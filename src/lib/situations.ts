import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll, lotes } from "@/lib/db";
import type { Student } from "@/lib/students";

/**
 * MOTOR DE SITUACIÓN — idempotente. La situación del estudiante se DERIVA,
 * nunca se escribe a mano; solo situation_source = 'manual' la congela.
 *
 * Reglas (BLUEPRINT · Módulo 2, modelo sin LOA desde 2026-08-23):
 *   1. tiene matrículas y TODAS están retiradas        → retiro
 *   2. tiene matrículas y TODAS están finalizadas      → egresado
 *   3. alguna matrícula viva en programa partner_campus → campus_socio
 *   4. si no                                           → activo
 * "Viva" = pendiente_pago o activa. El retiro pertenece a la matrícula:
 * retirado de un programa con otro activo, el estudiante sigue activo.
 *
 * El motor detecta si existen las tablas del Módulo 3; sin ellas aplica
 * solo la regla 4 (permite correr el cron desde el Módulo 2).
 */

type Situacion = Student["situation"];

type Hechos = {
  retiro: Set<string>;      // todas sus matrículas retiradas
  egresado: Set<string>;    // todas sus matrículas finalizadas
  campusSocio: Set<string>; // alguna matrícula viva en campus socio
};

/**
 * 2026-08-23: con HEAD (head: true) PostgREST no devuelve cuerpo y el 404 de
 * "relation does not exist" llegaba como error=null → el cron anunciaba
 * reglas activas sobre tablas inexistentes. Se usa un GET con limit(0).
 */
async function tablaExiste(nombre: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from(nombre).select("*").limit(0);
  return !error;
}

async function cargarHechos(studentIds: string[]): Promise<Hechos> {
  const h: Hechos = { retiro: new Set(), egresado: new Set(), campusSocio: new Set() };
  const db = supabaseAdmin();
  if (!(await tablaExiste("academic_student_enrollments"))) return h;

  const porEstudiante = new Map<string, { vivas: number; retiradas: number; finalizadas: number; socio: number }>();
  for (const lote of lotes(studentIds)) {
    const { data, error } = await db
      .from("academic_student_enrollments")
      .select("student_id, status, academic_programs!inner(partner_campus)")
      .in("student_id", lote);
    if (error) throw new Error(`academic_student_enrollments: ${error.message}`);
    for (const e of data ?? []) {
      const prog = e.academic_programs as unknown as { partner_campus: boolean } | null;
      const c = porEstudiante.get(e.student_id) ?? { vivas: 0, retiradas: 0, finalizadas: 0, socio: 0 };
      if (e.status === "retirada") c.retiradas++;
      else if (e.status === "finalizada") c.finalizadas++;
      else { c.vivas++; if (prog?.partner_campus) c.socio++; }
      porEstudiante.set(e.student_id, c);
    }
  }
  for (const [id, c] of porEstudiante) {
    const total = c.vivas + c.retiradas + c.finalizadas;
    if (total > 0 && c.retiradas === total) h.retiro.add(id);
    else if (total > 0 && c.finalizadas === total) h.egresado.add(id);
    else if (c.socio > 0) h.campusSocio.add(id);
  }
  return h;
}

export function derivarSituacion(id: string, h: Hechos): Situacion {
  if (h.retiro.has(id)) return "retiro";
  if (h.egresado.has(id)) return "egresado";
  if (h.campusSocio.has(id)) return "campus_socio";
  return "activo";
}

export type RecomputeResult = {
  dry: boolean;
  revisados: number;
  manuales: number;
  cambios: { id: string; de: Situacion; a: Situacion }[];
  reglasActivas: string[];
};

/** Recalcula todos (o una lista). dry=true no escribe. */
export async function recomputeSituations(opts: { dry?: boolean; studentIds?: string[]; actor?: string } = {}): Promise<RecomputeResult> {
  const db = supabaseAdmin();
  let q = db.from("academic_students").select("id, situation, situation_source").order("id");
  if (opts.studentIds?.length) q = q.in("id", opts.studentIds.slice(0, 150));
  const students = await fetchAll<{ id: string; situation: Situacion; situation_source: "auto" | "manual" }>(q);

  const autos = students.filter((s) => s.situation_source === "auto");
  const hechos = await cargarHechos(autos.map((s) => s.id));
  const cambios: RecomputeResult["cambios"] = [];
  for (const s of autos) {
    const nueva = derivarSituacion(s.id, hechos);
    if (nueva !== s.situation) cambios.push({ id: s.id, de: s.situation, a: nueva });
  }

  if (!opts.dry) {
    for (const c of cambios) {
      const { error } = await db
        .from("academic_students")
        .update({ situation: c.a, updated_by: opts.actor ?? "recomputeSituations" })
        .eq("id", c.id)
        .eq("situation_source", "auto"); // nunca pisar una manual
      if (error) throw new Error(`No se pudo actualizar ${c.id}: ${error.message}`);
    }
  }

  const reglasActivas = ["activo (defecto)"];
  if (await tablaExiste("academic_student_enrollments")) reglasActivas.unshift("retiro / egresado / campus socio por matrículas");

  return { dry: !!opts.dry, revisados: students.length, manuales: students.length - autos.length, cambios, reglasActivas };
}
