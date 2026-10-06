"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";

export function NewStudentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ first_name: "", last_name: "", second_last_name: "", document_type: "DNI", document_number: "", email: "", phone_code: "+34", phone_local: "" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.push(`/students/${json.id}`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c]">
        <Plus className="h-4 w-4" /> Nuevo estudiante
      </button>
    );
  }

  return (
    <form onSubmit={crear} className="fixed inset-0 z-20 bg-black/30 flex items-start justify-center pt-24" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Nuevo estudiante</h2>
        {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm"><div className="text-slate-600 mb-1">Nombre *</div><input required className={`${input} w-full`} value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Primer apellido *</div><input required className={`${input} w-full`} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Segundo apellido</div><input className={`${input} w-full`} value={f.second_last_name} onChange={(e) => setF({ ...f, second_last_name: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Tipo doc. *</div>
            <select className={`${input} w-full`} value={f.document_type} onChange={(e) => setF({ ...f, document_type: e.target.value })}>
              {["DNI", "NIE", "PASAPORTE", "OTRO"].map((t) => <option key={t}>{t}</option>)}
            </select></label>
          <label className="text-sm col-span-2"><div className="text-slate-600 mb-1">Número de documento *</div><input required className={`${input} w-full uppercase`} value={f.document_number} onChange={(e) => setF({ ...f, document_number: e.target.value })} /></label>
          <label className="text-sm col-span-3"><div className="text-slate-600 mb-1">Correo *</div><input required type="email" className={`${input} w-full`} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="text-sm"><div className="text-slate-600 mb-1">Prefijo</div><input className={`${input} w-full`} value={f.phone_code} onChange={(e) => setF({ ...f, phone_code: e.target.value })} /></label>
          <label className="text-sm col-span-2"><div className="text-slate-600 mb-1">Teléfono</div><input className={`${input} w-full`} value={f.phone_local} onChange={(e) => setF({ ...f, phone_local: e.target.value })} /></label>
        </div>
        <div className="mt-5 flex gap-3 justify-end">
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
          <button className="rounded-md bg-[#0f2a44] text-white px-4 py-1.5 text-sm">Crear y abrir ficha</button>
        </div>
      </div>
    </form>
  );
}
