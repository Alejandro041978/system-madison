"use client";

import { Search } from "lucide-react";

export function StudentSearch({ q, all }: { q: string; all: boolean }) {
  return (
    <form className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
      <Search className="h-4 w-4 text-slate-400" />
      <input name="q" defaultValue={q} autoFocus minLength={2} placeholder="Nombre, documento, correo o teléfono…"
        className="flex-1 text-sm outline-none" />
      <label className="text-xs text-slate-500 flex items-center gap-1.5">
        <input type="checkbox" name="all" value="1" defaultChecked={all} /> incluir deshabilitados
      </label>
      <button className="rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm">Buscar</button>
    </form>
  );
}
