import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

const COLS = "id, enrollment_id, percentage, note, granted_at, granted_by, revoked_at, revoked_by, revoke_reason";

/** POST {enrollment_id, percentage, note?} → conceder beca (solo %; una activa por matrícula). */
export async function POST(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const pct = Number(b?.percentage);
  if (!b?.enrollment_id || Number.isNaN(pct) || pct <= 0 || pct > 100) {
    return NextResponse.json({ error: "enrollment_id y porcentaje (0–100] son obligatorios" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from("scholarships")
    .insert({ enrollment_id: b.enrollment_id, percentage: pct, note: b?.note?.trim() || null, granted_by: g.identity.email })
    .select(COLS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "La matrícula ya tiene una beca activa; revócala primero" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/** PATCH {id, revoke_reason} → revocar. */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id || !String(b?.revoke_reason ?? "").trim()) return NextResponse.json({ error: "id y revoke_reason son obligatorios" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("scholarships")
    .update({ revoked_at: new Date().toISOString(), revoked_by: g.identity.email, revoke_reason: String(b.revoke_reason).trim() })
    .eq("id", b.id).is("revoked_at", null)
    .select(COLS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Beca no encontrada o ya revocada" }, { status: 404 });
  return NextResponse.json(data);
}
