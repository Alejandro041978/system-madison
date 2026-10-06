import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { StaffTable, type StaffRow, type RoleOption } from "./StaffTable";

export const metadata = { title: "Personal" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const identity = await guardPage("staff", "/staff");
  const db = supabaseAdmin();

  const [employees, roles] = await Promise.all([
    fetchAll<StaffRow>(
      db.from("hr_employees").select("id, user_id, email, full_name, role_id, is_helpdesk, active, created_at").order("full_name"),
    ),
    db.from("roles").select("id, name").order("name"),
  ]);

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Personal</h1>
          <p className="text-sm text-slate-500">
            Quien tiene ficha aquí es personal. El usuario de acceso se crea en Supabase Auth con el mismo correo.
          </p>
        </div>
        <div className="text-sm text-slate-500">{employees.length} fichas</div>
      </div>
      <StaffTable
        rows={employees}
        roles={(roles.data ?? []) as RoleOption[]}
        canEdit={puedeEditarPagina(identity, "staff")}
        canImpersonate={identity.isSuperadmin && !identity.impersonatedBy}
        selfId={identity.employee.id}
      />
    </div>
  );
}
