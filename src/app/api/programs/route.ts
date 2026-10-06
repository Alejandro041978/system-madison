import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";

const COLS = "id, category_id, name, code, description, partner_campus, active, external_id, created_at, updated_at";

function err(e: { code?: string; message: string }) {
  if (e.code === "23505") return NextResponse.json({ error: "Ya existe un programa con ese código" }, { status: 409 });
  if (e.code === "23503") return NextResponse.json({ error: "La categoría indicada no existe" }, { status: 400 });
  return NextResponse.json({ error: e.message }, { status: 500 });
}

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  try {
    const rows = await fetchAll(supabaseAdmin().from("academic_programs").select(COLS).order("name"));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  const code = String(b?.code ?? "").trim().toUpperCase();
  if (!name || !code || !b?.category_id) {
    return NextResponse.json({ error: "Nombre, código y categoría son obligatorios" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from("academic_programs")
    .insert({
      name, code, category_id: b.category_id,
      description: b?.description || null,
      partner_campus: !!b?.partner_campus,
      external_id: b?.external_id || null,
    })
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
  if ("code" in b) patch.code = String(b.code).trim().toUpperCase();
  if ("category_id" in b) patch.category_id = b.category_id;
  if ("description" in b) patch.description = b.description || null;
  if ("partner_campus" in b) patch.partner_campus = !!b.partner_campus;
  if ("active" in b) patch.active = !!b.active;
  if ("external_id" in b) patch.external_id = b.external_id || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("academic_programs").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return err(error);
  return NextResponse.json(data);
}
