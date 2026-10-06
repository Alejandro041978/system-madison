import { NextResponse } from "next/server";
import { guardApi, guardSuperadmin } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { registrarPago, PAYMENT_COLS } from "@/lib/billing";
import { DomainError } from "@/lib/enrollments";

function handle(e: unknown) {
  if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

/**
 * POST {charge_id, amount, paid_date?, payment_type, series_code?, receipt_number?, transaction_reference?, note?}
 * series_code='DESCUENTO' → solo superadmin (reduce deuda, no es ingreso).
 */
export async function POST(req: Request) {
  const b = await req.clone().json().catch(() => null);
  const esDescuento = b?.series_code === "DESCUENTO" || b?.payment_type === "DESCUENTO";
  const g = esDescuento ? await guardSuperadmin(req) : await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  if (!b?.charge_id || !b?.payment_type) return NextResponse.json({ error: "charge_id y payment_type son obligatorios" }, { status: 400 });
  try {
    const r = await registrarPago({
      charge_id: b.charge_id, amount: Number(b.amount), paid_date: b.paid_date, payment_type: b.payment_type,
      series_code: esDescuento ? "DESCUENTO" : b.series_code, receipt_number: b.receipt_number,
      transaction_reference: b.transaction_reference, note: b.note, actor: g.identity.email,
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) { return handle(e); }
}

/** PATCH {id, void_reason} → anular un pago (no se borra; método PATCH → permiso de editar). */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id || !String(b?.void_reason ?? "").trim()) return NextResponse.json({ error: "id y void_reason son obligatorios" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("account_payments")
    .update({ voided_at: new Date().toISOString(), voided_by: g.identity.email, void_reason: String(b.void_reason).trim() })
    .eq("id", b.id).is("voided_at", null)
    .select(PAYMENT_COLS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Pago no encontrado o ya anulado" }, { status: 404 });
  return NextResponse.json(data);
}
