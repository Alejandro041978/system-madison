"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

type Program = {
  id: string; category_id: string; name: string; code: string; description: string | null; partner_campus: boolean; active: boolean; external_id: string | null;
};
type Cat = { id: string; name: string; sigla: string };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";

export function ProgramHeader(p: { program: Program; categories: Cat[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ ...p.program, description: p.program.description ?? "", external_id: p.program.external_id ?? "" });
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/programs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setEditing(false);
    router.refresh();
  }

  const cat = p.categories.find((c) => c.id === p.program.category_id);

  if (!editing) {
    return (
      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="font-mono text-base text-slate-500 mr-2">{p.program.code}</span>{p.program.name}
            {!p.program.active && <span className="ml-2 rounded bg-slate-200 text-slate-700 px-1.5 py-0.5 text-xs align-middle">inactivo</span>}
            {p.program.partner_campus && <span className="ml-2 rounded bg-violet-100 text-violet-800 px-1.5 py-0.5 text-xs align-middle">campus socio</span>}
          </h1>
          <div className="text-sm text-slate-500">{cat?.name ?? "—"}{p.program.description ? ` · ${p.program.description}` : ""}</div>
        </div>
        {p.canEdit && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <Pencil className="h-4 w-4" /> Editar
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="mt-2 bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
      {error && <div className="w-full rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      <label className="text-sm"><div className="text-slate-600 mb-1">Código</div>
        <input required className={`${input} w-32 uppercase`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
      <label className="text-sm flex-1 min-w-64"><div className="text-slate-600 mb-1">Nombre</div>
        <input required className={`${input} w-full`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="text-sm"><div className="text-slate-600 mb-1">Categoría</div>
        <select className={input} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <label className="text-sm w-full"><div className="text-slate-600 mb-1">Descripción</div>
        <input className={`${input} w-full`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="text-sm"><div className="text-slate-600 mb-1">Id de origen (trazabilidad)</div>
        <input className={`${input} w-40`} value={f.external_id} onChange={(e) => setF({ ...f, external_id: e.target.value })} /></label>
      <label className="text-sm flex items-center gap-2 pb-2"><input type="checkbox" checked={f.partner_campus} onChange={(e) => setF({ ...f, partner_campus: e.target.checked })} /> Campus socio</label>
      <label className="text-sm flex items-center gap-2 pb-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>
      <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Guardar</button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
    </form>
  );
}
