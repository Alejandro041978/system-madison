import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { moverPago } from "@/lib/billing";
import { DomainError } from "@/lib/enrollments";

/** POST {payment_id, target_charge_id} → mover un pago a otro cargo del MISMO estudiante. */
export async function POST(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.payment_id || !b?.target_charge_id) return NextResponse.json({ error: "payment_id y target_charge_id son obligatorios" }, { status: 400 });
  try {
    return NextResponse.json(await moverPago(b.payment_id, b.target_charge_id, g.identity.email));
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
