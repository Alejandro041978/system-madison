"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export type ConvocatoriaRow = {
  id: string; name: string; category_id: string; term_year: number; term_block: number;
  registration_start_date: string; deadline_date: string; first_day: string; end_date: string | null; active: boolean;
};
export type CatOption = { id: string; name: string; sigla: string };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full";
const year = new Date().getFullYear();

export function ConvocatoriasPanel(p: { rows: ConvocatoriaRow[]; categories: CatOption[]; selectedId: string; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", category_id: "", term_year: String(year), term_block: "1", registration_start_date: "", deadline_date: "", first_day: "", end_date: "" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/convocatorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setOpen(false);
    router.push(`/admissions?convocatoria=${json.id}`);
    router.refresh();
  }

  async function toggle(c: ConvocatoriaRow) {
    const res = await fetch("/api/convocatorias", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, active: !c.active }) });
    if (!res.ok) { setError((await res.json()).error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  const catName = (id: string) => p.categories.find((c) => c.id === id)?.sigla ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Convocatorias</h2>
        {p.canEdit && !open && (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline"><Plus className="h-4 w-4" /> Nueva</button>
        )}
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}

      {open && (
        <form onSubmit={crear} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-sm">
          <input required placeholder="Nombre (p. ej. Master 2026 · Octubre)" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select required className={input} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">— Categoría —</option>
            {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label><div className="text-xs text-slate-500">Año</div><input type="number" required className={input} value={f.term_year} onChange={(e) => setF({ ...f, term_year: e.target.value })} /></label>
            <label><div className="text-xs text-slate-500">Bloque (1–12)</div><input type="number" min={1} max={12} required className={input} value={f.term_block} onChange={(e) => setF({ ...f, term_block: e.target.value })} /></label>
            <label><div className="text-xs text-slate-500">Inicio inscripción</div><input type="date" required className={input} value={f.registration_start_date} onChange={(e) => setF({ ...f, registration_start_date: e.target.value })} /></label>
            <label><div className="text-xs text-slate-500">Cierre inscripción</div><input type="date" required className={input} value={f.deadline_date} onChange={(e) => setF({ ...f, deadline_date: e.target.value })} /></label>
            <label><div className="text-xs text-slate-500">Primer día de clase</div><input type="date" required className={input} value={f.first_day} onChange={(e) => setF({ ...f, first_day: e.target.value })} /></label>
            <label><div className="text-xs text-slate-500">Fin (opcional)</div><input type="date" className={input} value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:underline">Cancelar</button>
            <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1">Crear</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {p.rows.map((c) => (
          <div key={c.id} className={`px-3 py-2 border-b border-slate-100 last:border-0 text-sm flex items-center justify-between ${c.id === p.selectedId ? "bg-sky-50" : ""}`}>
            <Link href={`/admissions?convocatoria=${c.id}`} className={`flex-1 ${c.active ? "" : "text-slate-400"}`}>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-slate-500">{catName(c.category_id)} · {c.term_year}/{c.term_block} · {c.first_day}</div>
            </Link>
            {p.canEdit && (
              <button onClick={() => toggle(c)} className="text-xs text-slate-500 hover:underline" title={c.active ? "Cerrar convocatoria" : "Reabrir"}>
                {c.active ? "abierta" : "cerrada"}
              </button>
            )}
          </div>
        ))}
        {p.rows.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">Sin convocatorias.</div>}
      </div>
    </div>
  );
}
