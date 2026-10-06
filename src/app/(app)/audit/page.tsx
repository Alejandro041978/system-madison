import { guardPage } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PERMISOS_ESTRICTO } from "@/lib/audit";

export const metadata = { title: "Auditoría de permisos" };
export const dynamic = "force-dynamic";

type Row = {
  id: number; email: string | null; page_key: string | null; accion: string; metodo: string;
  ruta: string; bloqueado: boolean; motivo: string | null; created_at: string;
};

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await guardPage("audit", "/audit");
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";

  let q = supabaseAdmin().from("permission_audit").select("*").order("created_at", { ascending: false }).limit(200);
  if (email) q = q.ilike("email", `%${email}%`);
  const { data, error } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Auditoría de permisos</h1>
          <p className="text-sm text-slate-500">
            Solo se registran las decisiones que habrían denegado. Modo actual: <b>{PERMISOS_ESTRICTO ? "estricto (bloquea)" : "auditoría (deja pasar)"}</b>.
          </p>
        </div>
        <form className="flex gap-2">
          <input name="email" defaultValue={email} placeholder="Filtrar por correo" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white">Filtrar</button>
        </form>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error.message}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium">Página</th>
              <th className="px-3 py-2 font-medium">Acción</th>
              <th className="px-3 py-2 font-medium">Ruta</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleString("es-ES")}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.email ?? "—"}</td>
                <td className="px-3 py-1.5">{r.page_key ?? "—"}</td>
                <td className="px-3 py-1.5">{r.accion} <span className="text-xs text-slate-400">{r.metodo}</span></td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.ruta}</td>
                <td className="px-3 py-1.5 text-xs">{r.motivo ?? "—"}</td>
                <td className="px-3 py-1.5">
                  {r.bloqueado
                    ? <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-xs">bloqueado</span>
                    : <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs">registrado</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Sin registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
