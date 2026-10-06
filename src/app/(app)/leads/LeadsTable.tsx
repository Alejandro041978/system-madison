"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type LeadRow = {
  id: string; bot_key: string | null; phone: string; name: string | null; email: string | null;
  program_interest: string | null; prior_studies: string | null; stage: string; qualified: boolean;
  notes: string | null; profession: string | null; age: number | null; employment: string | null;
  specialty_interest: string | null; consent: boolean; source: string | null; created_at: string; updated_at: string;
};

const STAGES = ["nuevo", "contactable", "calificado", "interesado", "inscrito", "descartado"];
const COLOR: Record<string, string> = {
  nuevo: "bg-slate-100 text-slate-700", contactable: "bg-sky-100 text-sky-800", calificado: "bg-violet-100 text-violet-800",
  interesado: "bg-amber-100 text-amber-800", inscrito: "bg-emerald-100 text-emerald-800", descartado: "bg-red-100 text-red-700",
};
const input = "rounded-md border border-slate-300 px-2 py-1 text-sm bg-white";

export function LeadsTable(p: { rows: LeadRow[]; stage: string; conteo: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (!res.ok) { setError((await res.json()).error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => router.push("/leads")} className={`rounded-full px-3 py-1 border ${!p.stage ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>Todos</button>
        {STAGES.map((s) => (
          <button key={s} onClick={() => router.push(`/leads?stage=${s}`)}
            className={`rounded-full px-3 py-1 border capitalize ${p.stage === s ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>
            {s}{p.conteo[s] ? ` (${p.conteo[s]})` : ""}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Contacto</th>
              <th className="px-3 py-2 font-medium">Programa de interés</th>
              <th className="px-3 py-2 font-medium">Notas</th>
              <th className="px-3 py-2 font-medium">Etapa</th>
              <th className="px-3 py-2 font-medium text-center">Calificado</th>
              <th className="px-3 py-2 font-medium">Último contacto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.rows.map((l) => (
              <tr key={l.id} className={l.stage === "descartado" ? "opacity-50" : ""}>
                <td className="px-3 py-2">
                  <div className="font-medium">{l.name ?? "—"}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    <a href={`https://wa.me/${l.phone.replace("+", "")}`} target="_blank" rel="noreferrer" className="hover:underline">{l.phone}</a>
                    {l.email ? ` · ${l.email}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {l.program_interest ?? l.specialty_interest ?? "—"}
                  {(l.profession || l.age || l.employment) && (
                    <div className="text-xs text-slate-400">{[l.profession, l.age ? `${l.age} años` : null, l.employment].filter(Boolean).join(" · ")}</div>
                  )}
                  {l.prior_studies && <div className="text-xs text-slate-400">{l.prior_studies}</div>}
                  {l.consent && <span className="text-[10px] rounded bg-emerald-50 text-emerald-700 px-1">consentido</span>}
                </td>
                <td className="px-3 py-2 w-64">
                  {p.canEdit ? (
                    <input className={`${input} w-full`} defaultValue={l.notes ?? ""}
                      onChange={(e) => setNotas({ ...notas, [l.id]: e.target.value })}
                      onBlur={() => notas[l.id] !== undefined && notas[l.id] !== (l.notes ?? "") && patch(l.id, { notes: notas[l.id] })} />
                  ) : (l.notes ?? "—")}
                </td>
                <td className="px-3 py-2">
                  {p.canEdit ? (
                    <select className={`${input} capitalize`} value={l.stage} onChange={(e) => patch(l.id, { stage: e.target.value })}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${COLOR[l.stage]}`}>{l.stage}</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" disabled={!p.canEdit} checked={l.qualified} onChange={(e) => patch(l.id, { qualified: e.target.checked })} />
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{new Date(l.updated_at).toLocaleString("es-ES")}</td>
              </tr>
            ))}
            {p.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin leads todavía. Llegan solos cuando el bot de ventas conversa.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
