import Link from "next/link";
import { guardPage } from "@/lib/api-guard";
import { reporteDeuda } from "@/lib/tuition-audit";

export const metadata = { title: "Reporte de deuda" };
export const dynamic = "force-dynamic";

const money = (n: number) => Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 });

export default async function DebtReportPage() {
  await guardPage("accounts", "/accounts/debt");
  const r = await reporteDeuda();

  return (
    <div>
      <Link href="/accounts" className="text-sm text-sky-700 hover:underline">← Estados de cuenta</Link>
      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-semibold">Reporte de deuda</h1>
        <p className="text-sm text-slate-500">Matrículas vivas con cargos, ordenadas por vencido y saldo.</p>
      </div>

      {!r.cierra && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 font-medium">
          El reporte NO cierra por identidad (facturado − pagado ≠ saldo): hay un dato roto, no un redondeo. Revisar antes de usar estas cifras.
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card t="Facturado" v={money(r.totales.facturado)} />
        <Card t="Pagado" v={money(r.totales.pagado)} />
        <Card t="Saldo" v={money(r.totales.saldo)} />
        <Card t="Vencido" v={money(r.totales.vencido)} warn={r.totales.vencido > 0} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Estudiante</th>
              <th className="px-4 py-2 font-medium">Programa</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium text-right">Facturado</th>
              <th className="px-4 py-2 font-medium text-right">Pagado</th>
              <th className="px-4 py-2 font-medium text-right">Saldo</th>
              <th className="px-4 py-2 font-medium text-right">Vencido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.filas.map((f) => (
              <tr key={f.enrollment_id} className={f.vencido > 0 ? "bg-red-50/40" : ""}>
                <td className="px-4 py-2"><Link href={`/accounts/${f.enrollment_id}`} className="font-medium text-sky-800 hover:underline">{f.student}</Link></td>
                <td className="px-4 py-2 text-slate-600">{f.program}</td>
                <td className="px-4 py-2 text-slate-600">{f.categoria}</td>
                <td className="px-4 py-2 text-right">{money(f.facturado)}</td>
                <td className="px-4 py-2 text-right">{money(f.pagado)}</td>
                <td className="px-4 py-2 text-right font-medium">{money(f.saldo)}</td>
                <td className={`px-4 py-2 text-right ${f.vencido > 0 ? "text-red-700 font-semibold" : "text-slate-400"}`}>
                  {money(f.vencido)}{f.cuotasVencidas > 0 && <span className="text-xs font-normal"> ({f.cuotasVencidas})</span>}
                </td>
              </tr>
            ))}
            {r.filas.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Sin matrículas con cargos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ t, v, warn }: { t: string; v: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{t}</div>
      <div className="text-lg font-semibold">{v} €</div>
    </div>
  );
}
