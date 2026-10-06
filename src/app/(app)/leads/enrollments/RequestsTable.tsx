"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrollmentRequest } from "@/lib/enroll";

const ESTADO: Record<string, { label: string; cls: string }> = {
  enviada: { label: "Enviada (sin completar)", cls: "bg-slate-100 text-slate-700" },
  completada: { label: "Completada · verificar pago", cls: "bg-amber-100 text-amber-800" },
  pagada: { label: "Pago confirmado", cls: "bg-emerald-100 text-emerald-800" },
  formalizada: { label: "Formalizada", cls: "bg-sky-100 text-sky-800" },
  anulada: { label: "Anulada", cls: "bg-red-100 text-red-700" },
};

export function RequestsTable(p: { filas: EnrollmentRequest[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decidir(r: EnrollmentRequest, action: string, confirmacion: string) {
    if (!confirm(confirmacion)) return;
    setError(null); setBusy(r.id);
    const res = await fetch("/api/enroll/manage", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, action }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Prospecto</th>
              <th className="px-3 py-2 font-medium">Programa</th>
              <th className="px-3 py-2 font-medium">Ref. de pago</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Fechas</th>
              {p.canEdit && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.filas.map((r) => (
              <tr key={r.id} className={r.status === "anulada" ? "opacity-50" : ""}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.full_name ?? "— sin completar —"}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    <a href={`https://wa.me/${r.phone.replace("+", "")}`} target="_blank" rel="noreferrer" className="hover:underline">{r.phone}</a>
                    {r.email ? ` · ${r.email}` : ""}{r.document_number ? ` · ${r.document_type} ${r.document_number}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2">{r.program_name ?? "—"}{r.notes && <div className="text-xs text-slate-400">{r.notes}</div>}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.payment_reference ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${ESTADO[r.status].cls}`}>{ESTADO[r.status].label}</span>
                  {r.paid_confirmed_by && <div className="text-[10px] text-slate-400">pago confirmado por {r.paid_confirmed_by}</div>}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  <div>enviada {new Date(r.created_at).toLocaleDateString("es-ES")}</div>
                  {r.completed_at && <div>completada {new Date(r.completed_at).toLocaleDateString("es-ES")}</div>}
                </td>
                {p.canEdit && (
                  <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
                    {r.status === "completada" && (
                      <button disabled={busy === r.id} onClick={() => decidir(r, "confirmar_pago", `¿Confirmas que el pago de ${r.full_name ?? r.phone} está verificado en el panel de la pasarela${r.payment_reference ? ` (ref. ${r.payment_reference})` : ""}? El lead pasará a «inscrito».`)}
                        className="rounded-md bg-emerald-600 text-white px-2 py-1 hover:bg-emerald-700">Confirmar pago</button>
                    )}
                    {r.status === "pagada" && (
                      <button disabled={busy === r.id} onClick={() => decidir(r, "formalizar", "¿Marcar como formalizada? (matrícula ya creada en Admisión)")}
                        className="rounded-md bg-sky-600 text-white px-2 py-1 hover:bg-sky-700">Formalizada en Admisión</button>
                    )}
                    {!["formalizada", "anulada"].includes(r.status) && (
                      <button disabled={busy === r.id} onClick={() => decidir(r, "anular", "¿Anular esta ficha? El enlace dejará de funcionar.")}
                        className="ml-2 text-red-600 hover:underline">anular</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {p.filas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin fichas todavía. El bot las genera cuando un prospecto dice «quiero inscribirme».</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
