import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { tarifaVigente, isoDate } from "@/lib/rates";
import { recomputeSituations } from "@/lib/situations";
import { RETORNO_FEE, money } from "@/lib/config";

/**
 * MÓDULO 3 · Matrícula, registro curricular, retiro y retorno.
 * Todas las pantallas y APIs pasan por aquí; nadie escribe estas tablas
 * por su cuenta.
 *
 * Modelo (2026-08-23, heredado del proyecto base):
 *  - No hay LOA. Retiro (definitivo mientras vigente) y Retorno son las
 *    únicas operaciones. El trámite Retorno cobra RETORNO_FEE (config);
 *    con 0 el retorno no exige pago (2026-10-06).
 *  - Retorno repone las asignaturas `retirada` en el MISMO intento y las
 *    `reprobada` con intento NUEVO (recursado: consume créditos otra vez).
 */

export class DomainError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export { RETORNO_FEE };

export type Enrollment = {
  id: string; student_id: string; program_id: string; convocatoria_id: string; enrollment_date: string;
  status: "pendiente_pago" | "activa" | "retirada" | "finalizada";
  activated_at: string | null; activated_by: string | null; activation_mode: "pago" | "force" | null; activation_note: string | null;
  credit_rate: number | null; credit_rate_source: "program" | "category" | null; credit_rate_currency: string | null; credit_rate_id: string | null;
  list_price: number | null; external_id: string | null; created_by: string | null; created_at: string; updated_at: string;
};

export type CourseEnrollment = {
  id: string; student_id: string; course_id: string; program_id: string; program_enrollment_id: string; attempt: number;
  status: "no_iniciada" | "en_curso" | "aprobada" | "reprobada" | "retirada";
  source: string; opened_at: string | null; opened_by: string | null; closed_at: string | null; closed_by: string | null; note: string | null;
};

export type Withdrawal = {
  id: string; student_id: string; enrollment_id: string; status: "vigente" | "retornado"; withdrawal_date: string; reason: string;
  resolution_number: string | null; created_by: string | null; return_fee_amount: number | null; return_fee_reference: string | null;
  return_fee_paid_at: string | null; returned_at: string | null; returned_by: string | null; return_note: string | null; created_at: string;
};

export const ENROLLMENT_COLS =
  "id, student_id, program_id, convocatoria_id, enrollment_date, status, activated_at, activated_by, activation_mode, activation_note, credit_rate, credit_rate_source, credit_rate_currency, credit_rate_id, list_price, external_id, created_by, created_at, updated_at";
export const COURSE_ENROLLMENT_COLS =
  "id, student_id, course_id, program_id, program_enrollment_id, attempt, status, source, opened_at, opened_by, closed_at, closed_by, note";
export const WITHDRAWAL_COLS =
  "id, student_id, enrollment_id, status, withdrawal_date, reason, resolution_number, created_by, return_fee_amount, return_fee_reference, return_fee_paid_at, returned_at, returned_by, return_note, created_at";

function fail(e: { message: string } | null, ctx: string): never {
  throw new DomainError(`${ctx}: ${e?.message ?? "error"}`, 500);
}

export async function getEnrollment(id: string): Promise<Enrollment | null> {
  const { data, error } = await supabaseAdmin().from("academic_student_enrollments").select(ENROLLMENT_COLS).eq("id", id).maybeSingle();
  if (error) fail(error, "matrícula");
  return (data as Enrollment) ?? null;
}

/**
 * Inyecta en el registro curricular toda asignatura activa de la malla que
 * el estudiante aún no tenga (ningún intento). Idempotente.
 */
export async function inyectarMallaEnRegistro(enrollment: Enrollment, actor: string, source: "matricula" | "malla_nueva" = "matricula"): Promise<number> {
  const db = supabaseAdmin();
  const courses = await fetchAll<{ id: string }>(db.from("academic_courses").select("id").eq("program_id", enrollment.program_id).eq("active", true).order("id"));
  const existentes = await fetchAll<{ course_id: string }>(
    db.from("academic_course_enrollments").select("course_id").eq("student_id", enrollment.student_id).eq("program_enrollment_id", enrollment.id).order("course_id"),
  );
  const ya = new Set(existentes.map((x) => x.course_id));
  const nuevas = courses.filter((c) => !ya.has(c.id)).map((c) => ({
    student_id: enrollment.student_id, course_id: c.id, program_id: enrollment.program_id, program_enrollment_id: enrollment.id,
    attempt: 1, status: "no_iniciada", source, opened_by: actor,
  }));
  if (nuevas.length === 0) return 0;
  const { error } = await db.from("academic_course_enrollments").insert(nuevas);
  if (error) fail(error, "registro curricular");
  return nuevas.length;
}

/** Créditos de la malla activa del programa. */
async function creditosMalla(programId: string): Promise<number> {
  const rows = await fetchAll<{ credits: number }>(supabaseAdmin().from("academic_courses").select("credits").eq("program_id", programId).eq("active", true).order("id"));
  return rows.reduce((s, r) => s + Number(r.credits), 0);
}

/** Prerrequisito de categoría: programa FINALIZADO de la categoría requerida. */
async function comprobarPrerrequisito(studentId: string, categoryId: string) {
  const db = supabaseAdmin();
  const { data: cat } = await db.from("academic_programs_category").select("name, requires_category_id").eq("id", categoryId).maybeSingle();
  if (!cat?.requires_category_id) return;
  const { data: req } = await db.from("academic_programs_category").select("name").eq("id", cat.requires_category_id).maybeSingle();
  const { data: ok } = await db
    .from("academic_student_enrollments")
    .select("id, academic_programs!inner(category_id)")
    .eq("student_id", studentId).eq("status", "finalizada").eq("academic_programs.category_id", cat.requires_category_id)
    .limit(1);
  if (!ok || ok.length === 0) {
    throw new DomainError(`Para matricularse en «${cat.name}» hace falta haber finalizado un programa de «${req?.name ?? "categoría requerida"}»`, 409);
  }
}

export type NuevaMatricula = { student_id: string; program_id: string; convocatoria_id: string; enrollment_date?: string; actor: string };

/**
 * POST nueva matrícula: nace pendiente_pago, con snapshot de tarifa en la
 * fecha de matrícula y la malla completa como no_iniciada. El plan de
 * cuotas se genera en el Módulo 4 a partir de este snapshot.
 */
export async function crearMatricula(p: NuevaMatricula): Promise<{ enrollment: Enrollment; asignaturas: number; avisos: string[] }> {
  const db = supabaseAdmin();
  const avisos: string[] = [];
  const fecha = p.enrollment_date && /^\d{4}-\d{2}-\d{2}$/.test(p.enrollment_date) ? p.enrollment_date : isoDate();

  const [{ data: student }, { data: program }, { data: conv }] = await Promise.all([
    db.from("academic_students").select("id, disabled").eq("id", p.student_id).maybeSingle(),
    db.from("academic_programs").select("id, name, category_id, active").eq("id", p.program_id).maybeSingle(),
    db.from("convocatorias").select("id, name, category_id, active").eq("id", p.convocatoria_id).maybeSingle(),
  ]);
  if (!student) throw new DomainError("Estudiante no encontrado", 404);
  if (student.disabled) throw new DomainError("El estudiante está deshabilitado", 409);
  if (!program) throw new DomainError("Programa no encontrado", 404);
  if (!program.active) throw new DomainError("El programa está inactivo", 409);
  if (!conv) throw new DomainError("Convocatoria no encontrada", 404);
  if (!conv.active) throw new DomainError("La convocatoria está cerrada", 409);
  if (conv.category_id !== program.category_id) throw new DomainError("El programa no pertenece a la categoría de la convocatoria", 409);

  const { data: dup } = await db.from("academic_student_enrollments").select("id, status").eq("student_id", p.student_id).eq("program_id", p.program_id).maybeSingle();
  if (dup) throw new DomainError(`El estudiante ya tiene una matrícula (${dup.status}) en este programa`, 409);

  await comprobarPrerrequisito(p.student_id, program.category_id);

  // Snapshot de tarifa: UNA función. null ≠ 0: sin tarifa se matricula pero se avisa.
  const tarifa = await tarifaVigente(p.program_id, fecha);
  const creditos = await creditosMalla(p.program_id);
  if (!tarifa) avisos.push("El programa no tiene tarifa vigente en la fecha de matrícula: el precio queda sin calcular (null). Crea la tarifa y avisa a administración.");
  if (creditos === 0) avisos.push("La malla del programa no tiene créditos: la tuition será 0 hasta que se cargue la malla.");

  const { data: enr, error } = await db
    .from("academic_student_enrollments")
    .insert({
      student_id: p.student_id, program_id: p.program_id, convocatoria_id: p.convocatoria_id, enrollment_date: fecha,
      status: "pendiente_pago",
      credit_rate: tarifa ? tarifa.rate.price_per_credit : null,
      credit_rate_source: tarifa ? tarifa.source : null,
      credit_rate_currency: tarifa ? tarifa.rate.currency : null,
      credit_rate_id: tarifa ? tarifa.rate.id : null,
      list_price: tarifa ? Number((Number(tarifa.rate.price_per_credit) * creditos).toFixed(2)) : null,
      created_by: p.actor,
    })
    .select(ENROLLMENT_COLS)
    .single();
  if (error) fail(error, "crear matrícula");

  const asignaturas = await inyectarMallaEnRegistro(enr as Enrollment, p.actor, "matricula");
  await recomputeSituations({ studentIds: [p.student_id], actor: p.actor }).catch(() => null);
  return { enrollment: enr as Enrollment, asignaturas, avisos };
}

/**
 * Activación. `pago` la disparará el Módulo 4 al cobrar el concepto inicial;
 * `force` es manual, exige motivo y queda registrada en la propia matrícula.
 * Acta, correo institucional y ruta de aprendizaje: integraciones posteriores.
 */
export async function activarMatricula(id: string, p: { mode: "pago" | "force"; note?: string; actor: string }): Promise<Enrollment> {
  const enr = await getEnrollment(id);
  if (!enr) throw new DomainError("Matrícula no encontrada", 404);
  if (enr.status !== "pendiente_pago") throw new DomainError(`La matrícula está ${enr.status}; solo se activa una pendiente de pago`, 409);
  if (p.mode === "force" && !p.note?.trim()) throw new DomainError("La activación manual exige motivo", 400);
  const { data, error } = await supabaseAdmin()
    .from("academic_student_enrollments")
    .update({ status: "activa", activated_at: new Date().toISOString(), activated_by: p.actor, activation_mode: p.mode, activation_note: p.note?.trim() || null })
    .eq("id", id).eq("status", "pendiente_pago")
    .select(ENROLLMENT_COLS).single();
  if (error) fail(error, "activar matrícula");
  await recomputeSituations({ studentIds: [enr.student_id], actor: p.actor }).catch(() => null);
  return data as Enrollment;
}

// ---------------------------------------------------------------------
// Registro curricular: transiciones de una asignatura
// ---------------------------------------------------------------------
export type AccionAsignatura = "abrir" | "aprobar" | "reprobar" | "retirar" | "nuevo_intento" | "reabrir";

export async function cambiarEstadoAsignatura(courseEnrollmentId: string, accion: AccionAsignatura, p: { actor: string; note?: string }): Promise<CourseEnrollment> {
  const db = supabaseAdmin();
  const { data: ce } = await db.from("academic_course_enrollments").select(COURSE_ENROLLMENT_COLS).eq("id", courseEnrollmentId).maybeSingle();
  if (!ce) throw new DomainError("Asignatura del registro no encontrada", 404);
  const { data: enr } = await db.from("academic_student_enrollments").select("status").eq("id", ce.program_enrollment_id).maybeSingle();
  if (enr?.status === "retirada") throw new DomainError("La matrícula está retirada; registra el retorno primero", 409);

  const now = new Date().toISOString();
  const transiciones: Record<AccionAsignatura, { desde: CourseEnrollment["status"][]; patch: Record<string, unknown> }> = {
    abrir:    { desde: ["no_iniciada"], patch: { status: "en_curso", opened_at: now, opened_by: p.actor } },
    reabrir:  { desde: ["retirada"],    patch: { status: "no_iniciada", closed_at: null, closed_by: null } },
    aprobar:  { desde: ["en_curso"],    patch: { status: "aprobada", closed_at: now, closed_by: p.actor } },
    reprobar: { desde: ["en_curso"],    patch: { status: "reprobada", closed_at: now, closed_by: p.actor } },
    retirar:  { desde: ["no_iniciada", "en_curso"], patch: { status: "retirada", closed_at: now, closed_by: p.actor } },
    nuevo_intento: { desde: ["reprobada", "retirada"], patch: {} },
  };
  const t = transiciones[accion];
  if (!t) throw new DomainError("Acción desconocida", 400);
  if (!t.desde.includes(ce.status)) throw new DomainError(`No se puede «${accion}» una asignatura en estado ${ce.status}`, 409);

  if (accion === "nuevo_intento") {
    const { data: max } = await db.from("academic_course_enrollments").select("attempt").eq("student_id", ce.student_id).eq("course_id", ce.course_id).order("attempt", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db.from("academic_course_enrollments").insert({
      student_id: ce.student_id, course_id: ce.course_id, program_id: ce.program_id, program_enrollment_id: ce.program_enrollment_id,
      attempt: (max?.attempt ?? ce.attempt) + 1, status: "no_iniciada", source: "recursado", opened_by: p.actor, note: p.note?.trim() || null,
    }).select(COURSE_ENROLLMENT_COLS).single();
    if (error) fail(error, "nuevo intento");
    return data as CourseEnrollment;
  }
  const { data, error } = await db.from("academic_course_enrollments").update({ ...t.patch, note: p.note?.trim() || ce.note }).eq("id", ce.id).select(COURSE_ENROLLMENT_COLS).single();
  if (error) fail(error, "registro curricular");
  return data as CourseEnrollment;
}

// ---------------------------------------------------------------------
// Retiro y Retorno (por matrícula)
// ---------------------------------------------------------------------
export async function registrarRetiro(enrollmentId: string, p: { reason: string; resolution_number?: string; date?: string; actor: string }): Promise<Withdrawal> {
  const db = supabaseAdmin();
  const enr = await getEnrollment(enrollmentId);
  if (!enr) throw new DomainError("Matrícula no encontrada", 404);
  if (!["pendiente_pago", "activa"].includes(enr.status)) throw new DomainError(`La matrícula está ${enr.status}; no se puede retirar`, 409);
  if (!p.reason?.trim()) throw new DomainError("El retiro exige motivo", 400);
  const fecha = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : isoDate();

  const { data: w, error } = await db.from("student_withdrawals").insert({
    student_id: enr.student_id, enrollment_id: enr.id, status: "vigente", withdrawal_date: fecha,
    reason: p.reason.trim(), resolution_number: p.resolution_number?.trim() || null, created_by: p.actor, return_fee_amount: RETORNO_FEE,
  }).select(WITHDRAWAL_COLS).single();
  if (error) {
    if (error.code === "23505") throw new DomainError("Esta matrícula ya tiene un retiro vigente", 409);
    fail(error, "registrar retiro");
  }

  // Cargo del trámite Retorno (RETORNO_FEE) en el estado de cuenta (Módulo 4).
  // Import dinámico: billing.ts importa de este módulo y un import estático
  // sería circular. (2026-08-23)
  try {
    const { crearCargoRetorno } = await import("@/lib/billing");
    await crearCargoRetorno(enr, (w as Withdrawal).id, p.actor);
  } catch { /* sin tablas del Módulo 4 todavía: el pago se registra a mano */ }

  const now = new Date().toISOString();
  // Asignaturas en curso → retirada; las no iniciadas se quedan como están.
  const { error: e2 } = await db.from("academic_course_enrollments")
    .update({ status: "retirada", closed_at: now, closed_by: p.actor, note: `Retiro ${fecha}` })
    .eq("program_enrollment_id", enr.id).eq("status", "en_curso");
  if (e2) fail(e2, "retirar asignaturas");
  const { error: e3 } = await db.from("academic_student_enrollments").update({ status: "retirada" }).eq("id", enr.id);
  if (e3) fail(e3, "retirar matrícula");

  await recomputeSituations({ studentIds: [enr.student_id], actor: p.actor }).catch(() => null);
  return w as Withdrawal;
}

/** Pago del trámite Retorno (manual hasta el Módulo 4). */
export async function registrarPagoRetorno(withdrawalId: string, p: { reference: string; paid_at?: string; actor: string }): Promise<Withdrawal> {
  const db = supabaseAdmin();
  const { data: w } = await db.from("student_withdrawals").select(WITHDRAWAL_COLS).eq("id", withdrawalId).maybeSingle();
  if (!w) throw new DomainError("Retiro no encontrado", 404);
  if (w.status !== "vigente") throw new DomainError("El retiro ya fue retornado", 409);
  if (!p.reference?.trim()) throw new DomainError("Indica la referencia del pago (recibo)", 400);
  const paid = p.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(p.paid_at) ? p.paid_at : isoDate();
  const { data, error } = await db.from("student_withdrawals")
    .update({ return_fee_reference: p.reference.trim(), return_fee_paid_at: paid, return_fee_amount: w.return_fee_amount ?? RETORNO_FEE })
    .eq("id", withdrawalId).select(WITHDRAWAL_COLS).single();
  if (error) fail(error, "pago de retorno");
  return data as Withdrawal;
}

/**
 * Retorno: exige trámite pagado si tiene importe. Cierra el retiro, reactiva la matrícula y
 * repone asignaturas: `retirada` → mismo intento a no_iniciada; `reprobada`
 * (último intento) → intento nuevo (recursado).
 */
export async function registrarRetorno(withdrawalId: string, p: { note?: string; actor: string }): Promise<{ withdrawal: Withdrawal; repuestas: number; recursadas: number }> {
  const db = supabaseAdmin();
  const { data: w } = await db.from("student_withdrawals").select(WITHDRAWAL_COLS).eq("id", withdrawalId).maybeSingle();
  if (!w) throw new DomainError("Retiro no encontrado", 404);
  if (w.status !== "vigente") throw new DomainError("El retiro ya fue retornado", 409);
  const exigePago = Number(w.return_fee_amount ?? RETORNO_FEE) > 0;
  if (exigePago && !w.return_fee_paid_at) throw new DomainError(`El retorno exige el trámite «Retorno» pagado (${money(Number(w.return_fee_amount ?? RETORNO_FEE))}). Registra el pago primero.`, 409);

  const rows = await fetchAll<CourseEnrollment>(
    db.from("academic_course_enrollments").select(COURSE_ENROLLMENT_COLS).eq("program_enrollment_id", w.enrollment_id).order("course_id").order("attempt"),
  );
  // Último intento por asignatura.
  const ultimo = new Map<string, CourseEnrollment>();
  for (const r of rows) ultimo.set(r.course_id, r);

  let repuestas = 0, recursadas = 0;
  const now = new Date().toISOString();
  for (const ce of ultimo.values()) {
    if (ce.status === "retirada") {
      const { error } = await db.from("academic_course_enrollments")
        .update({ status: "no_iniciada", closed_at: null, closed_by: null, source: "retorno", note: `Retorno ${isoDate()}` }).eq("id", ce.id);
      if (error) fail(error, "reponer asignatura");
      repuestas++;
    } else if (ce.status === "reprobada") {
      const { error } = await db.from("academic_course_enrollments").insert({
        student_id: ce.student_id, course_id: ce.course_id, program_id: ce.program_id, program_enrollment_id: ce.program_enrollment_id,
        attempt: ce.attempt + 1, status: "no_iniciada", source: "recursado", opened_by: p.actor, note: `Retorno ${isoDate()} · intento ${ce.attempt + 1}`,
      });
      if (error) fail(error, "recursado en retorno");
      recursadas++;
    }
  }

  const { error: e1 } = await db.from("academic_student_enrollments").update({ status: "activa" }).eq("id", w.enrollment_id);
  if (e1) fail(e1, "reactivar matrícula");
  const { data, error } = await db.from("student_withdrawals")
    .update({ status: "retornado", returned_at: now, returned_by: p.actor, return_note: p.note?.trim() || null })
    .eq("id", withdrawalId).select(WITHDRAWAL_COLS).single();
  if (error) fail(error, "cerrar retiro");

  await recomputeSituations({ studentIds: [w.student_id], actor: p.actor }).catch(() => null);
  return { withdrawal: data as Withdrawal, repuestas, recursadas };
}
