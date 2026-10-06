import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { alCrearAsignatura } from "@/lib/courses";

const COLS = "id, program_id, name, code, credits, hours, level, sort_order, is_capstone, graduation_requirement, partner_campus, active, external_id, created_at, updated_at";

function err(e: { code?: string; message: string }) {
  if (e.code === "23505") return NextResponse.json({ error: "Ya existe una asignatura con ese código en el programa" }, { status: 409 });
  if (e.code === "23503") return NextResponse.json({ error: "El programa indicado no existe" }, { status: 400 });
  if (e.code === "23514") return NextResponse.json({ error: "Datos inválidos (créditos ≥ 0, nivel ≥ 1)" }, { status: 400 });
  return NextResponse.json({ error: e.message }, { status: 500 });
}

/** GET ?program_id=<uuid> */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const programId = new URL(req.url).searchParams.get("program_id");
  if (!programId) return NextResponse.json({ error: "Falta program_id" }, { status: 400 });
  try {
    const rows = await fetchAll(
      supabaseAdmin().from("academic_courses").select(COLS).eq("program_id", programId).order("level").order("sort_order").order("code"),
    );
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
  const credits = Number(b?.credits);
  if (!b?.program_id || !name || !code || Number.isNaN(credits)) {
    return NextResponse.json({ error: "Programa, nombre, código y créditos son obligatorios" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from("academic_courses")
    .insert({
      program_id: b.program_id, name, code, credits,
      hours: b?.hours === "" || b?.hours == null ? null : Number(b.hours),
      level: Number(b?.level) >= 1 ? Number(b.level) : 1,
      sort_order: Number(b?.sort_order) || 0,
      is_capstone: !!b?.is_capstone,
      graduation_requirement: b?.graduation_requirement === undefined ? true : !!b.graduation_requirement,
      partner_campus: !!b?.partner_campus,
      external_id: b?.external_id || null,
    })
    .select(COLS)
    .single();
  if (error) return err(error);

  const inyeccion = await alCrearAsignatura(data.id, data.program_id, g.identity.email);
  return NextResponse.json({ ...data, inyeccion }, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = String(b.name).trim();
  if ("code" in b) patch.code = String(b.code).trim().toUpperCase();
  if ("credits" in b) patch.credits = Number(b.credits);
  if ("hours" in b) patch.hours = b.hours === "" || b.hours == null ? null : Number(b.hours);
  if ("level" in b) patch.level = Number(b.level);
  if ("sort_order" in b) patch.sort_order = Number(b.sort_order) || 0;
  if ("is_capstone" in b) patch.is_capstone = !!b.is_capstone;
  if ("graduation_requirement" in b) patch.graduation_requirement = !!b.graduation_requirement;
  if ("partner_campus" in b) patch.partner_campus = !!b.partner_campus;
  if ("active" in b) patch.active = !!b.active;
  if ("external_id" in b) patch.external_id = b.external_id || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("academic_courses").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return err(error);
  return NextResponse.json(data);
}
