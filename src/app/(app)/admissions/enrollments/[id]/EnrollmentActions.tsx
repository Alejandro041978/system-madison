"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Enrollment } from "@/lib/enrollments";

export function EnrollmentActions({ enrollment, canEdit }: { enrollment: Enrollment; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canEdit || enrollment.status !== "pendiente_pago") return null;

  async function activar() {
    setError(null);
    const res = await fetch("/api/admissions/enrollments/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: enrollment.id, note }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="text-right">
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Activar manualmente…</button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-3 w-80 text-left space-y-2">
          <div className="text-sm font-medium">Activación manual (forzada)</div>
          <p className="text-xs text-slate-500">Normalmente la matrícula se activa sola al pagar el concepto inicial. Forzarla queda registrado con tu usuario y este motivo.</p>
          <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-full" placeholder="Motivo (obligatorio)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
            <button onClick={activar} disabled={!note.trim()} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm disabled:opacity-50">Activar</button>
          </div>
        </div>
      )}
    </div>
  );
}
