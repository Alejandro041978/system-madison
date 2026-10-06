import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Accion, PageKey } from "@/lib/pages";

export const PERMISOS_ESTRICTO = process.env.PERMISOS_MODO === "estricto";

export type MotivoAuditoria = "sin_sesion" | "sin_ficha" | "sin_permiso" | "solo_lectura_ver_como" | "no_superadmin";

/**
 * Registra una decisión de permisos. Se llama SOLO cuando el acceso habría
 * sido denegado: en modo auditoría se anota (bloqueado=false) y se deja
 * pasar; en modo estricto se anota (bloqueado=true) y se bloquea.
 *
 * Nunca lanza: una auditoría que falla no debe tumbar la petición, pero sí
 * queda en consola del servidor.
 */
export async function registrarDenegacion(p: {
  userId: string | null;
  email: string | null;
  roleId: string | null;
  pageKey: PageKey | null;
  accion: Accion;
  metodo: string;
  ruta: string;
  motivo: MotivoAuditoria;
  /** fuerza bloqueo aunque el modo sea auditoría (p. ej. sin sesión) */
  bloqueado?: boolean;
}) {
  const bloqueado = p.bloqueado ?? PERMISOS_ESTRICTO;
  const { error } = await supabaseAdmin().from("permission_audit").insert({
    user_id: p.userId,
    email: p.email,
    role_id: p.roleId,
    page_key: p.pageKey,
    accion: p.accion,
    metodo: p.metodo.toUpperCase(),
    ruta: p.ruta,
    bloqueado,
    motivo: p.motivo,
  });
  if (error) console.error("[permission_audit] no se pudo registrar:", error.message, p);
  return bloqueado;
}
