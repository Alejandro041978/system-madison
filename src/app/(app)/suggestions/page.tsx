import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { SUGGESTION_COLS, type Suggestion } from "@/lib/suggestions";
import { SuggestionsPanel } from "./SuggestionsPanel";

export const metadata = { title: "Mejora continua" };
export const dynamic = "force-dynamic";

export default async function SuggestionsPage({ searchParams }: PageProps<"/suggestions">) {
  const identity = await guardPage("bot_suggestions", "/suggestions");
  const sp = await searchParams;
  const db = supabaseAdmin();
  const bot = typeof sp.bot === "string" ? sp.bot : "";
  const status = typeof sp.status === "string" && ["pending", "approved", "rejected"].includes(sp.status) ? sp.status : "pending";

  let q = db.from("supervisor_suggestions").select(SUGGESTION_COLS).eq("status", status).order("created_at", { ascending: false });
  if (bot) q = q.eq("bot_key", bot);
  const [filas, pendientes, bots] = await Promise.all([
    fetchAll<Suggestion>(q),
    db.from("supervisor_suggestions").select("bot_key").eq("status", "pending"),
    db.from("bots").select("key, name").order("key"),
  ]);
  const conteo: Record<string, number> = {};
  for (const p of pendientes.data ?? []) conteo[p.bot_key] = (conteo[p.bot_key] ?? 0) + 1;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Mejora continua</h1>
      <p className="text-sm text-slate-500 mb-6">
        El supervisor propone; tú revisas, corriges y decides. Aprobar <b>primero aplica</b> (viñeta de prompt con versión nueva, o artículo indexado) <b>y luego marca</b>; si la aplicación falla, la sugerencia sigue pendiente.
      </p>
      <SuggestionsPanel
        filas={filas}
        bots={(bots.data ?? []) as { key: string; name: string }[]}
        conteo={conteo}
        bot={bot}
        status={status}
        canEdit={puedeEditarPagina(identity, "bot_suggestions")}
      />
    </div>
  );
}
