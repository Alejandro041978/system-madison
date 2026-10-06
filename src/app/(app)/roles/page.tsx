import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PAGES } from "@/lib/pages";
import { RolesMatrix, type RoleRow, type PermRow } from "./RolesMatrix";

export const metadata = { title: "Roles y permisos" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const identity = await guardPage("roles", "/roles");
  const db = supabaseAdmin();
  const [roles, perms] = await Promise.all([
    db.from("roles").select("id, name, description").order("name"),
    db.from("role_permissions").select("role_id, page_key, can_view, can_edit, can_delete"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Roles y permisos</h1>
      <p className="text-sm text-slate-500 mb-6">
        Los permisos nacen en «no»: un rol nuevo no ve nada hasta que se le concede. Editar o borrar implica ver.
      </p>
      <RolesMatrix
        roles={(roles.data ?? []) as RoleRow[]}
        permissions={(perms.data ?? []) as PermRow[]}
        pages={PAGES.filter((p) => !p.publicStaff).map((p) => ({ key: p.key, label: p.label, group: p.group }))}
        canEdit={puedeEditarPagina(identity, "roles")}
      />
    </div>
  );
}
