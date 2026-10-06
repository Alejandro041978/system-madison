import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

/** GET ?id=<student_id> → últimos 100 cambios de la ficha. */
export async function GET(req: Request) {
  const g = await guardApi(req, "students");
  if (!g.ok) return g.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("academic_students_audit")
    .select("id, changed_by, action, changes, created_at")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
