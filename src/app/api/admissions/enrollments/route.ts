import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { crearMatricula, DomainError, ENROLLMENT_COLS } from "@/lib/enrollments";

function handle(e: unknown) {
  if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

/** GET ?convocatoria_id= | ?student_id= | ?id= */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const convocatoriaId = sp.get("convocatoria_id");
  const studentId = sp.get("student_id");
  let q = supabaseAdmin().from("academic_student_enrollments").select(ENROLLMENT_COLS).order("created_at", { ascending: false }).limit(1000);
  if (id) q = q.eq("id", id);
  else if (convocatoriaId) q = q.eq("convocatoria_id", convocatoriaId);
  else if (studentId) q = q.eq("student_id", studentId);
  else return NextResponse.json({ error: "Indica id, convocatoria_id o student_id" }, { status: 400 });
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST {student_id, program_id, convocatoria_id, enrollment_date?} → nueva matrícula (pendiente_pago). */
export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.student_id || !b?.program_id || !b?.convocatoria_id) {
    return NextResponse.json({ error: "student_id, program_id y convocatoria_id son obligatorios" }, { status: 400 });
  }
  try {
    const r = await crearMatricula({
      student_id: b.student_id, program_id: b.program_id, convocatoria_id: b.convocatoria_id,
      enrollment_date: b.enrollment_date, actor: g.identity.email,
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return handle(e);
  }
}
