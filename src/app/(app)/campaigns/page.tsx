import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { CAMPAIGN_COLS, type Campaign } from "@/lib/campaigns";
import { CampaignsPanel, type TemplateRow } from "./CampaignsPanel";

export const metadata = { title: "Campañas" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const identity = await guardPage("campaigns", "/campaigns");
  const db = supabaseAdmin();
  const [campanas, templates, recs, perfiles] = await Promise.all([
    fetchAll<Campaign>(db.from("campaigns").select(CAMPAIGN_COLS).order("created_at", { ascending: false })),
    db.from("whatsapp_templates").select("id, key, language, content_sid, bot_key, body_preview, active").order("key"),
    fetchAll<{ campaign_id: string; status: string }>(db.from("campaign_recipients").select("campaign_id, status").order("id")),
    db.from("sales_leads").select("profession, specialty_interest").eq("consent", true),
  ]);
  const stats: Record<string, Record<string, number>> = {};
  for (const r of recs) {
    const s = (stats[r.campaign_id] ??= {});
    s[r.status] = (s[r.status] ?? 0) + 1;
  }
  const opciones = {
    profession: [...new Set((perfiles.data ?? []).map((x) => x.profession).filter(Boolean))].sort() as string[],
    specialty_interest: [...new Set((perfiles.data ?? []).map((x) => x.specialty_interest).filter(Boolean))].sort() as string[],
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Campañas salientes</h1>
      <p className="text-sm text-slate-500 mb-6">
        Una plantilla aprobada de WhatsApp abre la conversación; el bot de ventas la continúa con el perfil del contacto.
        Solo se envía a contactos con consentimiento, con tope diario por campaña. El despacho corre cada hora (09–19 UTC).
      </p>
      <CampaignsPanel
        campanas={campanas}
        templates={(templates.data ?? []) as TemplateRow[]}
        stats={stats}
        opciones={opciones}
        canEdit={puedeEditarPagina(identity, "campaigns")}
      />
    </div>
  );
}
