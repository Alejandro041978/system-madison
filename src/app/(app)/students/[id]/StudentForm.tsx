"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Student } from "@/lib/students";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-600";

type Form = {
  first_name: string; last_name: string; second_last_name: string; document_type: string; document_number: string;
  email: string; email_alt: string; phone_code: string; phone_local: string; date_of_birth: string; city: string; country: string;
  disabled: boolean; external_id: string; notes: string;
};

function toForm(s: Student): Form {
  return {
    first_name: s.first_name, last_name: s.last_name, second_last_name: s.second_last_name ?? "",
    document_type: s.document_type, document_number: s.document_number,
    email: s.email, email_alt: s.email_alt ?? "", phone_code: s.phone_code ?? "", phone_local: s.phone_local ?? "",
    date_of_birth: s.date_of_birth ?? "", city: s.city ?? "", country: s.country, disabled: s.disabled,
    external_id: s.external_id ?? "", notes: s.notes ?? "",
  };
}

export function StudentForm({ student, canEdit }: { student: Student; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(toForm(student));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const set = (k: keyof Form, v: string | boolean) => setF({ ...f, [k]: v });
  const ro = !editing || !canEdit;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(false);
    // Solo enviar lo que cambió (lista blanca la aplica la API).
    const base = toForm(student);
    const patch: Record<string, unknown> = { id: student.id };
    for (const k of Object.keys(f) as (keyof Form)[]) if (f[k] !== base[k]) patch[k] = f[k];
    if (Object.keys(patch).length === 1) { setEditing(false); return; }
    const res = await fetch("/api/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setEditing(false); setOk(true);
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
        <div className="text-sm font-medium">Datos de la ficha</div>
        {canEdit && !editing && <button type="button" onClick={() => { setEditing(true); setOk(false); }} className="text-sm text-sky-700 hover:underline">Editar</button>}
        {editing && (
          <div className="flex gap-3">
            <button type="button" onClick={() => { setF(toForm(student)); setEditing(false); setError(null); }} className="text-sm text-slate-500 hover:underline">Cancelar</button>
            <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm">Guardar</button>
          </div>
        )}
      </div>
      <div className="p-4">
        {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
        {ok && <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">Guardado.</div>}
        <div className="grid grid-cols-3 gap-3">
          <L t="Nombre"><input disabled={ro} required className={`${input} w-full`} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></L>
          <L t="Primer apellido"><input disabled={ro} required className={`${input} w-full`} value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></L>
          <L t="Segundo apellido"><input disabled={ro} className={`${input} w-full`} value={f.second_last_name} onChange={(e) => set("second_last_name", e.target.value)} /></L>
          <L t="Tipo de documento">
            <select disabled={ro} className={`${input} w-full`} value={f.document_type} onChange={(e) => set("document_type", e.target.value)}>
              {["DNI", "NIE", "PASAPORTE", "OTRO"].map((t) => <option key={t}>{t}</option>)}
            </select></L>
          <L t="Número de documento" span={2}><input disabled={ro} required className={`${input} w-full uppercase`} value={f.document_number} onChange={(e) => set("document_number", e.target.value)} /></L>
          <L t="Correo" span={2}><input disabled={ro} required type="email" className={`${input} w-full`} value={f.email} onChange={(e) => set("email", e.target.value)} /></L>
          <L t="Correo alternativo"><input disabled={ro} type="email" className={`${input} w-full`} value={f.email_alt} onChange={(e) => set("email_alt", e.target.value)} /></L>
          <L t="Prefijo"><input disabled={ro} className={`${input} w-full`} placeholder="+34" value={f.phone_code} onChange={(e) => set("phone_code", e.target.value)} /></L>
          <L t="Teléfono"><input disabled={ro} className={`${input} w-full`} value={f.phone_local} onChange={(e) => set("phone_local", e.target.value)} /></L>
          <L t="E.164 (derivado)"><input disabled className={`${input} w-full font-mono`} value={student.phone_number ?? ""} readOnly /></L>
          <L t="Fecha de nacimiento"><input disabled={ro} type="date" className={`${input} w-full`} value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></L>
          <L t="Ciudad"><input disabled={ro} className={`${input} w-full`} value={f.city} onChange={(e) => set("city", e.target.value)} /></L>
          <L t="País (ISO-3)"><input disabled={ro} maxLength={3} className={`${input} w-full uppercase`} value={f.country} onChange={(e) => set("country", e.target.value)} /></L>
          <L t="Id de origen (trazabilidad)"><input disabled={ro} className={`${input} w-full`} value={f.external_id} onChange={(e) => set("external_id", e.target.value)} /></L>
          <L t="Notas" span={2}><input disabled={ro} className={`${input} w-full`} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></L>
          <label className="text-sm flex items-center gap-2 col-span-3 pt-1">
            <input type="checkbox" disabled={ro} checked={f.disabled} onChange={(e) => set("disabled", e.target.checked)} />
            Deshabilitado (no aparece en búsquedas ni lo identifican los bots; el historial se conserva)
          </label>
        </div>
      </div>
    </form>
  );
}

function L({ t, span, children }: { t: string; span?: number; children: React.ReactNode }) {
  return <label className={`text-sm ${span === 2 ? "col-span-2" : ""}`}><div className="text-slate-600 mb-1">{t}</div>{children}</label>;
}
