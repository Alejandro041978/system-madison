"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Beca = { id: string; enrollment_id: string; percentage: number; note: string | null; granted_by: string | null; granted_at: string; revoked_at: string | null; revoke_reason: string | null };
export type Bono = { id: string; enrollment_id: string; percentage: number | null; amount: number | null; reason: string; granted_by: string | null; granted_at: string; revoked_at: string | null; revoke_reason: string | null };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full";

export function BenefitsPanel(p: { enrollmentId: string; becas: Beca[]; bonos: Bono[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [beca, setBeca] = useState({ percentage: "", note: "" });
  const [bono, setBono] = useState({ tipo: "percentage", valor: "", reason: "" });
  const becaActiva = p.becas.find((b) => !b.revoked_at) ?? null;

  async function call(url: string, method: string, body: unknown) {
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return false; }
    router.refresh();
    return true;
  }

  async function revocar(url: string, id: string) {
    const motivo = prompt("Motivo de la revocación:");
    if (!motivo?.trim()) return;
    await call(url, "PATCH", { id, revoke_reason: motivo });
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
        <div className="text-sm font-medium">Beca <span className="text-xs font-normal text-slate-400">(solo %, una activa; el monto lo deriva la cascada)</span></div>
        {becaActiva ? (
          <div className="text-sm">
            <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 font-medium">{Number(becaActiva.percentage)} %</span>
            <span className="ml-2 text-xs text-slate-500">{becaActiva.note ?? ""} · {becaActiva.granted_by}</span>
            {p.canEdit && <button onClick={() => revocar("/api/accounts/scholarships", becaActiva.id)} className="ml-3 text-xs text-red-600 hover:underline">revocar</button>}
          </div>
        ) : p.canEdit ? (
          <div className="flex gap-2">
            <input type="number" step="0.01" min="0.01" max="100" placeholder="%" className={`${input} w-20`} value={beca.percentage} onChange={(e) => setBeca({ ...beca, percentage: e.target.value })} />
            <input placeholder="Nota" className={input} value={beca.note} onChange={(e) => setBeca({ ...beca, note: e.target.value })} />
            <button onClick={async () => { if (await call("/api/accounts/scholarships", "POST", { enrollment_id: p.enrollmentId, ...beca })) setBeca({ percentage: "", note: "" }); }}
              disabled={!beca.percentage} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm disabled:opacity-50">Conceder</button>
          </div>
        ) : <div className="text-sm text-slate-400">Sin beca activa.</div>}
        {p.becas.filter((b) => b.revoked_at).map((b) => (
          <div key={b.id} className="text-xs text-slate-400 line-through">{Number(b.percentage)} % · revocada: {b.revoke_reason}</div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
        <div className="text-sm font-medium">Bonos <span className="text-xs font-normal text-slate-400">(% o monto fijo, tras la beca; motivo obligatorio)</span></div>
        <ul className="space-y-1 text-sm">
          {p.bonos.filter((b) => !b.revoked_at).map((b) => (
            <li key={b.id}>
              <span className="rounded bg-sky-100 text-sky-800 px-2 py-0.5 font-medium">{b.amount != null ? `${Number(b.amount).toLocaleString("es-ES")} €` : `${Number(b.percentage)} %`}</span>
              <span className="ml-2 text-xs text-slate-500">{b.reason} · {b.granted_by}</span>
              {p.canEdit && <button onClick={() => revocar("/api/accounts/bonuses", b.id)} className="ml-2 text-xs text-red-600 hover:underline">revocar</button>}
            </li>
          ))}
          {p.bonos.filter((b) => !b.revoked_at).length === 0 && <li className="text-slate-400 text-sm">Sin bonos activos.</li>}
        </ul>
        {p.canEdit && (
          <div className="flex gap-2 pt-1">
            <select className={`${input} w-28`} value={bono.tipo} onChange={(e) => setBono({ ...bono, tipo: e.target.value })}>
              <option value="percentage">%</option>
              <option value="amount">€ fijo</option>
            </select>
            <input type="number" step="0.01" min="0.01" placeholder="valor" className={`${input} w-24`} value={bono.valor} onChange={(e) => setBono({ ...bono, valor: e.target.value })} />
            <input placeholder="Motivo (obligatorio)" className={input} value={bono.reason} onChange={(e) => setBono({ ...bono, reason: e.target.value })} />
            <button onClick={async () => {
              const body = { enrollment_id: p.enrollmentId, reason: bono.reason, [bono.tipo]: bono.valor };
              if (await call("/api/accounts/bonuses", "POST", body)) setBono({ tipo: bono.tipo, valor: "", reason: "" });
            }} disabled={!bono.valor || !bono.reason.trim()} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm disabled:opacity-50">Añadir</button>
          </div>
        )}
        {p.bonos.filter((b) => b.revoked_at).map((b) => (
          <div key={b.id} className="text-xs text-slate-400 line-through">{b.amount != null ? `${b.amount} €` : `${b.percentage} %`} · revocado: {b.revoke_reason}</div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Tras conceder o revocar, usa «Refacturar» para que las cuotas sin movimientos cuadren con el nuevo total.</p>
    </div>
  );
}
