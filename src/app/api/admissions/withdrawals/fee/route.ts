import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { registrarPagoRetorno, DomainError } from "@/lib/enrollments";

/** POST {withdrawal_id, reference, paid_at?} → pago del trámite Retorno (manual hasta el Módulo 4). */
export async function POST(req: Request) {
  const g = await guardApi(req, "admissions");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.withdrawal_id) return NextResponse.json({ error: "Falta withdrawal_id" }, { status: 400 });
  try {
    return NextResponse.json(await registrarPagoRetorno(b.withdrawal_id, { reference: b.reference, paid_at: b.paid_at, actor: g.identity.email }));
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
