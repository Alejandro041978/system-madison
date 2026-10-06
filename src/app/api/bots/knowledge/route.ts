import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { indexarConocimiento, buscarConocimiento, KNOWLEDGE_COLS } from "@/lib/knowledge";

/** GET ?bot=<key> [&q=<consulta de prueba>] → artículos del bot; con q, además el resultado de la búsqueda híbrida. */
export async function GET(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const bot = sp.get("bot");
  if (!bot) return NextResponse.json({ error: "Falta bot" }, { status: 400 });
  try {
    const articulos = await fetchAll(
      supabaseAdmin().from("knowledge").select(KNOWLEDGE_COLS).eq("bot_key", bot).order("category").order("title"),
    );
    const q = sp.get("q");
    const prueba = q ? await buscarConocimiento(bot, q) : undefined;
    return NextResponse.json({ articulos, prueba });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST {bot_key, title, content, category?} → crea e indexa. También {items: [...]} para importación en lote. */
export async function POST(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const items = Array.isArray(b?.items) ? b.items : [b];
  const creados: { id: string; title: string; chunks: number; conEmbedding: number }[] = [];
  const errores: string[] = [];
  for (const item of items.slice(0, 100)) {
    const title = String(item?.title ?? "").trim();
    const content = String(item?.content ?? "").trim();
    const bot_key = String(item?.bot_key ?? b?.bot_key ?? "").trim();
    if (!title || !content || !bot_key) { errores.push(`«${title || "(sin título)"}»: título, contenido y bot son obligatorios`); continue; }
    const { data, error } = await supabaseAdmin()
      .from("knowledge")
      .insert({ bot_key, title, content, category: item?.category?.trim() || null, created_by: g.identity.email })
      .select("id, title").single();
    if (error) { errores.push(`«${title}»: ${error.message}`); continue; }
    try {
      const idx = await indexarConocimiento(data.id);
      creados.push({ id: data.id, title: data.title, ...idx });
    } catch (e) {
      errores.push(`«${title}» creado pero sin indexar: ${(e as Error).message}`);
    }
  }
  return NextResponse.json({ creados, errores }, { status: errores.length && !creados.length ? 400 : 201 });
}

/** PATCH {id, title?, content?, category?, enabled?} → edita y reindexa si cambió el texto. */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("title" in b) patch.title = String(b.title).trim();
  if ("content" in b) patch.content = String(b.content);
  if ("category" in b) patch.category = b.category?.trim() || null;
  if ("enabled" in b) patch.enabled = !!b.enabled;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("knowledge").update(patch).eq("id", b.id).select(KNOWLEDGE_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let reindexado = null;
  if ("title" in patch || "content" in patch) {
    try { reindexado = await indexarConocimiento(b.id); } catch (e) { return NextResponse.json({ ...data, error_indexado: (e as Error).message }); }
  }
  return NextResponse.json({ ...data, reindexado });
}

/** DELETE {id} → borra el artículo (los trozos caen en cascada). */
export async function DELETE(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const { data: row } = await supabaseAdmin().from("knowledge").select("id, title").eq("id", b.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Artículo no encontrado" }, { status: 404 });
  const { error } = await supabaseAdmin().from("knowledge").delete().eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, borrado: row.title });
}
