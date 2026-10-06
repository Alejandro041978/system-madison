import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { enviarWhatsApp } from "@/lib/twilio";
import { DomainError } from "@/lib/enrollments";

/**
 * CAMPAÑAS SALIENTES de ventas (2026-09-16).
 * Una plantilla aprobada abre la conversación; el bot la continúa con el
 * perfil del lead. Reglas duras:
 *  - Solo leads con `consent` y teléfono; nunca etapas inscrito/descartado.
 *  - Tope diario por campaña (daily_limit): WhatsApp penaliza ráfagas.
 *  - El despacho es idempotente: un recipient pasa de pendiente a
 *    enviado/error una sola vez; repetir el cron no reenvía.
 *  - Lo enviado se espeja en la sesión y en bot_conversations como turno
 *    del bot: cuando el prospecto responda, el modelo verá cómo se abrió.
 */

export type Campaign = {
  id: string; name: string; bot_key: string; template_id: string | null;
  variables_map: Record<string, string>; audience_filter: Record<string, string[]>;
  pitch_notes: string | null; daily_limit: number;
  status: "borrador" | "activa" | "pausada" | "terminada";
  created_by: string | null; created_at: string; updated_at: string;
};
export type Recipient = {
  id: string; campaign_id: string; lead_id: string; status: "pendiente" | "enviado" | "respondido" | "error" | "excluido";
  sent_at: string | null; message_sid: string | null; error_detail: string | null; responded_at: string | null;
};
type Lead = {
  id: string; phone: string; name: string | null; email: string | null; stage: string;
  profession: string | null; age: number | null; employment: string | null; specialty_interest: string | null;
  language: string; consent: boolean; program_interest: string | null;
};
type Template = { id: string; key: string; language: string; content_sid: string; body_preview: string | null; active: boolean };

export const CAMPAIGN_COLS = "id, name, bot_key, template_id, variables_map, audience_filter, pitch_notes, daily_limit, status, created_by, created_at, updated_at";
const LEAD_COLS = "id, phone, name, email, stage, profession, age, employment, specialty_interest, language, consent, program_interest";
const PERFIL_FILTRABLE = ["profession", "employment", "specialty_interest", "language", "source", "stage"] as const;

const db = () => supabaseAdmin();

/** Audiencia elegible: consentidos, con teléfono, fuera de inscrito/descartado, y que pasan el filtro de perfil. */
export async function audienciaDeCampana(c: Campaign): Promise<Lead[]> {
  let q = db().from("sales_leads").select(LEAD_COLS)
    .eq("consent", true)
    .not("phone", "is", null)
    .not("stage", "in", "(inscrito,descartado)")
    .order("created_at");
  for (const campo of PERFIL_FILTRABLE) {
    const valores = c.audience_filter?.[campo];
    if (Array.isArray(valores) && valores.length > 0) q = q.in(campo, valores);
  }
  return fetchAll<Lead>(q);
}

/** Llena la cola (pendiente) con la audiencia actual. Idempotente; respeta "un pendiente por lead". */
export async function poblarDestinatarios(campaignId: string): Promise<{ audiencia: number; nuevos: number; yaEnCola: number; enOtraCampana: number }> {
  const { data: c } = await db().from("campaigns").select(CAMPAIGN_COLS).eq("id", campaignId).maybeSingle();
  if (!c) throw new DomainError("Campaña no encontrada", 404);
  const leads = await audienciaDeCampana(c as Campaign);

  // 2026-09-23: el insert fila a fila (1.826 leads) superaba el tiempo de la
  // función serverless y la cola quedaba a medias. Ahora: prefiltrado de los
  // ya en cola y de los pendientes en OTRA campaña (índice one_pending), e
  // inserción por lotes de 500 con ignoreDuplicates. Sigue siendo idempotente.
  const ya = new Set<string>();
  {
    const filas = await fetchAll<{ lead_id: string }>(
      db().from("campaign_recipients").select("lead_id").eq("campaign_id", campaignId).order("lead_id"),
    );
    for (const x of filas) ya.add(x.lead_id);
  }
  const candidatos = leads.filter((l) => !ya.has(l.id));
  const enOtraSet = new Set<string>();
  for (let i = 0; i < candidatos.length; i += 150) {
    const lote = candidatos.slice(i, i + 150).map((l) => l.id);
    const { data } = await db().from("campaign_recipients").select("lead_id").eq("status", "pendiente").in("lead_id", lote);
    for (const x of data ?? []) enOtraSet.add(x.lead_id);
  }
  const aInsertar = candidatos.filter((l) => !enOtraSet.has(l.id));
  let nuevos = 0;
  for (let i = 0; i < aInsertar.length; i += 500) {
    const filas = aInsertar.slice(i, i + 500).map((l) => ({ campaign_id: campaignId, lead_id: l.id }));
    const { data, error } = await db().from("campaign_recipients")
      .upsert(filas, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true }).select("id");
    if (error) throw new DomainError(error.message, 500);
    nuevos += data?.length ?? 0;
  }
  return { audiencia: leads.length, nuevos, yaEnCola: ya.size, enOtraCampana: enOtraSet.size };
}

function renderPreview(preview: string | null, variables: Record<string, string>): string {
  if (!preview) return "[plantilla enviada]";
  return preview.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[n] ?? "");
}

function variablesDeLead(map: Record<string, string>, lead: Lead): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pos, campo] of Object.entries(map ?? {})) {
    const v = (lead as unknown as Record<string, unknown>)[campo];
    out[pos] = v == null ? "" : String(v);
  }
  return out;
}

/** Enviados HOY por una campaña (para el tope diario). */
async function enviadosHoy(campaignId: string): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { count } = await db().from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId).in("status", ["enviado", "respondido"])
    .gte("sent_at", `${hoy}T00:00:00Z`);
  return count ?? 0;
}

export type ResultadoDespacho = {
  campaign: string; dry: boolean; pendientes: number; cupoHoy: number;
  enviados: number; errores: number; detalleErrores: string[];
};

/** Despacha UNA campaña activa hasta su cupo de hoy. dry=true solo cuenta. */
export async function despacharCampana(c: Campaign, dry: boolean): Promise<ResultadoDespacho> {
  const out: ResultadoDespacho = { campaign: c.name, dry, pendientes: 0, cupoHoy: 0, enviados: 0, errores: 0, detalleErrores: [] };
  const { data: bot } = await db().from("bots").select("key, twilio_number, active").eq("key", c.bot_key).maybeSingle();
  if (!bot?.active || !bot.twilio_number) { out.detalleErrores.push("El bot no está activo o no tiene número"); return out; }
  if (!c.template_id) { out.detalleErrores.push("La campaña no tiene plantilla"); return out; }
  const { data: tpl } = await db().from("whatsapp_templates").select("id, key, language, content_sid, body_preview, active").eq("id", c.template_id).maybeSingle();
  if (!tpl?.active) { out.detalleErrores.push("La plantilla no existe o está inactiva"); return out; }

  const pendientes = await fetchAll<Recipient>(
    db().from("campaign_recipients").select("id, campaign_id, lead_id, status, sent_at, message_sid, error_detail, responded_at")
      .eq("campaign_id", c.id).eq("status", "pendiente").order("created_at"),
  );
  out.pendientes = pendientes.length;
  out.cupoHoy = Math.max(0, c.daily_limit - (await enviadosHoy(c.id)));
  if (dry || out.cupoHoy === 0 || pendientes.length === 0) return out;

  for (const r of pendientes.slice(0, out.cupoHoy)) {
    const { data: lead } = await db().from("sales_leads").select(LEAD_COLS).eq("id", r.lead_id).maybeSingle();
    if (!lead || !lead.consent || ["inscrito", "descartado"].includes(lead.stage)) {
      await db().from("campaign_recipients").update({ status: "excluido", error_detail: "Ya no elegible al despachar" }).eq("id", r.id).eq("status", "pendiente");
      continue;
    }
    const variables = variablesDeLead(c.variables_map, lead as Lead);
    const envio = await enviarWhatsApp({
      to: `whatsapp:${lead.phone}`, from: bot.twilio_number,
      contentSid: (tpl as Template).content_sid, contentVariables: variables,
    });
    if (!envio.ok) {
      await db().from("campaign_recipients").update({ status: "error", error_detail: envio.error?.slice(0, 300) }).eq("id", r.id).eq("status", "pendiente");
      out.errores++;
      if (out.detalleErrores.length < 5) out.detalleErrores.push(`${lead.phone.slice(0, 6)}…: ${envio.error}`);
      continue;
    }
    await db().from("campaign_recipients").update({ status: "enviado", sent_at: new Date().toISOString(), message_sid: envio.sid }).eq("id", r.id).eq("status", "pendiente");
    if (lead.stage === "nuevo") await db().from("sales_leads").update({ stage: "contactable" }).eq("id", lead.id).eq("stage", "nuevo");
    await espejarApertura(c, tpl as Template, lead as Lead, renderPreview((tpl as Template).body_preview, variables));
    out.enviados++;
    await new Promise((res) => setTimeout(res, 400));  // ritmo suave: WhatsApp penaliza ráfagas
  }
  return out;
}

/** Deja la plantilla enviada como turno del bot en sesión + espejo: al responder, el modelo verá cómo se abrió. */
async function espejarApertura(c: Campaign, tpl: Template, lead: Lead, texto: string) {
  const now = new Date().toISOString();
  const msg = { role: "assistant", content: texto, at: now };
  const { data: ses } = await db().from("whatsapp_sessions").select("id, messages").eq("phone", lead.phone).eq("bot_key", c.bot_key).maybeSingle();
  if (ses) {
    await db().from("whatsapp_sessions").update({ messages: [...(ses.messages ?? []), msg].slice(-20) }).eq("id", ses.id);
  } else {
    await db().from("whatsapp_sessions").insert({ phone: lead.phone, bot_key: c.bot_key, messages: [msg] });
  }
  const sessionId = `wa:${c.bot_key}:${lead.phone}`;
  const { data: conv } = await db().from("bot_conversations").select("messages, message_count").eq("session_id", sessionId).maybeSingle();
  const espejo = [...(conv?.messages ?? []), msg];
  await db().from("bot_conversations").upsert({
    session_id: sessionId, bot_key: c.bot_key, messages: espejo, message_count: espejo.length,
    contact_email: lead.email, source: `campaña:${c.name}`,
  }, { onConflict: "session_id" });
}

export async function despacharCampanasActivas(dry: boolean): Promise<ResultadoDespacho[]> {
  const campanas = await fetchAll<Campaign>(db().from("campaigns").select(CAMPAIGN_COLS).eq("status", "activa").order("created_at"));
  const out: ResultadoDespacho[] = [];
  for (const c of campanas) out.push(await despacharCampana(c, dry));
  return out;
}

/**
 * El prospecto respondió: marca `respondido` su envío pendiente de respuesta
 * y devuelve el contexto de campaña (pitch) para personalizar el diálogo.
 * La llama el motor de ventas en cada mensaje entrante.
 */
export async function marcarRespuestaDeCampana(botKey: string, phone: string): Promise<{ pitch: string | null; campaignName: string | null }> {
  const { data: lead } = await db().from("sales_leads").select("id").eq("bot_key", botKey).eq("phone", phone).maybeSingle();
  if (!lead) return { pitch: null, campaignName: null };
  const { data: rec } = await db().from("campaign_recipients")
    .select("id, status, campaigns!inner(name, pitch_notes)")
    .eq("lead_id", lead.id).in("status", ["enviado", "respondido"])
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (!rec) return { pitch: null, campaignName: null };
  const camp = rec.campaigns as unknown as { name: string; pitch_notes: string | null };
  if (rec.status === "enviado") {
    await db().from("campaign_recipients").update({ status: "respondido", responded_at: new Date().toISOString() }).eq("id", rec.id).eq("status", "enviado");
  }
  return { pitch: camp?.pitch_notes ?? null, campaignName: camp?.name ?? null };
}

/* ─────────────────────────────────────────────────────────────────────
 * ESTADO DE ENTREGA (2026-10-02, SQL 012)
 * Caso real: 500 «enviados» y Twilio decía que 93 nunca se entregaron.
 * `enviado` en la cola solo significa «Twilio aceptó el mensaje»; el
 * estado de WhatsApp (un visto / dos vistos / azules / no entregado) se
 * guarda aparte en delivery_status. Lo escriben el webhook de estado y
 * el cron de respaldo, SIEMPRE por esta función.
 * ──────────────────────────────────────────────────────────────────── */

export type EstadoEntrega = "sent" | "delivered" | "read" | "undelivered" | "failed";
const RANGO: Record<EstadoEntrega, number> = { sent: 1, delivered: 2, read: 3, undelivered: 1, failed: 1 };

/** Estado de Twilio → el nuestro (los transitorios queued/accepted/sending no se guardan). */
export function normalizarEstadoEntrega(s: string | null | undefined): EstadoEntrega | null {
  return s === "sent" || s === "delivered" || s === "read" || s === "undelivered" || s === "failed" ? s : null;
}

/**
 * Registra el estado de un mensaje. Solo AVANZA: los avisos de Twilio
 * llegan desordenados (un «delivered» después del «read») y un estado
 * anterior no debe pisar al posterior. Idempotente. Devuelve si cambió algo.
 */
export async function registrarEntrega(messageSid: string, estado: EstadoEntrega, errorCode?: string | null): Promise<boolean> {
  const previosPermitidos = (Object.keys(RANGO) as EstadoEntrega[]).filter((e) =>
    estado === "undelivered" || estado === "failed" ? e === "sent" : RANGO[e] < RANGO[estado] && e !== "undelivered" && e !== "failed");
  const filtro = ["delivery_status.is.null", ...(previosPermitidos.length ? [`delivery_status.in.(${previosPermitidos.join(",")})`] : [])].join(",");
  const { data, error } = await db().from("campaign_recipients")
    .update({ delivery_status: estado, delivery_error: errorCode ? String(errorCode).slice(0, 40) : null, delivery_updated_at: new Date().toISOString() })
    .eq("message_sid", messageSid).or(filtro).select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export type ResultadoSync = { dry: boolean; revisados: number; cambiados: number; fallosConsulta: number; porEstado: Record<string, number> };

/**
 * Respaldo del webhook: pregunta a Twilio por los envíos cuyo estado aún
 * puede cambiar (sin estado → siempre; sent/delivered → 7 días desde el
 * envío, que es cuando todavía puede llegar el «leído»). Idempotente.
 */
export async function sincronizarEntregas(dry: boolean): Promise<ResultadoSync> {
  const out: ResultadoSync = { dry, revisados: 0, cambiados: 0, fallosConsulta: 0, porEstado: {} };
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio sin configurar");
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const abiertos = await fetchAll<{ id: string; message_sid: string; delivery_status: string | null; sent_at: string | null }>(
    db().from("campaign_recipients").select("id, message_sid, delivery_status, sent_at")
      .not("message_sid", "is", null)
      .or(`delivery_status.is.null,and(delivery_status.in.(sent,delivered),sent_at.gte."${hace7}")`)
      .order("id"),
  );
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < abiertos.length) {
      const r = abiertos[i++];
      try {
        let res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${r.message_sid}.json`, { headers: { Authorization: auth } });
        if (res.status === 429) { await new Promise((x) => setTimeout(x, 1500)); res = await fetch(res.url, { headers: { Authorization: auth } }); }
        if (!res.ok) { out.fallosConsulta++; continue; }
        const j = await res.json();
        out.revisados++;
        const estado = normalizarEstadoEntrega(j.status);
        out.porEstado[j.status ?? "?"] = (out.porEstado[j.status ?? "?"] ?? 0) + 1;
        if (!estado || estado === r.delivery_status) continue;
        if (dry) { out.cambiados++; continue; }
        if (await registrarEntrega(r.message_sid, estado, j.error_code)) out.cambiados++;
      } catch { out.fallosConsulta++; }
    }
  }));
  return out;
}
