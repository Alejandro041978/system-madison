import { redirect } from "next/navigation";
import { resolveIdentity, currentAuthUser } from "@/lib/identity";
import { Sidebar } from "@/components/Sidebar";
import { PERMISOS_ESTRICTO } from "@/lib/audit";

/**
 * Layout de gestión: exige ficha de colaborador. Un estudiante con sesión
 * (sin ficha) va a /no-access y no ve ni el sidebar.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const identity = await resolveIdentity();
  if (!identity) {
    const auth = await currentAuthUser();
    redirect(auth ? "/no-access" : "/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar identity={identity} />
      <div className="flex-1 flex flex-col min-w-0">
        {identity.impersonatedBy && (
          <div className="bg-amber-100 text-amber-900 text-sm px-6 py-2 border-b border-amber-200">
            Estás viendo como <b>{identity.employee.full_name}</b> ({identity.email}). Solo lectura; cada acción queda auditada.
          </div>
        )}
        {!PERMISOS_ESTRICTO && (
          <div className="bg-slate-100 text-slate-600 text-xs px-6 py-1 border-b border-slate-200">
            Permisos en modo auditoría: las denegaciones se registran pero no bloquean.
          </div>
        )}
        <main className="flex-1 p-8 max-w-6xl w-full">{children}</main>
      </div>
    </div>
  );
}
