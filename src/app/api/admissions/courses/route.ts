import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { cambiarEstadoAsignatura, DomainError, type AccionAsignatura } from "@/lib/enrollments";

const ACCIONES: AccionAsignatura[] = ["abrir", "aprobar", "reprobar", "retirar", "nuevo_intento", "reabrir"];

/** PATCH {id, action, note?} sobre una fila del registro curricular. */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "admissions");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id || !ACCIONES.includes(b?.action)) {
    return NextResponse.json({ error: "id y action válidos son obligatorios" }, { status: 400 });
  }
  try {
    return NextResponse.json(await cambiarEstadoAsignatura(b.id, b.action, { actor: g.identity.email, note: b.note }));
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
