import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

const COLS = "id, name, category_id, term_year, term_block, registration_start_date, deadline_date, first_day, end_date, active, created_at";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function err(e: { code?: string; message: string }) {
  if (e.code === "23505") return NextResponse.json({ error: "Ya existe una convocatoria para esa categoría, año y bloque" }, { status: 409 });
  if (e.code === "23514") return NextResponse.json({ error: "Fechas incoherentes (inicio ≤ cierre; fin ≥ primer día) o bloque fuera de rango" }, { status: 400 });
  if (e.code === "23503") return NextResponse.json({ error: "Categoría inexistente" }, { status: 400 });
  return NextResponse.json({ error: e.message }, { status: 500 });
}

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const { data, error } = await supabaseAdmin().from("convocatorias").select(COLS).order("term_year", { ascending: false }).order("term_block", { ascending: false }).limit(500);
  if (error) return err(error);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  if (!name || !b?.category_id || !b?.term_year || !b?.term_block) return NextResponse.json({ error: "Nombre, categoría, año y bloque son obligatorios" }, { status: 400 });
  for (const k of ["registration_start_date", "deadline_date", "first_day"]) if (!DATE.test(String(b?.[k] ?? ""))) return NextResponse.json({ error: `Fecha inválida: ${k}` }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("convocatorias").insert({
    name, category_id: b.category_id, term_year: Number(b.term_year), term_block: Number(b.term_block),
    registration_start_date: b.registration_start_date, deadline_date: b.deadline_date, first_day: b.first_day,
    end_date: DATE.test(String(b?.end_date ?? "")) ? b.end_date : null,
  }).select(COLS).single();
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
  if ("active" in b) patch.active = !!b.active;
  for (const k of ["registration_start_date", "deadline_date", "first_day", "end_date"]) {
    if (k in b) patch[k] = DATE.test(String(b[k] ?? "")) ? b[k] : null;
  }
  if (patch.first_day === null) delete patch.first_day;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("convocatorias").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return err(error);
  return NextResponse.json(data);
}
