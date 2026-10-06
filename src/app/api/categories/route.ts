import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

const COLS = "id, name, sigla, passing_score, description, external_id, created_at, updated_at";

function err(e: { code?: string; message: string }) {
  if (e.code === "23505") return NextResponse.json({ error: "Ya existe una categoría con ese nombre o sigla" }, { status: 409 });
  if (e.code === "23514") return NextResponse.json({ error: "Datos inválidos (sigla de 1 a 5 caracteres, nota ≥ 0)" }, { status: 400 });
  return NextResponse.json({ error: e.message }, { status: 500 });
}

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const { data, error } = await supabaseAdmin().from("academic_programs_category").select(COLS).order("name");
  if (error) return err(error);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  const sigla = String(b?.sigla ?? "").trim().toUpperCase();
  const passing_score = Number(b?.passing_score);
  if (!name || !sigla || Number.isNaN(passing_score)) {
    return NextResponse.json({ error: "Nombre, sigla y nota mínima son obligatorios" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from("academic_programs_category")
    .insert({ name, sigla, passing_score, description: b?.description || null, external_id: b?.external_id || null })
    .select(COLS)
    .single();
  if (error) return err(error);
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = String(b.name).trim();
  if ("sigla" in b) patch.sigla = String(b.sigla).trim().toUpperCase();
  if ("passing_score" in b) patch.passing_score = Number(b.passing_score);
  if ("description" in b) patch.description = b.description || null;
  if ("external_id" in b) patch.external_id = b.external_id || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("academic_programs_category").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return err(error);
  return NextResponse.json(data);
}
