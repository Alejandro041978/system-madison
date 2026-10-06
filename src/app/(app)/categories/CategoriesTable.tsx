"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X } from "lucide-react";

export type CategoryRow = {
  id: string; name: string; sigla: string; passing_score: number; description: string | null; external_id: string | null;
};

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";

async function api(method: string, body: unknown) {
  const res = await fetch("/api/categories", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json;
}

export function CategoriesTable(p: { rows: CategoryRow[]; programas: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nuevo, setNuevo] = useState({ name: "", sigla: "", passing_score: "", description: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<CategoryRow>>({});

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", nuevo);
      setNuevo({ name: "", sigla: "", passing_score: "", description: "" });
      setShowNew(false);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  }

  async function guardar() {
    if (!editId) return;
    setError(null);
    try {
      await api("PATCH", { id: editId, ...edit });
      setEditId(null);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {p.canEdit && (
        !showNew ? (
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c]">
            <Plus className="h-4 w-4" /> Nueva categoría
          </button>
        ) : (
          <form onSubmit={crear} className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
            <label className="text-sm"><div className="text-slate-600 mb-1">Nombre</div>
              <input required className={input} value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} /></label>
            <label className="text-sm"><div className="text-slate-600 mb-1">Sigla (≤5)</div>
              <input required maxLength={5} className={`${input} w-24 uppercase`} value={nuevo.sigla} onChange={(e) => setNuevo({ ...nuevo, sigla: e.target.value })} /></label>
            <label className="text-sm"><div className="text-slate-600 mb-1">Nota mínima</div>
              <input required type="number" step="0.01" min="0" className={`${input} w-28`} value={nuevo.passing_score} onChange={(e) => setNuevo({ ...nuevo, passing_score: e.target.value })} /></label>
            <label className="text-sm flex-1 min-w-48"><div className="text-slate-600 mb-1">Descripción</div>
              <input className={`${input} w-full`} value={nuevo.description} onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })} /></label>
            <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Guardar</button>
            <button type="button" onClick={() => setShowNew(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
          </form>
        )
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Sigla</th>
              <th className="px-4 py-2 font-medium">Nota mínima</th>
              <th className="px-4 py-2 font-medium">Descripción</th>
              <th className="px-4 py-2 font-medium">Programas</th>
              {p.canEdit && <th className="px-4 py-2 w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.rows.map((r) => editId === r.id ? (
              <tr key={r.id} className="bg-sky-50/40">
                <td className="px-4 py-2"><input className={input} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                <td className="px-4 py-2"><input maxLength={5} className={`${input} w-20 uppercase`} value={edit.sigla ?? ""} onChange={(e) => setEdit({ ...edit, sigla: e.target.value })} /></td>
                <td className="px-4 py-2"><input type="number" step="0.01" min="0" className={`${input} w-24`} value={edit.passing_score ?? ""} onChange={(e) => setEdit({ ...edit, passing_score: Number(e.target.value) })} /></td>
                <td className="px-4 py-2"><input className={`${input} w-full`} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></td>
                <td className="px-4 py-2 text-slate-500">{p.programas[r.id] ?? 0}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={guardar} title="Guardar" className="text-emerald-700"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditId(null)} title="Cancelar" className="text-slate-400"><X className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.sigla}</td>
                <td className="px-4 py-2">{Number(r.passing_score).toLocaleString("es-ES")}</td>
                <td className="px-4 py-2 text-slate-600">{r.description ?? ""}</td>
                <td className="px-4 py-2 text-slate-500">{p.programas[r.id] ?? 0}</td>
                {p.canEdit && (
                  <td className="px-4 py-2">
                    <button onClick={() => { setEditId(r.id); setEdit({ name: r.name, sigla: r.sigla, passing_score: r.passing_score, description: r.description ?? "" }); }}
                      title="Editar" className="text-slate-500 hover:text-slate-800"><Pencil className="h-4 w-4" /></button>
                  </td>
                )}
              </tr>
            ))}
            {p.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin categorías. Crea la primera (p. ej. Master, sigla MBA, nota 5).</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
