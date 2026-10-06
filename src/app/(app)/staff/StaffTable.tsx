"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Plus } from "lucide-react";

export type StaffRow = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role_id: string | null;
  is_helpdesk: boolean;
  active: boolean;
  created_at: string;
};
export type RoleOption = { id: string; name: string };

async function api(method: string, body: unknown) {
  const res = await fetch("/api/staff", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json;
}

export function StaffTable(p: { rows: StaffRow[]; roles: RoleOption[]; canEdit: boolean; canImpersonate: boolean; selfId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nuevo, setNuevo] = useState({ email: "", full_name: "", role_id: "" });

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api("PATCH", { id, ...body });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", { ...nuevo, role_id: nuevo.role_id || null });
      setNuevo({ email: "", full_name: "", role_id: "" });
      setShowNew(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white";

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {p.canEdit && (
        <div>
          {!showNew ? (
            <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c]">
              <Plus className="h-4 w-4" /> Nueva ficha
            </button>
          ) : (
            <form onSubmit={crear} className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
              <label className="text-sm">
                <div className="text-slate-600 mb-1">Nombre completo</div>
                <input required className={input} value={nuevo.full_name} onChange={(e) => setNuevo({ ...nuevo, full_name: e.target.value })} />
              </label>
              <label className="text-sm">
                <div className="text-slate-600 mb-1">Correo</div>
                <input required type="email" className={input} value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
              </label>
              <label className="text-sm">
                <div className="text-slate-600 mb-1">Rol</div>
                <select className={input} value={nuevo.role_id} onChange={(e) => setNuevo({ ...nuevo, role_id: e.target.value })}>
                  <option value="">— Sin rol —</option>
                  {p.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Guardar</button>
              <button type="button" onClick={() => setShowNew(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
            </form>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Correo</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Helpdesk</th>
              <th className="px-4 py-2 font-medium">Activa</th>
              <th className="px-4 py-2 font-medium">Acceso</th>
              {p.canImpersonate && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.rows.map((r) => (
              <tr key={r.id} className={r.active ? "" : "text-slate-400"}>
                <td className="px-4 py-2">{r.full_name}{r.id === p.selfId && <span className="ml-2 text-xs text-slate-400">(tú)</span>}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.email}</td>
                <td className="px-4 py-2">
                  {p.canEdit ? (
                    <select className={input} value={r.role_id ?? ""} onChange={(e) => patch(r.id, { role_id: e.target.value || null })}>
                      <option value="">— Sin rol —</option>
                      {p.roles.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  ) : (
                    p.roles.find((o) => o.id === r.role_id)?.name ?? <span className="text-slate-400">Sin rol</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input type="checkbox" disabled={!p.canEdit} checked={r.is_helpdesk} onChange={(e) => patch(r.id, { is_helpdesk: e.target.checked })} />
                </td>
                <td className="px-4 py-2">
                  <input type="checkbox" disabled={!p.canEdit || r.id === p.selfId} checked={r.active} onChange={(e) => patch(r.id, { active: e.target.checked })} />
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.user_id ? <span className="text-emerald-700">ha iniciado sesión</span> : <span className="text-slate-400">pendiente</span>}
                </td>
                {p.canImpersonate && (
                  <td className="px-4 py-2">
                    {r.id !== p.selfId && r.active && (
                      <form action="/api/auth/impersonate" method="post">
                        <input type="hidden" name="employee_id" value={r.id} />
                        <button className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline" title="Ver la aplicación como este colaborador (solo lectura)">
                          <Eye className="h-3.5 w-3.5" /> Ver como
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {p.rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No hay fichas todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
