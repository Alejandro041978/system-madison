import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/config";
import { fetchAll } from "@/lib/db";
import { anthropic, BOT_MODEL, hayAnthropic } from "@/lib/bots/claude";
import type { Bot, SesionMsg } from "@/lib/bots/engine";

/**
 * EVALUADOR (supervisor) — cron diario por bot (BLUEPRINT · Módulo 5).
 * Lee las conversaciones de AYER (espejo bot_conversations) + inventario de
 * conocimiento + prompt vigente; analiza con un prompt por rol; escribe
 * supervisor_reports (único por fecha y bot) y genera ≤4 sugerencias/día
 * para la bandeja del Módulo 6 (nunca para el buzón humano).
 */

export type Informe = {
  executive_summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  knowledge_gaps: string[];
  prompt_suggestions: string[];
  quality_score: number;
  suggestions: {
    type: "prompt" | "knowledge";
    title: string;
    recommendation: string;
    content: string;
    kb_topic?: string;
    kb_question?: string;
  }[];
};

const ANALISIS_POR_ROL: Record<Bot["role"], string> = {
  ventas: `Evalúa al bot COMERCIAL: ¿responde con datos del conocimiento sin inventar? ¿capta nombre, correo y programa de interés con naturalidad? ¿pierde oportunidades de calificar el lead? ¿tono cercano sin ser insistente?`,
  soporte: `Evalúa al bot de SOPORTE: ¿identifica correctamente antes de dar información personal? ¿resuelve con el conocimiento disponible? ¿escala a ticket o a persona cuando toca, ni antes ni después? ¿alguna fuga de datos de terceros? (eso sería gravísimo)`,
  retencion: `Evalúa al bot de RETENCIÓN usando las ESTADÍSTICAS REALES de compromisos incluidas abajo: ¿consigue compromisos concretos con fecha? ¿respeta al estudiante que rechaza? ¿el tono acompaña sin presionar?`,
  inbox: `Evalúa a los AGENTES HUMANOS del buzón: tiempos de respuesta aparentes, tono, resolución. El bot solo valida códigos; lo que se evalúa aquí es la atención humana posterior.`,
};

function formatearConversaciones(convs: { session_id: string; messages: SesionMsg[] }[], fecha: string): { texto: string; total: number } {
  let total = 0;
  const bloques: string[] = [];
  for (const c of convs) {
    const delDia = (c.messages ?? []).filter((m) => (m.at ?? "").startsWith(fecha));
    if (delDia.length === 0) continue;
    total += delDia.length;
    bloques.push(`### Conversación ${c.session_id.replace(/:\+?\d+$/, ":***")}\n` + delDia.map((m) => `${m.role === "user" ? "CLIENTE" : "BOT"}: ${m.content}`).join("\n"));
  }
  return { texto: bloques.join("\n\n").slice(0, 150_000), total };
}

const TOOL_INFORME: Anthropic.Tool = {
  name: "guardar_informe",
  description: "Guarda el informe de evaluación del día.",
  input_schema: {
    type: "object",
    properties: {
      executive_summary: { type: "string", description: "3-5 frases en español" },
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      knowledge_gaps: { type: "array", items: { type: "string" }, description: "preguntas de clientes que el conocimiento no cubría" },
      prompt_suggestions: { type: "array", items: { type: "string" } },
      quality_score: { type: "number", description: "0 a 10, un decimal" },
      suggestions: {
        type: "array",
        description: "Máximo 4 sugerencias accionables para revisión humana",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["prompt", "knowledge"] },
            title: { type: "string", description: "título corto y único" },
            recommendation: { type: "string", description: "por qué, citando lo observado" },
            content: { type: "string", description: "texto propuesto: viñeta de prompt o cuerpo del artículo" },
            kb_topic: { type: "string" },
            kb_question: { type: "string", description: "la pregunta del cliente que respondería" },
          },
          required: ["type", "title", "recommendation", "content"],
        },
      },
    },
    required: ["executive_summary", "strengths", "weaknesses", "recommendations", "knowledge_gaps", "prompt_suggestions", "quality_score", "suggestions"],
  },
};

async function analizar(bot: Bot, fecha: string, conversaciones: string, extra: string): Promise<Informe> {
  const db = supabaseAdmin();
  const inventario = await fetchAll<{ title: string; category: string | null }>(
    db.from("knowledge").select("title, category").eq("bot_key", bot.key).eq("enabled", true).order("title"),
  );
  const system = `Eres el supervisor de calidad de los bots de ${APP_NAME}. Analizas conversaciones reales y produces un informe honesto y accionable en español. No inventes: cita solo lo que está en las conversaciones. Guarda el informe con la herramienta guardar_informe.`;
  const user = `## Bot evaluado
${bot.name} (rol: ${bot.role}) · fecha analizada: ${fecha}

## Enfoque del análisis
${ANALISIS_POR_ROL[bot.role]}

## Prompt vigente del bot
${bot.prompt}

## Inventario de conocimiento (${inventario.length} artículos)
${inventario.map((k) => `- [${k.category ?? "sin categoría"}] ${k.title}`).join("\n") || "(vacío)"}
${extra}

## Conversaciones de ${fecha}
${conversaciones}`;

  const response = await anthropic().messages.create({
    model: BOT_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
    tools: [TOOL_INFORME],
    tool_choice: { type: "tool", name: "guardar_informe" },
  });
  const call = response.content.find((b) => b.type === "tool_use");
  if (!call) throw new Error("El modelo no devolvió el informe");
  const inf = call.input as Informe;
  inf.suggestions = (inf.suggestions ?? []).slice(0, 4);
  inf.quality_score = Math.max(0, Math.min(10, Number(inf.quality_score) || 0));
  return inf;
}

export type ResultadoEvaluacion = { bot_key: string; status: "ok" | "sin_conversaciones" | "error"; conversaciones: number; mensajes: number; quality_score?: number; sugerencias?: number; error?: string };

export async function evaluarBot(bot: Bot, fecha: string, dry: boolean): Promise<ResultadoEvaluacion> {
  const db = supabaseAdmin();
  try {
    // Conversaciones tocadas alrededor de la fecha (el filtro fino es por mensaje).
    const convs = await fetchAll<{ session_id: string; messages: SesionMsg[] }>(
      db.from("bot_conversations").select("session_id, messages")
        .eq("bot_key", bot.key)
        .gte("updated_at", `${fecha}T00:00:00Z`)
        .order("session_id"),
    );
    const { texto, total } = formatearConversaciones(convs, fecha);
    const analizadas = convs.filter((c) => (c.messages ?? []).some((m) => (m.at ?? "").startsWith(fecha))).length;

    if (analizadas === 0) {
      if (!dry) {
        await db.from("supervisor_reports").upsert({
          report_date: fecha, bot_key: bot.key, status: "sin_conversaciones", conversations_analyzed: 0, total_messages: 0,
        }, { onConflict: "report_date,bot_key" });
      }
      return { bot_key: bot.key, status: "sin_conversaciones", conversaciones: 0, mensajes: 0 };
    }
    if (dry) return { bot_key: bot.key, status: "ok", conversaciones: analizadas, mensajes: total };
    if (!hayAnthropic()) throw new Error("ANTHROPIC_API_KEY sin configurar");

    // Estadísticas reales de compromisos para retención ([[R: …]] guardado en sesión).
    let extra = "";
    if (bot.role === "retencion") {
      const { data: ses } = await db.from("whatsapp_sessions").select("user_info").eq("bot_key", bot.key).limit(1000);
      const resultados = (ses ?? []).map((x) => (x.user_info as { ultimo_resultado?: string })?.ultimo_resultado).filter(Boolean);
      const cuenta: Record<string, number> = {};
      for (const r of resultados) { const k = String(r).split("|")[0].trim(); cuenta[k] = (cuenta[k] ?? 0) + 1; }
      extra = `\n## Estadísticas reales de compromisos (todas las sesiones)\n${Object.entries(cuenta).map(([k, n]) => `- ${k}: ${n}`).join("\n") || "- sin datos"}`;
    }

    const inf = await analizar(bot, fecha, texto, extra);
    await db.from("supervisor_reports").upsert({
      report_date: fecha, bot_key: bot.key, status: "ok",
      conversations_analyzed: analizadas, total_messages: total,
      executive_summary: inf.executive_summary,
      strengths: inf.strengths, weaknesses: inf.weaknesses, recommendations: inf.recommendations,
      knowledge_gaps: inf.knowledge_gaps, prompt_suggestions: inf.prompt_suggestions,
      full_report: JSON.stringify(inf, null, 2), quality_score: inf.quality_score,
    }, { onConflict: "report_date,bot_key" });

    // Sugerencias: ≤4 AL DÍA por bot (contando las ya existentes de esa fecha:
    // repetir el cron redacta títulos distintos y el UNIQUE por título no basta,
    // 2026-08-23, cazado por E2E). ignoreDuplicates cubre títulos idénticos.
    // Nunca para el inbox.
    let sugerencias = 0;
    if (bot.role !== "inbox" && inf.suggestions.length > 0) {
      const { count: yaHoy } = await db.from("supervisor_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("bot_key", bot.key).eq("report_date", fecha);
      const hueco = Math.max(0, 4 - (yaHoy ?? 0));
      const filas = inf.suggestions.slice(0, hueco).map((s) => ({
        bot_key: bot.key, report_date: fecha, type: s.type, title: s.title.slice(0, 200),
        recommendation: s.recommendation, content: s.content,
        kb_topic: s.kb_topic ?? null, kb_question: s.kb_question ?? null,
        campaign_key: bot.role === "retencion" ? `retencion-${fecha}` : null,
      }));
      if (filas.length > 0) {
        const { data } = await db.from("supervisor_suggestions").upsert(filas, { onConflict: "bot_key,type,title", ignoreDuplicates: true }).select("id");
        sugerencias = data?.length ?? 0;
      }
    }
    return { bot_key: bot.key, status: "ok", conversaciones: analizadas, mensajes: total, quality_score: inf.quality_score, sugerencias };
  } catch (e) {
    await db.from("supervisor_reports").upsert({
      report_date: fecha, bot_key: bot.key, status: "error", conversations_analyzed: 0, total_messages: 0,
      executive_summary: `Error del evaluador: ${(e as Error).message}`,
    }, { onConflict: "report_date,bot_key" }).then(() => null, () => null);
    return { bot_key: bot.key, status: "error", conversaciones: 0, mensajes: 0, error: (e as Error).message };
  }
}

export async function evaluarTodos(fecha: string, dry: boolean): Promise<ResultadoEvaluacion[]> {
  const { data: bots } = await supabaseAdmin().from("bots").select("key, name, role, prompt, twilio_number, active").eq("active", true).order("key");
  const out: ResultadoEvaluacion[] = [];
  for (const bot of (bots ?? []) as Bot[]) out.push(await evaluarBot(bot, fecha, dry));
  return out;
}
