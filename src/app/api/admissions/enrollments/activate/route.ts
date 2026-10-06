import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { activarMatricula, DomainError } from "@/lib/enrollments";

/**
 * POST {id, note} → activación manual (force), con motivo, registrada en la
 * propia matrícula. La activación automática por pago llega con el Módulo 4.
 */
export async function POST(req: Request) {
  const g = await guardApi(req, "admissions");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  try {
    return NextResponse.json(await activarMatricula(b.id, { mode: "force", note: b.note, actor: g.identity.email }));
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
