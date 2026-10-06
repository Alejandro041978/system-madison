import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { indexarConocimiento } from "@/lib/knowledge";

/** POST {bot_key} → reindexa TODO el conocimiento del bot (tras cambiar de modelo de embeddings o importar). */
export async function POST(req: Request) {
  const g = await guardApi(req, "bots");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.bot_key) return NextResponse.json({ error: "Falta bot_key" }, { status: 400 });
  try {
    const arts = await fetchAll<{ id: string }>(
      supabaseAdmin().from("knowledge").select("id").eq("bot_key", b.bot_key).order("id"),
    );
    let chunks = 0, conEmbedding = 0;
    for (const a of arts) {
      const r = await indexarConocimiento(a.id);
      chunks += r.chunks; conEmbedding += r.conEmbedding;
    }
    return NextResponse.json({ articulos: arts.length, chunks, conEmbedding });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
