"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export type ProgramRow = {
  id: string; category_id: string; name: string; code: string; partner_campus: boolean; active: boolean; description: string | null;
};
export type CategoryOption = { id: string; name: string; sigla: string };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";

export function ProgramsTable(p: {
  rows: ProgramRow[]; categories: CategoryOption[]; stats: Record<string, { n: number; creditos: number }>; canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nuevo, setNuevo] = useState({ name: "", code: "", category_id: "", partner_campus: false, description: "" });
  const [filtroCat, setFiltroCat] = useState("");

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nuevo) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      router.push(`/programs/${json.id}`);
    } catch (e) { setError((e as Error).message); }
  }

  const catName = (id: string) => p.categories.find((c) => c.id === id)?.name ?? "—";
  const rows = filtroCat ? p.rows.filter((r) => r.category_id === filtroCat) : p.rows;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="flex items-center gap-3">
        {p.canEdit && !showNew && (
          <button onClick={() => setShowNew(true)} disabled={p.categories.length === 0}
            title={p.categories.length === 0 ? "Crea primero una categoría" : ""}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c] disabled:opacity-50">
            <Plus className="h-4 w-4" /> Nuevo programa
          </button>
        )}
        <select className={input} value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {showNew && (
        <form onSubmit={crear} className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
          <label className="text-sm"><div className="text-slate-600 mb-1">Categoría</div>
            <select required className={input} value={nuevo.category_id} onChange={(e) => setNuevo({ ...nuevo, category_id: e.target.value })}>
              <option value="">— Elegir —</option>
              {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Código</div>
            <input required className={`${input} w-32 uppercase`} value={nuevo.code} onChange={(e) => setNuevo({ ...nuevo, code: e.target.value })} /></label>
          <label className="text-sm flex-1 min-w-64"><div className="text-slate-600 mb-1">Nombre</div>
            <input required className={`${input} w-full`} value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} /></label>
          <label className="text-sm flex items-center gap-2 pb-2">
            <input type="checkbox" checked={nuevo.partner_campus} onChange={(e) => setNuevo({ ...nuevo, partner_campus: e.target.checked })} /> Campus socio
          </label>
          <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Crear y abrir malla</button>
          <button type="button" onClick={() => setShowNew(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Programa</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium text-right">Asignaturas</th>
              <th className="px-4 py-2 font-medium text-right">Créditos</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const s = p.stats[r.id] ?? { n: 0, creditos: 0 };
              return (
                <tr key={r.id} className={r.active ? "" : "text-slate-400"}>
                  <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-2"><Link href={`/programs/${r.id}`} className="font-medium text-sky-800 hover:underline">{r.name}</Link>
                    {r.partner_campus && <span className="ml-2 rounded bg-violet-100 text-violet-800 px-1.5 py-0.5 text-xs">campus socio</span>}</td>
                  <td className="px-4 py-2">{catName(r.category_id)}</td>
                  <td className="px-4 py-2 text-right">{s.n}</td>
                  <td className="px-4 py-2 text-right">{s.creditos.toLocaleString("es-ES")}</td>
                  <td className="px-4 py-2">{r.active ? "activo" : "inactivo"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin programas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
