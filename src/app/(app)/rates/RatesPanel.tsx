"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { CreditRate, TarifaVigente } from "@/lib/rates";

type Cat = { id: string; name: string; sigla: string };
type Prog = { id: string; name: string; code: string; category_id: string; active: boolean };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";
const money = (n: number, cur: string) => `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 })} ${cur}`;

export function RatesPanel(p: {
  categories: Cat[]; programs: Prog[];
  selected: { program_id: string; category_id: string; date: string };
  historial: CreditRate[]; vigente: TarifaVigente | null; today: string; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ price_per_credit: "", currency: "EUR", effective_from: p.today, note: "" });
  const [date, setDate] = useState(p.selected.date);

  const scope = p.selected.program_id ? "program" : p.selected.category_id ? "category" : "";
  const program = p.programs.find((x) => x.id === p.selected.program_id);
  const category = p.categories.find((x) => x.id === (p.selected.category_id || program?.category_id));

  function go(q: Record<string, string>) {
    const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    router.push(`/rates?${sp.toString()}`);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = { ...nuevo, program_id: p.selected.program_id || null, category_id: p.selected.program_id ? null : p.selected.category_id || null };
    const res = await fetch("/api/rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setNuevo({ ...nuevo, price_per_credit: "", note: "" });
    router.refresh();
  }

  async function borrar(r: CreditRate) {
    if (!confirm(`¿Borrar la versión del ${r.effective_from} (${money(r.price_per_credit, r.currency)})?

Solo se permite si ninguna matrícula la ha usado. Queda copia en el registro de borrados.`)) return;
    setError(null);
    const res = await fetch("/api/rates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
        <label className="text-sm"><div className="text-slate-600 mb-1">Categoría</div>
          <select className={input} value={p.selected.category_id} onChange={(e) => go({ category_id: e.target.value })}>
            <option value="">— Elegir —</option>
            {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <span className="pb-2 text-slate-400 text-sm">o</span>
        <label className="text-sm"><div className="text-slate-600 mb-1">Programa</div>
          <select className={`${input} min-w-64`} value={p.selected.program_id} onChange={(e) => go({ program_id: e.target.value, date })}>
            <option value="">— Elegir —</option>
            {p.programs.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
          </select></label>
        {scope === "program" && (
          <label className="text-sm"><div className="text-slate-600 mb-1">Tarifa vigente en fecha</div>
            <div className="flex gap-2">
              <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
              <button onClick={() => go({ program_id: p.selected.program_id, date })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">Consultar</button>
            </div></label>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {scope === "program" && (
        <div className={`rounded-lg border p-4 ${p.vigente ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">Tarifa que recibiría una matrícula del {p.selected.date}</div>
          {p.vigente ? (
            <div className="mt-1">
              <span className="text-2xl font-semibold">{money(p.vigente.rate.price_per_credit, p.vigente.rate.currency)}</span>
              <span className="text-sm text-slate-600"> / crédito · {p.vigente.source === "program" ? "propia del programa" : `heredada de la categoría ${category?.name ?? ""}`} · versión del {p.vigente.rate.effective_from}</span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-red-700">Sin tarifa vigente en esa fecha, ni del programa ni de su categoría.</div>
          )}
        </div>
      )}

      {scope && (
        <div className="grid grid-cols-[1fr_320px] gap-5">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium">
              Historial {scope === "program" ? `del programa ${program?.code ?? ""}` : `de la categoría ${category?.name ?? ""}`}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Vigente desde</th>
                  <th className="px-4 py-2 font-medium text-right">Precio / crédito</th>
                  <th className="px-4 py-2 font-medium">Nota</th>
                  <th className="px-4 py-2 font-medium">Creada por</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  {p.canDelete && <th className="w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.historial.map((r, i) => {
                  const futura = r.effective_from > p.today;
                  const vigenteHoy = !futura && i === p.historial.findIndex((x) => x.effective_from <= p.today);
                  return (
                    <tr key={r.id} className={futura ? "text-slate-500" : ""}>
                      <td className="px-4 py-2 font-mono text-xs">{r.effective_from}</td>
                      <td className="px-4 py-2 text-right font-medium">{money(r.price_per_credit, r.currency)}</td>
                      <td className="px-4 py-2 text-slate-600">{r.note ?? ""}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{r.created_by ?? "—"}</td>
                      <td className="px-4 py-2">
                        {vigenteHoy && <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-xs">vigente</span>}
                        {futura && <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.5 text-xs">futura</span>}
                        {!vigenteHoy && !futura && <span className="text-xs text-slate-400">histórica</span>}
                      </td>
                      {p.canDelete && (
                        <td className="px-2 py-2">
                          <button onClick={() => borrar(r)} className="text-red-600 hover:text-red-800" title="Borrar versión (solo si ninguna matrícula la usó)"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {p.historial.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin versiones.</td></tr>}
              </tbody>
            </table>
          </div>

          {p.canEdit && (
            <form onSubmit={crear} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 self-start">
              <div className="text-sm font-medium">Nueva versión {scope === "program" ? "del programa" : "de la categoría"}</div>
              <label className="block text-sm"><div className="text-slate-600 mb-1">Precio por crédito</div>
                <div className="flex gap-2">
                  <input required type="number" step="0.01" min="0" className={`${input} w-full`} value={nuevo.price_per_credit} onChange={(e) => setNuevo({ ...nuevo, price_per_credit: e.target.value })} />
                  <input className={`${input} w-16 uppercase`} maxLength={3} value={nuevo.currency} onChange={(e) => setNuevo({ ...nuevo, currency: e.target.value })} />
                </div></label>
              <label className="block text-sm"><div className="text-slate-600 mb-1">Vigente desde</div>
                <input required type="date" className={`${input} w-full`} value={nuevo.effective_from} onChange={(e) => setNuevo({ ...nuevo, effective_from: e.target.value })} /></label>
              <label className="block text-sm"><div className="text-slate-600 mb-1">Nota (motivo)</div>
                <input className={`${input} w-full`} value={nuevo.note} onChange={(e) => setNuevo({ ...nuevo, note: e.target.value })} /></label>
              <button className="w-full rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Crear versión</button>
              <p className="text-xs text-slate-400">No se puede editar una versión existente: crea una nueva con otra fecha. Una versión equivocada se puede borrar mientras ninguna matrícula la haya usado.</p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
