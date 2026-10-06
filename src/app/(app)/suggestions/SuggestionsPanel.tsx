"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Pencil, BookOpen, MessageSquareText } from "lucide-react";
import type { Suggestion } from "@/lib/suggestions";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full";

export function SuggestionsPanel(p: {
  filas: Suggestion[]; bots: { key: string; name: string }[]; conteo: Record<string, number>;
  bot: string; status: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function go(bot: string, status: string) {
    const sp = new URLSearchParams();
    if (bot) sp.set("bot", bot);
    if (status !== "pending") sp.set("status", status);
    router.push(`/suggestions${sp.size ? `?${sp}` : ""}`);
  }

  async function call(method: string, body: unknown): Promise<Record<string, unknown> | null> {
    setError(null); setAviso(null);
    const res = await fetch("/api/suggestions", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return null; }
    router.refresh();
    return json;
  }

  async function decidir(s: Suggestion, action: "approve" | "reject") {
    if (action === "approve" && !confirm(`¿Aprobar y aplicar «${s.title}»?\n\n${s.type === "prompt" ? "Añadirá la viñeta al prompt del bot con una versión nueva." : "Creará (o actualizará) el artículo de conocimiento y lo indexará."}`)) return;
    setBusy(s.id);
    const r = await call("PATCH", { id: s.id, action });
    setBusy(null);
    if (r) setAviso(action === "reject" ? "Rechazada. No volverá a aparecer." : `Aplicada (${(r as { applied_ref?: string }).applied_ref}).`);
  }

  async function guardarEdicion() {
    if (!editando) return;
    const r = await call("PUT", {
      id: editando.id, title: editando.title, recommendation: editando.recommendation,
      content: editando.content, kb_topic: editando.kb_topic ?? undefined, kb_question: editando.kb_question ?? undefined,
    });
    if (r) { setEditando(null); setAviso("Edición guardada."); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => go("", p.status)} className={`rounded-full px-3 py-1 border ${!p.bot ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>Todos</button>
        {p.bots.map((b) => (
          <button key={b.key} onClick={() => go(b.key, p.status)}
            className={`rounded-full px-3 py-1 border ${p.bot === b.key ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>
            {b.name}{p.conteo[b.key] ? <span className="ml-1.5 rounded-full bg-amber-400 text-amber-950 px-1.5 text-xs font-semibold">{p.conteo[b.key]}</span> : null}
          </button>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        {(["pending", "approved", "rejected"] as const).map((st) => (
          <button key={st} onClick={() => go(p.bot, st)}
            className={`rounded-full px-3 py-1 border capitalize ${p.status === st ? "bg-slate-700 text-white border-slate-700" : "bg-white border-slate-300"}`}>
            {st === "pending" ? "pendientes" : st === "approved" ? "aprobadas" : "rechazadas"}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      {aviso && <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{aviso}</div>}

      <div className="space-y-3">
        {p.filas.map((s) => (
          <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4">
            {editando?.id === s.id ? (
              <div className="space-y-2">
                <input className={input} value={editando.title} onChange={(e) => setEditando({ ...editando, title: e.target.value })} />
                {editando.type === "knowledge" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="Categoría (kb_topic)" value={editando.kb_topic ?? ""} onChange={(e) => setEditando({ ...editando, kb_topic: e.target.value })} />
                    <input className={input} placeholder="Pregunta que responde (kb_question)" value={editando.kb_question ?? ""} onChange={(e) => setEditando({ ...editando, kb_question: e.target.value })} />
                  </div>
                )}
                <textarea rows={6} className={input} value={editando.content ?? ""} onChange={(e) => setEditando({ ...editando, content: e.target.value })} />
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setEditando(null)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
                  <button onClick={guardarEdicion} className="rounded-md bg-[#0f2a44] text-white px-3 py-1 text-sm">Guardar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {s.type === "knowledge" ? <BookOpen className="h-4 w-4 text-violet-600" /> : <MessageSquareText className="h-4 w-4 text-sky-600" />}
                      <span className="font-medium">{s.title}</span>
                      <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs">{s.bot_key}</span>
                      <span className="text-xs text-slate-400">{s.report_date}</span>
                      {s.campaign_key && <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs">campaña {s.campaign_key}</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{s.recommendation}</p>
                    {s.content && <pre className="mt-2 whitespace-pre-wrap text-xs bg-slate-50 border border-slate-100 rounded-md p-2 max-h-36 overflow-y-auto">{s.content}</pre>}
                    {s.status !== "pending" && (
                      <div className="mt-1 text-xs text-slate-500">
                        {s.status === "approved" ? `Aplicada ${s.applied_ref} el ${s.applied_at ? new Date(s.applied_at).toLocaleString("es-ES") : ""}` : "Rechazada"} por {s.reviewed_by}
                      </div>
                    )}
                  </div>
                  {p.canEdit && s.status === "pending" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setEditando(s)} title="Editar" className="rounded-md border border-slate-300 bg-white p-1.5 hover:bg-slate-50"><Pencil className="h-4 w-4 text-slate-600" /></button>
                      <button onClick={() => decidir(s, "reject")} disabled={busy === s.id} title="Rechazar" className="rounded-md border border-red-200 bg-white p-1.5 hover:bg-red-50"><X className="h-4 w-4 text-red-600" /></button>
                      <button onClick={() => decidir(s, "approve")} disabled={busy === s.id} title="Aprobar y aplicar" className="rounded-md bg-emerald-600 p-1.5 hover:bg-emerald-700"><Check className="h-4 w-4 text-white" /></button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {p.filas.length === 0 && (
          <div className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg p-6 text-center">
            Nada {p.status === "pending" ? "pendiente" : p.status === "approved" ? "aprobado" : "rechazado"}. El evaluador deja aquí sus sugerencias cada noche.
          </div>
        )}
      </div>
    </div>
  );
}
