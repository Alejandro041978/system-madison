import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { auditarTuition } from "@/lib/tuition-audit";

/** Auditor de tuition: esperado vs facturado por matrícula y categoría. Reporta; no corrige. */
export async function GET(req: Request) {
  const g = await guardApi(req, "accounts");
  if (!g.ok) return g.response;
  try {
    return NextResponse.json(await auditarTuition());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
