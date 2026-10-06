import Link from "next/link";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { KNOWLEDGE_COLS, type Articulo } from "@/lib/knowledge";
import { BotsPanel, type BotRow } from "./BotsPanel";

export const metadata = { title: "Bots" };
export const dynamic = "force-dynamic";

export default async function BotsPage({ searchParams }: PageProps<"/bots">) {
  const identity = await guardPage("bots", "/bots");
  const sp = await searchParams;
  const db = supabaseAdmin();
  const { data: bots } = await db.from("bots").select("key, name, role, prompt, twilio_number, active").order("key");
  const selected = typeof sp.bot === "string" && (bots ?? []).some((b) => b.key === sp.bot) ? (sp.bot as string) : (bots?.[0]?.key ?? "");
  const articulos = selected
    ? await fetchAll<Articulo>(db.from("knowledge").select(KNOWLEDGE_COLS).eq("bot_key", selected).order("category").order("title"))
    : [];

  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Bots</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/bots/versions" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Versiones del prompt</Link>
          <Link href="/bots/conversations" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Conversaciones</Link>
          <Link href="/bots/reports" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Reportes del supervisor</Link>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Un bot por número de WhatsApp. El prompt vigente se edita aquí (el versionado con aprobación llega con Mejora continua).
        Las credenciales de Twilio viven en variables de entorno, nunca en esta pantalla.
      </p>
      <BotsPanel bots={(bots ?? []) as BotRow[]} selected={selected} articulos={articulos} canEdit={puedeEditarPagina(identity, "bots")} />
    </div>
  );
}
