import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { Home, Users, ShieldCheck, ScrollText, LogOut, Eye, Layers, GraduationCap, BadgeEuro, UserRound, ClipboardList, Wallet, Bot, Users2, Sparkles, Megaphone, BarChart3 } from "lucide-react";
import { PAGES, type PageDef } from "@/lib/pages";
import { puedeVerPagina } from "@/lib/api-guard";
import type { Identity } from "@/lib/identity";

const ICONS: Record<PageDef["icon"], React.ComponentType<{ className?: string }>> = {
  Home, Users, ShieldCheck, ScrollText, Layers, GraduationCap, BadgeEuro, UserRound, ClipboardList, Wallet, Bot, Users2, Sparkles, Megaphone, BarChart3,
};

/**
 * El sidebar se construye desde PAGES (src/lib/pages.ts) filtrando por
 * puedeVerPagina(): la misma fuente que ROUTE_TO_PAGE_KEY, por construcción.
 */
export function Sidebar({ identity }: { identity: Identity }) {
  const visibles = PAGES.filter((p) => puedeVerPagina(identity, p.key));
  const grupos = [...new Set(visibles.map((p) => p.group))];

  return (
    <aside className="w-64 shrink-0 bg-[#0f2a44] text-slate-100 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
        <div className="text-xs text-slate-400">Gestión académica</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5">
        {grupos.map((g) => (
          <div key={g}>
            <div className="px-2 mb-1 text-[11px] uppercase tracking-wider text-slate-400">{g}</div>
            <ul className="space-y-0.5">
              {visibles.filter((p) => p.group === g).map((p) => {
                const Icon = ICONS[p.icon];
                return (
                  <li key={p.key}>
                    <Link href={p.href} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-white/10">
                      <Icon className="h-4 w-4 text-slate-300" />
                      {p.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 text-sm">
        <div className="font-medium truncate">{identity.employee.full_name}</div>
        <div className="text-xs text-slate-400 truncate">{identity.email}</div>
        <div className="mt-1 text-xs text-slate-300">
          {identity.isSuperadmin ? "Superadmin" : identity.role?.name ?? "Sin rol asignado"}
        </div>
        {identity.impersonatedBy && (
          <form action="/api/auth/impersonate" method="post" className="mt-2">
            <input type="hidden" name="stop" value="1" />
            <button className="flex items-center gap-1.5 text-xs text-amber-300 hover:underline">
              <Eye className="h-3.5 w-3.5" /> Salir de «ver como»
            </button>
          </form>
        )}
        <form action="/api/auth/signout" method="post" className="mt-3">
          <button className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
