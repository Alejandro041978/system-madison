"use client";

import { useState } from "react";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Mínimo 8 caracteres"); return; }
    if (password !== repeat) { setError("Las contraseñas no coinciden"); return; }
    setBusy(true);
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); setBusy(false); return; }
    // Recarga completa (no router.push): el proxy y el layout deben ver la
    // sesión ya con contraseña. URL absoluta para la regla de lint de Next.
    window.location.assign(new URL("/", window.location.origin).href);
  }

  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-slate-700">Contraseña nueva</span>
        <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-700">Repite la contraseña</span>
        <input type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={input} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-md bg-brand text-white py-2 text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
        {busy ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
