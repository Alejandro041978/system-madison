"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export type RoleRow = { id: string; name: string; description: string | null };
export type PermRow = { role_id: string; page_key: string; can_view: boolean; can_edit: boolean; can_delete: boolean };
type PageItem = { key: string; label: string; group: string };

type Flag = "can_view" | "can_edit" | "can_delete";
const FLAGS: { k: Flag; label: string }[] = [
  { k: "can_view", label: "Ver" },
  { k: "can_edit", label: "Editar" },
  { k: "can_delete", label: "Borrar" },
];

export function RolesMatrix(p: { roles: RoleRow[]; permissions: PermRow[]; pages: PageItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(p.roles[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const role = p.roles.find((r) => r.id === selected);

  function perm(pageKey: string): PermRow {
    return p.permissions.find((x) => x.role_id === selected && x.page_key === pageKey)
      ?? { role_id: selected, page_key: pageKey, can_view: false, can_edit: false, can_delete: false };
  }

  async function toggle(pageKey: string, flag: Flag, value: boolean) {
    if (!p.canEdit || !selected) return;
    setError(null);
    setBusy(`${pageKey}:${flag}`);
    const current = perm(pageKey);
    const next = { ...current, [flag]: value };
    // Quitar "ver" quita también editar y borrar (coherencia de la matriz).
    if (flag === "can_view" && !value) { next.can_edit = false; next.can_delete = false; }
    try {
      const res = await fetch("/api/roles/permissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error((await res.json()).error ?? `Error ${res.status}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function crearRol(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setNewName("");
      setSelected(json.id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const grupos = [...new Set(p.pages.map((x) => x.group))];

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      <div className="space-y-3">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {p.roles.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)}
              className={`w-full text-left px-4 py-2 text-sm border-b border-slate-100 last:border-0 ${r.id === selected ? "bg-sky-50 text-sky-900 font-medium" : "hover:bg-slate-50"}`}>
              {r.name}
            </button>
          ))}
          {p.roles.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Sin roles</div>}
        </div>
        {p.canEdit && (
          <form onSubmit={crearRol} className="flex gap-2">
            <input required placeholder="Nuevo rol" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="rounded-md bg-[#0f2a44] text-white px-2.5 py-1.5" title="Crear rol"><Plus className="h-4 w-4" /></button>
          </form>
        )}
      </div>

      <div>
        {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
        {role ? (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="font-medium">{role.name}</div>
              {role.description && <div className="text-xs text-slate-500">{role.description}</div>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Página</th>
                  {FLAGS.map((f) => <th key={f.k} className="px-4 py-2 font-medium w-24">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <GroupRows key={g} group={g} pages={p.pages.filter((x) => x.group === g)} perm={perm} toggle={toggle} canEdit={p.canEdit} busy={busy} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-400">Selecciona o crea un rol.</div>
        )}
      </div>
    </div>
  );
}

function GroupRows(p: {
  group: string; pages: PageItem[]; perm: (k: string) => PermRow;
  toggle: (k: string, f: Flag, v: boolean) => void; canEdit: boolean; busy: string | null;
}) {
  return (
    <>
      <tr className="bg-slate-50/60"><td colSpan={4} className="px-4 py-1 text-[11px] uppercase tracking-wider text-slate-400">{p.group}</td></tr>
      {p.pages.map((pg) => {
        const x = p.perm(pg.key);
        return (
          <tr key={pg.key} className="border-t border-slate-100">
            <td className="px-4 py-2">{pg.label} <span className="text-xs text-slate-400 font-mono">{pg.key}</span></td>
            {FLAGS.map((f) => (
              <td key={f.k} className="px-4 py-2 text-center">
                <input type="checkbox" checked={x[f.k]} disabled={!p.canEdit || p.busy === `${pg.key}:${f.k}`}
                  onChange={(e) => p.toggle(pg.key, f.k, e.target.checked)} />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
