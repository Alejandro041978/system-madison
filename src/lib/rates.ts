import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * TARIFA VIGENTE — la única función que resuelve un precio por crédito.
 * Todas las pantallas y el snapshot de matrícula (Módulo 3) la llaman.
 *
 * Reglas (BLUEPRINT · Módulo 1):
 *  1. Tarifario inmutable por versiones (effective_from).
 *  2. El programa manda sobre la categoría: tarifa vigente del programa; si
 *     no hay, la de su categoría.
 *  3. Vigente = mayor effective_from <= fecha.
 *
 * Devuelve null cuando NO HAY tarifa (distinto de precio 0): null ≠ 0.
 */

export type CreditRate = {
  id: string;
  category_id: string | null;
  program_id: string | null;
  price_per_credit: number;
  currency: string;
  effective_from: string; // YYYY-MM-DD
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type TarifaVigente = {
  rate: CreditRate;
  /** de dónde salió: del programa o heredada de la categoría */
  source: "program" | "category";
};

const COLS = "id, category_id, program_id, price_per_credit, currency, effective_from, note, created_by, created_at";

/** Fecha como YYYY-MM-DD en hora local (evita el desfase UTC de toISOString). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function vigenteDe(col: "program_id" | "category_id", id: string, fecha: string): Promise<CreditRate | null> {
  const { data, error } = await supabaseAdmin()
    .from("credit_rates")
    .select(COLS)
    .eq(col, id)
    .lte("effective_from", fecha)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`credit_rates: ${error.message}`);
  return (data as CreditRate) ?? null;
}

export async function tarifaVigente(programId: string, fecha: string = isoDate()): Promise<TarifaVigente | null> {
  const propia = await vigenteDe("program_id", programId, fecha);
  if (propia) return { rate: propia, source: "program" };

  const { data: prog, error } = await supabaseAdmin()
    .from("academic_programs")
    .select("category_id")
    .eq("id", programId)
    .maybeSingle();
  if (error) throw new Error(`academic_programs: ${error.message}`);
  if (!prog?.category_id) return null;

  const heredada = await vigenteDe("category_id", prog.category_id, fecha);
  return heredada ? { rate: heredada, source: "category" } : null;
}

/** Historial completo (todas las versiones) de un programa o categoría, más reciente primero. */
export async function historialTarifas(scope: { program_id?: string; category_id?: string }): Promise<CreditRate[]> {
  let q = supabaseAdmin().from("credit_rates").select(COLS).order("effective_from", { ascending: false });
  if (scope.program_id) q = q.eq("program_id", scope.program_id);
  else if (scope.category_id) q = q.eq("category_id", scope.category_id);
  const { data, error } = await q.limit(500);
  if (error) throw new Error(`credit_rates: ${error.message}`);
  return (data ?? []) as CreditRate[];
}
