import Link from "next/link";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { nombreCompleto } from "@/lib/students";
import { ConvocatoriasPanel, type ConvocatoriaRow, type CatOption } from "./ConvocatoriasPanel";
import { NewEnrollmentForm, type ProgramOption } from "./NewEnrollmentForm";

export const metadata = { title: "Admisión y matrícula" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente_pago: { label: "Pendiente de pago", cls: "bg-amber-100 text-amber-800" },
  activa: { label: "Activa", cls: "bg-emerald-100 text-emerald-800" },
  retirada: { label: "Retirada", cls: "bg-red-100 text-red-800" },
  finalizada: { label: "Finalizada", cls: "bg-sky-100 text-sky-800" },
};

type EnrRow = {
  id: string; student_id: string; program_id: string; enrollment_date: string; status: string; list_price: number | null; credit_rate: number | null;
  academic_students: { first_name: string; last_name: string; second_last_name: string | null; document_number: string } | null;
  academic_programs: { code: string; name: string } | null;
};

export default async function AdmissionsPage({ searchParams }: PageProps<"/admissions">) {
  const identity = await guardPage("admissions", "/admissions");
  const sp = await searchParams;
  const db = supabaseAdmin();
  const [convs, cats, progs] = await Promise.all([
    fetchAll<ConvocatoriaRow>(db.from("convocatorias").select("id, name, category_id, term_year, term_block, registration_start_date, deadline_date, first_day, end_date, active").order("term_year", { ascending: false }).order("term_block", { ascending: false })),
    db.from("academic_programs_category").select("id, name, sigla").order("name"),
    db.from("academic_programs").select("id, code, name, category_id").eq("active", true).order("name"),
  ]);

  const selectedId = typeof sp.convocatoria === "string" ? sp.convocatoria : convs.find((c) => c.active)?.id ?? convs[0]?.id ?? "";
  const selected = convs.find((c) => c.id === selectedId) ?? null;

  let enrollments: EnrRow[] = [];
  if (selected) {
    const { data } = await db
      .from("academic_student_enrollments")
      .select("id, student_id, program_id, enrollment_date, status, list_price, credit_rate, academic_students(first_name, last_name, second_last_name, document_number), academic_programs(code, name)")
      .eq("convocatoria_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    enrollments = (data ?? []) as unknown as EnrRow[];
  }
  const canEdit = puedeEditarPagina(identity, "admissions");
  const resumen = enrollments.reduce((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admisión y matrícula</h1>
      <p className="text-sm text-slate-500 mb-6">Una convocatoria por categoría, año y bloque. La matrícula nace pendiente de pago con su tarifa congelada y la malla completa.</p>

      <div className="grid grid-cols-[360px_1fr] gap-6">
        <ConvocatoriasPanel rows={convs} categories={(cats.data ?? []) as CatOption[]} selectedId={selectedId} canEdit={canEdit} />

        <div className="space-y-4">
          {selected ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <div className="text-sm text-slate-500">
                    {(cats.data ?? []).find((c) => c.id === selected.category_id)?.name} · {selected.term_year}/{selected.term_block} · inicio {selected.first_day}
                    {!selected.active && <span className="ml-2 rounded bg-slate-200 text-slate-700 px-1.5 py-0.5 text-xs">cerrada</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {enrollments.length} matrículas
                    {Object.entries(resumen).map(([k, n]) => <span key={k} className={`ml-2 rounded px-1.5 py-0.5 ${ESTADO[k]?.cls ?? ""}`}>{n} {ESTADO[k]?.label.toLowerCase() ?? k}</span>)}
                  </div>
                </div>
                {canEdit && selected.active && (
                  <NewEnrollmentForm convocatoria={{ id: selected.id, name: selected.name, category_id: selected.category_id }}
                    programs={((progs.data ?? []) as ProgramOption[]).filter((p) => p.category_id === selected.category_id)} />
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Estudiante</th>
                      <th className="px-4 py-2 font-medium">Programa</th>
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium text-right">Precio lista</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {enrollments.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-2">
                          <Link href={`/admissions/enrollments/${e.id}`} className="font-medium text-sky-800 hover:underline">
                            {e.academic_students ? nombreCompleto(e.academic_students) : e.student_id}
                          </Link>
                          <div className="text-xs text-slate-400 font-mono">{e.academic_students?.document_number}</div>
                        </td>
                        <td className="px-4 py-2"><span className="font-mono text-xs text-slate-500 mr-1">{e.academic_programs?.code}</span>{e.academic_programs?.name}</td>
                        <td className="px-4 py-2 font-mono text-xs">{e.enrollment_date}</td>
                        <td className="px-4 py-2 text-right">
                          {e.list_price != null ? Number(e.list_price).toLocaleString("es-ES", { minimumFractionDigits: 2 }) : <span className="text-red-600 text-xs">sin tarifa</span>}
                        </td>
                        <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${ESTADO[e.status]?.cls}`}>{ESTADO[e.status]?.label ?? e.status}</span></td>
                      </tr>
                    ))}
                    {enrollments.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin matrículas en esta convocatoria.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400">Crea la primera convocatoria para empezar a matricular.</div>
          )}
        </div>
      </div>
    </div>
  );
}
