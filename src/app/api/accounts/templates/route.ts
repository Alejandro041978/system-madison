import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

const COLS = "id, name, initial_amount, installments, frequency_months, first_installment_offset_months, active, created_at";

export async function GET(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const db = supabaseAdmin();
  const [templates, targets] = await Promise.all([
    db.from("billing_templates").select(COLS).order("name"),
    db.from("billing_template_targets").select("id, template_id, program_id, category_id"),
  ]);
  if (templates.error) return NextResponse.json({ error: templates.error.message }, { status: 500 });
  return NextResponse.json({ templates: templates.data, targets: targets.data ?? [] });
}

/** POST plantilla nueva. */
export async function POST(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  const installments = Number(b?.installments);
  if (!name || !(installments >= 1)) return NextResponse.json({ error: "Nombre y nº de cuotas (≥1) son obligatorios" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("billing_templates").insert({
    name, installments,
    initial_amount: Number(b?.initial_amount) || 0,
    frequency_months: Number(b?.frequency_months) >= 1 ? Number(b.frequency_months) : 1,
    first_installment_offset_months: Number(b?.first_installment_offset_months) >= 0 ? Number(b.first_installment_offset_months) : 0,
    created_by: g.identity.email,
  }).select(COLS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una plantilla con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/** PATCH {id, ...campos} · también {id, add_target: {program_id|category_id}} y {id, remove_target: <target_id>}. */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const db = supabaseAdmin();

  if (b.add_target) {
    const { program_id, category_id } = b.add_target;
    if (!program_id === !category_id) return NextResponse.json({ error: "El destino es un programa O una categoría" }, { status: 400 });
    const { data, error } = await db.from("billing_template_targets")
      .insert({ template_id: b.id, program_id: program_id || null, category_id: category_id || null }).select().single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Ese programa/categoría ya tiene plantilla asignada" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  }
  if (b.remove_target) {
    const { error } = await db.from("billing_template_targets").delete().eq("id", b.remove_target).eq("template_id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = String(b.name).trim();
  if ("initial_amount" in b) patch.initial_amount = Number(b.initial_amount) || 0;
  if ("installments" in b) patch.installments = Number(b.installments);
  if ("frequency_months" in b) patch.frequency_months = Number(b.frequency_months);
  if ("first_installment_offset_months" in b) patch.first_installment_offset_months = Number(b.first_installment_offset_months);
  if ("active" in b) patch.active = !!b.active;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await db.from("billing_templates").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
