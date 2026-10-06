import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/server";
import { identificarEstudiante, nombreCompleto, type Student } from "@/lib/students";
import { buscarConocimiento } from "@/lib/knowledge";
import { conversar, hayAnthropic } from "@/lib/bots/claude";
import { marcarRespuestaDeCampana } from "@/lib/campaigns";
import { crearFicha, textoPagoMatricula } from "@/lib/enroll";
import { APP_NAME } from "@/lib/config";

/**
 * Motor de conversación por rol (BLUEPRINT · Módulo 5).
 *  - ventas: conocimiento + extracción de lead. No identifica estudiantes.
 *  - soporte: identificación en dos niveles; tools propose_ticket y
 *    request_human (ENLACE + wa.me al buzón humano).
 *  - retencion: identifica SOLO con coincidencia única de teléfono;
 *    compromisos codificados en [[R: …]] que nunca se muestran.
 *  - inbox: puerta dura por código ENLACE válido y no usado.
 * Comando literal «reiniciar» borra la sesión de ese teléfono.
 */

export const COMANDO_REINICIO = "reiniciar";
const MAX_HISTORIAL = 20;

export type Bot = { key: string; name: string; role: "ventas" | "soporte" | "retencion" | "inbox"; prompt: string; twilio_number: string | null; active: boolean };
export type SesionMsg = { role: "user" | "assistant"; content: string; at: string };
export type Sesion = {
  id: string; phone: string; bot_key: string; messages: SesionMsg[];
  identified: boolean; user_info: Record<string, unknown> | null;
  pending_verify: Record<string, unknown> | null; pending_ticket: Record<string, unknown> | null;
};

const db = () => supabaseAdmin();

export async function botPorNumero(to: string): Promise<Bot | null> {
  const { data } = await db().from("bots").select("key, name, role, prompt, twilio_number, active").eq("twilio_number", to).maybeSingle();
  return (data as Bot) ?? null;
}

export async function cargarSesion(phone: string, botKey: string): Promise<Sesion> {
  const cols = "id, phone, bot_key, messages, identified, user_info, pending_verify, pending_ticket";
  const { data } = await db().from("whatsapp_sessions").select(cols).eq("phone", phone).eq("bot_key", botKey).maybeSingle();
  if (data) return data as Sesion;
  const { data: nueva, error } = await db().from("whatsapp_sessions")
    .insert({ phone, bot_key: botKey }).select(cols).single();
  if (error) throw new Error(`whatsapp_sessions: ${error.message}`);
  return nueva as Sesion;
}

export async function borrarSesion(phone: string, botKey: string) {
  await db().from("whatsapp_sessions").delete().eq("phone", phone).eq("bot_key", botKey);
}

/** Guarda la sesión (historial ≤20) y espeja el turno completo en bot_conversations. */
export async function guardarTurno(s: Sesion, userMsg: string, botMsg: string, patch: Partial<Sesion> = {}) {
  const now = new Date().toISOString();
  const nuevos: SesionMsg[] = [...s.messages, { role: "user", content: userMsg, at: now }];
  if (botMsg) nuevos.push({ role: "assistant", content: botMsg, at: now });
  const recortados = nuevos.slice(-MAX_HISTORIAL);
  await db().from("whatsapp_sessions").update({
    messages: recortados,
    identified: patch.identified ?? s.identified,
    user_info: patch.user_info !== undefined ? patch.user_info : s.user_info,
    pending_verify: patch.pending_verify !== undefined ? patch.pending_verify : s.pending_verify,
    pending_ticket: patch.pending_ticket !== undefined ? patch.pending_ticket : s.pending_ticket,
  }).eq("id", s.id);

  const sessionId = `wa:${s.bot_key}:${s.phone}`;
  const { data: conv } = await db().from("bot_conversations").select("messages, message_count").eq("session_id", sessionId).maybeSingle();
  const espejo = [...(conv?.messages ?? []), { role: "user", content: userMsg, at: now }];
  if (botMsg) espejo.push({ role: "assistant", content: botMsg, at: now });
  const email = (patch.user_info ?? s.user_info)?.email as string | undefined;
  await db().from("bot_conversations").upsert({
    session_id: sessionId, bot_key: s.bot_key, messages: espejo, message_count: espejo.length,
    contact_email: email ?? null, source: "whatsapp",
  }, { onConflict: "session_id" });
}

function historial(s: Sesion, userMsg: string): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = s.messages.map((m) => ({ role: m.role, content: m.content }));
  msgs.push({ role: "user", content: userMsg });
  return msgs;
}

function bloqueConocimiento(resultados: { title: string; content: string }[]): string {
  if (resultados.length === 0) return "";
  return `\n\n═══ CONOCIMIENTO (usa SOLO esto para datos concretos; si no está aquí, di que lo consultarás) ═══\n` +
    resultados.map((r) => `## ${r.title}\n${r.content}`).join("\n\n");
}

const SIN_IA = "Ahora mismo no puedo atenderte por aquí. Escríbenos a admisiones y te respondemos enseguida.";

export type Respuesta = { textos: string[] };

// ---------------------------------------------------------------------
// VENTAS: conocimiento + lead. No identifica estudiantes.
// ---------------------------------------------------------------------
async function manejarVentas(bot: Bot, s: Sesion, texto: string): Promise<Respuesta> {
  if (!hayAnthropic()) return { textos: [SIN_IA] };

  // Personalización saliente (2026-09-16): si el contacto viene de una
  // campaña, se marca su respuesta y el bot recibe el perfil cargado
  // (profesión, edad, empleo, especialidad) y el guión de la campaña.
  const [conocimiento, campana, leadRes] = await Promise.all([
    buscarConocimiento(bot.key, texto),
    marcarRespuestaDeCampana(bot.key, s.phone).catch(() => ({ pitch: null, campaignName: null })),
    db().from("sales_leads").select("name, email, profession, age, employment, specialty_interest, language, program_interest, stage").eq("bot_key", bot.key).eq("phone", s.phone).maybeSingle(),
  ]);
  let perfil = "";
  const lead = leadRes.data;
  if (lead) {
    const datos = Object.entries({
      nombre: lead.name, profesión: lead.profession, edad: lead.age, empleo: lead.employment,
      "especialidad de interés": lead.specialty_interest, "programa de interés": lead.program_interest,
      idioma: lead.language, correo: lead.email,
    }).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}: ${v}`).join(" · ");
    if (datos) perfil = `

PERFIL DEL CONTACTO (úsalo para personalizar; no recites la lista): ${datos}.`;
  }
  if (campana.campaignName) {
    perfil += `

CONTEXTO: este contacto viene de la campaña «${campana.campaignName}» — tú abriste la conversación con la plantilla que ves en el historial.${campana.pitch ? ` Guión de la campaña: ${campana.pitch}` : ""}`;
  }
  const tools: Anthropic.Tool[] = [{
    name: "send_enrollment_form",
    description: `Genera el enlace personal de la ficha de inscripción. Úsala SOLO cuando el interesado confirme que quiere inscribirse o pregunte cómo matricularse. Comparte el enlace devuelto y explica que la ficha tarda 2 minutos. ${textoPagoMatricula()}`,
    input_schema: { type: "object", properties: {} },
  }, {
    name: "save_lead",
    description: "Guarda o actualiza los datos del interesado en cuanto los mencione (nombre, correo, programa de interés, estudios previos). Llámala cada vez que obtengas un dato nuevo; no hace falta tenerlos todos.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, email: { type: "string" },
        program_interest: { type: "string" }, prior_studies: { type: "string" },
        notes: { type: "string", description: "resumen breve del interés y contexto" },
        qualified: { type: "boolean", description: "true si mostró interés real en matricularse" },
      },
    },
  }];
  const handlers = {
    send_enrollment_form: async () => {
      const { url } = await crearFicha(bot.key, s.phone);
      return `Enlace de inscripción generado: ${url} — compártelo tal cual. La ficha tarda ~2 minutos. ${textoPagoMatricula()}`;
    },
    save_lead: async (input: Record<string, unknown>) => {
      const patch: Record<string, unknown> = { bot_key: bot.key, phone: s.phone };
      for (const k of ["name", "email", "program_interest", "prior_studies", "notes"]) {
        if (input[k]) patch[k] = String(input[k]).trim();
      }
      if (input.qualified !== undefined) {
        patch.qualified = !!input.qualified;
        if (input.qualified) patch.stage = "interesado";
      }
      const { error } = await db().from("sales_leads").upsert(patch, { onConflict: "bot_key,phone" });
      return error ? `No guardado: ${error.message}` : "Lead guardado";
    },
  };
  const r = await conversar({
    system: `${bot.prompt}${bloqueConocimiento(conocimiento)}\n\nResponde en 1-3 frases por mensaje, tono cercano de WhatsApp. Nunca menciones herramientas internas.`,
    messages: historial(s, texto),
    tools, handlers,
  });
  return { textos: [r.texto || "¿Me cuentas un poco más?"] };
}

// ---------------------------------------------------------------------
// SOPORTE: identificación en dos niveles + ticket + humano (ENLACE).
// ---------------------------------------------------------------------
async function generarEnlace(bot: Bot, s: Sesion, input: { summary?: string; topic?: string }): Promise<string> {
  const info = s.user_info as { name?: string; document_number?: string } | null;
  for (let intento = 0; intento < 5; intento++) {
    const code = `ENLACE-${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await db().from("handoff_codes").insert({
      code, customer_phone: s.phone, bot_key: bot.key,
      summary: input.summary?.slice(0, 500) ?? null, topic: input.topic ?? null,
      student_name: info?.name ?? null, document_number: info?.document_number ?? null,
    });
    if (!error) return code;
  }
  throw new Error("No se pudo generar el código");
}

async function numeroInbox(): Promise<string | null> {
  const { data } = await db().from("bots").select("twilio_number").eq("role", "inbox").eq("active", true).maybeSingle();
  return data?.twilio_number?.replace("whatsapp:", "") ?? null;
}

function fichaResumen(st: Student) {
  return { student_id: st.id, name: nombreCompleto(st), email: st.email, document_number: st.document_number, situation: st.situation };
}

async function manejarSoporte(bot: Bot, s: Sesion, texto: string): Promise<Respuesta> {
  if (!hayAnthropic()) return { textos: [SIN_IA] };
  const patch: Partial<Sesion> = {};

  // Nivel 1: el teléfono conocido identifica solo (coincidencia única).
  if (!s.identified) {
    const porTelefono = await identificarEstudiante({ phone: s.phone });
    if (porTelefono.length === 1) {
      patch.identified = true;
      patch.user_info = fichaResumen(porTelefono[0]);
      s.identified = true;
      s.user_info = patch.user_info;
    }
  }

  // Verificación pendiente: pidió identidad por documento y esperamos el correo de la MISMA ficha.
  if (!s.identified && s.pending_verify?.student_id) {
    const correo = texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase();
    if (correo) {
      const { data: st } = await db().from("academic_students")
        .select("id, email, email_alt").eq("id", s.pending_verify.student_id).maybeSingle();
      if (st && (st.email?.toLowerCase() === correo || st.email_alt?.toLowerCase() === correo)) {
        const full = await identificarEstudiante({ email: correo });
        if (full.length >= 1) {
          patch.identified = true;
          patch.user_info = fichaResumen(full[0]);
          patch.pending_verify = null;
          s.identified = true;
          s.user_info = patch.user_info;
          s.pending_verify = null;
        }
      } else {
        patch.pending_verify = null;
        s.pending_verify = null;
        return { textos: ["Ese correo no coincide con la ficha del documento indicado. Por seguridad no puedo continuar; verifica tus datos o escribe a soporte desde tu correo institucional."] };
      }
    }
  }

  const tools: Anthropic.Tool[] = [
    {
      name: "identify_user",
      description: "Identifica al estudiante cuando facilite su correo o su número de documento. El correo identifica por sí solo; el documento requiere una segunda prueba (se gestiona automáticamente).",
      input_schema: { type: "object", properties: { email: { type: "string" }, document: { type: "string" } } },
    },
    {
      name: "propose_ticket",
      description: "Propón crear un ticket para el equipo de soporte cuando no puedas resolver el problema. El estudiante debe confirmar con sí/no.",
      input_schema: { type: "object", properties: { summary: { type: "string", description: "resumen del problema" } }, required: ["summary"] },
    },
    {
      name: "request_human",
      description: "El estudiante pide hablar con una persona. Genera un código de acceso al buzón humano.",
      input_schema: { type: "object", properties: { summary: { type: "string" }, topic: { type: "string" } } },
    },
  ];

  const handlers = {
    identify_user: async (input: Record<string, unknown>) => {
      if (s.identified) return "Ya identificado";
      if (input.email) {
        const hits = await identificarEstudiante({ email: String(input.email) });
        if (hits.length >= 1) {
          patch.identified = true;
          patch.user_info = fichaResumen(hits[0]);
          s.identified = true;
          s.user_info = patch.user_info;
          return `Identificado: ${patch.user_info.name}`;
        }
        return "Correo no encontrado. Pide el número de documento o el correo con el que se matriculó.";
      }
      if (input.document) {
        // Documento desde teléfono desconocido: exige segunda prueba (correo de la misma ficha).
        const hits = await identificarEstudiante({ document: String(input.document) });
        if (hits.length === 1) {
          patch.pending_verify = { student_id: hits[0].id };
          s.pending_verify = patch.pending_verify;
          return "Documento encontrado. Por seguridad, pide el correo asociado a la matrícula para confirmar la identidad. NO confirmes todavía quién es.";
        }
        return "Documento no encontrado. Pide el correo con el que se matriculó.";
      }
      return "Pide el correo o el documento.";
    },
    propose_ticket: async (input: Record<string, unknown>) => {
      if (!s.identified) return "Primero hay que identificar al estudiante.";
      patch.pending_ticket = { summary: String(input.summary ?? "").slice(0, 500) };
      s.pending_ticket = patch.pending_ticket;
      return "Propuesta registrada. Pregunta al estudiante si confirma la creación del ticket (sí/no).";
    },
    request_human: async (input: Record<string, unknown>) => {
      if (!s.identified) return "Primero hay que identificar al estudiante.";
      const code = await generarEnlace(bot, s, input as { summary?: string; topic?: string });
      const numero = await numeroInbox();
      return numero
        ? `Código generado: ${code}. Indícale que escriba ese código en https://wa.me/${numero.replace("+", "")} (caduca en 48 h).`
        : `Código generado: ${code}, pero el buzón humano no tiene número configurado: indícale que lo mencione al escribir a soporte.`;
    },
  };

  // Confirmación sí/no del ticket pendiente (sin pasar por el modelo).
  if (s.pending_ticket && /^\s*(s[ií]|yes|ok|vale|confirmo)\s*[.!]?\s*$/i.test(texto)) {
    const code = await generarEnlace(bot, s, { summary: `TICKET: ${s.pending_ticket.summary}`, topic: "ticket" });
    await db().from("whatsapp_sessions").update({ pending_ticket: null }).eq("id", s.id);
    s.pending_ticket = null;
    return { textos: [`Ticket creado con referencia ${code}. El equipo de soporte te contactará por este número o por correo. ¿Algo más?`] };
  }
  if (s.pending_ticket && /^\s*(no|nop|mejor no)\s*[.!]?\s*$/i.test(texto)) {
    await db().from("whatsapp_sessions").update({ pending_ticket: null }).eq("id", s.id);
    s.pending_ticket = null;
    return { textos: ["De acuerdo, no creo el ticket. ¿Te ayudo con otra cosa?"] };
  }

  const conocimiento = s.identified ? await buscarConocimiento(bot.key, texto) : [];
  const identidad = s.identified
    ? `\n\nESTUDIANTE IDENTIFICADO: ${JSON.stringify(s.user_info)}. Trátalo por su nombre.`
    : `\n\nNO IDENTIFICADO: antes de ayudar en nada personal, identifícalo con identify_user (correo o documento). Sé amable: pide el dato, no interrogues.`;
  const r = await conversar({
    system: `${bot.prompt}${identidad}${bloqueConocimiento(conocimiento)}\n\nResponde en 1-3 frases, tono cercano. Nunca muestres datos de otra persona ni menciones herramientas internas.`,
    messages: historial(s, texto),
    tools, handlers,
  });
  return { textos: [r.texto || "¿En qué puedo ayudarte?"], ...(Object.keys(patch).length ? { patch } : {}) } as Respuesta & { patch?: Partial<Sesion> };
}

// ---------------------------------------------------------------------
// RETENCIÓN: solo coincidencia única de teléfono; [[R: …]] nunca se muestra.
// ---------------------------------------------------------------------
async function manejarRetencion(bot: Bot, s: Sesion, texto: string): Promise<Respuesta> {
  // La identidad va ANTES que la IA: el rechazo por teléfono desconocido es
  // determinista y debe funcionar aunque falte la clave (2026-08-23, E2E).
  if (!s.identified) {
    const hits = await identificarEstudiante({ phone: s.phone });
    if (hits.length !== 1) {
      return { textos: [`Hola, soy del equipo de acompañamiento de ${APP_NAME}, pero no reconozco este número. Si eres estudiante, escríbenos desde el teléfono que figura en tu matrícula o contacta con soporte.`] };
    }
    s.identified = true;
    s.user_info = fichaResumen(hits[0]);
  }
  const r = await conversar({
    system: `${bot.prompt}\n\nESTUDIANTE: ${JSON.stringify(s.user_info)}.\n\nAl final de CADA respuesta añade una línea con el resultado codificado en el formato [[R: estado|compromiso|fecha]] (estado ∈ contactado, compromiso, rechazo, sin_respuesta). Esa línea es interna: el sistema la oculta. Responde en 1-3 frases.`,
    messages: historial(s, texto),
  });
  // Extraer y ocultar el código [[R: …]].
  const m = r.texto.match(/\[\[R:([^\]]*)\]\]/);
  const visible = r.texto.replace(/\s*\[\[R:[^\]]*\]\]\s*/g, "").trim();
  if (m) {
    const info = { ...(s.user_info ?? {}), ultimo_resultado: m[1].trim(), ultimo_resultado_at: new Date().toISOString() };
    s.user_info = info;
    await db().from("whatsapp_sessions").update({ identified: true, user_info: info }).eq("id", s.id);
  } else if (s.identified) {
    await db().from("whatsapp_sessions").update({ identified: true, user_info: s.user_info }).eq("id", s.id);
  }
  return { textos: [visible || "Gracias por responder."] };
}

// ---------------------------------------------------------------------
// INBOX: puerta dura por ENLACE válido y no usado.
// ---------------------------------------------------------------------
async function manejarInbox(_bot: Bot, s: Sesion, texto: string): Promise<Respuesta> {
  if (s.identified) {
    // Puerta ya abierta: los humanos leen y responden desde su consola; el bot calla.
    return { textos: [] };
  }
  const code = texto.toUpperCase().match(/ENLACE-\d{4}/)?.[0];
  if (!code) {
    return { textos: [`Este es el buzón de atención personal de ${APP_NAME}. Para entrar necesitas un código ENLACE-#### que te da el asistente de soporte. Escríbele y pide «hablar con una persona».`] };
  }
  const { data: h } = await db().from("handoff_codes").select("code, used, expires_at, summary, student_name, customer_phone").eq("code", code).maybeSingle();
  if (!h || h.used || new Date(h.expires_at) < new Date()) {
    return { textos: ["Ese código no es válido o ya se usó. Pide uno nuevo al asistente de soporte."] };
  }
  await db().from("handoff_codes").update({ used: true }).eq("code", code);
  await db().from("whatsapp_sessions").update({ identified: true, user_info: { code, summary: h.summary, student_name: h.student_name } }).eq("id", s.id);
  s.identified = true;
  return { textos: [`Código verificado${h.student_name ? `, ${h.student_name}` : ""}. Una persona del equipo te atenderá en este chat en horario de oficina. Cuéntanos tu caso.`] };
}

// ---------------------------------------------------------------------
export async function procesarMensaje(bot: Bot, phone: string, texto: string, notaMedia: string | null): Promise<string[]> {
  if (texto.trim().toLowerCase() === COMANDO_REINICIO) {
    await borrarSesion(phone, bot.key);
    return ["Conversación reiniciada. ¿En qué puedo ayudarte?"];
  }
  const s = await cargarSesion(phone, bot.key);
  const entrada = notaMedia ? `${texto}\n${notaMedia}`.trim() : texto;
  let respuesta: Respuesta;
  try {
    if (bot.role === "ventas") respuesta = await manejarVentas(bot, s, entrada);
    else if (bot.role === "soporte") respuesta = await manejarSoporte(bot, s, entrada);
    else if (bot.role === "retencion") respuesta = await manejarRetencion(bot, s, entrada);
    else respuesta = await manejarInbox(bot, s, entrada);
  } catch (e) {
    console.error(`[bot:${bot.key}]`, (e as Error).message);
    respuesta = { textos: ["Perdona, he tenido un problema técnico. ¿Puedes repetírmelo en un momento?"] };
  }
  const patch = (respuesta as Respuesta & { patch?: Partial<Sesion> }).patch ?? {};
  await guardarTurno(s, entrada, respuesta.textos.join("\n"), patch);
  return respuesta.textos;
}
