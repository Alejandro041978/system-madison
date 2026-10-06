import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { isoDate } from "@/lib/rates";
import { computeTuition } from "@/lib/tuition";
import { activarMatricula, getEnrollment, DomainError, type Enrollment } from "@/lib/enrollments";
import { APP_CURRENCY, RETORNO_FEE } from "@/lib/config";

/**
 * MÓDULO 4 · Plan de cuotas y pagos.
 *  - generarCuotas: idempotente (no duplica un plan ya emitido).
 *  - refacturar: SOLO cuotas sin movimientos; aborta si el plan completo
 *    tiene pagos que dejarían el total por debajo de lo ya facturado.
 *  - registrarPago: siempre contra un cargo; al completar el cargo inicial
 *    la matrícula se activa sola; al completar un cargo RETORNO se marca
 *    pagado el trámite del retiro enlazado.
 */

export type Charge = {
  id: string; external_id: string | null; student_id: string; enrollment_id: string | null; convocatoria_id: string | null;
  withdrawal_id: string | null; charge_type: string; description: string | null; amount: number; currency: string;
  due_date: string; reference: string | null; source: "plan" | "retiro" | "manual"; is_initial: boolean;
  installment_no: number | null; created_by: string | null; created_at: string;
};
export type Payment = {
  id: string; external_id: string | null; charge_id: string; student_id: string; amount: number; paid_date: string;
  payment_type: string; series_code: string | null; receipt_number: string | null; transaction_reference: string | null;
  note: string | null; voided_at: string | null; voided_by: string | null; void_reason: string | null; created_by: string | null; created_at: string;
};

export const CHARGE_COLS =
  "id, external_id, student_id, enrollment_id, convocatoria_id, withdrawal_id, charge_type, description, amount, currency, due_date, reference, source, is_initial, installment_no, created_by, created_at";
export const PAYMENT_COLS =
  "id, external_id, charge_id, student_id, amount, paid_date, payment_type, series_code, receipt_number, transaction_reference, note, voided_at, voided_by, void_reason, created_by, created_at";

const r2 = (n: number) => Math.round(n * 100) / 100;

function fail(e: { message: string } | null, ctx: string): never {
  throw new DomainError(`${ctx}: ${e?.message ?? "error"}`, 500);
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, last));
  return base.toISOString().slice(0, 10);
}

/** Plantilla aplicable: programa > categoría. Null si no hay ninguna. */
export async function resolverPlantilla(programId: string): Promise<{ id: string; name: string; initial_amount: number; installments: number; frequency_months: number; first_installment_offset_months: number } | null> {
  const db = supabaseAdmin();
  const cols = "id, name, initial_amount, installments, frequency_months, first_installment_offset_months, active";
  const porPrograma = await db.from("billing_template_targets").select(`billing_templates!inner(${cols})`).eq("program_id", programId).maybeSingle();
  type T = { id: string; name: string; initial_amount: number; installments: number; frequency_months: number; first_installment_offset_months: number; active: boolean };
  const t1 = porPrograma.data?.billing_templates as unknown as T | undefined;
  if (t1?.active) return t1;
  const { data: prog } = await db.from("academic_programs").select("category_id").eq("id", programId).maybeSingle();
  if (!prog) return null;
  const porCategoria = await db.from("billing_template_targets").select(`billing_templates!inner(${cols})`).eq("category_id", prog.category_id).maybeSingle();
  const t2 = porCategoria.data?.billing_templates as unknown as T | undefined;
  return t2?.active ? t2 : null;
}

export async function cargosDeMatricula(enrollmentId: string): Promise<Charge[]> {
  return fetchAll<Charge>(
    supabaseAdmin().from("account_charges").select(CHARGE_COLS).eq("enrollment_id", enrollmentId).order("due_date").order("created_at"),
  );
}

export async function pagosDeCargos(chargeIds: string[]): Promise<Payment[]> {
  if (chargeIds.length === 0) return [];
  const out: Payment[] = [];
  for (let i = 0; i < chargeIds.length; i += 150) {
    const rows = await fetchAll<Payment>(
      supabaseAdmin().from("account_payments").select(PAYMENT_COLS).in("charge_id", chargeIds.slice(i, i + 150)).order("paid_date"),
    );
    out.push(...rows);
  }
  return out;
}

/** Pagado válido (no anulado) por cargo. */
export function pagadoPorCargo(pagos: Payment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pagos.filter((x) => !x.voided_at)) m.set(p.charge_id, r2((m.get(p.charge_id) ?? 0) + Number(p.amount)));
  return m;
}

/**
 * Genera el plan de cuotas de una matrícula. Idempotente: si ya hay cargos
 * source='plan' no crea nada (usar refacturar para rehacerlo).
 */
export async function generarCuotas(enrollmentId: string, actor: string): Promise<{ creados: Charge[]; avisos: string[] }> {
  const db = supabaseAdmin();
  const enr = await getEnrollment(enrollmentId);
  if (!enr) throw new DomainError("Matrícula no encontrada", 404);
  if (enr.status === "retirada" || enr.status === "finalizada") throw new DomainError(`La matrícula está ${enr.status}`, 409);

  const existentes = (await cargosDeMatricula(enrollmentId)).filter((c) => c.source === "plan");
  if (existentes.length > 0) return { creados: [], avisos: ["El plan ya existe; usa refacturar para rehacer las cuotas sin movimientos."] };

  const t = await computeTuition(enr);
  if (t.total == null) throw new DomainError("No se puede facturar: la matrícula no tiene tarifa congelada (revisa el tarifario y rehaz la matrícula)", 409);
  const plantilla = await resolverPlantilla(enr.program_id);
  if (!plantilla) throw new DomainError("No hay plantilla de facturación para el programa ni su categoría", 409);
  const { data: conv } = await db.from("convocatorias").select("first_day").eq("id", enr.convocatoria_id).single();

  const avisos: string[] = [];
  if (t.total === 0) avisos.push("Tuition 0 (sin créditos o todo convalidado/becado): no se emiten cuotas.");

  const filas: Omit<Charge, "id" | "created_at">[] = [];
  const inicial = Math.min(Number(plantilla.initial_amount), t.total);
  if (inicial > 0) {
    filas.push({
      external_id: null, student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, withdrawal_id: null,
      charge_type: "MATRICULA", description: "Matrícula", amount: r2(inicial), currency: t.moneda ?? APP_CURRENCY,
      due_date: enr.enrollment_date, reference: null, source: "plan", is_initial: true, installment_no: null, created_by: actor,
    });
  }
  const resto = r2(t.total - inicial);
  if (resto > 0) {
    const n = plantilla.installments;
    const cuota = r2(Math.floor((resto / n) * 100) / 100);
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? r2(resto - cuota * (n - 1)) : cuota;  // la última absorbe el redondeo
      filas.push({
        external_id: null, student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, withdrawal_id: null,
        charge_type: "CUOTA", description: `Cuota ${i + 1}/${n}`, amount, currency: t.moneda ?? APP_CURRENCY,
        due_date: addMonths(conv!.first_day, plantilla.first_installment_offset_months + i * plantilla.frequency_months),
        reference: null, source: "plan", is_initial: false, installment_no: i + 1, created_by: actor,
      });
    }
  } else if (inicial > 0 && filas.length === 1) {
    avisos.push("El total no supera la matrícula inicial: se emite solo el cargo inicial por el total.");
  }
  if (filas.length === 0) return { creados: [], avisos };

  const { data, error } = await db.from("account_charges").insert(filas).select(CHARGE_COLS);
  if (error) fail(error, "generar cuotas");
  return { creados: (data ?? []) as Charge[], avisos };
}

/**
 * Refacturar: borra las cuotas del plan SIN pagos válidos y las regenera
 * para que (lo conservado + lo nuevo) = total vigente. Nunca toca un cargo
 * con movimientos. Devuelve el antes/después para confirmar en pantalla.
 */
export async function refacturar(enrollmentId: string, actor: string, opts: { confirm?: boolean } = {}): Promise<{
  aplicado: boolean; totalNuevo: number; conservados: number; conservadoImporte: number; borrados: number; creados: number; avisos: string[];
}> {
  const db = supabaseAdmin();
  const enr = await getEnrollment(enrollmentId);
  if (!enr) throw new DomainError("Matrícula no encontrada", 404);
  const t = await computeTuition(enr);
  if (t.total == null) throw new DomainError("Sin tarifa congelada: no se puede refacturar", 409);

  const plan = (await cargosDeMatricula(enrollmentId)).filter((c) => c.source === "plan");
  const pagado = pagadoPorCargo(await pagosDeCargos(plan.map((c) => c.id)));
  const conMovimientos = plan.filter((c) => (pagado.get(c.id) ?? 0) > 0);
  const sinMovimientos = plan.filter((c) => (pagado.get(c.id) ?? 0) === 0);
  const conservadoImporte = r2(conMovimientos.reduce((s, c) => s + Number(c.amount), 0));
  const restante = r2(t.total - conservadoImporte);
  const avisos: string[] = [];
  if (restante < 0) {
    throw new DomainError(`El total vigente (${t.total}) es menor que lo ya facturado con movimientos (${conservadoImporte}). Resuélvelo con descuento de superadmin, no refacturando.`, 409);
  }
  if (!opts.confirm) {
    return { aplicado: false, totalNuevo: t.total, conservados: conMovimientos.length, conservadoImporte, borrados: sinMovimientos.length, creados: 0, avisos: ["Ensayo: nada se ha tocado. Confirma para aplicar."] };
  }

  for (const c of sinMovimientos) {
    const { error } = await db.from("account_charges").delete().eq("id", c.id);
    if (error) fail(error, `borrar cuota ${c.description ?? c.id}`);
  }
  let creados = 0;
  if (restante > 0) {
    const plantilla = await resolverPlantilla(enr.program_id);
    if (!plantilla) throw new DomainError("No hay plantilla de facturación", 409);
    const { data: conv } = await db.from("convocatorias").select("first_day").eq("id", enr.convocatoria_id).single();
    const hayInicialConservada = conMovimientos.some((c) => c.is_initial);
    const filas = [];
    let resto = restante;
    if (!hayInicialConservada) {
      const inicial = Math.min(Number(plantilla.initial_amount), resto);
      if (inicial > 0) {
        filas.push({ student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, charge_type: "MATRICULA", description: "Matrícula", amount: r2(inicial), currency: t.moneda ?? APP_CURRENCY, due_date: enr.enrollment_date, source: "plan", is_initial: true, created_by: actor });
        resto = r2(resto - inicial);
      }
    }
    if (resto > 0) {
      const n = plantilla.installments;
      const cuota = r2(Math.floor((resto / n) * 100) / 100);
      for (let i = 0; i < n; i++) {
        filas.push({
          student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, charge_type: "CUOTA",
          description: `Cuota ${i + 1}/${n}`, amount: i === n - 1 ? r2(resto - cuota * (n - 1)) : cuota, currency: t.moneda ?? APP_CURRENCY,
          due_date: addMonths(conv!.first_day, plantilla.first_installment_offset_months + i * plantilla.frequency_months),
          source: "plan", is_initial: false, installment_no: i + 1, created_by: actor,
        });
      }
    }
    if (filas.length > 0) {
      const { error } = await db.from("account_charges").insert(filas);
      if (error) fail(error, "refacturar");
      creados = filas.length;
    }
  }
  return { aplicado: true, totalNuevo: t.total, conservados: conMovimientos.length, conservadoImporte, borrados: sinMovimientos.length, creados, avisos };
}

/**
 * Registrar un pago contra un cargo. Efectos:
 *  - cargo inicial completado → activa la matrícula (modo pago).
 *  - cargo RETORNO completado → marca pagado el trámite del retiro enlazado.
 * DESCUENTO: solo lo aplica superadmin (lo exige la API) y no es ingreso.
 */
export async function registrarPago(p: {
  charge_id: string; amount: number; paid_date?: string; payment_type: string; series_code?: string | null;
  receipt_number?: string; transaction_reference?: string; note?: string; actor: string;
}): Promise<{ payment: Payment; efectos: string[] }> {
  const db = supabaseAdmin();
  const { data: charge } = await db.from("account_charges").select(CHARGE_COLS).eq("id", p.charge_id).maybeSingle();
  if (!charge) throw new DomainError("Cargo no encontrado", 404);
  const amount = r2(Number(p.amount));
  if (!(amount > 0)) throw new DomainError("Importe inválido", 400);

  const pagos = await pagosDeCargos([charge.id]);
  const yaPagado = pagadoPorCargo(pagos).get(charge.id) ?? 0;
  if (yaPagado + amount > Number(charge.amount) + 0.005) {
    throw new DomainError(`El pago (${amount}) supera el saldo del cargo (${r2(Number(charge.amount) - yaPagado)}). Los excedentes se registran contra otra cuota.`, 409);
  }

  const { data: pay, error } = await db.from("account_payments").insert({
    charge_id: charge.id, student_id: charge.student_id, amount,
    paid_date: p.paid_date && /^\d{4}-\d{2}-\d{2}$/.test(p.paid_date) ? p.paid_date : isoDate(),
    payment_type: p.payment_type, series_code: p.series_code || null,
    receipt_number: p.receipt_number?.trim() || null, transaction_reference: p.transaction_reference?.trim() || null,
    note: p.note?.trim() || null, created_by: p.actor,
  }).select(PAYMENT_COLS).single();
  if (error) fail(error, "registrar pago");

  const efectos: string[] = [];
  const totalPagado = r2(yaPagado + amount);
  const completo = totalPagado >= Number(charge.amount) - 0.005;

  if (completo && charge.is_initial && charge.enrollment_id) {
    try {
      await activarMatricula(charge.enrollment_id, { mode: "pago", actor: p.actor });
      efectos.push("Matrícula activada por pago del concepto inicial.");
    } catch (e) {
      if (!(e instanceof DomainError && e.status === 409)) throw e; // ya activa: idempotente
    }
  }
  if (completo && charge.charge_type === "RETORNO" && charge.withdrawal_id) {
    const { error: e2 } = await db.from("student_withdrawals")
      .update({ return_fee_reference: pay.receipt_number ?? pay.id, return_fee_paid_at: pay.paid_date, return_fee_amount: charge.amount })
      .eq("id", charge.withdrawal_id).eq("status", "vigente");
    if (!e2) efectos.push("Trámite Retorno marcado como pagado; ya se puede registrar el retorno.");
  }
  return { payment: pay as Payment, efectos };
}

/** Cargo RETORNO (RETORNO_FEE) al registrar un retiro. Idempotente por retiro. Sin importe, no hay cargo. */
export async function crearCargoRetorno(enr: Enrollment, withdrawalId: string, actor: string): Promise<boolean> {
  if (RETORNO_FEE <= 0) return false;
  const db = supabaseAdmin();
  const { data: ya } = await db.from("account_charges").select("id").eq("withdrawal_id", withdrawalId).limit(1);
  if (ya && ya.length > 0) return false;
  const { error } = await db.from("account_charges").insert({
    student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, withdrawal_id: withdrawalId,
    charge_type: "RETORNO", description: "Trámite de retorno", amount: RETORNO_FEE, currency: enr.credit_rate_currency ?? APP_CURRENCY,
    due_date: isoDate(), source: "retiro", created_by: actor,
  });
  return !error;
}

/**
 * Mover un pago a otro cargo (excedentes, error de caja). Reglas:
 *  - NUNCA entre estudiantes (además del trigger, se comprueba aquí).
 *  - El destino debe tener saldo suficiente para el importe del pago.
 *  - Queda rastro en la nota del pago.
 */
export async function moverPago(paymentId: string, targetChargeId: string, actor: string): Promise<Payment> {
  const db = supabaseAdmin();
  const { data: pay } = await db.from("account_payments").select(PAYMENT_COLS).eq("id", paymentId).maybeSingle();
  if (!pay) throw new DomainError("Pago no encontrado", 404);
  if (pay.voided_at) throw new DomainError("El pago está anulado", 409);
  if (pay.charge_id === targetChargeId) throw new DomainError("El pago ya está en ese cargo", 400);
  const { data: target } = await db.from("account_charges").select(CHARGE_COLS).eq("id", targetChargeId).maybeSingle();
  if (!target) throw new DomainError("Cargo destino no encontrado", 404);
  if (target.student_id !== pay.student_id) throw new DomainError("Nunca se mueven pagos entre estudiantes", 409);

  const yaPagado = pagadoPorCargo(await pagosDeCargos([target.id])).get(target.id) ?? 0;
  if (yaPagado + Number(pay.amount) > Number(target.amount) + 0.005) {
    throw new DomainError(`El destino no tiene saldo suficiente (saldo ${r2(Number(target.amount) - yaPagado)}, pago ${pay.amount})`, 409);
  }
  const { data: origen } = await db.from("account_charges").select("description, charge_type").eq("id", pay.charge_id).maybeSingle();
  const nota = `${pay.note ? pay.note + " · " : ""}movido desde «${origen?.description ?? origen?.charge_type ?? pay.charge_id}» por ${actor} el ${isoDate()}`;
  const { data, error } = await db.from("account_payments")
    .update({ charge_id: target.id, note: nota })
    .eq("id", paymentId)
    .select(PAYMENT_COLS).single();
  if (error) fail(error, "mover pago");
  return data as Payment;
}
