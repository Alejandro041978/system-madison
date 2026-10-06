import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { APP_CURRENCY } from "@/lib/config";
import { nombreCompleto } from "@/lib/students";
import { getEnrollment } from "@/lib/enrollments";
import { computeTuition } from "@/lib/tuition";
import { cargosDeMatricula, pagosDeCargos, pagadoPorCargo } from "@/lib/billing";
import { isoDate } from "@/lib/rates";
import { PlanActions } from "./PlanActions";
import { ChargesTable } from "./ChargesTable";
import { BenefitsPanel, type Beca, type Bono } from "./BenefitsPanel";

export const metadata = { title: "Estado de cuenta" };
export const dynamic = "force-dynamic";

const money = (n: number | null | undefined, cur = APP_CURRENCY) =>
  n == null ? "—" : `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2 })} ${cur}`;

export default async function AccountStatementPage({ params }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const identity = await guardPage("accounts", `/accounts/${id}`);
  const enr = await getEnrollment(id).catch(() => null);
  if (!enr) notFound();
  const db = supabaseAdmin();

  const [student, program, tuition, charges, becas, bonos] = await Promise.all([
    db.from("academic_students").select("id, first_name, last_name, second_last_name, document_number").eq("id", enr.student_id).single(),
    db.from("academic_programs").select("code, name").eq("id", enr.program_id).single(),
    computeTuition(enr),
    cargosDeMatricula(id),
    db.from("scholarships").select("id, enrollment_id, percentage, note, granted_by, granted_at, revoked_at, revoke_reason").eq("enrollment_id", id).order("granted_at", { ascending: false }),
    db.from("bonuses").select("id, enrollment_id, percentage, amount, reason, granted_by, granted_at, revoked_at, revoke_reason").eq("enrollment_id", id).order("granted_at", { ascending: false }),
  ]);
  const payments = await pagosDeCargos(charges.map((c) => c.id));
  const pagado = pagadoPorCargo(payments);

  const cur = tuition.moneda ?? APP_CURRENCY;
  const facturado = charges.reduce((s, c) => s + Number(c.amount), 0);
  const cobrado = [...pagado.values()].reduce((s, v) => s + v, 0);
  const hoy = isoDate();
  const vencido = charges.reduce((s, c) => {
    const falta = Number(c.amount) - (pagado.get(c.id) ?? 0);
    return c.due_date < hoy && falta > 0 ? s + falta : s;
  }, 0);
  const canEdit = puedeEditarPagina(identity, "accounts");
  const tienePlan = charges.some((c) => c.source === "plan");

  return (
    <div>
      <Link href={`/admissions/enrollments/${id}`} className="text-sm text-sky-700 hover:underline">← Matrícula</Link>
      <div className="mt-2 mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Estado de cuenta · {student.data ? nombreCompleto(student.data) : ""}</h1>
          <div className="text-sm text-slate-500"><span className="font-mono">{program.data?.code}</span> {program.data?.name} · matrícula del {enr.enrollment_date} · {enr.status}</div>
        </div>
        {canEdit && <PlanActions enrollmentId={id} tienePlan={tienePlan} />}
      </div>

      {tuition.sinRegistro && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          Sin registro curricular: no hay nada inscrito, la tuition es 0. Revisa la malla del programa.
        </div>
      )}
      {tuition.total == null && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          La matrícula no tiene tarifa congelada: no se puede calcular la tuition (esto no es un 0, es un dato que falta).
        </div>
      )}

      <div className="grid grid-cols-5 gap-3 mb-2">
        <Card t="Precio oficial" v={money(tuition.lista, cur)} s={`${tuition.creditos.toLocaleString("es-ES")} créditos × ${money(tuition.tarifa, cur)}`} />
        <Card t="Ahorro (convalidado)" v={money(tuition.ahorro, cur)} s={`${tuition.creditosConvalidados.toLocaleString("es-ES")} créditos`} />
        <Card t={`Beca${tuition.becaPct ? ` (${tuition.becaPct}%)` : ""}`} v={money(tuition.beca, cur)} s={tuition.becaPct ? "sobre lista − ahorro" : "sin beca activa"} />
        <Card t="Bonos" v={money(tuition.bono, cur)} s="tras la beca" />
        <Card t="Total a facturar" v={money(tuition.total, cur)} s="la cascada, una sola función" strong />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card t="Facturado" v={money(facturado, cur)} s={`${charges.length} cargos`} />
        <Card t="Pagado" v={money(cobrado, cur)} s={`${payments.filter((x) => !x.voided_at).length} pagos válidos`} />
        <Card t="Saldo" v={money(facturado - cobrado, cur)} s="facturado − pagado" />
        <Card t="Vencido" v={money(vencido, cur)} s={`a ${hoy}`} warn={vencido > 0} />
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <ChargesTable charges={charges} payments={payments} canEdit={canEdit} isSuperadmin={identity.isSuperadmin} />
        <BenefitsPanel enrollmentId={id} becas={(becas.data ?? []) as Beca[]} bonos={(bonos.data ?? []) as Bono[]} canEdit={canEdit} />
      </div>
    </div>
  );
}

function Card({ t, v, s, warn, strong }: { t: string; v: string; s: string; warn?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "bg-red-50 border-red-200" : strong ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-200"}`}>
      <div className={`text-[11px] uppercase tracking-wider ${strong ? "text-slate-300" : "text-slate-400"}`}>{t}</div>
      <div className="text-lg font-semibold">{v}</div>
      <div className={`text-xs ${strong ? "text-slate-300" : "text-slate-500"}`}>{s}</div>
    </div>
  );
}
