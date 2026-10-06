import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseSession } from "@/lib/supabase/server";
import { PAGE_KEYS, type PageKey } from "@/lib/pages";

/**
 * UNA identidad, UNA función (regla "un dato, una función" de CLAUDE.md).
 * Todo —layout, sidebar, páginas, APIs— llama a resolveIdentity() y nadie
 * recalcula por su cuenta quién es el usuario ni qué puede hacer.
 *
 * Principios (2026-08-23, herencia del ERP anterior):
 *  - Identidad por PRESENCIA: es personal quien tiene ficha activa en
 *    hr_employees; es superadmin quien, además, no tiene role_id Y está en
 *    app_superadmins. "Sin rol" a secas no es nada.
 *  - Cualquier error de lectura NIEGA (devuelve null / sin permisos).
 *  - Un estudiante con sesión Supabase pero sin ficha NO es personal.
 */

export type Permiso = { can_view: boolean; can_edit: boolean; can_delete: boolean };

export type Employee = {
  id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  is_helpdesk: boolean;
  active: boolean;
};

export type Identity = {
  /** auth.users.id de la persona que realmente inició sesión */
  userId: string;
  email: string;
  employee: Employee;
  role: { id: string; name: string } | null;
  isSuperadmin: boolean;
  permisos: Partial<Record<PageKey, Permiso>>;
  /** presente cuando un superadmin está "viendo como" otro colaborador */
  impersonatedBy: { userId: string; email: string } | null;
};

export const VER_COMO_COOKIE = "madison_ver_como";

const NO_PERMISO: Permiso = { can_view: false, can_edit: false, can_delete: false };

/** Sesión Supabase actual (sin decidir nada todavía). */
export const currentAuthUser = cache(async () => {
  try {
    const sb = await supabaseSession();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email.toLowerCase() };
  } catch {
    return null;
  }
});

/**
 * Ficha del colaborador por user_id; si no existe, por email, y en ese caso
 * se enlaza user_id (primer inicio de sesión de una ficha creada a mano).
 */
async function findEmployee(userId: string, email: string): Promise<Employee | null> {
  const db = supabaseAdmin();
  const cols = "id, email, full_name, role_id, is_helpdesk, active";

  const byUser = await db.from("hr_employees").select(cols).eq("user_id", userId).maybeSingle();
  if (byUser.error) return null; // fallo de lectura → niega
  if (byUser.data) return byUser.data as Employee;

  const byEmail = await db.from("hr_employees").select(cols).eq("email", email).maybeSingle();
  if (byEmail.error || !byEmail.data) return null;

  // Enlazar por id para no depender del email en adelante. Si falla, seguimos
  // (la ficha existe); el enlace se reintentará en la siguiente petición.
  await db.from("hr_employees").update({ user_id: userId }).eq("id", byEmail.data.id).is("user_id", null);
  return byEmail.data as Employee;
}

async function isListedSuperadmin(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("app_superadmins")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (error) return false; // fallo de lectura → niega
  return !!data;
}

async function loadPermisos(roleId: string): Promise<Partial<Record<PageKey, Permiso>>> {
  const { data, error } = await supabaseAdmin()
    .from("role_permissions")
    .select("page_key, can_view, can_edit, can_delete")
    .eq("role_id", roleId);
  if (error || !data) return {};
  const out: Partial<Record<PageKey, Permiso>> = {};
  for (const r of data) {
    if ((PAGE_KEYS as string[]).includes(r.page_key)) {
      out[r.page_key as PageKey] = { can_view: r.can_view, can_edit: r.can_edit, can_delete: r.can_delete };
    }
  }
  return out;
}

async function buildIdentity(
  userId: string,
  email: string,
  employee: Employee,
  impersonatedBy: Identity["impersonatedBy"],
): Promise<Identity> {
  let role: Identity["role"] = null;
  let permisos: Identity["permisos"] = {};
  let isSuperadmin = false;

  if (employee.role_id) {
    const { data } = await supabaseAdmin().from("roles").select("id, name").eq("id", employee.role_id).maybeSingle();
    role = data ?? null;
    permisos = await loadPermisos(employee.role_id);
  } else {
    isSuperadmin = await isListedSuperadmin(employee.email.toLowerCase());
  }

  return { userId, email, employee, role, isSuperadmin, permisos, impersonatedBy };
}

/**
 * Identidad del personal para la petición actual. Null = no es personal
 * (sin sesión, sin ficha, ficha inactiva o fallo de lectura).
 * Memoizada por petición con React cache().
 */
export const resolveIdentity = cache(async (): Promise<Identity | null> => {
  const auth = await currentAuthUser();
  if (!auth) return null;

  const real = await findEmployee(auth.id, auth.email);
  if (!real || !real.active) return null;

  const realIdentity = await buildIdentity(auth.id, auth.email, real, null);

  // "Ver como": solo un superadmin real puede suplantar, y solo lectura
  // (los guards niegan escrituras cuando impersonatedBy != null).
  if (realIdentity.isSuperadmin) {
    const cookieStore = await cookies();
    const targetId = cookieStore.get(VER_COMO_COOKIE)?.value;
    if (targetId && targetId !== real.id) {
      const { data } = await supabaseAdmin()
        .from("hr_employees")
        .select("id, email, full_name, role_id, is_helpdesk, active")
        .eq("id", targetId)
        .maybeSingle();
      if (data && data.active) {
        return buildIdentity(auth.id, data.email, data as Employee, { userId: auth.id, email: auth.email });
      }
    }
  }

  return realIdentity;
});

export function permisoDe(identity: Identity, pageKey: PageKey): Permiso {
  if (identity.isSuperadmin) return { can_view: true, can_edit: true, can_delete: true };
  return identity.permisos[pageKey] ?? NO_PERMISO;
}
