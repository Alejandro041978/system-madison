"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseEnrollment } from "@/lib/enrollments";

export type CourseInfo = { id: string; code: string; name: string; credits: number; level: number; active: boolean };

const ESTADO: Record<CourseEnrollment["status"], { label: string; cls: string }> = {
  no_iniciada: { label: "No iniciada", cls: "bg-slate-100 text-slate-700" },
  en_curso: { label: "En curso", cls: "bg-sky-100 text-sky-800" },
  aprobada: { label: "Aprobada", cls: "bg-emerald-100 text-emerald-800" },
  reprobada: { label: "Reprobada", cls: "bg-red-100 text-red-800" },
  retirada: { label: "Retirada", cls: "bg-amber-100 text-amber-800" },
};

const ACCIONES: Record<CourseEnrollment["status"], { action: string; label: string }[]> = {
  no_iniciada: [{ action: "abrir", label: "Abrir" }, { action: "retirar", label: "Retirar" }],
  en_curso: [{ action: "aprobar", label: "Aprobar" }, { action: "reprobar", label: "Reprobar" }, { action: "retirar", label: "Retirar" }],
  aprobada: [],
  reprobada: [{ action: "nuevo_intento", label: "Nuevo intento" }],
  retirada: [{ action: "reabrir", label: "Reponer" }, { action: "nuevo_intento", label: "Nuevo intento" }],
};

export function CurriculumTable(p: { courses: CourseInfo[]; rows: CourseEnrollment[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(row: CourseEnrollment, action: string) {
    setError(null); setBusy(row.id);
    const res = await fetch("/api/admissions/courses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  // Agrupar por asignatura; mostrar todos los intentos, último primero.
  const porCurso = new Map<string, CourseEnrollment[]>();
  for (const r of p.rows) porCurso.set(r.course_id, [...(porCurso.get(r.course_id) ?? []), r]);
  const niveles = [...new Set(p.courses.map((c) => c.level))].sort((a, b) => a - b);

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Registro curricular <span className="text-sm font-normal text-slate-500">— en qué está inscrito</span></h2>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Asignatura</th>
              <th className="px-3 py-2 font-medium text-right">Créditos</th>
              <th className="px-3 py-2 font-medium text-center">Intento</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Origen</th>
              {p.canEdit && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {niveles.map((lvl) => (
              <Group key={lvl} lvl={lvl} courses={p.courses.filter((c) => c.level === lvl)} porCurso={porCurso} canEdit={p.canEdit} busy={busy} act={act} />
            ))}
            {p.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Registro vacío: la malla del programa no tenía asignaturas al matricular.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Group(p: { lvl: number; courses: CourseInfo[]; porCurso: Map<string, CourseEnrollment[]>; canEdit: boolean; busy: string | null; act: (r: CourseEnrollment, a: string) => void }) {
  return (
    <>
      <tr className="bg-slate-50/60 border-t border-slate-200"><td colSpan={6} className="px-3 py-1 text-[11px] uppercase tracking-wider text-slate-500">Nivel {p.lvl}</td></tr>
      {p.courses.map((c) => {
        const intentos = (p.porCurso.get(c.id) ?? []).slice().sort((a, b) => b.attempt - a.attempt);
        if (intentos.length === 0) {
          return (
            <tr key={c.id} className="border-t border-slate-100 text-slate-400">
              <td className="px-3 py-1.5"><span className="font-mono text-xs mr-2">{c.code}</span>{c.name}</td>
              <td className="px-3 py-1.5 text-right">{Number(c.credits).toLocaleString("es-ES")}</td>
              <td colSpan={4} className="px-3 py-1.5 text-xs">no está en el registro</td>
            </tr>
          );
        }
        return intentos.map((r, i) => (
          <tr key={r.id} className={`border-t border-slate-100 ${i > 0 ? "text-slate-400" : ""}`}>
            <td className="px-3 py-1.5">{i === 0 && <><span className="font-mono text-xs mr-2">{c.code}</span>{c.name}</>}</td>
            <td className="px-3 py-1.5 text-right">{i === 0 ? Number(c.credits).toLocaleString("es-ES") : ""}</td>
            <td className="px-3 py-1.5 text-center">{r.attempt}{r.attempt > 1 && <span className="text-xs text-slate-400"> (recursado)</span>}</td>
            <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-xs ${ESTADO[r.status].cls}`}>{ESTADO[r.status].label}</span></td>
            <td className="px-3 py-1.5 text-xs text-slate-500">{r.source}{r.note ? ` · ${r.note}` : ""}</td>
            {p.canEdit && (
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {i === 0 && ACCIONES[r.status].map((a) => (
                  <button key={a.action} disabled={p.busy === r.id} onClick={() => p.act(r, a.action)} className="ml-2 text-xs text-sky-700 hover:underline disabled:opacity-50">{a.label}</button>
                ))}
              </td>
            )}
          </tr>
        ));
      })}
    </>
  );
}
