import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { decidirFicha, ENROLL_COLS } from "@/lib/enroll";
import { DomainError } from "@/lib/enrollments";

/** Bandeja del equipo (page_key leads): listar y decidir fichas de inscripción. */
export async function GET(req: Request) {
  const g = await guardApi(req, "leads");
  if (!g.ok) return g.response;
  try {
    const filas = await fetchAll(
      supabaseAdmin().from("enrollment_requests").select(ENROLL_COLS).order("created_at", { ascending: false }),
    );
    return NextResponse.json(filas);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** PATCH {id, action: confirmar_pago | formalizar | anular}. */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "leads");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id || !["confirmar_pago", "formalizar", "anular"].includes(b?.action)) {
    return NextResponse.json({ error: "id y action válidos son obligatorios" }, { status: 400 });
  }
  try {
    return NextResponse.json(await decidirFicha(b.id, b.action, g.identity.email));
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
