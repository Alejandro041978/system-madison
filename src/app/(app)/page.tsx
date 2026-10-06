import { guardPage } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const identity = await guardPage("home", "/");
  return (
    <div>
      <h1 className="text-2xl font-semibold">Hola, {identity.employee.full_name.split(" ")[0]}</h1>
      <p className="mt-2 text-slate-600">
        {identity.isSuperadmin
          ? "Tienes acceso total como superadmin."
          : identity.role
            ? `Rol: ${identity.role.name}.`
            : "Aún no tienes rol asignado; pide a administración que te lo conceda."}
      </p>
    </div>
  );
}
