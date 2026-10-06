import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

const COLS = "id, enrollment_id, percentage, amount, reason, granted_at, granted_by, revoked_at, revoked_by, revoke_reason";

/** POST {enrollment_id, percentage | amount, reason} → bono (XOR %/monto, motivo obligatorio). */
export async function POST(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const pct = b?.percentage === undefined || b?.percentage === "" || b?.percentage === null ? null : Number(b.percentage);
  const amt = b?.amount === undefined || b?.amount === "" || b?.amount === null ? null : Number(b.amount);
  const reason = String(b?.reason ?? "").trim();
  if (!b?.enrollment_id || !reason) return NextResponse.json({ error: "enrollment_id y motivo son obligatorios" }, { status: 400 });
  if ((pct === null) === (amt === null)) return NextResponse.json({ error: "Indica porcentaje O monto fijo, no ambos" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("bonuses")
    .insert({ enrollment_id: b.enrollment_id, percentage: pct, amount: amt, reason, granted_by: g.identity.email })
    .select(COLS).single();
  if (error) {
    if (error.code === "23514") return NextResponse.json({ error: "Valores fuera de rango (porcentaje 0–100, monto > 0)" }, { status: 400 });
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
    .from("bonuses")
    .update({ revoked_at: new Date().toISOString(), revoked_by: g.identity.email, revoke_reason: String(b.revoke_reason).trim() })
    .eq("id", b.id).is("revoked_at", null)
    .select(COLS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Bono no encontrado o ya revocado" }, { status: 404 });
  return NextResponse.json(data);
}
