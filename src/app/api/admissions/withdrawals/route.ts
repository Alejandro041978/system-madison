import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { registrarRetiro, DomainError, WITHDRAWAL_COLS } from "@/lib/enrollments";

function handle(e: unknown) {
  if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

/** GET ?enrollment_id= | ?student_id= */
export async function GET(req: Request) {
  const g = await guardApi(req, "admissions");
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const enrollmentId = sp.get("enrollment_id");
  const studentId = sp.get("student_id");
  let q = supabaseAdmin().from("student_withdrawals").select(WITHDRAWAL_COLS).order("created_at", { ascending: false }).limit(200);
  if (enrollmentId) q = q.eq("enrollment_id", enrollmentId);
  else if (studentId) q = q.eq("student_id", studentId);
  else return NextResponse.json({ error: "Indica enrollment_id o student_id" }, { status: 400 });
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST {enrollment_id, reason, resolution_number?, date?} → Retiro. */
export async function POST(req: Request) {
  const g = await guardApi(req, "admissions");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.enrollment_id) return NextResponse.json({ error: "Falta enrollment_id" }, { status: 400 });
  try {
    const w = await registrarRetiro(b.enrollment_id, {
      reason: b.reason, resolution_number: b.resolution_number, date: b.date, actor: g.identity.email,
    });
    return NextResponse.json(w, { status: 201 });
  } catch (e) {
    return handle(e);
  }
}
