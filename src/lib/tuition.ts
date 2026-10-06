import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll, lotes } from "@/lib/db";
import type { Enrollment } from "@/lib/enrollments";

/**
 * LA CASCADA (BLUEPRINT · Módulo 4) — una sola función, computeTuition().
 * Todas las pantallas (estado de cuenta, becas, bonos, auditor, plan de
 * cuotas) la llaman. Tres pantallas con tres precios fue el error más caro
 * del ERP anterior; aquí no hay segunda implementación.
 *
 *   lista     = tarifa congelada × créditos que lleva HOY
 *   ahorro    = créditos convalidados × tarifa
 *   becaBase  = max(0, lista − ahorro)
 *   beca      = becaBase × %
 *   afterBeca = lista − ahorro − beca
 *   bono      = monto fijo ? min(monto, afterBeca) : afterBeca × %
 *   total     = afterBeca − bono
 *
 * "Créditos que lleva" = TODAS las filas de su registro curricular (cada
 * intento cuenta: recursar consume créditos otra vez), incluidas las
 * convalidadas (que luego se restan como ahorro). Cero créditos → cero
 * tuition. Tarifa null → total null (*no pude calcular*, distinto de 0).
 */

export type Tuition = {
  moneda: string | null;
  tarifa: number | null;            // null = la matrícula no tiene snapshot de tarifa
  creditos: number;                 // créditos que lleva hoy (todos los intentos)
  creditosConvalidados: number;
  lista: number | null;
  ahorro: number | null;
  becaPct: number;                  // 0 si no hay beca activa
  beca: number | null;
  bono: number | null;              // suma de bonos activos, ya limitados
  total: number | null;             // null = no se pudo calcular (sin tarifa)
  sinRegistro: boolean;             // no hay ninguna fila en el registro curricular
};

type RegistroRow = { program_enrollment_id: string; course_id: string; source: string; credits: number };
type BecaRow = { enrollment_id: string; percentage: number };
type BonoRow = { enrollment_id: string; percentage: number | null; amount: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

function cascada(tarifa: number | null, creditos: number, convalidados: number, becaPct: number, bonos: BonoRow[]): Omit<Tuition, "moneda" | "sinRegistro" | "creditos" | "creditosConvalidados" | "becaPct" | "tarifa"> {
  if (tarifa == null) return { lista: null, ahorro: null, beca: null, bono: null, total: null };
  const lista = r2(tarifa * creditos);
  const ahorro = r2(tarifa * convalidados);
  const becaBase = Math.max(0, lista - ahorro);
  const beca = r2(becaBase * (becaPct / 100));
  const afterBeca = r2(lista - ahorro - beca);
  let bono = 0;
  let restante = afterBeca;
  for (const b of bonos) {
    const monto = b.amount != null ? Math.min(Number(b.amount), restante) : r2(restante * (Number(b.percentage) / 100));
    bono = r2(bono + monto);
    restante = r2(restante - monto);
  }
  return { lista, ahorro, beca, bono, total: r2(afterBeca - bono) };
}

/**
 * Versión EN BLOQUE (auditor, becas, bonos): misma regla para muchas
 * matrículas en una pasada. computeTuition() de una sola delega aquí para
 * que no puedan divergir.
 */
export async function computeTuitionEnBloque(enrollments: Enrollment[]): Promise<Map<string, Tuition>> {
  const db = supabaseAdmin();
  const out = new Map<string, Tuition>();
  if (enrollments.length === 0) return out;
  const ids = enrollments.map((e) => e.id);

  // créditos por asignatura de los programas implicados
  const programIds = [...new Set(enrollments.map((e) => e.program_id))];
  const credit = new Map<string, number>();
  for (const lote of lotes(programIds)) {
    const rows = await fetchAll<{ id: string; credits: number }>(
      db.from("academic_courses").select("id, credits").in("program_id", lote).order("id"),
    );
    for (const c of rows) credit.set(c.id, Number(c.credits));
  }

  // registro curricular: cada fila (intento) cuenta
  const registro: RegistroRow[] = [];
  for (const lote of lotes(ids)) {
    const rows = await fetchAll<{ program_enrollment_id: string; course_id: string; source: string }>(
      db.from("academic_course_enrollments").select("program_enrollment_id, course_id, source").in("program_enrollment_id", lote).order("id"),
    );
    for (const r of rows) registro.push({ ...r, credits: credit.get(r.course_id) ?? 0 });
  }

  // becas activas y bonos activos
  const becas = new Map<string, number>();
  const bonos = new Map<string, BonoRow[]>();
  for (const lote of lotes(ids)) {
    const [b1, b2] = await Promise.all([
      db.from("scholarships").select("enrollment_id, percentage").is("revoked_at", null).in("enrollment_id", lote),
      db.from("bonuses").select("enrollment_id, percentage, amount").is("revoked_at", null).in("enrollment_id", lote),
    ]);
    for (const b of (b1.data ?? []) as BecaRow[]) becas.set(b.enrollment_id, Number(b.percentage));
    for (const b of (b2.data ?? []) as BonoRow[]) bonos.set(b.enrollment_id, [...(bonos.get(b.enrollment_id) ?? []), b]);
  }

  for (const e of enrollments) {
    const filas = registro.filter((x) => x.program_enrollment_id === e.id);
    const creditos = r2(filas.reduce((s, x) => s + x.credits, 0));
    const convalidados = r2(filas.filter((x) => x.source === "convalidacion").reduce((s, x) => s + x.credits, 0));
    const becaPct = becas.get(e.id) ?? 0;
    const tarifa = e.credit_rate != null ? Number(e.credit_rate) : null;
    out.set(e.id, {
      moneda: e.credit_rate_currency,
      tarifa,
      creditos,
      creditosConvalidados: convalidados,
      becaPct,
      sinRegistro: filas.length === 0,
      ...cascada(tarifa, creditos, convalidados, becaPct, bonos.get(e.id) ?? []),
    });
  }
  return out;
}

/** Tuition de UNA matrícula: delega en la versión en bloque (misma regla siempre). */
export async function computeTuition(enrollment: Enrollment): Promise<Tuition> {
  const m = await computeTuitionEnBloque([enrollment]);
  return m.get(enrollment.id)!;
}
