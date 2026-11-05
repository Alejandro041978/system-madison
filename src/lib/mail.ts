import "server-only";

/**
 * Correo transaccional por Resend (2026-11-05). Única puerta de salida de
 * correo de la app: nadie llama a la API de Resend por su cuenta.
 *
 * Sin RESEND_API_KEY o RESEND_FROM_EMAIL no lanza: devuelve ok=false con
 * el motivo, y quien llama decide qué mostrar. Así un entorno sin correo
 * (preview, local) no tumba el alta de personal.
 */

export type ResultadoCorreo = { ok: true; id: string } | { ok: false; motivo: string };

export function hayCorreo(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

export async function enviarCorreo(p: { to: string; subject: string; html: string; text: string }): Promise<ResultadoCorreo> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) return { ok: false, motivo: "RESEND_API_KEY/RESEND_FROM_EMAIL sin configurar" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [p.to], subject: p.subject, html: p.html, text: p.text }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, motivo: `Resend ${res.status}: ${json.message ?? json.name ?? "error"}` };
    return { ok: true, id: json.id ?? "" };
  } catch (e) {
    return { ok: false, motivo: `Resend sin respuesta: ${(e as Error).message}` };
  }
}

/** Escapa texto para incrustarlo en HTML de correo. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
