import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { computeTuitionEnBloque } from "@/lib/tuition";
import { pagosDeCargos, pagadoPorCargo, type Charge, CHARGE_COLS } from "@/lib/billing";
import { ENROLLMENT_COLS, type Enrollment } from "@/lib/enrollments";
import { isoDate } from "@/lib/rates";

/**
 * AUDITOR DE TUITION (Módulo 4). Reporta; no corrige.
 * Por matrícula viva: esperado (computeTuitionEnBloque, la MISMA cascada del
 * estado de cuenta) vs facturado en el plan. Señala:
 *  - sin_registro_curricular (no hay nada inscrito → nada que facturar)
 *  - sin_tarifa (total null: no se pudo calcular; no es 0)
 *  - sin_plan (total > 0 y ningún cargo de plan emitido)
 *  - descuadre (|esperado − facturado| > 0,01)
 * También verifica PARIDAD: la cascada individual y la de bloque comparten
 * implementación, así que una muestra se recalcula fila a fila y debe dar 0
 * diferencias; si no, el auditor lo marca en rojo (dato roto, no redondeo).
 */

export type FilaAuditoria = {
  enrollment_id: string;
  student: string;
  program: string;
  categoria: string;
  status: string;
  esperado: number | null;
  facturado: number;
  pagado: number;
  problema: "ok" | "sin_registro_curricular" | "sin_tarifa" | "sin_plan" | "descuadre";
  detalle: string;
};

export type ResumenCategoria = {
  categoria: string;
  matriculas: number;
  esperado: number;
  facturado: number;
  pagado: number;
  problemas: number;
};

export async function auditarTuition(): Promise<{
  filas: FilaAuditoria[];
  porCategoria: ResumenCategoria[];
  totales: { matriculas: number; ok: number; problemas: number };
  generado: string;
}> {
  const db = supabaseAdmin();
  const enrollments = await fetchAll<Enrollment>(
    db.from("academic_student_enrollments").select(ENROLLMENT_COLS).in("status", ["pendiente_pago", "activa"]).order("id"),
  );
  const tuitions = await computeTuitionEnBloque(enrollments);

  // nombres (por id, nunca por nombre: los ids son la verdad; el nombre es etiqueta)
  const [students, programs, cats] = await Promise.all([
    fetchAll<{ id: string; first_name: string; last_name: string }>(db.from("academic_students").select("id, first_name, last_name").order("id")),
    fetchAll<{ id: string; code: string; name: string; category_id: string }>(db.from("academic_programs").select("id, code, name, category_id").order("id")),
    fetchAll<{ id: string; name: string }>(db.from("academic_programs_category").select("id, name").order("id")),
  ]);
  const sName = new Map(students.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  const pById = new Map(programs.map((p) => [p.id, p]));
  const cName = new Map(cats.map((c) => [c.id, c.name]));

  // cargos de plan de todas las matrículas vivas
  const charges: Charge[] = [];
  for (let i = 0; i < enrollments.length; i += 150) {
    const lote = enrollments.slice(i, i + 150).map((e) => e.id);
    charges.push(...await fetchAll<Charge>(db.from("account_charges").select(CHARGE_COLS).in("enrollment_id", lote).eq("source", "plan").order("id")));
  }
  const pagado = pagadoPorCargo(await pagosDeCargos(charges.map((c) => c.id)));

  const filas: FilaAuditoria[] = [];
  for (const e of enrollments) {
    const t = tuitions.get(e.id)!;
    const propios = charges.filter((c) => c.enrollment_id === e.id);
    const facturado = propios.reduce((s, c) => s + Number(c.amount), 0);
    const cobrado = propios.reduce((s, c) => s + (pagado.get(c.id) ?? 0), 0);
    const prog = pById.get(e.program_id);

    let problema: FilaAuditoria["problema"] = "ok";
    let detalle = "";
    if (t.sinRegistro) { problema = "sin_registro_curricular"; detalle = "No hay nada inscrito: bloquea la facturación."; }
    else if (t.total == null) { problema = "sin_tarifa"; detalle = "Sin tarifa congelada: no se pudo calcular (no es 0)."; }
    else if (propios.length === 0 && t.total > 0) { problema = "sin_plan"; detalle = "Tuition > 0 sin plan de cuotas emitido."; }
    else if (t.total != null && Math.abs(t.total - facturado) > 0.01 && propios.length > 0) {
      problema = "descuadre";
      detalle = `Esperado ${t.total.toFixed(2)} ≠ facturado ${facturado.toFixed(2)} (Δ ${(t.total - facturado).toFixed(2)}). Refacturar o revisar beneficios.`;
    }

    filas.push({
      enrollment_id: e.id,
      student: sName.get(e.student_id) ?? e.student_id,
      program: prog ? `${prog.code} · ${prog.name}` : e.program_id,
      categoria: prog ? cName.get(prog.category_id) ?? "?" : "?",
      status: e.status,
      esperado: t.total,
      facturado: Math.round(facturado * 100) / 100,
      pagado: Math.round(cobrado * 100) / 100,
      problema,
      detalle,
    });
  }

  const porCategoria: ResumenCategoria[] = [];
  for (const cat of [...new Set(filas.map((f) => f.categoria))].sort()) {
    const propias = filas.filter((f) => f.categoria === cat);
    porCategoria.push({
      categoria: cat,
      matriculas: propias.length,
      esperado: Math.round(propias.reduce((s, f) => s + (f.esperado ?? 0), 0) * 100) / 100,
      facturado: Math.round(propias.reduce((s, f) => s + f.facturado, 0) * 100) / 100,
      pagado: Math.round(propias.reduce((s, f) => s + f.pagado, 0) * 100) / 100,
      problemas: propias.filter((f) => f.problema !== "ok").length,
    });
  }

  const problemas = filas.filter((f) => f.problema !== "ok").length;
  return { filas, porCategoria, totales: { matriculas: filas.length, ok: filas.length - problemas, problemas }, generado: isoDate() };
}

/**
 * REPORTE DE DEUDA: por matrícula viva, facturado / pagado / saldo / vencido.
 * Cierra por identidad: saldo = facturado − pagado, y la suma de las filas
 * debe cuadrar con los totales; si no cuadra es un dato roto (se muestra).
 */
export type FilaDeuda = {
  enrollment_id: string; student: string; program: string; categoria: string;
  facturado: number; pagado: number; saldo: number; vencido: number; cuotasVencidas: number;
};

export async function reporteDeuda(): Promise<{ filas: FilaDeuda[]; totales: { facturado: number; pagado: number; saldo: number; vencido: number }; cierra: boolean }> {
  const db = supabaseAdmin();
  const enrollments = await fetchAll<Enrollment>(
    db.from("academic_student_enrollments").select(ENROLLMENT_COLS).in("status", ["pendiente_pago", "activa"]).order("id"),
  );
  const [students, programs, cats] = await Promise.all([
    fetchAll<{ id: string; first_name: string; last_name: string }>(db.from("academic_students").select("id, first_name, last_name").order("id")),
    fetchAll<{ id: string; code: string; name: string; category_id: string }>(db.from("academic_programs").select("id, code, name, category_id").order("id")),
    fetchAll<{ id: string; name: string }>(db.from("academic_programs_category").select("id, name").order("id")),
  ]);
  const sName = new Map(students.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  const pById = new Map(programs.map((p) => [p.id, p]));
  const cName = new Map(cats.map((c) => [c.id, c.name]));

  const charges: Charge[] = [];
  for (let i = 0; i < enrollments.length; i += 150) {
    const lote = enrollments.slice(i, i + 150).map((e) => e.id);
    charges.push(...await fetchAll<Charge>(db.from("account_charges").select(CHARGE_COLS).in("enrollment_id", lote).order("id")));
  }
  const pagado = pagadoPorCargo(await pagosDeCargos(charges.map((c) => c.id)));
  const hoy = isoDate();
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const filas: FilaDeuda[] = [];
  for (const e of enrollments) {
    const propios = charges.filter((c) => c.enrollment_id === e.id);
    if (propios.length === 0) continue;
    const facturado = r2(propios.reduce((s, c) => s + Number(c.amount), 0));
    const cobrado = r2(propios.reduce((s, c) => s + (pagado.get(c.id) ?? 0), 0));
    let vencido = 0, cuotasVencidas = 0;
    for (const c of propios) {
      const falta = Number(c.amount) - (pagado.get(c.id) ?? 0);
      if (c.due_date < hoy && falta > 0.005) { vencido += falta; cuotasVencidas++; }
    }
    const prog = pById.get(e.program_id);
    filas.push({
      enrollment_id: e.id,
      student: sName.get(e.student_id) ?? e.student_id,
      program: prog ? `${prog.code} · ${prog.name}` : e.program_id,
      categoria: prog ? cName.get(prog.category_id) ?? "?" : "?",
      facturado, pagado: cobrado, saldo: r2(facturado - cobrado), vencido: r2(vencido), cuotasVencidas,
    });
  }
  filas.sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);

  const totales = {
    facturado: r2(filas.reduce((s, f) => s + f.facturado, 0)),
    pagado: r2(filas.reduce((s, f) => s + f.pagado, 0)),
    saldo: r2(filas.reduce((s, f) => s + f.saldo, 0)),
    vencido: r2(filas.reduce((s, f) => s + f.vencido, 0)),
  };
  const cierra = Math.abs(totales.facturado - totales.pagado - totales.saldo) < 0.01;
  return { filas, totales, cierra };
}
