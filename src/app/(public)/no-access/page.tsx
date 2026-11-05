import { currentAuthUser } from "@/lib/identity";
import { pageDef, PAGE_KEYS, type PageKey } from "@/lib/pages";

export const metadata = { title: "Sin acceso" };

/**
 * Aterrizan aquí: sesiones sin ficha de colaborador (p. ej. estudiantes) y,
 * en modo estricto, personal sin permiso de ver una página.
 */
export default async function NoAccessPage({ searchParams }: PageProps<"/no-access">) {
  const sp = await searchParams;
  const auth = await currentAuthUser();
  const page = typeof sp.page === "string" && (PAGE_KEYS as string[]).includes(sp.page) ? pageDef(sp.page as PageKey) : null;

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-plum via-plum-dark to-[#2a0f36]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        {page ? (
          <p className="mt-2 text-sm text-slate-600">Tu rol no tiene permiso para ver «{page.label}».</p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Esta cuenta{auth ? ` (${auth.email})` : ""} no pertenece al personal de la institución.
          </p>
        )}
        <form action="/api/auth/signout" method="post" className="mt-6">
          <button className="text-sm text-plum hover:underline">Cerrar sesión</button>
        </form>
      </div>
    </div>
  );
}
