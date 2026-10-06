import Link from "next/link";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { VersionsPanel, type VersionRow } from "./VersionsPanel";

export const metadata = { title: "Versiones del prompt" };
export const dynamic = "force-dynamic";

export default async function VersionsPage({ searchParams }: PageProps<"/bots/versions">) {
  const identity = await guardPage("bots", "/bots/versions");
  const sp = await searchParams;
  const db = supabaseAdmin();
  const { data: bots } = await db.from("bots").select("key, name").order("key");
  const bot = typeof sp.bot === "string" && (bots ?? []).some((b) => b.key === sp.bot) ? (sp.bot as string) : (bots?.[0]?.key ?? "");
  const { data: versiones } = await db
    .from("bot_prompt_versions")
    .select("id, bot_key, version, prompt, reason, created_by, created_at")
    .eq("bot_key", bot).order("version", { ascending: false }).limit(100);

  return (
    <div>
      <Link href="/bots" className="text-sm text-sky-700 hover:underline">← Bots</Link>
      <div className="mt-2 mb-4 flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Versiones del prompt</h1>
        <div className="flex gap-2 text-sm">
          {(bots ?? []).map((b) => (
            <Link key={b.key} href={`/bots/versions?bot=${b.key}`}
              className={`rounded-full px-3 py-1 border ${bot === b.key ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>{b.name}</Link>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">La historia nunca se reescribe: restaurar crea una versión nueva con el contenido antiguo.</p>
      <VersionsPanel versiones={(versiones ?? []) as VersionRow[]} canEdit={puedeEditarPagina(identity, "bots")} />
    </div>
  );
}
