import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { versionarPrompt } from "@/lib/suggestions";
import { DomainError } from "@/lib/enrollments";

/** GET ?bot= → historial de versiones del prompt (recientes primero). */
export async function GET(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const bot = new URL(req.url).searchParams.get("bot");
  if (!bot) return NextResponse.json({ error: "Falta bot" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("bot_prompt_versions")
    .select("id, bot_key, version, prompt, reason, suggestion_id, created_by, created_at")
    .eq("bot_key", bot).order("version", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * POST {bot_key, version} → restaurar: crea una versión NUEVA con el
 * contenido de la antigua (la historia nunca se reescribe) y la deja vigente.
 */
export async function POST(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.bot_key || !b?.version) return NextResponse.json({ error: "bot_key y version son obligatorios" }, { status: 400 });
  const { data: vieja } = await supabaseAdmin()
    .from("bot_prompt_versions").select("prompt, version").eq("bot_key", b.bot_key).eq("version", Number(b.version)).maybeSingle();
  if (!vieja) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  try {
    const version = await versionarPrompt(b.bot_key, vieja.prompt, `restaurada v${vieja.version}`, g.identity.email);
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
