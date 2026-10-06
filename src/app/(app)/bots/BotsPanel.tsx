"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, RefreshCw, Search } from "lucide-react";
import type { Articulo, Resultado } from "@/lib/knowledge";

export type BotRow = { key: string; name: string; role: string; prompt: string; twilio_number: string | null; active: boolean };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";
const ROL: Record<string, string> = { ventas: "Ventas", soporte: "Soporte", retencion: "Retención", inbox: "Buzón humano" };

export function BotsPanel(p: { bots: BotRow[]; selected: string; articulos: Articulo[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const bot = p.bots.find((b) => b.key === p.selected) ?? null;
  const [editPrompt, setEditPrompt] = useState(false);
  const [prompt, setPrompt] = useState(bot?.prompt ?? "");
  const [numero, setNumero] = useState(bot?.twilio_number ?? "");
  const [showNew, setShowNew] = useState(false);
  const [art, setArt] = useState({ title: "", category: "", content: "" });
  const [editArt, setEditArt] = useState<Articulo | null>(null);
  const [q, setQ] = useState("");
  const [prueba, setPrueba] = useState<Resultado[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body: unknown): Promise<Record<string, unknown> | null> {
    setError(null); setAviso(null); setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return null; }
    router.refresh();
    return json;
  }

  async function guardarBot(patch: Record<string, unknown>) {
    if (!bot) return;
    const r = await call("/api/bots", "PATCH", { key: bot.key, ...patch });
    if (r) { setEditPrompt(false); setAviso("Guardado."); }
  }

  async function probar() {
    if (!bot || q.trim().length < 2) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/bots/knowledge?bot=${bot.key}&q=${encodeURIComponent(q)}`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setPrueba(json.prueba ?? []);
  }

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6">
      <div className="space-y-1">
        {p.bots.map((b) => (
          <button key={b.key} onClick={() => { router.push(`/bots?bot=${b.key}`); setPrueba(null); setEditPrompt(false); setPrompt(""); }}
            className={`w-full text-left rounded-md px-3 py-2 text-sm border ${b.key === p.selected ? "bg-sky-50 border-sky-200 text-sky-900" : "bg-white border-slate-200 hover:bg-slate-50"} ${b.active ? "" : "opacity-60"}`}>
            <div className="font-medium">{b.name}</div>
            <div className="text-xs text-slate-500">{ROL[b.role] ?? b.role} · {b.twilio_number ?? "sin número"}{!b.active && " · inactivo"}</div>
          </button>
        ))}
      </div>

      {bot && (
        <div className="space-y-5 min-w-0">
          {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
          {aviso && <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{aviso}</div>}

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{bot.name} <span className="text-xs text-slate-400">({ROL[bot.role]})</span></div>
              {p.canEdit && (
                <label className="text-xs flex items-center gap-1.5">
                  <input type="checkbox" checked={bot.active} onChange={(e) => guardarBot({ active: e.target.checked })} /> activo
                </label>
              )}
            </div>
            {p.canEdit && (
              <div className="flex items-end gap-2">
                <label className="text-sm flex-1"><div className="text-slate-600 mb-1">Número de WhatsApp (Twilio, formato whatsapp:+34…)</div>
                  <input className={`${input} w-full font-mono`} placeholder="whatsapp:+34600000000" defaultValue={bot.twilio_number ?? ""} onChange={(e) => setNumero(e.target.value)} /></label>
                <button onClick={() => guardarBot({ twilio_number: numero || bot.twilio_number })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">Guardar</button>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Prompt vigente</div>
                {p.canEdit && !editPrompt && <button onClick={() => { setPrompt(bot.prompt); setEditPrompt(true); }} className="text-sm text-sky-700 hover:underline inline-flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</button>}
              </div>
              {editPrompt ? (
                <div className="mt-1 space-y-2">
                  <textarea rows={8} className={`${input} w-full font-mono text-xs`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => setEditPrompt(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
                    <button onClick={() => guardarBot({ prompt })} disabled={busy} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm">Guardar prompt</button>
                  </div>
                </div>
              ) : (
                <pre className="mt-1 whitespace-pre-wrap text-xs bg-slate-50 border border-slate-100 rounded-md p-3 max-h-40 overflow-y-auto">{bot.prompt || "(vacío)"}</pre>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Conocimiento <span className="text-xs text-slate-400">({p.articulos.length} artículos)</span></div>
              {p.canEdit && (
                <div className="flex gap-3">
                  <button onClick={async () => { const r = await call("/api/bots/knowledge/reindex", "POST", { bot_key: bot.key }); if (r) setAviso(`Reindexado: ${r.articulos} artículos, ${r.conEmbedding}/${r.chunks} trozos con embedding.`); }}
                    disabled={busy} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><RefreshCw className="h-3.5 w-3.5" /> Reindexar todo</button>
                  {!showNew && <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline"><Plus className="h-4 w-4" /> Nuevo artículo</button>}
                </div>
              )}
            </div>

            {(showNew || editArt) && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <input placeholder="Título" className={`${input} flex-1`} value={editArt ? editArt.title : art.title}
                    onChange={(e) => editArt ? setEditArt({ ...editArt, title: e.target.value }) : setArt({ ...art, title: e.target.value })} />
                  <input placeholder="Categoría" className={`${input} w-40`} value={editArt ? editArt.category ?? "" : art.category}
                    onChange={(e) => editArt ? setEditArt({ ...editArt, category: e.target.value }) : setArt({ ...art, category: e.target.value })} />
                </div>
                <textarea rows={6} placeholder="Contenido (la respuesta que el bot debe conocer)" className={`${input} w-full`}
                  value={editArt ? editArt.content : art.content}
                  onChange={(e) => editArt ? setEditArt({ ...editArt, content: e.target.value }) : setArt({ ...art, content: e.target.value })} />
                <div className="flex gap-3 justify-end">
                  <button onClick={() => { setShowNew(false); setEditArt(null); }} className="text-sm text-slate-500 hover:underline">Cancelar</button>
                  <button disabled={busy} onClick={async () => {
                    const r = editArt
                      ? await call("/api/bots/knowledge", "PATCH", { id: editArt.id, title: editArt.title, category: editArt.category, content: editArt.content })
                      : await call("/api/bots/knowledge", "POST", { bot_key: bot.key, ...art });
                    if (r) { setShowNew(false); setEditArt(null); setArt({ title: "", category: "", content: "" }); setAviso("Guardado e indexado."); }
                  }} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm">Guardar e indexar</button>
                </div>
              </div>
            )}

            <ul className="divide-y divide-slate-100">
              {p.articulos.map((a) => (
                <li key={a.id} className={`py-2 flex items-start justify-between gap-3 ${a.enabled ? "" : "opacity-50"}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-xs text-slate-500">{a.category ?? "sin categoría"} · {a.chunk_count} trozo(s)</div>
                  </div>
                  {p.canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setEditArt(a); setShowNew(false); }} className="text-slate-500 hover:text-slate-800" title="Editar"><Pencil className="h-4 w-4" /></button>
                      <label className="text-xs flex items-center gap-1" title="Habilitado">
                        <input type="checkbox" checked={a.enabled} onChange={(e) => call("/api/bots/knowledge", "PATCH", { id: a.id, enabled: e.target.checked })} />
                      </label>
                      <button onClick={async () => { if (confirm(`¿Borrar «${a.title}»?`)) await call("/api/bots/knowledge", "DELETE", { id: a.id }); }}
                        className="text-red-500 hover:text-red-700" title="Borrar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </li>
              ))}
              {p.articulos.length === 0 && <li className="py-3 text-sm text-slate-400">Sin conocimiento: el bot responderá solo con su prompt.</li>}
            </ul>

            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Probar la búsqueda híbrida</div>
              <div className="flex gap-2">
                <input placeholder="¿Qué preguntaría un cliente?" className={`${input} flex-1`} value={q} onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && probar()} />
                <button onClick={probar} disabled={busy} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm inline-flex items-center gap-1"><Search className="h-4 w-4" /> Probar</button>
              </div>
              {prueba && (
                <ul className="mt-2 space-y-1 text-sm">
                  {prueba.map((r, i) => (
                    <li key={i} className="rounded-md bg-slate-50 border border-slate-100 px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs mr-2 ${r.via === "keyword" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>{r.via}{r.similarity ? ` ${(r.similarity * 100).toFixed(0)}%` : ""}</span>
                      <b>{r.title}</b>
                      <div className="text-xs text-slate-500 truncate">{r.content.slice(0, 160)}</div>
                    </li>
                  ))}
                  {prueba.length === 0 && <li className="text-slate-400 text-sm">Sin resultados: el bot respondería sin conocimiento.</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
