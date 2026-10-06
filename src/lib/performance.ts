import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import type { SesionMsg } from "@/lib/bots/engine";

/**
 * MÉTRICAS DE DESEMPEÑO del agente de ventas (2026-09-23) — una sola
 * función; la pantalla /performance solo pinta. El embudo cierra por
 * identidad (total = suma de etapas): si no cierra, dato roto en rojo.
 */

export type SerieDia = { dia: string; valor: number };
export type MetricasVentas = {
  dias: number;
  desde: string;
  // conversaciones del bot de ventas
  conversacionesPeriodo: number;
  mensajesPeriodo: number;
  mensajesCliente: number;
  /** De las conversaciones del periodo: las que abrimos nosotros (campaña) y las que abrió el prospecto. */
  conversacionesDeCampana: number;
  conversacionesEntrantes: number;
  conversacionesPorDia: SerieDia[];
  // leads
  leadsTotal: number;
  leadsPorEtapa: Record<string, number>;
  embudoCierra: boolean;
  leadsNuevosPeriodo: number;
  leadsNuevosPorDia: SerieDia[];
  // campañas
  campanas: CampanaMetricas[];
  /** false = falta el SQL 012: no sabemos el estado de entrega (null ≠ 0). */
  entregaDisponible: boolean;
  // fichas de inscripción
  fichas: { enviadas: number; completadas: number; pagadas: number; formalizadas: number; anuladas: number };
  // supervisor (bot ventas)
  notas: { dia: string; nota: number }[];
  ultimaNota: number | null;
};

/**
 * Entrega según WhatsApp (2026-10-02). «Enviado» era solo «Twilio lo aceptó»:
 * de los primeros 500, 93 nunca llegaron. Identidad que debe cerrar:
 * enviados = leidos + entregados + unVisto + noEntregados + sinEstado.
 * «leidos» es un mínimo: quien desactiva la confirmación de lectura queda en «entregados»,
 * salvo que haya respondido: quien respondió, leyó (2026-10-02: 10 de 24 respuestas venían
 * de teléfonos sin confirmación de lectura y la pantalla decía «23 respondieron, 0 leídos»).
 */
export type CampanaMetricas = {
  name: string; status: string;
  enviados: number; respondidos: number; sinRespuesta: number; errores: number; pendientes: number;
  tasaRespuesta: number | null;
  entrega: null | {
    leidos: number; entregados: number; unVisto: number; noEntregados: number; sinEstado: number;
    cierra: boolean;
    /** respondidos / (leidos + entregados): la tasa sobre quienes de verdad recibieron el mensaje. */
    tasaSobreEntregados: number | null;
    motivosNoEntrega: { codigo: string; n: number }[];
  };
};

const dia = (iso: string) => iso.slice(0, 10);

function serieDiaria(fechas: string[], desde: string, dias: number): SerieDia[] {
  const cuenta: Record<string, number> = {};
  for (const f of fechas) cuenta[f] = (cuenta[f] ?? 0) + 1;
  const out: SerieDia[] = [];
  const inicio = new Date(desde + "T00:00:00Z");
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio.getTime() + i * 86400000).toISOString().slice(0, 10);
    out.push({ dia: d, valor: cuenta[d] ?? 0 });
  }
  return out;
}

export async function metricasVentas(dias = 30): Promise<MetricasVentas> {
  const db = supabaseAdmin();
  const desde = new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10);
  const desdeIso = `${desde}T00:00:00Z`;

  // Conversaciones de ventas tocadas en el periodo (el filtro fino es por mensaje).
  const convs = await fetchAll<{ session_id: string; messages: SesionMsg[] }>(
    db.from("bot_conversations").select("session_id, messages").eq("bot_key", "ventas").gte("updated_at", desdeIso).order("session_id"),
  );
  // 2026-10-02: una CONVERSACIÓN es un chat donde el prospecto escribió. Antes se
  // contaba cualquier chat con mensajes y la tarjeta decía «512 conversaciones»
  // cuando 476 eran aperturas de campaña sin respuesta; el gráfico diario solo
  // dibujaba los 50 envíos del cron. Las aperturas sin respuesta viven en el
  // panel de campañas, no aquí.
  let mensajesPeriodo = 0, mensajesCliente = 0;
  const diasConActividad: string[] = [];
  const convsActivas = new Set<string>();
  let conversacionesDeCampana = 0, conversacionesEntrantes = 0;
  for (const c of convs) {
    const delPeriodo = (c.messages ?? []).filter((m) => (m.at ?? "") >= desdeIso);
    const delCliente = delPeriodo.filter((m) => m.role === "user");
    if (delCliente.length === 0) continue;
    convsActivas.add(c.session_id);
    // La abrimos nosotros si el primer mensaje del chat es nuestro (plantilla de campaña).
    if ((c.messages ?? [])[0]?.role === "assistant") conversacionesDeCampana++; else conversacionesEntrantes++;
    mensajesPeriodo += delPeriodo.length;
    mensajesCliente += delCliente.length;
    for (const d of new Set(delCliente.map((m) => dia(m.at)))) diasConActividad.push(`${d}|${c.session_id}`);
  }
  const conversacionesPorDia = serieDiaria(diasConActividad.map((x) => x.split("|")[0]), desde, dias);

  // Leads: embudo completo (paginado) + nuevos del periodo.
  const leads = await fetchAll<{ stage: string; created_at: string }>(
    db.from("sales_leads").select("stage, created_at").eq("bot_key", "ventas").order("id"),
  );
  const leadsPorEtapa: Record<string, number> = {};
  for (const l of leads) leadsPorEtapa[l.stage] = (leadsPorEtapa[l.stage] ?? 0) + 1;
  const suma = Object.values(leadsPorEtapa).reduce((a, b) => a + b, 0);
  const nuevos = leads.filter((l) => l.created_at >= desdeIso);

  // Campañas con su cola.
  type Rec = { campaign_id: string; status: string; delivery_status?: string | null; delivery_error?: string | null };
  const camps = await fetchAll<{ id: string; name: string; status: string }>(db.from("campaigns").select("id, name, status").order("created_at", { ascending: false }));
  let recs: Rec[];
  let entregaDisponible = true;
  try {
    recs = await fetchAll<Rec>(db.from("campaign_recipients").select("campaign_id, status, delivery_status, delivery_error").order("id"));
  } catch {
    // Sin el SQL 012 las columnas no existen: el tablero sigue vivo y dice que no lo sabe.
    entregaDisponible = false;
    recs = await fetchAll<Rec>(db.from("campaign_recipients").select("campaign_id, status").order("id"));
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const campanas: CampanaMetricas[] = camps.map((c) => {
    const mias = recs.filter((r) => r.campaign_id === c.id);
    const n = (s: string) => mias.filter((r) => r.status === s).length;
    const enviadas = mias.filter((r) => r.status === "enviado" || r.status === "respondido");
    const enviados = enviadas.length;
    let entrega: CampanaMetricas["entrega"] = null;
    if (entregaDisponible) {
      const e = (...ss: (string | null)[]) => enviadas.filter((r) => r.status !== "respondido" && ss.includes(r.delivery_status ?? null)).length;
      const leidos = e("read") + n("respondido"), entregados = e("delivered"), unVisto = e("sent"), noEntregados = e("undelivered", "failed"), sinEstado = e(null);
      const motivos: Record<string, number> = {};
      for (const r of enviadas) if (r.status !== "respondido" && (r.delivery_status === "undelivered" || r.delivery_status === "failed")) {
        const k = r.delivery_error ?? "sin código";
        motivos[k] = (motivos[k] ?? 0) + 1;
      }
      entrega = {
        leidos, entregados, unVisto, noEntregados, sinEstado,
        cierra: leidos + entregados + unVisto + noEntregados + sinEstado === enviados,
        tasaSobreEntregados: pct(n("respondido"), leidos + entregados),
        motivosNoEntrega: Object.entries(motivos).map(([codigo, k]) => ({ codigo, n: k })).sort((a, b) => b.n - a.n),
      };
    }
    return {
      name: c.name, status: c.status,
      enviados, respondidos: n("respondido"), sinRespuesta: n("enviado"), errores: n("error"), pendientes: n("pendiente"),
      tasaRespuesta: pct(n("respondido"), enviados),
      entrega,
    };
  });

  // Fichas de inscripción (acumulado histórico; los estados avanzan, no se pierden).
  const fichasRows = await fetchAll<{ status: string }>(db.from("enrollment_requests").select("status").order("id"));
  const f = (s: string) => fichasRows.filter((x) => x.status === s).length;
  const fichas = {
    enviadas: fichasRows.length,
    completadas: f("completada") + f("pagada") + f("formalizada"),
    pagadas: f("pagada") + f("formalizada"),
    formalizadas: f("formalizada"),
    anuladas: f("anulada"),
  };

  // Nota del supervisor (serie).
  const { data: reps } = await db.from("supervisor_reports")
    .select("report_date, quality_score").eq("bot_key", "ventas").eq("status", "ok")
    .gte("report_date", desde).order("report_date");
  const notas = (reps ?? []).filter((r) => r.quality_score != null).map((r) => ({ dia: r.report_date, nota: Number(r.quality_score) }));

  return {
    dias, desde,
    conversacionesPeriodo: convsActivas.size, mensajesPeriodo, mensajesCliente, conversacionesDeCampana, conversacionesEntrantes, conversacionesPorDia,
    leadsTotal: leads.length, leadsPorEtapa, embudoCierra: suma === leads.length,
    leadsNuevosPeriodo: nuevos.length,
    leadsNuevosPorDia: serieDiaria(nuevos.map((l) => dia(l.created_at)), desde, dias),
    campanas, entregaDisponible, fichas,
    notas, ultimaNota: notas.length ? notas[notas.length - 1].nota : null,
  };
}
