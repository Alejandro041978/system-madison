"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Ensayo = { totalNuevo: number; conservados: number; conservadoImporte: number; borrados: number };

export function PlanActions({ enrollmentId, tienePlan }: { enrollmentId: string; tienePlan: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ensayo, setEnsayo] = useState<Ensayo | null>(null);
  const [busy, setBusy] = useState(false);

  async function generar() {
    setError(null); setBusy(true);
    const res = await fetch("/api/accounts/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollment_id: enrollmentId }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setAviso(json.avisos?.join(" ") || `Plan generado: ${json.creados?.length ?? 0} cargos.`);
    router.refresh();
  }

  async function refacturar(confirm: boolean) {
    setError(null); setBusy(true);
    const res = await fetch("/api/accounts/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollment_id: enrollmentId, confirm }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); setEnsayo(null); return; }
    if (!confirm) { setEnsayo(json); return; }
    setEnsayo(null);
    setAviso(`Refacturado: ${json.borrados} cuotas rehechas, ${json.conservados} con movimientos conservadas. Total ${json.totalNuevo}.`);
    router.refresh();
  }

  return (
    <div className="text-right space-y-2 max-w-sm">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 text-left">{error}</div>}
      {aviso && <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2 text-left">{aviso}</div>}
      {!tienePlan ? (
        <button onClick={generar} disabled={busy} className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm disabled:opacity-50">Generar plan de cuotas</button>
      ) : ensayo ? (
        <div className="bg-white border border-amber-300 rounded-lg p-3 text-left text-sm space-y-1">
          <div className="font-medium">Confirmar refacturación</div>
          <div className="text-xs text-slate-600">
            Se conservan <b>{ensayo.conservados}</b> cargos con movimientos ({ensayo.conservadoImporte.toLocaleString("es-ES")} €),
            se rehacen <b>{ensayo.borrados}</b> cuotas sin movimientos para cuadrar el total vigente de <b>{ensayo.totalNuevo.toLocaleString("es-ES")} €</b>.
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button onClick={() => setEnsayo(null)} className="text-xs text-slate-500 hover:underline">Cancelar</button>
            <button onClick={() => refacturar(true)} disabled={busy} className="rounded-md bg-amber-600 text-white px-3 py-1 text-xs">Aplicar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => refacturar(false)} disabled={busy} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Refacturar…</button>
      )}
    </div>
  );
}
