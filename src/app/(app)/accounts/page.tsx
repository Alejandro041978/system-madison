import Link from "next/link";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { TemplatesPanel, type TemplateRow, type TargetRow } from "./TemplatesPanel";

export const metadata = { title: "Estados de cuenta" };
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const identity = await guardPage("accounts", "/accounts");
  const db = supabaseAdmin();
  const [templates, targets, cats, progs] = await Promise.all([
    db.from("billing_templates").select("id, name, initial_amount, installments, frequency_months, first_installment_offset_months, active").order("name"),
    db.from("billing_template_targets").select("id, template_id, program_id, category_id"),
    db.from("academic_programs_category").select("id, name").order("name"),
    db.from("academic_programs").select("id, code, name").order("name"),
  ]);

  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Estados de cuenta</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/accounts/audit" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Auditor de tuition</Link>
          <Link href="/accounts/debt" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Reporte de deuda</Link>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        El estado de cuenta de cada matrícula se abre desde su ficha (Admisión y matrícula → matrícula → «Estado de cuenta»).
        Aquí se definen las <b>plantillas de facturación</b>: cuántas cuotas, matrícula inicial y cadencia desde el primer día de la convocatoria.
        La plantilla del programa manda sobre la de la categoría.
      </p>
      <TemplatesPanel
        templates={(templates.data ?? []) as TemplateRow[]}
        targets={(targets.data ?? []) as TargetRow[]}
        categories={cats.data ?? []}
        programs={progs.data ?? []}
        canEdit={puedeEditarPagina(identity, "accounts")}
      />
    </div>
  );
}
