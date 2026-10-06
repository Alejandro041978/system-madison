"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

/**
 * Importación por pegado de CSV/TSV (desde Excel: copiar y pegar).
 * Primera fila = cabeceras. Reconocidas: phone/telefono, name/nombre,
 * email/correo, profession/profesion, age/edad, employment/empleo,
 * specialty_interest/especialidad, language/idioma, source/origen, notes/notas.
 */
const MAPA: Record<string, string> = {
  phone: "phone", telefono: "phone", "teléfono": "phone", celular: "phone", movil: "phone", "móvil": "phone", whatsapp: "phone",
  name: "name", nombre: "name",
  email: "email", correo: "email",
  profession: "profession", profesion: "profession", "profesión": "profession",
  age: "age", edad: "age",
  employment: "employment", empleo: "employment", cargo: "employment", trabajo: "employment",
  specialty_interest: "specialty_interest", especialidad: "specialty_interest", interes: "specialty_interest", "interés": "specialty_interest",
  language: "language", idioma: "language",
  source: "source", origen: "source", fuente: "source",
  notes: "notes", notas: "notes",
  program_interest: "program_interest", programa: "program_interest",
};

export function ImportLeads() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function parsear(): { items: Record<string, string>[]; aviso?: string } {
    const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lineas.length < 2) return { items: [] };
    const sep = lineas[0].includes("\t") ? "\t" : lineas[0].includes(";") ? ";" : ",";
    const cabeceras = lineas[0].split(sep).map((h) => MAPA[h.trim().toLowerCase()] ?? null);
    if (!cabeceras.includes("phone")) return { items: [], aviso: "Falta la columna de teléfono (phone/telefono/whatsapp)" };
    const items = lineas.slice(1).map((l) => {
      const celdas = l.split(sep);
      const item: Record<string, string> = {};
      cabeceras.forEach((campo, i) => { if (campo && celdas[i]?.trim()) item[campo] = celdas[i].trim(); });
      return item;
    }).filter((x) => x.phone);
    return { items };
  }

  async function importar() {
    setError(null); setAviso(null);
    const { items, aviso: pa } = parsear();
    if (pa) { setError(pa); return; }
    if (items.length === 0) { setError("No se reconoció ninguna fila con teléfono"); return; }
    setBusy(true);
    const res = await fetch("/api/leads/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, consent_confirmed: consent }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setAviso(`Importados: ${json.insertados} nuevos, ${json.actualizados} actualizados${json.totalErrores ? ` · ${json.totalErrores} errores: ${json.errores.join(" · ")}` : ""}`);
    setTexto("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
        <Upload className="h-4 w-4" /> Importar contactos
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-20 bg-black/30 flex items-start justify-center pt-16" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-3xl">
        <h2 className="text-lg font-semibold">Importar contactos</h2>
        <p className="text-sm text-slate-500 mt-1 mb-3">
          Copia el rango desde Excel (con cabeceras) y pégalo aquí. Columnas reconocidas: teléfono (obligatoria, con prefijo de país),
          nombre, correo, profesión, edad, empleo, especialidad, idioma, origen, notas.
        </p>
        {error && <div className="mb-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
        {aviso && <div className="mb-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{aviso}</div>}
        <textarea rows={10} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono"
          placeholder={"telefono\tnombre\tprofesion\tedad\tespecialidad\n+34600111222\tMaría López\tEnfermera\t34\tEconomía de la Salud"}
          value={texto} onChange={(e) => setTexto(e.target.value)} />
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>Confirmo que estos contactos dieron su <b>consentimiento</b> para recibir comunicaciones de la institución por WhatsApp. Enviar a listas frías infringe la política de Meta y puede bloquear el número.</span>
        </label>
        <div className="mt-4 flex gap-3 justify-end">
          <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cerrar</button>
          <button onClick={importar} disabled={busy || !consent || !texto.trim()} className="rounded-md bg-[#0f2a44] text-white px-4 py-1.5 text-sm disabled:opacity-50">
            {busy ? "Importando…" : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
