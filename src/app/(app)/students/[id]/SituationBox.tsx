"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, RefreshCw } from "lucide-react";
import type { Student } from "@/lib/students";

const SITUACIONES: Record<Student["situation"], string> = {
  activo: "Activo", egresado: "Egresado", retiro: "Retiro", campus_socio: "Campus socio",
};
const COLOR: Record<Student["situation"], string> = {
  activo: "bg-emerald-100 text-emerald-800", egresado: "bg-sky-100 text-sky-800",
  retiro: "bg-red-100 text-red-800", campus_socio: "bg-violet-100 text-violet-800",
};
const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full";

export function SituationBox({ student, canEdit }: { student: Student; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sit, setSit] = useState<Student["situation"]>(student.situation);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(body: Record<string, unknown>) {
    setError(null); setBusy(true);
    const res = await fetch("/api/students/situation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: student.id, ...body }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setOpen(false); setNote("");
    router.refresh();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400">Situación</div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-sm font-medium ${COLOR[student.situation]}`}>{SITUACIONES[student.situation]}</span>
        {student.situation_source === "manual"
          ? <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Lock className="h-3 w-3" /> manual</span>
          : <span className="text-xs text-slate-400">derivada automáticamente</span>}
      </div>
      {student.situation_source === "manual" && student.situation_note && (
        <div className="mt-1 text-xs text-slate-600">Motivo: {student.situation_note}</div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Se deriva de retiros, egresos y campus socio. Solo una situación manual la congela, y exige motivo.
      </p>
      {error && <div className="mt-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1.5">{error}</div>}

      {canEdit && (
        <div className="mt-3 space-y-2">
          {student.situation_source === "manual" ? (
            <button disabled={busy} onClick={() => call({ source: "auto" })} className="inline-flex items-center gap-1.5 text-sm text-sky-700 hover:underline">
              <RefreshCw className="h-3.5 w-3.5" /> Volver a derivación automática
            </button>
          ) : !open ? (
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:underline">
              <Lock className="h-3.5 w-3.5" /> Fijar a mano…
            </button>
          ) : (
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <select className={input} value={sit} onChange={(e) => setSit(e.target.value as Student["situation"])}>
                {Object.entries(SITUACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className={input} placeholder="Motivo (obligatorio)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-3">
                <button disabled={busy || !note.trim()} onClick={() => call({ source: "manual", situation: sit, note })} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm disabled:opacity-50">Fijar</button>
                <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
