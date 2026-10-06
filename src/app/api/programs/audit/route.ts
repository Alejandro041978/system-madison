import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { auditarProgramas } from "@/lib/programs-audit";

/** Auditor del Módulo 1: reporta, no corrige. */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  try {
    return NextResponse.json(await auditarProgramas());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
