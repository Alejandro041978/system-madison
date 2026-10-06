"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

export type TemplateRow = { id: string; name: string; initial_amount: number; installments: number; frequency_months: number; first_installment_offset_months: number; active: boolean };
export type TargetRow = { id: string; template_id: string; program_id: string | null; category_id: string | null };
type Opt = { id: string; name: string; code?: string };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";

export function TemplatesPanel(p: { templates: TemplateRow[]; targets: TargetRow[]; categories: Opt[]; programs: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ name: "", initial_amount: "0", installments: "10", frequency_months: "1", first_installment_offset_months: "0" });
  const [target, setTarget] = useState<Record<string, string>>({});

  async function api(method: string, body: unknown) {
    setError(null);
    const res = await fetch("/api/accounts/templates", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return null; }
    router.refresh();
    return json;
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("POST", f);
    if (r) { setShowNew(false); setF({ ...f, name: "" }); }
  }

  function nombreDestino(t: TargetRow) {
    if (t.program_id) { const x = p.programs.find((o) => o.id === t.program_id); return `${x?.code ?? ""} ${x?.name ?? t.program_id}`; }
    const x = p.categories.find((o) => o.id === t.category_id);
    return `Categoría: ${x?.name ?? t.category_id}`;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {p.canEdit && (!showNew ? (
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c]">
          <Plus className="h-4 w-4" /> Nueva plantilla
        </button>
      ) : (
        <form onSubmit={crear} className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4 text-sm">
          <label><div className="text-slate-600 mb-1">Nombre</div><input required className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label><div className="text-slate-600 mb-1">Matrícula inicial (€)</div><input type="number" step="0.01" min="0" className={`${input} w-32`} value={f.initial_amount} onChange={(e) => setF({ ...f, initial_amount: e.target.value })} /></label>
          <label><div className="text-slate-600 mb-1">Nº de cuotas</div><input type="number" min="1" required className={`${input} w-24`} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></label>
          <label><div className="text-slate-600 mb-1">Cada (meses)</div><input type="number" min="1" className={`${input} w-24`} value={f.frequency_months} onChange={(e) => setF({ ...f, frequency_months: e.target.value })} /></label>
          <label><div className="text-slate-600 mb-1">1.ª cuota (meses tras inicio)</div><input type="number" min="0" className={`${input} w-24`} value={f.first_installment_offset_months} onChange={(e) => setF({ ...f, first_installment_offset_months: e.target.value })} /></label>
          <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5">Crear</button>
          <button type="button" onClick={() => setShowNew(false)} className="text-slate-500 hover:underline">Cancelar</button>
        </form>
      ))}

      <div className="grid grid-cols-2 gap-4">
        {p.templates.map((t) => {
          const mios = p.targets.filter((x) => x.template_id === t.id);
          return (
            <div key={t.id} className={`bg-white border rounded-lg p-4 ${t.active ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{t.name}</div>
                {p.canEdit && (
                  <button onClick={() => api("PATCH", { id: t.id, active: !t.active })} className="text-xs text-slate-500 hover:underline">
                    {t.active ? "activa" : "inactiva"}
                  </button>
                )}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Inicial {Number(t.initial_amount).toLocaleString("es-ES")} € + {t.installments} cuota(s) cada {t.frequency_months} mes(es), desde {t.first_installment_offset_months} mes(es) tras el primer día.
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Se aplica a</div>
                <ul className="space-y-1 text-sm">
                  {mios.map((x) => (
                    <li key={x.id} className="flex items-center justify-between">
                      <span>{nombreDestino(x)}</span>
                      {p.canEdit && <button onClick={() => api("PATCH", { id: t.id, remove_target: x.id })} className="text-slate-400 hover:text-red-600" title="Quitar"><X className="h-3.5 w-3.5" /></button>}
                    </li>
                  ))}
                  {mios.length === 0 && <li className="text-xs text-slate-400">Sin destinos: ninguna matrícula la usará.</li>}
                </ul>
                {p.canEdit && (
                  <div className="mt-2 flex gap-2">
                    <select className={`${input} flex-1`} value={target[t.id] ?? ""} onChange={(e) => setTarget({ ...target, [t.id]: e.target.value })}>
                      <option value="">— Añadir destino —</option>
                      <optgroup label="Categorías">
                        {p.categories.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
                      </optgroup>
                      <optgroup label="Programas">
                        {p.programs.map((x) => <option key={x.id} value={`p:${x.id}`}>{x.code} · {x.name}</option>)}
                      </optgroup>
                    </select>
                    <button
                      onClick={() => {
                        const v = target[t.id];
                        if (!v) return;
                        const [kind, id] = [v.slice(0, 1), v.slice(2)];
                        api("PATCH", { id: t.id, add_target: kind === "p" ? { program_id: id } : { category_id: id } });
                        setTarget({ ...target, [t.id]: "" });
                      }}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">Añadir</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {p.templates.length === 0 && <div className="text-sm text-slate-400 col-span-2">Sin plantillas. Sin plantilla no se pueden generar planes de cuotas.</div>}
      </div>
    </div>
  );
}
