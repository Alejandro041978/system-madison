/**
 * Catálogo de páginas de gestión. ÚNICA fuente para:
 *   - el sidebar (src/components/Sidebar.tsx),
 *   - ROUTE_TO_PAGE_KEY (páginas) y
 *   - la lista de page_key que administra la pantalla de roles.
 * Así el sidebar y los permisos no pueden desincronizarse (regla de CLAUDE.md).
 *
 * URLs en inglés; etiquetas en español.
 */

export type PageKey = "home" | "staff" | "roles" | "audit" | "categories" | "programs" | "rates" | "students" | "admissions" | "accounts" | "bots" | "leads" | "bot_suggestions" | "campaigns" | "performance";

export type PageDef = {
  key: PageKey;
  label: string;
  href: string;
  /** nombre del icono de lucide-react; se resuelve en el Sidebar */
  icon: "Home" | "Users" | "ShieldCheck" | "ScrollText" | "Layers" | "GraduationCap" | "BadgeEuro" | "UserRound" | "ClipboardList" | "Wallet" | "Bot" | "Users2" | "Sparkles" | "Megaphone" | "BarChart3";
  group: string;
  /** true = todo el personal activo la ve sin necesitar permiso (p. ej. Inicio) */
  publicStaff?: boolean;
};

export const PAGES: readonly PageDef[] = [
  { key: "home", label: "Inicio", href: "/", icon: "Home", group: "General", publicStaff: true },
  { key: "categories", label: "Categorías", href: "/categories", icon: "Layers", group: "Académico" },
  { key: "programs", label: "Programas y mallas", href: "/programs", icon: "GraduationCap", group: "Académico" },
  { key: "rates", label: "Tarifario", href: "/rates", icon: "BadgeEuro", group: "Académico" },
  { key: "students", label: "Estudiantes", href: "/students", icon: "UserRound", group: "Estudiantes" },
  { key: "admissions", label: "Admisión y matrícula", href: "/admissions", icon: "ClipboardList", group: "Estudiantes" },
  { key: "accounts", label: "Estados de cuenta", href: "/accounts", icon: "Wallet", group: "Finanzas" },
  { key: "bots", label: "Bots", href: "/bots", icon: "Bot", group: "Marketing" },
  { key: "leads", label: "Leads", href: "/leads", icon: "Users2", group: "Marketing" },
  { key: "campaigns", label: "Campañas", href: "/campaigns", icon: "Megaphone", group: "Marketing" },
  { key: "performance", label: "Desempeño", href: "/performance", icon: "BarChart3", group: "Marketing" },
  { key: "bot_suggestions", label: "Mejora continua", href: "/suggestions", icon: "Sparkles", group: "Marketing" },
  { key: "staff", label: "Personal", href: "/staff", icon: "Users", group: "Administración" },
  { key: "roles", label: "Roles y permisos", href: "/roles", icon: "ShieldCheck", group: "Administración" },
  { key: "audit", label: "Auditoría de permisos", href: "/audit", icon: "ScrollText", group: "Administración" },
] as const;

export const PAGE_KEYS: PageKey[] = PAGES.map((p) => p.key);

/** ruta de página → page_key. Derivado del catálogo, no se edita a mano. */
export const ROUTE_TO_PAGE_KEY: Record<string, PageKey> = Object.fromEntries(
  PAGES.map((p) => [p.href, p.key]),
) as Record<string, PageKey>;

/** ruta de API → page_key. Prefijo más largo gana (ver resolveApiPageKey). */
export const API_ROUTE_TO_PAGE_KEY: Record<string, PageKey> = {
  "/api/me": "home",
  "/api/staff": "staff",
  "/api/roles": "roles",
  "/api/audit": "audit",
  "/api/categories": "categories",
  "/api/programs": "programs",
  "/api/courses": "programs",
  "/api/rates": "rates",
  "/api/students": "students",
  "/api/admissions": "admissions",
  "/api/convocatorias": "admissions",
  "/api/accounts": "accounts",
  "/api/bots": "bots",
  "/api/leads": "leads",
  "/api/suggestions": "bot_suggestions",
  "/api/campaigns": "campaigns",
};

export function pageDef(key: PageKey): PageDef {
  return PAGES.find((p) => p.key === key)!;
}

/** Página a la que pertenece una ruta (`/staff/123` → staff). Null si no es de gestión. */
export function resolvePagePageKey(pathname: string): PageKey | null {
  if (ROUTE_TO_PAGE_KEY[pathname]) return ROUTE_TO_PAGE_KEY[pathname];
  const hit = Object.keys(ROUTE_TO_PAGE_KEY)
    .filter((href) => href !== "/" && pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? ROUTE_TO_PAGE_KEY[hit] : null;
}

export function resolveApiPageKey(pathname: string): PageKey | null {
  const hit = Object.keys(API_ROUTE_TO_PAGE_KEY)
    .filter((p) => pathname === p || pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? API_ROUTE_TO_PAGE_KEY[hit] : null;
}

export type Accion = "ver" | "editar" | "borrar";

/** Acción por método HTTP: GET→ver, DELETE→borrar, resto→editar. */
export function accionPorMetodo(method: string): Accion {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return "ver";
  if (m === "DELETE") return "borrar";
  return "editar";
}
