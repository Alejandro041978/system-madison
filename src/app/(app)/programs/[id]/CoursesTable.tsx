"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X } from "lucide-react";

export type CourseRow = {
  id: string; program_id: string; name: string; code: string; credits: number; hours: number | null; level: number; sort_order: number;
  is_capstone: boolean; graduation_requirement: boolean; partner_campus: boolean; active: boolean; external_id: string | null;
};

const input = "rounded-md border border-slate-300 px-2 py-1 text-sm bg-white";
const VACIO = { name: "", code: "", credits: "", hours: "", level: "1", sort_order: "0", is_capstone: false, graduation_requirement: true, partner_campus: false };

async function api(method: string, body: unknown) {
  const res = await fetch("/api/courses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json;
}

export function CoursesTable(p: { programId: string; rows: CourseRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nuevo, setNuevo] = useState({ ...VACIO });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, unknown>>({});

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", { ...nuevo, program_id: p.programId });
      setNuevo({ ...VACIO, level: nuevo.level });
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  }

  async function guardar() {
    setError(null);
    try {
      await api("PATCH", { id: editId, ...edit });
      setEditId(null);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  }

  async function toggle(id: string, campo: string, valor: boolean) {
    setError(null);
    try { await api("PATCH", { id, [campo]: valor }); router.refresh(); } catch (e) { setError((e as Error).message); }
  }

  const niveles = [...new Set(p.rows.map((r) => r.level))].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Malla curricular</h2>
        {p.canEdit && !showNew && (
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c]">
            <Plus className="h-4 w-4" /> Nueva asignatura
          </button>
        )}
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {showNew && (
        <form onSubmit={crear} className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
          <label className="text-sm"><div className="text-slate-600 mb-1">Nivel</div>
            <input type="number" min="1" className={`${input} w-16`} value={nuevo.level} onChange={(e) => setNuevo({ ...nuevo, level: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Código</div>
            <input required className={`${input} w-28 uppercase`} value={nuevo.code} onChange={(e) => setNuevo({ ...nuevo, code: e.target.value })} /></label>
          <label className="text-sm flex-1 min-w-64"><div className="text-slate-600 mb-1">Nombre</div>
            <input required className={`${input} w-full`} value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Créditos</div>
            <input required type="number" step="0.5" min="0" className={`${input} w-20`} value={nuevo.credits} onChange={(e) => setNuevo({ ...nuevo, credits: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Horas</div>
            <input type="number" step="1" min="0" className={`${input} w-20`} value={nuevo.hours} onChange={(e) => setNuevo({ ...nuevo, hours: e.target.value })} /></label>
          <label className="text-sm flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={nuevo.graduation_requirement} onChange={(e) => setNuevo({ ...nuevo, graduation_requirement: e.target.checked })} /> Requisito grado</label>
          <label className="text-sm flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={nuevo.is_capstone} onChange={(e) => setNuevo({ ...nuevo, is_capstone: e.target.checked })} /> Capstone/TFM</label>
          <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Añadir</button>
          <button type="button" onClick={() => setShowNew(false)} className="text-sm text-slate-500 hover:underline">Cerrar</button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium w-16">Nivel</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Asignatura</th>
              <th className="px-3 py-2 font-medium text-right">Créditos</th>
              <th className="px-3 py-2 font-medium text-right">Horas</th>
              <th className="px-3 py-2 font-medium text-center">Req. grado</th>
              <th className="px-3 py-2 font-medium text-center">Capstone</th>
              <th className="px-3 py-2 font-medium text-center">Activa</th>
              {p.canEdit && <th className="w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {niveles.map((lvl) => (
              <Nivel key={lvl} lvl={lvl} rows={p.rows.filter((r) => r.level === lvl)} canEdit={p.canEdit}
                editId={editId} edit={edit} setEdit={setEdit} setEditId={setEditId} guardar={guardar} toggle={toggle} />
            ))}
            {p.rows.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">Malla vacía. Sin asignaturas, una matrícula no tendría registro curricular.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Nivel(p: {
  lvl: number; rows: CourseRow[]; canEdit: boolean; editId: string | null; edit: Record<string, unknown>;
  setEdit: (e: Record<string, unknown>) => void; setEditId: (id: string | null) => void; guardar: () => void;
  toggle: (id: string, campo: string, v: boolean) => void;
}) {
  const sub = p.rows.filter((r) => r.active).reduce((s, r) => s + Number(r.credits), 0);
  return (
    <>
      <tr className="bg-slate-50/60 border-t border-slate-200">
        <td colSpan={3} className="px-3 py-1 text-[11px] uppercase tracking-wider text-slate-500">Nivel {p.lvl}</td>
        <td className="px-3 py-1 text-right text-xs text-slate-500">{sub.toLocaleString("es-ES")}</td>
        <td colSpan={5}></td>
      </tr>
      {p.rows.map((r) => p.editId === r.id ? (
        <tr key={r.id} className="bg-sky-50/40 border-t border-slate-100">
          <td className="px-3 py-1"><input type="number" min="1" className={`${input} w-14`} value={String(p.edit.level ?? "")} onChange={(e) => p.setEdit({ ...p.edit, level: e.target.value })} /></td>
          <td className="px-3 py-1"><input className={`${input} w-24 uppercase`} value={String(p.edit.code ?? "")} onChange={(e) => p.setEdit({ ...p.edit, code: e.target.value })} /></td>
          <td className="px-3 py-1"><input className={`${input} w-full`} value={String(p.edit.name ?? "")} onChange={(e) => p.setEdit({ ...p.edit, name: e.target.value })} /></td>
          <td className="px-3 py-1"><input type="number" step="0.5" min="0" className={`${input} w-20 text-right`} value={String(p.edit.credits ?? "")} onChange={(e) => p.setEdit({ ...p.edit, credits: e.target.value })} /></td>
          <td className="px-3 py-1"><input type="number" min="0" className={`${input} w-20 text-right`} value={String(p.edit.hours ?? "")} onChange={(e) => p.setEdit({ ...p.edit, hours: e.target.value })} /></td>
          <td className="px-3 py-1 text-center"><input type="checkbox" checked={!!p.edit.graduation_requirement} onChange={(e) => p.setEdit({ ...p.edit, graduation_requirement: e.target.checked })} /></td>
          <td className="px-3 py-1 text-center"><input type="checkbox" checked={!!p.edit.is_capstone} onChange={(e) => p.setEdit({ ...p.edit, is_capstone: e.target.checked })} /></td>
          <td className="px-3 py-1 text-center">{r.active ? "sí" : "no"}</td>
          <td className="px-3 py-1">
            <div className="flex gap-2">
              <button onClick={p.guardar} className="text-emerald-700" title="Guardar"><Check className="h-4 w-4" /></button>
              <button onClick={() => p.setEditId(null)} className="text-slate-400" title="Cancelar"><X className="h-4 w-4" /></button>
            </div>
          </td>
        </tr>
      ) : (
        <tr key={r.id} className={`border-t border-slate-100 ${r.active ? "" : "text-slate-400"}`}>
          <td className="px-3 py-1.5">{r.level}</td>
          <td className="px-3 py-1.5 font-mono text-xs">{r.code}</td>
          <td className="px-3 py-1.5">{r.name}{r.partner_campus && <span className="ml-2 rounded bg-violet-100 text-violet-800 px-1 text-xs">socio</span>}</td>
          <td className="px-3 py-1.5 text-right">{Number(r.credits).toLocaleString("es-ES")}</td>
          <td className="px-3 py-1.5 text-right">{r.hours != null ? Number(r.hours).toLocaleString("es-ES") : "—"}</td>
          <td className="px-3 py-1.5 text-center"><input type="checkbox" disabled={!p.canEdit} checked={r.graduation_requirement} onChange={(e) => p.toggle(r.id, "graduation_requirement", e.target.checked)} /></td>
          <td className="px-3 py-1.5 text-center"><input type="checkbox" disabled={!p.canEdit} checked={r.is_capstone} onChange={(e) => p.toggle(r.id, "is_capstone", e.target.checked)} /></td>
          <td className="px-3 py-1.5 text-center"><input type="checkbox" disabled={!p.canEdit} checked={r.active} onChange={(e) => p.toggle(r.id, "active", e.target.checked)} /></td>
          {p.canEdit && (
            <td className="px-3 py-1.5">
              <button onClick={() => { p.setEditId(r.id); p.setEdit({ level: r.level, code: r.code, name: r.name, credits: r.credits, hours: r.hours ?? "", graduation_requirement: r.graduation_requirement, is_capstone: r.is_capstone }); }}
                className="text-slate-500 hover:text-slate-800" title="Editar"><Pencil className="h-4 w-4" /></button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
