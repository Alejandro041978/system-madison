import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { STUDENT_COLS } from "@/lib/students";
import { recomputeSituations } from "@/lib/situations";

const SITUACIONES = ["activo", "egresado", "retiro", "campus_socio"];

/**
 * PATCH {id, source: 'manual', situation, note}  → congela la situación a mano (con motivo obligatorio)
 * PATCH {id, source: 'auto'}                      → vuelve a derivarla y la recalcula ya
 * Es la única vía para tocar situation: la ficha no la edita.
 */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "students");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const db = supabaseAdmin();

  if (b.source === "manual") {
    if (!SITUACIONES.includes(b.situation)) return NextResponse.json({ error: "Situación inválida" }, { status: 400 });
    const note = String(b.note ?? "").trim();
    if (!note) return NextResponse.json({ error: "Una situación manual exige motivo" }, { status: 400 });
    const { data, error } = await db
      .from("academic_students")
      .update({ situation: b.situation, situation_source: "manual", situation_note: note, updated_by: g.identity.email })
      .eq("id", b.id)
      .select(STUDENT_COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (b.source === "auto") {
    const { error } = await db
      .from("academic_students")
      .update({ situation_source: "auto", situation_note: null, updated_by: g.identity.email })
      .eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const r = await recomputeSituations({ studentIds: [b.id], actor: g.identity.email });
    const { data } = await db.from("academic_students").select(STUDENT_COLS).eq("id", b.id).single();
    return NextResponse.json({ ...data, recompute: r });
  }

  return NextResponse.json({ error: "source debe ser 'manual' o 'auto'" }, { status: 400 });
}
