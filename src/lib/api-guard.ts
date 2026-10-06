import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { resolveIdentity, currentAuthUser, permisoDe, type Identity } from "@/lib/identity";
import { PERMISOS_ESTRICTO, registrarDenegacion } from "@/lib/audit";
import { accionPorMetodo, resolveApiPageKey, pageDef, type Accion, type PageKey } from "@/lib/pages";

/**
 * Guards de autorización. La regla de la casa: la autorización la hacen estos
 * guards y el proxy, nunca las políticas RLS. Identidad por presencia; un
 * fallo de lectura niega.
 */

type GuardOk = { ok: true; identity: Identity };
type GuardFail = { ok: false; response: NextResponse };
export type GuardResult = GuardOk | GuardFail;

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export function puedeVerPagina(identity: Identity, pageKey: PageKey): boolean {
  if (pageDef(pageKey).publicStaff) return true;
  return permisoDe(identity, pageKey).can_view;
}
export function puedeEditarPagina(identity: Identity, pageKey: PageKey): boolean {
  return permisoDe(identity, pageKey).can_edit;
}
export function puedeBorrarPagina(identity: Identity, pageKey: PageKey): boolean {
  return permisoDe(identity, pageKey).can_delete;
}
export function puedeAccion(identity: Identity, pageKey: PageKey, accion: Accion): boolean {
  if (accion === "ver") return puedeVerPagina(identity, pageKey);
  if (accion === "borrar") return puedeBorrarPagina(identity, pageKey);
  return puedeEditarPagina(identity, pageKey);
}

/** Sesión + ficha de colaborador activa. 401 sin sesión, 403 sin ficha. */
export async function guardStaff(req: Request): Promise<GuardResult> {
  const identity = await resolveIdentity();
  if (identity) return { ok: true, identity };

  const auth = await currentAuthUser();
  const ruta = new URL(req.url).pathname;
  await registrarDenegacion({
    userId: auth?.id ?? null,
    email: auth?.email ?? null,
    roleId: null,
    pageKey: resolveApiPageKey(ruta),
    accion: accionPorMetodo(req.method),
    metodo: req.method,
    ruta,
    motivo: auth ? "sin_ficha" : "sin_sesion",
    bloqueado: true, // sin identidad no hay modo auditoría que valga
  });
  return { ok: false, response: auth ? json(403, "No eres personal de la institución") : json(401, "Sesión requerida") };
}

/** Solo superadmin por lista explícita (app_superadmins). Siempre bloquea. */
export async function guardSuperadmin(req: Request): Promise<GuardResult> {
  const base = await guardStaff(req);
  if (!base.ok) return base;
  if (base.identity.isSuperadmin && !base.identity.impersonatedBy) return base;

  const ruta = new URL(req.url).pathname;
  await registrarDenegacion({
    userId: base.identity.userId,
    email: base.identity.email,
    roleId: base.identity.employee.role_id,
    pageKey: resolveApiPageKey(ruta),
    accion: accionPorMetodo(req.method),
    metodo: req.method,
    ruta,
    motivo: "no_superadmin",
    bloqueado: true,
  });
  return { ok: false, response: json(403, "Solo superadmin") };
}

/**
 * Guard de API por página: personal + permiso según método
 * (GET→ver, DELETE→borrar, resto→editar) usando API_ROUTE_TO_PAGE_KEY.
 * Modo auditoría: registra y deja pasar. Estricto: 403.
 * "Ver como" es SIEMPRE solo lectura, en cualquier modo.
 */
export async function guardApi(req: Request, pageKeyOverride?: PageKey): Promise<GuardResult> {
  const base = await guardStaff(req);
  if (!base.ok) return base;
  const { identity } = base;
  const ruta = new URL(req.url).pathname;
  const pageKey = pageKeyOverride ?? resolveApiPageKey(ruta);
  const accion = accionPorMetodo(req.method);

  if (identity.impersonatedBy && accion !== "ver") {
    await registrarDenegacion({
      userId: identity.userId, email: identity.email, roleId: identity.employee.role_id,
      pageKey, accion, metodo: req.method, ruta, motivo: "solo_lectura_ver_como", bloqueado: true,
    });
    return { ok: false, response: json(403, "Modo «ver como»: solo lectura") };
  }

  if (!pageKey) {
    // Ruta no catalogada: sin page_key no hay permiso que comprobar. Se deja
    // pasar a personal, pero se avisa en consola para catalogarla.
    console.warn(`[guardApi] ruta sin page_key en API_ROUTE_TO_PAGE_KEY: ${ruta}`);
    return base;
  }

  if (puedeAccion(identity, pageKey, accion)) return base;

  const bloqueado = await registrarDenegacion({
    userId: identity.userId, email: identity.email, roleId: identity.employee.role_id,
    pageKey, accion, metodo: req.method, ruta, motivo: "sin_permiso",
  });
  if (bloqueado) return { ok: false, response: json(403, `Sin permiso para ${accion} en «${pageDef(pageKey).label}»`) };
  return base;
}

/**
 * Guard para Server Components de página. Sin sesión → /login; sin ficha →
 * /no-access; sin permiso de ver → auditoría (estricto: /no-access).
 */
export async function guardPage(pageKey: PageKey, pathname: string): Promise<Identity> {
  const identity = await resolveIdentity();
  if (!identity) {
    const auth = await currentAuthUser();
    await registrarDenegacion({
      userId: auth?.id ?? null, email: auth?.email ?? null, roleId: null,
      pageKey, accion: "ver", metodo: "GET", ruta: pathname,
      motivo: auth ? "sin_ficha" : "sin_sesion", bloqueado: true,
    });
    redirect(auth ? "/no-access" : `/login?next=${encodeURIComponent(pathname)}`);
  }
  if (puedeVerPagina(identity, pageKey)) return identity;

  const bloqueado = await registrarDenegacion({
    userId: identity.userId, email: identity.email, roleId: identity.employee.role_id,
    pageKey, accion: "ver", metodo: "GET", ruta: pathname, motivo: "sin_permiso",
  });
  if (bloqueado) redirect(`/no-access?page=${pageKey}`);
  return identity;
}

export { PERMISOS_ESTRICTO };
