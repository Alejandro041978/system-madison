import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { generarCuotas, refacturar } from "@/lib/billing";
import { DomainError } from "@/lib/enrollments";

function handle(e: unknown) {
  if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

/** POST {enrollment_id} → genera el plan de cuotas (idempotente). */
export async function POST(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.enrollment_id) return NextResponse.json({ error: "Falta enrollment_id" }, { status: 400 });
  try {
    return NextResponse.json(await generarCuotas(b.enrollment_id, g.identity.email), { status: 201 });
  } catch (e) { return handle(e); }
}

/**
 * PUT {enrollment_id, confirm?} → refacturar. Sin confirm devuelve el
 * ensayo (qué se conservaría y qué se rehace); con confirm aplica.
 * Solo cuotas sin movimientos; exige can_edit en esta página (guardApi).
 */
export async function PUT(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.enrollment_id) return NextResponse.json({ error: "Falta enrollment_id" }, { status: 400 });
  try {
    return NextResponse.json(await refacturar(b.enrollment_id, g.identity.email, { confirm: !!b.confirm }));
  } catch (e) { return handle(e); }
}
