import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { LeadsTable, type LeadRow } from "./LeadsTable";
import Link from "next/link";
import { ImportLeads } from "./ImportLeads";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const identity = await guardPage("leads", "/leads");
  const sp = await searchParams;
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  let q = supabaseAdmin().from("sales_leads")
    .select("id, bot_key, phone, name, email, program_interest, prior_studies, stage, qualified, notes, profession, age, employment, specialty_interest, consent, source, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (stage) q = q.eq("stage", stage);
  const leads = await fetchAll<LeadRow>(q);

  const conteo: Record<string, number> = {};
  if (!stage) for (const l of leads) conteo[l.stage] = (conteo[l.stage] ?? 0) + 1;

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-slate-500">Contactos que deja el bot de ventas. La etapa la mueve tu equipo comercial.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/leads/enrollments" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Fichas de inscripción</Link>
          {puedeEditarPagina(identity, "leads") && <ImportLeads />}
          <div className="text-sm text-slate-500">{leads.length} leads{stage ? ` en «${stage}»` : ""}</div>
        </div>
      </div>
      <LeadsTable rows={leads} stage={stage} conteo={conteo} canEdit={puedeEditarPagina(identity, "leads")} />
    </div>
  );
}
