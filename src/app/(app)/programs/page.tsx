import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { auditarProgramas, type Hallazgo } from "@/lib/programs-audit";
import { ProgramsTable, type ProgramRow, type CategoryOption } from "./ProgramsTable";

export const metadata = { title: "Programas y mallas" };
export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const identity = await guardPage("programs", "/programs");
  const db = supabaseAdmin();
  const [programs, cats, courses, audit] = await Promise.all([
    fetchAll<ProgramRow>(db.from("academic_programs").select("id, category_id, name, code, partner_campus, active, description").order("name")),
    db.from("academic_programs_category").select("id, name, sigla").order("name"),
    fetchAll<{ program_id: string; credits: number; active: boolean }>(db.from("academic_courses").select("program_id, credits, active").order("id")),
    auditarProgramas().catch((e: Error) => ({ hallazgos: [{ severidad: "bloquea", tipo: "auditor_error", mensaje: `El auditor falló: ${e.message}` }] as Hallazgo[], resumen: { bloquea: 1, aviso: 0 } })),
  ]);

  const stats: Record<string, { n: number; creditos: number }> = {};
  for (const c of courses.filter((c) => c.active)) {
    const s = (stats[c.program_id] ??= { n: 0, creditos: 0 });
    s.n++;
    s.creditos += Number(c.credits);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Programas y mallas</h1>
      <p className="text-sm text-slate-500 mb-6">El plan de estudios es la única fuente de nombres, códigos y créditos.</p>

      {audit.hallazgos.length > 0 && (
        <div className="mb-6 bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium flex items-center gap-3">
            Auditor del módulo
            <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-xs">{audit.resumen.bloquea} bloquean</span>
            <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs">{audit.resumen.aviso} avisos</span>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {audit.hallazgos.map((h, i) => (
              <li key={i} className="px-4 py-1.5 flex items-start gap-2">
                {h.severidad === "bloquea" ? <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" /> : <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
                <span>
                  {h.mensaje}
                  {h.programa_id && <Link href={`/programs/${h.programa_id}`} className="ml-2 text-sky-700 hover:underline text-xs">abrir</Link>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ProgramsTable
        rows={programs}
        categories={(cats.data ?? []) as CategoryOption[]}
        stats={stats}
        canEdit={puedeEditarPagina(identity, "programs")}
      />
    </div>
  );
}
