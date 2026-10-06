import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";

const COLS = "id, bot_key, phone, name, email, program_interest, prior_studies, stage, qualified, notes, meta, created_at, updated_at";
const STAGES = ["nuevo", "contactable", "calificado", "interesado", "inscrito", "descartado"];

/** GET [?stage=] → leads (más recientes primero). */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const stage = new URL(req.url).searchParams.get("stage");
  try {
    let q = supabaseAdmin().from("sales_leads").select(COLS).order("updated_at", { ascending: false });
    if (stage && STAGES.includes(stage)) q = q.eq("stage", stage);
    return NextResponse.json(await fetchAll(q));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** PATCH {id, stage?, qualified?, notes?, name?, email?, program_interest?} */
export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("stage" in b) {
    if (!STAGES.includes(b.stage)) return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    patch.stage = b.stage;
  }
  if ("qualified" in b) patch.qualified = !!b.qualified;
  for (const k of ["notes", "name", "email", "program_interest"]) if (k in b) patch[k] = b[k]?.trim() || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("sales_leads").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
