import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";

/**
 * Al crear una asignatura, inyectar su fila `no_iniciada` (intento 1,
 * source malla_nueva) en el registro curricular de los estudiantes con
 * matrícula VIVA (pendiente_pago o activa) en ese programa. Idempotente:
 * UNIQUE (student_id, course_id, attempt) evita duplicados.
 *
 * 2026-08-23: activado con el Módulo 3 (antes no existía la tabla).
 */
export async function alCrearAsignatura(
  courseId: string,
  programId: string,
  actor = "sistema",
): Promise<{ aplicado: boolean; filas: number; nota: string }> {
  const db = supabaseAdmin();
  const vivas = await fetchAll<{ id: string; student_id: string }>(
    db.from("academic_student_enrollments").select("id, student_id").eq("program_id", programId).in("status", ["pendiente_pago", "activa"]).order("id"),
  );
  if (vivas.length === 0) return { aplicado: true, filas: 0, nota: "Sin matrículas vivas en el programa" };
  const filas = vivas.map((e) => ({
    student_id: e.student_id, course_id: courseId, program_id: programId, program_enrollment_id: e.id,
    attempt: 1, status: "no_iniciada", source: "malla_nueva", opened_by: actor,
  }));
  const { error } = await db.from("academic_course_enrollments").upsert(filas, { onConflict: "student_id,course_id,attempt", ignoreDuplicates: true });
  if (error) return { aplicado: false, filas: 0, nota: `No se pudo inyectar: ${error.message}` };
  return { aplicado: true, filas: filas.length, nota: `Inyectada en ${filas.length} matrícula(s) viva(s)` };
}
