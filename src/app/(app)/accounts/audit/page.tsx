import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { guardPage } from "@/lib/api-guard";
import { auditarTuition } from "@/lib/tuition-audit";

export const metadata = { title: "Auditor de tuition" };
export const dynamic = "force-dynamic";

const money = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 });
const PROBLEMA: Record<string, string> = {
  sin_registro_curricular: "Sin registro curricular",
  sin_tarifa: "Sin tarifa",
  sin_plan: "Sin plan de cuotas",
  descuadre: "Descuadre",
};

export default async function TuitionAuditPage() {
  await guardPage("accounts", "/accounts/audit");
  const audit = await auditarTuition();
  const problemas = audit.filas.filter((f) => f.problema !== "ok");

  return (
    <div>
      <Link href="/accounts" className="text-sm text-sky-700 hover:underline">← Estados de cuenta</Link>
      <div className="mt-2 mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Auditor de tuition</h1>
          <p className="text-sm text-slate-500">Esperado (la misma cascada del estado de cuenta) vs facturado, por matrícula viva. El auditor reporta; no corrige.</p>
        </div>
        <div className="text-sm">
          <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5">{audit.totales.ok} ok</span>
          <span className={`ml-2 rounded px-2 py-0.5 ${audit.totales.problemas ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-500"}`}>{audit.totales.problemas} con problema</span>
        </div>
      </div>

      <div className="mb-6 bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium text-right">Matrículas</th>
              <th className="px-4 py-2 font-medium text-right">Esperado</th>
              <th className="px-4 py-2 font-medium text-right">Facturado</th>
              <th className="px-4 py-2 font-medium text-right">Pagado</th>
              <th className="px-4 py-2 font-medium text-right">Problemas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {audit.porCategoria.map((c) => (
              <tr key={c.categoria} className={Math.abs(c.esperado - c.facturado) > 0.01 || c.problemas > 0 ? "bg-red-50/40" : ""}>
                <td className="px-4 py-2 font-medium">{c.categoria}</td>
                <td className="px-4 py-2 text-right">{c.matriculas}</td>
                <td className="px-4 py-2 text-right">{money(c.esperado)}</td>
                <td className={`px-4 py-2 text-right ${Math.abs(c.esperado - c.facturado) > 0.01 ? "text-red-700 font-semibold" : ""}`}>{money(c.facturado)}</td>
                <td className="px-4 py-2 text-right">{money(c.pagado)}</td>
                <td className={`px-4 py-2 text-right ${c.problemas ? "text-red-700 font-semibold" : "text-slate-400"}`}>{c.problemas}</td>
              </tr>
            ))}
            {audit.porCategoria.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin matrículas vivas.</td></tr>}
          </tbody>
        </table>
      </div>

      {problemas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium">Matrículas con problema</div>
          <ul className="divide-y divide-slate-100 text-sm">
            {problemas.map((f) => (
              <li key={f.enrollment_id} className="px-4 py-2 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <Link href={`/accounts/${f.enrollment_id}`} className="font-medium text-sky-800 hover:underline">{f.student}</Link>
                  <span className="ml-2 text-slate-500">{f.program}</span>
                  <span className="ml-2 rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-xs">{PROBLEMA[f.problema]}</span>
                  <div className="text-xs text-slate-600">{f.detalle}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
