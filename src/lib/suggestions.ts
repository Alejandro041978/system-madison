import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { indexarConocimiento } from "@/lib/knowledge";
import { DomainError } from "@/lib/enrollments";

/**
 * MÓDULO 6 · Mejora continua. El supervisor propone; una persona revisa,
 * corrige y aprueba; solo entonces se aplica, con rastro.
 *
 * Regla de oro (BLUEPRINT): aprobar = PRIMERO aplica, LUEGO marca approved.
 * Si la aplicación falla, la sugerencia sigue pendiente.
 */

export const MARCADOR_MEJORAS = "═══ MEJORAS APROBADAS ═══";

export type Suggestion = {
  id: string; bot_key: string; report_date: string; type: "prompt" | "knowledge";
  title: string; recommendation: string; content: string | null;
  kb_topic: string | null; kb_question: string | null; kb_tags: string | null;
  status: "pending" | "approved" | "rejected";
  applied_at: string | null; applied_ref: string | null; reviewed_by: string | null;
  campaign_key: string | null; created_at: string;
};

export const SUGGESTION_COLS =
  "id, bot_key, report_date, type, title, recommendation, content, kb_topic, kb_question, kb_tags, status, applied_at, applied_ref, reviewed_by, campaign_key, created_at";

const db = () => supabaseAdmin();

/** Crea una versión nueva del prompt y deja bots.prompt como vigente. */
export async function versionarPrompt(botKey: string, nuevoPrompt: string, reason: string, actor: string, suggestionId?: string): Promise<number> {
  const { data: max } = await db().from("bot_prompt_versions").select("version").eq("bot_key", botKey).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (max?.version ?? 0) + 1;
  const { error: e1 } = await db().from("bot_prompt_versions").insert({
    bot_key: botKey, version, prompt: nuevoPrompt, reason, created_by: actor, suggestion_id: suggestionId ?? null,
  });
  if (e1) throw new DomainError(`bot_prompt_versions: ${e1.message}`, 500);
  const { error: e2 } = await db().from("bots").update({ prompt: nuevoPrompt }).eq("key", botKey);
  if (e2) throw new DomainError(`bots: ${e2.message}`, 500);
  return version;
}

/** Añade una viñeta bajo el marcador de mejoras (creándolo si no existe). */
export function incorporarMejora(promptActual: string, vineta: string, campaignKey: string | null): string {
  const linea = `• ${campaignKey ? `[SOLO EN CAMPAÑA ${campaignKey.toUpperCase()}] ` : ""}${vineta.trim().replace(/\r?\n+/g, " ")}`;
  if (promptActual.includes(MARCADOR_MEJORAS)) return `${promptActual.trimEnd()}\n${linea}`;
  return `${promptActual.trimEnd()}\n\n${MARCADOR_MEJORAS}\n${linea}`;
}

async function obtener(id: string): Promise<Suggestion> {
  const { data, error } = await db().from("supervisor_suggestions").select(SUGGESTION_COLS).eq("id", id).maybeSingle();
  if (error) throw new DomainError(error.message, 500);
  if (!data) throw new DomainError("Sugerencia no encontrada", 404);
  return data as Suggestion;
}

/** Edición: solo en pending; título y contenido no vacíos. */
export async function editarSugerencia(id: string, patch: { title?: string; recommendation?: string; content?: string; kb_topic?: string; kb_question?: string; kb_tags?: string }): Promise<Suggestion> {
  const s = await obtener(id);
  if (s.status !== "pending") throw new DomainError(`Solo se edita una sugerencia pendiente (está ${s.status})`, 409);
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new DomainError("El título no puede quedar vacío", 400);
    upd.title = patch.title.trim();
  }
  if (patch.content !== undefined) {
    if (!patch.content.trim()) throw new DomainError("El contenido no puede quedar vacío", 400);
    upd.content = patch.content;
  }
  if (patch.recommendation !== undefined) upd.recommendation = patch.recommendation;
  for (const k of ["kb_topic", "kb_question", "kb_tags"] as const) {
    if (patch[k] !== undefined) upd[k] = patch[k]?.trim() || null;
  }
  if (Object.keys(upd).length === 0) throw new DomainError("Nada que actualizar", 400);
  const { data, error } = await db().from("supervisor_suggestions").update(upd).eq("id", id).eq("status", "pending").select(SUGGESTION_COLS).single();
  if (error) throw new DomainError(error.message, 500);
  return data as Suggestion;
}

export async function rechazarSugerencia(id: string, actor: string): Promise<Suggestion> {
  const s = await obtener(id);
  if (s.status !== "pending") throw new DomainError(`Ya está ${s.status}`, 409);
  const { data, error } = await db().from("supervisor_suggestions")
    .update({ status: "rejected", reviewed_by: actor }).eq("id", id).eq("status", "pending")
    .select(SUGGESTION_COLS).single();
  if (error) throw new DomainError(error.message, 500);
  return data as Suggestion;
}

/**
 * Aprobación: PRIMERO aplica, LUEGO marca. Si aplicar lanza, la sugerencia
 * queda pendiente y el error sube al llamador.
 *  - prompt   → viñeta bajo el marcador + versión nueva. applied_ref = 'v<versión>'.
 *  - knowledge → artículo (title = kb_question || title, category = kb_topic),
 *    reindexando si ya existía uno con ese título para el bot. applied_ref = id del artículo.
 */
export async function aprobarSugerencia(id: string, actor: string): Promise<{ suggestion: Suggestion; applied_ref: string }> {
  const s = await obtener(id);
  if (s.status !== "pending") throw new DomainError(`Ya está ${s.status}`, 409);
  if (!s.content?.trim()) throw new DomainError("La sugerencia no tiene contenido; edítala antes de aprobar", 409);

  let appliedRef: string;
  if (s.type === "prompt") {
    const { data: bot } = await db().from("bots").select("prompt").eq("key", s.bot_key).maybeSingle();
    if (!bot) throw new DomainError("Bot no encontrado", 404);
    const nuevo = incorporarMejora(bot.prompt, s.content, s.campaign_key);
    const version = await versionarPrompt(s.bot_key, nuevo, `sugerencia aprobada: ${s.title}`, actor, s.id);
    appliedRef = `v${version}`;
  } else {
    const titulo = (s.kb_question?.trim() || s.title).slice(0, 300);
    const { data: existente } = await db().from("knowledge").select("id").eq("bot_key", s.bot_key).eq("title", titulo).maybeSingle();
    let artId: string;
    if (existente) {
      const { error } = await db().from("knowledge").update({ content: s.content, category: s.kb_topic ?? null, enabled: true }).eq("id", existente.id);
      if (error) throw new DomainError(error.message, 500);
      artId = existente.id;
    } else {
      const { data: art, error } = await db().from("knowledge")
        .insert({ bot_key: s.bot_key, title: titulo, content: s.content, category: s.kb_topic ?? null, created_by: actor })
        .select("id").single();
      if (error) throw new DomainError(error.message, 500);
      artId = art.id;
    }
    await indexarConocimiento(artId); // lanza si falla → sigue pendiente (y el artículo queda, reintentable)
    appliedRef = artId;
  }

  const { data, error } = await db().from("supervisor_suggestions")
    .update({ status: "approved", reviewed_by: actor, applied_at: new Date().toISOString(), applied_ref: appliedRef })
    .eq("id", id).eq("status", "pending")
    .select(SUGGESTION_COLS).single();
  if (error) throw new DomainError(`Aplicada (${appliedRef}) pero no se pudo marcar: ${error.message}`, 500);
  return { suggestion: data as Suggestion, applied_ref: appliedRef };
}
