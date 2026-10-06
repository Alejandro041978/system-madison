"use client";

import { useState } from "react";

const input = "rounded-md border border-slate-300 px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-sky-500";

type Datos = {
  full_name: string; document_type: string; document_number: string; email: string;
  birth_date: string; city: string; country: string; program_name: string; notes: string;
};

export function EnrollForm(p: {
  token: string; estado: "enviada" | "completada"; paymentReference: string | null;
  prellenado: Record<string, string>; fichaActual: Datos; programas: string[];
  appName: string; paymentUrl: string; paymentProvider: string; matricula: number; moneda: string;
}) {
  const [f, setF] = useState<Datos>({
    ...p.fichaActual,
    full_name: p.fichaActual.full_name || p.prellenado.full_name || "",
    email: p.fichaActual.email || p.prellenado.email || "",
    program_name: p.fichaActual.program_name || p.prellenado.program_name || "",
  });
  const [fase, setFase] = useState<"formulario" | "pago">(p.estado === "completada" ? "pago" : "formulario");
  const [acepta, setAcepta] = useState(p.estado === "completada");
  const [ref, setRef] = useState(p.paymentReference ?? "");
  const [refGuardada, setRefGuardada] = useState(!!p.paymentReference);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Datos, v: string) => setF({ ...f, [k]: v });
  const hayPago = p.matricula > 0;
  const importe = p.matricula.toLocaleString("es-ES", { style: "currency", currency: p.moneda, maximumFractionDigits: 2 });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await fetch("/api/enroll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: p.token, action: "complete", ...f }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setFase("pago");
  }

  async function guardarReferencia() {
    setError(null); setBusy(true);
    const res = await fetch("/api/enroll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: p.token, action: "payment_reference", reference: ref }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setRefGuardada(true);
  }

  if (fase === "pago") {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-lg font-semibold text-emerald-700">✅ Ficha recibida{f.full_name ? `, ${f.full_name.split(" ")[0]}` : ""}</h1>
        {hayPago ? (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Para reservar tu plaza en el <b>{f.program_name}</b>, el último paso es abonar la <b>matrícula de {importe}</b> a través de {p.paymentProvider}.
            </p>
            {p.paymentUrl && (
              <a href={p.paymentUrl} target="_blank" rel="noreferrer"
                className="mt-4 block w-full text-center rounded-lg bg-[#0f2a44] text-white py-3 font-medium hover:bg-[#163a5c]">
                Pagar matrícula de {importe} →
              </a>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Hemos recibido tu ficha para el <b>{f.program_name}</b>. El equipo de admisiones te contactará por WhatsApp o correo para indicarte los siguientes pasos.
          </p>
        )}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="text-sm font-medium">¿Ya pagaste? Déjanos tu referencia</div>
          <p className="text-xs text-slate-500 mb-2">Si ya realizaste el pago, pega aquí el identificador o la referencia que te dieron para que admisiones lo verifique más rápido.</p>
          {error && <div className="mb-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
          {refGuardada ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
              Referencia <b>{ref}</b> registrada. Admisiones confirmará tu pago y te contactará por WhatsApp. ¡Gracias!
            </div>
          ) : (
            <div className="flex gap-2">
              <input className={input} placeholder="Referencia de pago" value={ref} onChange={(e) => setRef(e.target.value)} />
              <button onClick={guardarReferencia} disabled={busy || ref.trim().length < 4}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">Enviar</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-4">
      <p className="text-sm text-slate-600">Completa tus datos para formalizar tu inscripción. Tardarás menos de 2 minutos.</p>
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      <label className="block text-sm"><span className="text-slate-700">Programa elegido *</span>
        <select required className={`${input} mt-1`} value={f.program_name} onChange={(e) => set("program_name", e.target.value)}>
          <option value="">— Elige tu programa —</option>
          {p.programas.map((x) => <option key={x} value={x}>{x}</option>)}
        </select></label>
      <label className="block text-sm"><span className="text-slate-700">Nombre completo *</span>
        <input required minLength={5} className={`${input} mt-1`} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
      <div className="grid grid-cols-[130px_1fr] gap-3">
        <label className="block text-sm"><span className="text-slate-700">Documento *</span>
          <select className={`${input} mt-1`} value={f.document_type} onChange={(e) => set("document_type", e.target.value)}>
            {["DNI", "NIE", "PASAPORTE", "OTRO"].map((t) => <option key={t}>{t}</option>)}
          </select></label>
        <label className="block text-sm"><span className="text-slate-700">Número de documento *</span>
          <input required minLength={5} className={`${input} mt-1 uppercase`} value={f.document_number} onChange={(e) => set("document_number", e.target.value)} /></label>
      </div>
      <label className="block text-sm"><span className="text-slate-700">Correo electrónico *</span>
        <input required type="email" className={`${input} mt-1`} value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm"><span className="text-slate-700">Fecha de nacimiento</span>
          <input type="date" className={`${input} mt-1`} value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></label>
        <label className="block text-sm"><span className="text-slate-700">Ciudad</span>
          <input className={`${input} mt-1`} value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
        <label className="block text-sm"><span className="text-slate-700">País</span>
          <input className={`${input} mt-1`} value={f.country} onChange={(e) => set("country", e.target.value)} /></label>
      </div>
      <label className="block text-sm"><span className="text-slate-700">¿Algo que debamos saber? (opcional)</span>
        <input className={`${input} mt-1`} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5" />
        <span>Acepto que {p.appName} trate mis datos para gestionar mi admisión y me contacte por WhatsApp o correo. La admisión está sujeta a la evaluación de antecedentes.</span>
      </label>
      <button disabled={busy || !acepta} className="w-full rounded-lg bg-[#0f2a44] text-white py-3 font-medium hover:bg-[#163a5c] disabled:opacity-50">
        {busy ? "Enviando…" : hayPago ? "Enviar ficha y pasar al pago" : "Enviar ficha"}
      </button>
    </form>
  );
}
