import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStudent, nombreCompleto, SITUACIONES } from "@/lib/students";
import { StudentForm } from "./StudentForm";
import { SituationBox } from "./SituationBox";

export const metadata = { title: "Ficha de estudiante" };
export const dynamic = "force-dynamic";

type MatriculaRow = { id: string; status: string; enrollment_date: string; academic_programs: { code: string; name: string } | null; convocatorias: { name: string } | null };
const ESTADO_LABEL: Record<string, string> = { pendiente_pago: "pendiente de pago", activa: "activa", retirada: "retirada", finalizada: "finalizada" };
const ESTADO_CLS: Record<string, string> = { pendiente_pago: "text-amber-700", activa: "text-emerald-700", retirada: "text-red-700", finalizada: "text-sky-700" };

type AuditRow = { id: number; changed_by: string | null; action: string; changes: Record<string, { antes: unknown; despues: unknown }> | Record<string, unknown>; created_at: string };

export default async function StudentPage({ params }: PageProps<"/students/[id]">) {
  const { id } = await params;
  const identity = await guardPage("students", `/students/${id}`);
  const student = await getStudent(id).catch(() => null);
  if (!student) notFound();

  const { data: matriculas } = await supabaseAdmin()
    .from("academic_student_enrollments")
    .select("id, status, enrollment_date, academic_programs(code, name), convocatorias(name)")
    .eq("student_id", id)
    .order("created_at", { ascending: false });

  const { data: audit } = await supabaseAdmin()
    .from("academic_students_audit")
    .select("id, changed_by, action, changes, created_at")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const canEdit = puedeEditarPagina(identity, "students");

  return (
    <div>
      <Link href="/students" className="text-sm text-sky-700 hover:underline">← Estudiantes</Link>
      <div className="mt-2 mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {nombreCompleto(student)}
            {student.disabled && <span className="ml-2 rounded bg-slate-200 text-slate-700 px-1.5 py-0.5 text-xs align-middle">deshabilitado</span>}
          </h1>
          <div className="text-sm text-slate-500 font-mono">{student.document_type} {student.document_number} · {student.email}</div>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>id <span className="font-mono">{student.id}</span></div>
          <div>alta {new Date(student.created_at).toLocaleDateString("es-ES")}</div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <StudentForm student={student} canEdit={canEdit} />
        <div className="space-y-4">
          <SituationBox student={student} canEdit={canEdit} />
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium">Matrículas</div>
            <ul className="divide-y divide-slate-100 text-sm">
              {((matriculas ?? []) as unknown as MatriculaRow[]).map((m) => (
                <li key={m.id} className="px-4 py-2">
                  <Link href={`/admissions/enrollments/${m.id}`} className="text-sky-800 hover:underline font-medium">
                    <span className="font-mono text-xs text-slate-500 mr-1">{m.academic_programs?.code}</span>{m.academic_programs?.name}
                  </Link>
                  <div className="text-xs text-slate-500">{m.convocatorias?.name} · {m.enrollment_date} · <span className={ESTADO_CLS[m.status] ?? ""}>{ESTADO_LABEL[m.status] ?? m.status}</span></div>
                </li>
              ))}
              {(matriculas ?? []).length === 0 && <li className="px-4 py-3 text-xs text-slate-400">Sin matrículas. Se crean desde <Link href="/admissions" className="text-sky-700 hover:underline">Admisión y matrícula</Link>.</li>}
            </ul>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium">Historial de cambios</div>
            <ul className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {((audit ?? []) as AuditRow[]).map((a) => (
                <li key={a.id} className="px-4 py-2 text-xs">
                  <div className="text-slate-500">{new Date(a.created_at).toLocaleString("es-ES")} · {a.changed_by ?? "sistema"}</div>
                  {a.action === "insert" ? (
                    <div className="text-slate-700">Alta de la ficha</div>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {Object.entries(a.changes as Record<string, { antes: unknown; despues: unknown }>).map(([k, v]) => (
                        <li key={k}><span className="font-mono text-slate-600">{k}</span>: <span className="line-through text-slate-400">{fmt(v.antes)}</span> → <span className="text-slate-800">{fmt(v.despues)}</span></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {(audit ?? []).length === 0 && <li className="px-4 py-4 text-xs text-slate-400">Sin cambios registrados.</li>}
            </ul>
          </div>
          <div className="text-xs text-slate-400">Situación actual: {SITUACIONES[student.situation]} ({student.situation_source}).</div>
        </div>
      </div>
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "∅";
  if (typeof v === "boolean") return v ? "sí" : "no";
  return String(v);
}
