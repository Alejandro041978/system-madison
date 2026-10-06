import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { nombreCompleto } from "@/lib/students";
import { getEnrollment, COURSE_ENROLLMENT_COLS, WITHDRAWAL_COLS, type CourseEnrollment, type Withdrawal } from "@/lib/enrollments";
import { EnrollmentActions } from "./EnrollmentActions";
import { CurriculumTable, type CourseInfo } from "./CurriculumTable";
import { WithdrawalPanel } from "./WithdrawalPanel";

export const metadata = { title: "Matrícula" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente_pago: { label: "Pendiente de pago", cls: "bg-amber-100 text-amber-800" },
  activa: { label: "Activa", cls: "bg-emerald-100 text-emerald-800" },
  retirada: { label: "Retirada", cls: "bg-red-100 text-red-800" },
  finalizada: { label: "Finalizada", cls: "bg-sky-100 text-sky-800" },
};

export default async function EnrollmentPage({ params }: PageProps<"/admissions/enrollments/[id]">) {
  const { id } = await params;
  const identity = await guardPage("admissions", `/admissions/enrollments/${id}`);
  const enr = await getEnrollment(id).catch(() => null);
  if (!enr) notFound();
  const db = supabaseAdmin();

  const [student, program, conv, courses, registro, retiros] = await Promise.all([
    db.from("academic_students").select("id, first_name, last_name, second_last_name, document_number, email, situation").eq("id", enr.student_id).single(),
    db.from("academic_programs").select("id, code, name").eq("id", enr.program_id).single(),
    db.from("convocatorias").select("id, name, first_day").eq("id", enr.convocatoria_id).single(),
    fetchAll<CourseInfo>(db.from("academic_courses").select("id, code, name, credits, level, active").eq("program_id", enr.program_id).order("level").order("sort_order").order("code")),
    fetchAll<CourseEnrollment>(db.from("academic_course_enrollments").select(COURSE_ENROLLMENT_COLS).eq("program_enrollment_id", enr.id).order("course_id").order("attempt")),
    fetchAll<Withdrawal>(db.from("student_withdrawals").select(WITHDRAWAL_COLS).eq("enrollment_id", enr.id).order("created_at", { ascending: false })),
  ]);
  const canEdit = puedeEditarPagina(identity, "admissions");
  const creditosInscritos = registro.filter((r) => r.status !== "retirada").reduce((s, r) => s + Number(courses.find((c) => c.id === r.course_id)?.credits ?? 0), 0);
  const money = (n: number | null) => n == null ? "—" : `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 })} ${enr.credit_rate_currency ?? ""}`;

  return (
    <div>
      <Link href="/admissions" className="text-sm text-sky-700 hover:underline">← Admisión y matrícula</Link>
      <div className="mt-2 mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            <Link href={`/students/${enr.student_id}`} className="hover:underline">{student.data ? nombreCompleto(student.data) : enr.student_id}</Link>
            <span className={`ml-3 align-middle rounded px-2 py-0.5 text-sm ${ESTADO[enr.status]?.cls}`}>{ESTADO[enr.status]?.label}</span>
          </h1>
          <div className="text-sm text-slate-500">
            <span className="font-mono">{program.data?.code}</span> {program.data?.name} · {conv.data?.name} · matrícula del {enr.enrollment_date}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Link href={`/accounts/${enr.id}`} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Estado de cuenta</Link>
          <EnrollmentActions enrollment={enr} canEdit={canEdit} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card t="Tarifa congelada" v={enr.credit_rate != null ? `${money(enr.credit_rate)} / crédito` : "sin tarifa"} s={enr.credit_rate_source === "program" ? "propia del programa" : enr.credit_rate_source === "category" ? "heredada de la categoría" : "no había tarifa al matricular"} warn={enr.credit_rate == null} />
        <Card t="Precio de lista (respaldo)" v={money(enr.list_price)} s="tarifa × créditos de la malla en la fecha" />
        <Card t="Créditos inscritos hoy" v={creditosInscritos.toLocaleString("es-ES")} s={`${registro.length} filas en el registro`} />
        <Card t="Activación" v={enr.activated_at ? new Date(enr.activated_at).toLocaleDateString("es-ES") : "pendiente"} s={enr.activation_mode === "force" ? `manual · ${enr.activated_by}${enr.activation_note ? " · " + enr.activation_note : ""}` : enr.activation_mode === "pago" ? "por pago inicial" : "se activa al pagar el concepto inicial"} />
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-6">
        <CurriculumTable courses={courses} rows={registro} canEdit={canEdit && enr.status !== "retirada" && enr.status !== "finalizada"} />
        <WithdrawalPanel enrollment={enr} withdrawals={retiros} canEdit={canEdit} />
      </div>
    </div>
  );
}

function Card({ t, v, s, warn }: { t: string; v: string; s: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${warn ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
      <div className="text-xs uppercase tracking-wider text-slate-400">{t}</div>
      <div className="text-lg font-semibold">{v}</div>
      <div className="text-xs text-slate-500">{s}</div>
    </div>
  );
}
