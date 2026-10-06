import { NextResponse } from "next/server";
import { guardStaff } from "@/lib/api-guard";

/** Identidad resuelta de la sesión actual (útil para depurar permisos). */
export async function GET(req: Request) {
  const g = await guardStaff(req);
  if (!g.ok) return g.response;
  return NextResponse.json(g.identity);
}
