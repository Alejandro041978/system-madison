import { NextResponse } from "next/server";
import { completarFicha, declararPago } from "@/lib/enroll";
import { DomainError } from "@/lib/enrollments";

/**
 * API PÚBLICA de la ficha de inscripción: la autenticación es el token
 * aleatorio de la ficha (32 hex, caduca a 14 días). El proxy la deja pasar
 * sin sesión (/api/enroll en PUBLIC_PATHS). Sin token válido, 404.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const token = String(b?.token ?? "");
  try {
    if (b?.action === "complete") return NextResponse.json(sanear(await completarFicha(token, b)));
    if (b?.action === "payment_reference") return NextResponse.json(sanear(await declararPago(token, String(b?.reference ?? ""))));
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[enroll]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** Al público solo se le devuelve lo suyo imprescindible. */
function sanear(r: { status: string; program_name: string | null; payment_reference: string | null }) {
  return { status: r.status, program_name: r.program_name, payment_reference: r.payment_reference };
}
