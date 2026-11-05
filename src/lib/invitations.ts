import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DomainError } from "@/lib/enrollments";
import { enviarCorreo, escapeHtml } from "@/lib/mail";
import { APP_NAME, APP_URL } from "@/lib/config";

/**
 * Invitación de acceso para el personal (2026-11-05).
 *
 * Caso real: se crearon fichas en /staff y nadie recibió credenciales,
 * porque el alta solo creaba la ficha. Ahora:
 *  1. Se genera en Supabase Auth un enlace de un solo uso (tipo `invite`
 *     si el usuario no existe; `recovery` si ya existía) con la API admin.
 *     Supabase NO envía nada: el enlace lo mandamos nosotros por Resend,
 *     así todos los correos de la app salen por el mismo sitio.
 *  2. El enlace apunta a /api/auth/confirm, que canjea el token por una
 *     sesión y lleva a /auth/set-password para fijar la contraseña.
 *  3. La ficha guarda invited_at/by/kind o invite_error (013).
 *
 * El enlace caduca según «Email OTP expiration» del proyecto Supabase
 * (1 h por defecto). Caducado → se vuelve a invitar desde /staff.
 */

export type InviteKind = "invite" | "recovery";
export type ResultadoInvitacion = { kind: InviteKind; email: string };

type Ficha = { id: string; email: string; full_name: string; active: boolean };

function enlaceConfirmacion(hashedToken: string, kind: InviteKind): string {
  const u = new URL("/api/auth/confirm", APP_URL);
  u.searchParams.set("token_hash", hashedToken);
  u.searchParams.set("type", kind);
  return u.toString();
}

async function generarEnlace(email: string): Promise<{ url: string; kind: InviteKind }> {
  const admin = supabaseAdmin().auth.admin;
  const inv = await admin.generateLink({ type: "invite", email });
  if (!inv.error && inv.data.properties?.hashed_token) {
    return { url: enlaceConfirmacion(inv.data.properties.hashed_token, "invite"), kind: "invite" };
  }
  // Ya existe en Auth (p. ej. creado a mano o invitado antes): enlace de
  // recuperación, que también permite fijar la contraseña.
  const yaExiste = inv.error && /already|registered|exists/i.test(inv.error.message);
  if (!yaExiste) throw new DomainError(`No se pudo generar el enlace: ${inv.error?.message ?? "sin token"}`, 502);
  const rec = await admin.generateLink({ type: "recovery", email });
  if (rec.error || !rec.data.properties?.hashed_token) {
    throw new DomainError(`No se pudo generar el enlace: ${rec.error?.message ?? "sin token"}`, 502);
  }
  return { url: enlaceConfirmacion(rec.data.properties.hashed_token, "recovery"), kind: "recovery" };
}

function plantilla(p: { nombre: string; url: string; kind: InviteKind }): { subject: string; html: string; text: string } {
  const nombre = p.nombre.split(" ")[0] || p.nombre;
  const intro = p.kind === "invite"
    ? `Te han dado acceso al sistema de gestión de ${APP_NAME}. Para entrar, primero elige tu contraseña:`
    : `Aquí tienes un enlace para establecer una contraseña nueva en el sistema de gestión de ${APP_NAME}:`;
  const subject = p.kind === "invite" ? `Tu acceso a ${APP_NAME}` : `Nueva contraseña para ${APP_NAME}`;
  const text = `Hola ${nombre},\n\n${intro}\n\n${p.url}\n\nEl enlace es de un solo uso y caduca pronto. Si ha caducado, pide una invitación nueva a quien te dio de alta.\n\nTu usuario es tu correo; la contraseña la eliges tú al abrir el enlace.\n\n${APP_NAME}`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
  <div style="font-size:20px;font-weight:700;color:#6b2a7f;margin-bottom:16px">${escapeHtml(APP_NAME)}</div>
  <p style="font-size:15px;line-height:1.5">Hola ${escapeHtml(nombre)},</p>
  <p style="font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
  <p style="margin:24px 0"><a href="${escapeHtml(p.url)}" style="display:inline-block;background:#fe2373;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Elegir mi contraseña</a></p>
  <p style="font-size:13px;color:#475569;line-height:1.5">Tu usuario es tu correo. El enlace es de un solo uso y caduca pronto; si ha caducado, pide una invitación nueva a quien te dio de alta.</p>
  <p style="font-size:12px;color:#94a3b8;word-break:break-all">Si el botón no funciona, copia este enlace: ${escapeHtml(p.url)}</p>
</div></body></html>`;
  return { subject, html, text };
}

/** Genera el enlace, envía el correo y deja rastro en la ficha. Lanza DomainError si algo falla. */
export async function invitarColaborador(employeeId: string, actor: string): Promise<ResultadoInvitacion> {
  const db = supabaseAdmin();
  const { data: e, error } = await db.from("hr_employees").select("id, email, full_name, active").eq("id", employeeId).maybeSingle();
  if (error) throw new DomainError(error.message, 500);
  if (!e) throw new DomainError("Ficha no encontrada", 404);
  const ficha = e as Ficha;
  if (!ficha.active) throw new DomainError("La ficha está inactiva; actívala antes de invitar", 409);

  const registrar = async (patch: Record<string, unknown>) => {
    await db.from("hr_employees").update(patch).eq("id", ficha.id);
  };

  let enlace: { url: string; kind: InviteKind };
  try {
    enlace = await generarEnlace(ficha.email);
  } catch (err) {
    await registrar({ invite_error: (err as Error).message });
    throw err;
  }

  const correo = plantilla({ nombre: ficha.full_name, url: enlace.url, kind: enlace.kind });
  const envio = await enviarCorreo({ to: ficha.email, ...correo });
  if (!envio.ok) {
    await registrar({ invite_error: envio.motivo });
    throw new DomainError(`No se pudo enviar el correo: ${envio.motivo}`, 502);
  }

  await registrar({ invited_at: new Date().toISOString(), invited_by: actor, invite_kind: enlace.kind, invite_error: null });
  return { kind: enlace.kind, email: ficha.email };
}
