"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";

export type VersionRow = { id: string; bot_key: string; version: number; prompt: string; reason: string; created_by: string | null; created_at: string };

export function VersionsPanel(p: { versiones: VersionRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<number | null>(p.versiones[0]?.version ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vigente = p.versiones[0]?.version;

  async function restaurar(v: VersionRow) {
    if (!confirm(`¿Restaurar la versión ${v.version}? Se creará una versión nueva con ese contenido y quedará vigente.`)) return;
    setError(null); setBusy(true);
    const res = await fetch("/api/bots/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bot_key: v.bot_key, version: v.version }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      {p.versiones.map((v) => (
        <div key={v.id} className={`bg-white border rounded-lg ${v.version === vigente ? "border-emerald-300" : "border-slate-200"}`}>
          <button onClick={() => setAbierta(abierta === v.version ? null : v.version)} className="w-full flex items-center justify-between px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-400" />
              <b>v{v.version}</b>
              {v.version === vigente && <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-xs">vigente</span>}
              <span className="text-slate-500">{v.reason}</span>
            </span>
            <span className="text-xs text-slate-400">{v.created_by ?? "sistema"} · {new Date(v.created_at).toLocaleString("es-ES")}</span>
          </button>
          {abierta === v.version && (
            <div className="border-t border-slate-100 p-4">
              <pre className="whitespace-pre-wrap text-xs bg-slate-50 border border-slate-100 rounded-md p-3 max-h-72 overflow-y-auto">{v.prompt}</pre>
              {p.canEdit && v.version !== vigente && (
                <button onClick={() => restaurar(v)} disabled={busy} className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
                  Restaurar esta versión
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {p.versiones.length === 0 && <div className="text-sm text-slate-400">Sin versiones.</div>}
    </div>
  );
}
