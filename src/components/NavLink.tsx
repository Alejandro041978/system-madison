"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Enlace del sidebar con estado activo por ruta (la raíz solo coincide exacta). */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activo = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        activo ? "bg-white/15 text-white font-medium shadow-[inset_3px_0_0_0_var(--color-brand)]" : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
