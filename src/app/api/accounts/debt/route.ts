import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { reporteDeuda } from "@/lib/tuition-audit";

/** Reporte de deuda: facturado / pagado / saldo / vencido por matrícula viva. */
export async function GET(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  try {
    return NextResponse.json(await reporteDeuda());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
