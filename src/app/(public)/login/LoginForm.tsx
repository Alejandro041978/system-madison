"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError("Correo o contraseña incorrectos");
      setBusy(false);
      return;
    }
    // Recarga completa: el proxy debe ver la cookie de sesión nueva.
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-slate-700">Correo</span>
        <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </label>
      <label className="block text-sm">
        <span className="text-slate-700">Contraseña</span>
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-md bg-[#0f2a44] text-white py-2 text-sm font-medium hover:bg-[#163a5c] disabled:opacity-60">
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
