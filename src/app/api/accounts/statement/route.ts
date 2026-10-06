import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { getEnrollment, DomainError } from "@/lib/enrollments";
import { computeTuition } from "@/lib/tuition";
import { cargosDeMatricula, pagosDeCargos } from "@/lib/billing";

/** GET ?enrollment_id= → cascada + cargos + pagos (el estado de cuenta completo). */
export async function GET(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  const enrollmentId = new URL(req.url).searchParams.get("enrollment_id");
  if (!enrollmentId) return NextResponse.json({ error: "Falta enrollment_id" }, { status: 400 });
  try {
    const enr = await getEnrollment(enrollmentId);
    if (!enr) return NextResponse.json({ error: "Matrícula no encontrada" }, { status: 404 });
    const [tuition, charges] = await Promise.all([computeTuition(enr), cargosDeMatricula(enrollmentId)]);
    const payments = await pagosDeCargos(charges.map((c) => c.id));
    return NextResponse.json({ enrollment: enr, tuition, charges, payments });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
