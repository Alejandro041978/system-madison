import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { invitarColaborador } from "@/lib/invitations";
import { DomainError } from "@/lib/enrollments";

/** Enviar (o reenviar) la invitación de acceso de una ficha. page_key: staff (prefijo /api/staff). */
export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  const employeeId = String(body?.employee_id ?? "");
  if (!employeeId) return NextResponse.json({ error: "employee_id es obligatorio" }, { status: 400 });
  try {
    const r = await invitarColaborador(employeeId, g.identity.email);
    return NextResponse.json(r);
  } catch (e) {
    const status = e instanceof DomainError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
