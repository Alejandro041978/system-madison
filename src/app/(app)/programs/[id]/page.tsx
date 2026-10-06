import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { tarifaVigente } from "@/lib/rates";
import { ProgramHeader } from "./ProgramHeader";
import { CoursesTable, type CourseRow } from "./CoursesTable";

export const metadata = { title: "Programa" };
export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({ params }: PageProps<"/programs/[id]">) {
  const { id } = await params;
  const identity = await guardPage("programs", `/programs/${id}`);
  const db = supabaseAdmin();

  const { data: program } = await db
    .from("academic_programs")
    .select("id, category_id, name, code, description, partner_campus, active, external_id")
    .eq("id", id)
    .maybeSingle();
  if (!program) notFound();

  const [cats, courses, tarifa, category] = await Promise.all([
    db.from("academic_programs_category").select("id, name, sigla").order("name"),
    fetchAll<CourseRow>(
      db.from("academic_courses")
        .select("id, program_id, name, code, credits, hours, level, sort_order, is_capstone, graduation_requirement, partner_campus, active, external_id")
        .eq("program_id", id).order("level").order("sort_order").order("code"),
    ),
    tarifaVigente(id).catch(() => null),
    db.from("academic_programs_category").select("name, passing_score").eq("id", program.category_id).maybeSingle(),
  ]);

  const canEdit = puedeEditarPagina(identity, "programs");
  const activas = courses.filter((c) => c.active);
  const creditos = activas.reduce((s, c) => s + Number(c.credits), 0);

  return (
    <div>
      <Link href="/programs" className="text-sm text-sky-700 hover:underline">← Programas</Link>
      <ProgramHeader program={program} categories={cats.data ?? []} canEdit={canEdit} />

      <div className="grid grid-cols-3 gap-4 my-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Malla</div>
          <div className="text-2xl font-semibold">{activas.length} <span className="text-sm font-normal text-slate-500">asignaturas</span></div>
          <div className="text-sm text-slate-600">{creditos.toLocaleString("es-ES")} créditos</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Nota mínima (categoría)</div>
          <div className="text-2xl font-semibold">{category.data ? Number(category.data.passing_score).toLocaleString("es-ES") : "—"}</div>
          <div className="text-sm text-slate-600">{category.data?.name ?? ""}</div>
        </div>
        <div className={`border rounded-lg p-4 ${tarifa ? "bg-white border-slate-200" : "bg-red-50 border-red-200"}`}>
          <div className="text-xs uppercase tracking-wider text-slate-400">Tarifa vigente hoy</div>
          {tarifa ? (
            <>
              <div className="text-2xl font-semibold">
                {Number(tarifa.rate.price_per_credit).toLocaleString("es-ES", { minimumFractionDigits: 2 })} {tarifa.rate.currency}
                <span className="text-sm font-normal text-slate-500"> / crédito</span>
              </div>
              <div className="text-sm text-slate-600">
                {tarifa.source === "program" ? "propia del programa" : "heredada de la categoría"} · desde {tarifa.rate.effective_from}
                {creditos > 0 && <> · lista: <b>{(creditos * Number(tarifa.rate.price_per_credit)).toLocaleString("es-ES", { minimumFractionDigits: 2 })} {tarifa.rate.currency}</b></>}
              </div>
            </>
          ) : (
            <div className="text-sm text-red-700 mt-1">Sin tarifa: no se podrá matricular.</div>
          )}
          <Link href={`/rates?program_id=${id}`} className="text-xs text-sky-700 hover:underline">ver historial / nueva versión</Link>
        </div>
      </div>

      <CoursesTable programId={id} rows={courses} canEdit={canEdit} />
    </div>
  );
}
