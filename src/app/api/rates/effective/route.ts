import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { tarifaVigente, isoDate } from "@/lib/rates";

/**
 * GET ?program_id=<uuid>&date=YYYY-MM-DD → tarifa vigente para ese programa
 * en esa fecha (la misma función que usará el snapshot de matrícula).
 * Sirve para el criterio de "hecho" del Módulo 1.
 */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const programId = sp.get("program_id");
  const date = sp.get("date") || isoDate();
  if (!programId) return NextResponse.json({ error: "Falta program_id" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date debe ser YYYY-MM-DD" }, { status: 400 });
  try {
    const t = await tarifaVigente(programId, date);
    return NextResponse.json({ program_id: programId, date, vigente: t });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
