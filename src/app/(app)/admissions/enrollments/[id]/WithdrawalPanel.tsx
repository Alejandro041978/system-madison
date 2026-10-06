"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Enrollment, Withdrawal } from "@/lib/enrollments";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full";

export function WithdrawalPanel(p: { enrollment: Enrollment; withdrawals: Withdrawal[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "retiro" | "pago" | "retorno">("none");
  const [f, setF] = useState({ reason: "", resolution_number: "", date: "", reference: "", paid_at: "", note: "" });
  const vigente = p.withdrawals.find((w) => w.status === "vigente") ?? null;
  const tasa = Number(vigente?.return_fee_amount ?? 0);
  const exigePago = tasa > 0;
  const tramitePagado = !exigePago || !!vigente?.return_fee_paid_at;

  async function post(url: string, body: unknown) {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return false; }
    setMode("none");
    setF({ reason: "", resolution_number: "", date: "", reference: "", paid_at: "", note: "" });
    router.refresh();
    return true;
  }

  const puedeRetirar = p.canEdit && !vigente && ["pendiente_pago", "activa"].includes(p.enrollment.status);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Retiro y retorno</h2>
      <p className="text-xs text-slate-500">El retiro pertenece a esta matrícula: no afecta a otros programas del estudiante. {exigePago ? "El retorno exige el trámite «Retorno» pagado." : "El retorno no exige pago (no hay tasa configurada)."}</p>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {vigente && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm space-y-1">
          <div className="font-medium text-red-800">Retiro vigente desde {vigente.withdrawal_date}</div>
          <div className="text-slate-700">Motivo: {vigente.reason}</div>
          {vigente.resolution_number && <div className="text-xs text-slate-500">Resolución {vigente.resolution_number}</div>}
          <div className="text-xs text-slate-500">Registrado por {vigente.created_by}</div>
          {exigePago && (
            <div className="pt-2 border-t border-red-200 text-xs">
              Trámite Retorno ({tasa.toLocaleString("es-ES", { style: "currency", currency: p.enrollment.credit_rate_currency ?? "EUR" })}):{" "}
              {vigente.return_fee_paid_at
                ? <span className="text-emerald-700">pagado el {vigente.return_fee_paid_at} · ref. {vigente.return_fee_reference}</span>
                : <span className="text-amber-700">pendiente de pago</span>}
            </div>
          )}
          {p.canEdit && mode === "none" && (
            <div className="flex gap-3 pt-1">
              {exigePago && !vigente.return_fee_paid_at && <button onClick={() => setMode("pago")} className="text-sm text-sky-700 hover:underline">Registrar pago del trámite</button>}
              <button onClick={() => setMode("retorno")} disabled={!tramitePagado} title={!tramitePagado ? "Primero registra el pago del trámite" : ""}
                className="text-sm text-emerald-700 hover:underline disabled:opacity-50 disabled:no-underline">Registrar retorno</button>
            </div>
          )}
        </div>
      )}

      {mode === "pago" && vigente && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-sm">
          <div className="font-medium">Pago del trámite Retorno</div>
          <p className="text-xs text-slate-500">Hasta que exista el estado de cuenta, el pago se registra a mano con la referencia del recibo.</p>
          <input className={input} placeholder="Referencia / n.º de recibo" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          <input type="date" className={input} value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setMode("none")} className="text-slate-500 hover:underline">Cancelar</button>
            <button onClick={() => post("/api/admissions/withdrawals/fee", { withdrawal_id: vigente.id, reference: f.reference, paid_at: f.paid_at || undefined })} disabled={!f.reference.trim()} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 disabled:opacity-50">Guardar pago</button>
          </div>
        </div>
      )}

      {mode === "retorno" && vigente && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-sm">
          <div className="font-medium">Registrar retorno</div>
          <p className="text-xs text-slate-500">Reactiva la matrícula y repone las asignaturas: las retiradas en el mismo intento; las reprobadas con un intento nuevo (recursado).</p>
          <input className={input} placeholder="Nota (opcional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setMode("none")} className="text-slate-500 hover:underline">Cancelar</button>
            <button onClick={() => post("/api/admissions/withdrawals/return", { withdrawal_id: vigente.id, note: f.note })} className="rounded-md bg-emerald-700 text-white px-3 py-1">Confirmar retorno</button>
          </div>
        </div>
      )}

      {puedeRetirar && mode === "none" && (
        <button onClick={() => setMode("retiro")} className="rounded-md border border-red-300 text-red-700 bg-white px-3 py-1.5 text-sm hover:bg-red-50">Registrar retiro…</button>
      )}
      {mode === "retiro" && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-sm">
          <div className="font-medium">Registrar retiro de esta matrícula</div>
          <p className="text-xs text-slate-500">Las asignaturas en curso pasan a «retirada»; las no iniciadas se conservan. La situación del estudiante se recalcula sola.</p>
          <input className={input} placeholder="Motivo (obligatorio)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <input className={input} placeholder="N.º de resolución (opcional)" value={f.resolution_number} onChange={(e) => setF({ ...f, resolution_number: e.target.value })} />
          <input type="date" className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setMode("none")} className="text-slate-500 hover:underline">Cancelar</button>
            <button onClick={() => post("/api/admissions/withdrawals", { enrollment_id: p.enrollment.id, reason: f.reason, resolution_number: f.resolution_number, date: f.date || undefined })} disabled={!f.reason.trim()} className="rounded-md bg-red-700 text-white px-3 py-1 disabled:opacity-50">Confirmar retiro</button>
          </div>
        </div>
      )}

      {p.withdrawals.filter((w) => w.status === "retornado").length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-3 py-2 border-b border-slate-200 text-xs font-medium uppercase tracking-wider text-slate-500">Historial</div>
          <ul className="divide-y divide-slate-100 text-xs">
            {p.withdrawals.filter((w) => w.status === "retornado").map((w) => (
              <li key={w.id} className="px-3 py-2">
                <div><b>Retiro</b> {w.withdrawal_date} · {w.reason}</div>
                <div className="text-slate-500"><b>Retorno</b> {w.returned_at ? new Date(w.returned_at).toLocaleDateString("es-ES") : ""} {w.return_fee_reference ? ` · trámite ref. ${w.return_fee_reference}` : ""} · {w.returned_by}{w.return_note ? ` · ${w.return_note}` : ""}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
