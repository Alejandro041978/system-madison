"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Users } from "lucide-react";
import type { Campaign } from "@/lib/campaigns";

export type TemplateRow = { id: string; key: string; language: string; content_sid: string; bot_key: string | null; body_preview: string | null; active: boolean };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";
const ESTADO: Record<string, string> = { borrador: "bg-slate-100 text-slate-700", activa: "bg-emerald-100 text-emerald-800", pausada: "bg-amber-100 text-amber-800", terminada: "bg-sky-100 text-sky-800" };

export function CampaignsPanel(p: {
  campanas: Campaign[]; templates: TemplateRow[]; stats: Record<string, Record<string, number>>;
  opciones: { profession: string[]; specialty_interest: string[] }; canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", template_id: "", pitch_notes: "", daily_limit: "50", variables_map: '{"1":"name"}', profession: [] as string[], specialty_interest: [] as string[] });
  const [tpl, setTpl] = useState({ key: "", content_sid: "", language: "es", body_preview: "" });

  async function call(url: string, method: string, body: unknown): Promise<Record<string, unknown> | null> {
    setError(null); setAviso(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError((json as { error?: string }).error ?? `Error ${res.status}`); return null; }
    router.refresh();
    return json;
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    let vmap: Record<string, string> = {};
    try { vmap = f.variables_map.trim() ? JSON.parse(f.variables_map) : {}; } catch { setError("variables_map no es JSON válido (ej.: {\"1\":\"name\"})"); return; }
    const audience_filter: Record<string, string[]> = {};
    if (f.profession.length) audience_filter.profession = f.profession;
    if (f.specialty_interest.length) audience_filter.specialty_interest = f.specialty_interest;
    const r = await call("/api/campaigns", "POST", { name: f.name, template_id: f.template_id || null, pitch_notes: f.pitch_notes, daily_limit: f.daily_limit, variables_map: vmap, audience_filter });
    if (r) { setShowNew(false); setF({ ...f, name: "", pitch_notes: "" }); setAviso("Campaña creada en borrador."); }
  }

  async function accion(c: Campaign, action: string, extra: Record<string, unknown> = {}) {
    setBusy(c.id);
    const r = await call("/api/campaigns", "PATCH", { id: c.id, action, ...extra });
    setBusy(null);
    if (!r) return;
    if (action === "audience") setAviso(`Audiencia actual de «${c.name}»: ${r.audiencia} contactos elegibles (consentidos y que pasan el filtro).`);
    if (action === "enqueue") setAviso(`«${c.name}»: ${r.nuevos} añadidos a la cola (${r.yaEnCola} ya estaban, ${r.enOtraCampana} pendientes en otra campaña).`);
    if (action === "dispatch") {
      const d = r as { dry: boolean; pendientes: number; cupoHoy: number; enviados: number; errores: number; detalleErrores: string[] };
      setAviso(d.dry
        ? `Ensayo «${c.name}»: ${d.pendientes} en cola, cupo de hoy ${d.cupoHoy}. Nada enviado.`
        : `«${c.name}»: ${d.enviados} enviados, ${d.errores} errores.${d.detalleErrores.length ? " " + d.detalleErrores.join(" · ") : ""}`);
    }
  }

  const tplDe = (id: string | null) => p.templates.find((t) => t.id === id);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      {aviso && <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{aviso}</div>}

      {p.canEdit && (
        <div className="flex gap-3">
          {!showNew && <button onClick={() => { setShowNew(true); setShowTpl(false); }} className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c]"><Plus className="h-4 w-4" /> Nueva campaña</button>}
          {!showTpl && <button onClick={() => { setShowTpl(true); setShowNew(false); }} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Registrar plantilla aprobada</button>}
        </div>
      )}

      {showTpl && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
          <div className="font-medium">Registrar plantilla de WhatsApp</div>
          <p className="text-xs text-slate-500">La plantilla se crea y aprueba en Twilio (Content Template Builder); aquí solo registras su ContentSid (HX…) y el texto aprobado con sus huecos {"{{1}}"}, {"{{2}}"}…</p>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="key (ej. apertura_mba)" className={input} value={tpl.key} onChange={(e) => setTpl({ ...tpl, key: e.target.value })} />
            <input placeholder="ContentSid HX…" className={`${input} font-mono`} value={tpl.content_sid} onChange={(e) => setTpl({ ...tpl, content_sid: e.target.value })} />
            <input placeholder="idioma" className={input} value={tpl.language} onChange={(e) => setTpl({ ...tpl, language: e.target.value })} />
          </div>
          <textarea rows={3} placeholder="Texto aprobado, ej.: Hola {{1}}, soy Ana de la escuela…" className={`${input} w-full`} value={tpl.body_preview} onChange={(e) => setTpl({ ...tpl, body_preview: e.target.value })} />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowTpl(false)} className="text-slate-500 hover:underline">Cancelar</button>
            <button onClick={async () => { if (await call("/api/campaigns/templates", "POST", tpl)) { setShowTpl(false); setTpl({ key: "", content_sid: "", language: "es", body_preview: "" }); } }}
              disabled={!tpl.key || !tpl.content_sid} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 disabled:opacity-50">Guardar</button>
          </div>
          {p.templates.length > 0 && (
            <ul className="border-t border-slate-100 pt-2 text-xs text-slate-600 space-y-1">
              {p.templates.map((t) => <li key={t.id}><span className="font-mono">{t.key}</span> ({t.language}) · {t.content_sid.slice(0, 12)}… {t.active ? "" : "· inactiva"}</li>)}
            </ul>
          )}
        </div>
      )}

      {showNew && (
        <form onSubmit={crear} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <label><div className="text-slate-600 mb-1">Nombre</div><input required className={`${input} w-full`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label><div className="text-slate-600 mb-1">Plantilla de apertura</div>
              <select className={`${input} w-full`} value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })}>
                <option value="">— Elegir después —</option>
                {p.templates.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.key} ({t.language})</option>)}
              </select></label>
            <label><div className="text-slate-600 mb-1">Tope de envíos/día</div><input type="number" min={1} max={1000} className={`${input} w-full`} value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: e.target.value })} /></label>
          </div>
          <label className="block"><div className="text-slate-600 mb-1">Guión para el bot (qué ofrece esta campaña y a quién)</div>
            <textarea rows={2} className={`${input} w-full`} placeholder="Ej.: Ofrecemos el Máster en Economía de la Salud a profesionales sanitarios; destacar modalidad online y becas." value={f.pitch_notes} onChange={(e) => setF({ ...f, pitch_notes: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <Filtro titulo="Filtrar por profesión (vacío = todas)" opciones={p.opciones.profession} sel={f.profession} onChange={(v) => setF({ ...f, profession: v })} />
            <Filtro titulo="Filtrar por especialidad de interés" opciones={p.opciones.specialty_interest} sel={f.specialty_interest} onChange={(v) => setF({ ...f, specialty_interest: v })} />
          </div>
          <label className="block"><div className="text-slate-600 mb-1">Variables de la plantilla → campo del contacto (JSON)</div>
            <input className={`${input} w-full font-mono`} value={f.variables_map} onChange={(e) => setF({ ...f, variables_map: e.target.value })} />
            <div className="text-xs text-slate-400 mt-0.5">Campos: name, profession, employment, specialty_interest, program_interest, source</div></label>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowNew(false)} className="text-slate-500 hover:underline">Cancelar</button>
            <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5">Crear (borrador)</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {p.campanas.map((c) => {
          const s = p.stats[c.id] ?? {};
          const t = tplDe(c.template_id);
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${ESTADO[c.status]}`}>{c.status}</span>
                    <span className="text-xs text-slate-500">plantilla: {t ? `${t.key} (${t.language})` : "— sin plantilla —"} · tope {c.daily_limit}/día</span>
                  </div>
                  {c.pitch_notes && <p className="mt-1 text-xs text-slate-600">{c.pitch_notes}</p>}
                  <div className="mt-1.5 flex gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{s.pendiente ?? 0} en cola</span>
                    <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.5">{s.enviado ?? 0} enviados</span>
                    <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">{s.respondido ?? 0} respondieron</span>
                    {(s.error ?? 0) > 0 && <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5">{s.error} errores</span>}
                    {(s.excluido ?? 0) > 0 && <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">{s.excluido} excluidos</span>}
                  </div>
                </div>
                {p.canEdit && (
                  <div className="flex flex-wrap gap-2 justify-end shrink-0 text-xs">
                    <button disabled={busy === c.id} onClick={() => accion(c, "audience")} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"><Users className="h-3.5 w-3.5" /> Audiencia</button>
                    <button disabled={busy === c.id} onClick={() => accion(c, "enqueue")} className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">Poblar cola</button>
                    <button disabled={busy === c.id} onClick={() => accion(c, "dispatch", { dry: true })} className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">Ensayo</button>
                    {c.status === "activa" ? (
                      <>
                        <button disabled={busy === c.id} onClick={() => { if (confirm(`¿Despachar AHORA hasta ${c.daily_limit} mensajes de «${c.name}»? Enviará WhatsApp reales.`)) accion(c, "dispatch"); }}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-1 hover:bg-emerald-700"><Send className="h-3.5 w-3.5" /> Despachar ya</button>
                        <button disabled={busy === c.id} onClick={() => call("/api/campaigns", "PATCH", { id: c.id, status: "pausada" })} className="rounded-md border border-amber-300 text-amber-700 bg-white px-2 py-1">Pausar</button>
                      </>
                    ) : c.status !== "terminada" ? (
                      <button disabled={busy === c.id} onClick={() => { if (confirm(`¿Activar «${c.name}»? El cron horario empezará a enviar la plantilla a la cola (hasta ${c.daily_limit}/día).`)) call("/api/campaigns", "PATCH", { id: c.id, status: "activa" }); }}
                        className="rounded-md bg-[#0f2a44] text-white px-2 py-1">Activar</button>
                    ) : null}
                    {c.status !== "terminada" && <button disabled={busy === c.id} onClick={() => call("/api/campaigns", "PATCH", { id: c.id, status: "terminada" })} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-500">Terminar</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {p.campanas.length === 0 && <div className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg p-6 text-center">Sin campañas. Registra primero una plantilla aprobada y crea la primera.</div>}
      </div>
    </div>
  );
}

function Filtro(p: { titulo: string; opciones: string[]; sel: string[]; onChange: (v: string[]) => void }) {
  if (p.opciones.length === 0) return <div className="text-xs text-slate-400 self-end pb-2">{p.titulo}: sin valores aún (se llenan al importar contactos)</div>;
  return (
    <div>
      <div className="text-slate-600 mb-1">{p.titulo}</div>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-slate-200 rounded-md p-2">
        {p.opciones.map((o) => (
          <button type="button" key={o}
            onClick={() => p.onChange(p.sel.includes(o) ? p.sel.filter((x) => x !== o) : [...p.sel, o])}
            className={`rounded-full px-2 py-0.5 text-xs border ${p.sel.includes(o) ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
