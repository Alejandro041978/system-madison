"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Charge, Payment } from "@/lib/billing";

const input = "rounded-md border border-slate-300 px-2 py-1 text-sm bg-white";
const money = (n: number, cur: string) => `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 })} ${cur}`;
const TIPOS_PAGO = ["TRANSFERENCIA", "TARJETA", "EFECTIVO", "PASARELA"];

export function ChargesTable(p: { charges: Charge[]; payments: Payment[]; canEdit: boolean; isSuperadmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [efectos, setEfectos] = useState<string[]>([]);
  const [pagando, setPagando] = useState<string | null>(null);
  const [f, setF] = useState({ amount: "", payment_type: "TRANSFERENCIA", receipt_number: "", paid_date: "", descuento: false });

  const pagadoDe = (chargeId: string) => p.payments.filter((x) => x.charge_id === chargeId && !x.voided_at).reduce((s, x) => s + Number(x.amount), 0);
  const hoy = new Date().toLocaleDateString("sv-SE");

  async function pagar(charge: Charge) {
    setError(null); setEfectos([]);
    const res = await fetch("/api/accounts/payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        charge_id: charge.id, amount: Number(f.amount), payment_type: f.descuento ? "DESCUENTO" : f.payment_type,
        series_code: f.descuento ? "DESCUENTO" : undefined, receipt_number: f.receipt_number, paid_date: f.paid_date || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setEfectos(json.efectos ?? []);
    setPagando(null);
    setF({ amount: "", payment_type: "TRANSFERENCIA", receipt_number: "", paid_date: "", descuento: false });
    router.refresh();
  }

  async function anular(pay: Payment) {
    const motivo = prompt("Motivo de la anulación del pago (queda registrado):");
    if (!motivo?.trim()) return;
    setError(null);
    const res = await fetch("/api/accounts/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pay.id, void_reason: motivo }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Cuotas y pagos</h2>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      {efectos.map((e, i) => <div key={i} className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{e}</div>)}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Cargo</th>
              <th className="px-3 py-2 font-medium">Vence</th>
              <th className="px-3 py-2 font-medium text-right">Importe</th>
              <th className="px-3 py-2 font-medium text-right">Pagado</th>
              <th className="px-3 py-2 font-medium text-right">Saldo</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              {p.canEdit && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {p.charges.map((c) => {
              const pagado = pagadoDe(c.id);
              const saldo = Number(c.amount) - pagado;
              const pagos = p.payments.filter((x) => x.charge_id === c.id);
              const vencidoSin = c.due_date < hoy && saldo > 0.005;
              return (
                <FilaCargo key={c.id} c={c} pagado={pagado} saldo={saldo} pagos={pagos} vencido={vencidoSin} canEdit={p.canEdit}
                  isSuperadmin={p.isSuperadmin} pagando={pagando === c.id}
                  onPagar={() => { setPagando(c.id); setF({ ...f, amount: String(saldo.toFixed(2)) }); }}
                  onCancelar={() => setPagando(null)} onConfirmar={() => pagar(c)} onAnular={anular} f={f} setF={setF} money={money} />
              );
            })}
            {p.charges.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Sin cargos. Genera el plan de cuotas.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">El pago del cargo inicial activa la matrícula. Un descuento (solo superadmin) reduce deuda pero no es ingreso. Los pagos no se borran: se anulan con motivo.</p>
    </div>
  );
}

type FilaProps = {
  c: Charge; pagado: number; saldo: number; pagos: Payment[]; vencido: boolean; canEdit: boolean; isSuperadmin: boolean;
  pagando: boolean; onPagar: () => void; onCancelar: () => void; onConfirmar: () => void; onAnular: (p: Payment) => void;
  f: { amount: string; payment_type: string; receipt_number: string; paid_date: string; descuento: boolean };
  setF: (f: FilaProps["f"]) => void; money: (n: number, c: string) => string;
};

function FilaCargo(p: FilaProps) {
  const { c } = p;
  return (
    <>
      <tr className={`border-t border-slate-200 ${p.vencido ? "bg-red-50/50" : ""}`}>
        <td className="px-3 py-1.5">
          {c.description ?? c.charge_type}
          {c.is_initial && <span className="ml-2 rounded bg-sky-100 text-sky-800 px-1 text-xs">inicial</span>}
          {c.source === "retiro" && <span className="ml-2 rounded bg-violet-100 text-violet-800 px-1 text-xs">retorno</span>}
        </td>
        <td className={`px-3 py-1.5 font-mono text-xs ${p.vencido ? "text-red-700 font-semibold" : ""}`}>{c.due_date}</td>
        <td className="px-3 py-1.5 text-right">{p.money(Number(c.amount), c.currency)}</td>
        <td className="px-3 py-1.5 text-right">{p.pagado > 0 ? p.money(p.pagado, c.currency) : "—"}</td>
        <td className="px-3 py-1.5 text-right font-medium">{p.money(p.saldo, c.currency)}</td>
        <td className="px-3 py-1.5 text-xs">
          {p.saldo <= 0.005 ? <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">pagado</span>
            : p.vencido ? <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5">vencido</span>
            : <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">pendiente</span>}
        </td>
        {p.canEdit && (
          <td className="px-3 py-1.5 text-right">
            {p.saldo > 0.005 && !p.pagando && <button onClick={p.onPagar} className="text-xs text-sky-700 hover:underline">Registrar pago</button>}
          </td>
        )}
      </tr>
      {p.pagando && (
        <tr className="bg-sky-50/40 border-t border-slate-100">
          <td colSpan={7} className="px-3 py-2">
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label><div className="text-xs text-slate-500">Importe</div><input type="number" step="0.01" min="0.01" className={`${input} w-28`} value={p.f.amount} onChange={(e) => p.setF({ ...p.f, amount: e.target.value })} /></label>
              {!p.f.descuento && (
                <label><div className="text-xs text-slate-500">Medio</div>
                  <select className={input} value={p.f.payment_type} onChange={(e) => p.setF({ ...p.f, payment_type: e.target.value })}>
                    {TIPOS_PAGO.map((t) => <option key={t}>{t}</option>)}
                  </select></label>
              )}
              <label><div className="text-xs text-slate-500">Recibo / ref.</div><input className={`${input} w-36`} value={p.f.receipt_number} onChange={(e) => p.setF({ ...p.f, receipt_number: e.target.value })} /></label>
              <label><div className="text-xs text-slate-500">Fecha</div><input type="date" className={input} value={p.f.paid_date} onChange={(e) => p.setF({ ...p.f, paid_date: e.target.value })} /></label>
              {p.isSuperadmin && (
                <label className="flex items-center gap-1.5 pb-1.5 text-xs"><input type="checkbox" checked={p.f.descuento} onChange={(e) => p.setF({ ...p.f, descuento: e.target.checked })} /> DESCUENTO (no es ingreso)</label>
              )}
              <button onClick={p.onConfirmar} className="rounded-md bg-[#0f2a44] text-white px-3 py-1">Guardar</button>
              <button onClick={p.onCancelar} className="text-slate-500 hover:underline text-sm">Cancelar</button>
            </div>
          </td>
        </tr>
      )}
      {p.pagos.map((x) => (
        <tr key={x.id} className={`text-xs border-t border-slate-100 ${x.voided_at ? "text-slate-400 line-through" : "text-slate-500"}`}>
          <td className="px-3 py-1 pl-8">↳ pago {x.payment_type}{x.series_code === "DESCUENTO" ? " (DESCUENTO)" : ""}{x.receipt_number ? ` · ${x.receipt_number}` : ""}</td>
          <td className="px-3 py-1 font-mono">{x.paid_date}</td>
          <td className="px-3 py-1 text-right" colSpan={2}>{p.money(Number(x.amount), c.currency)}</td>
          <td colSpan={2} className="px-3 py-1">{x.voided_at ? `anulado: ${x.void_reason}` : x.created_by}</td>
          {p.canEdit && (
            <td className="px-3 py-1 text-right">
              {!x.voided_at && <button onClick={() => p.onAnular(x)} className="text-red-600 hover:underline no-underline" style={{ textDecoration: "none" }}>anular</button>}
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
