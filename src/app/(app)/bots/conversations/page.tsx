import Link from "next/link";
import { guardPage } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SesionMsg } from "@/lib/bots/engine";

export const metadata = { title: "Conversaciones" };
export const dynamic = "force-dynamic";

type Conv = { session_id: string; bot_key: string; messages: SesionMsg[]; message_count: number; contact_email: string | null; updated_at: string };

export default async function ConversationsPage({ searchParams }: PageProps<"/bots/conversations">) {
  await guardPage("bots", "/bots/conversations");
  const sp = await searchParams;
  const db = supabaseAdmin();
  const bot = typeof sp.bot === "string" ? sp.bot : "";
  const abierta = typeof sp.s === "string" ? sp.s : "";

  let q = db.from("bot_conversations").select("session_id, bot_key, messages, message_count, contact_email, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (bot) q = q.eq("bot_key", bot);
  const { data } = await q;
  const convs = (data ?? []) as Conv[];
  const seleccionada = convs.find((c) => c.session_id === abierta) ?? null;
  const { data: bots } = await db.from("bots").select("key, name").order("key");

  return (
    <div>
      <Link href="/bots" className="text-sm text-sky-700 hover:underline">← Bots</Link>
      <div className="mt-2 mb-4 flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Conversaciones</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/bots/conversations" className={`rounded-full px-3 py-1 border ${!bot ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>Todos</Link>
          {(bots ?? []).map((b) => (
            <Link key={b.key} href={`/bots/conversations?bot=${b.key}`}
              className={`rounded-full px-3 py-1 border ${bot === b.key ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>{b.name}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[380px_1fr] gap-5">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
          {convs.map((c) => (
            <Link key={c.session_id} href={`/bots/conversations?${bot ? `bot=${bot}&` : ""}s=${encodeURIComponent(c.session_id)}`}
              className={`block px-4 py-2 border-b border-slate-100 last:border-0 text-sm hover:bg-slate-50 ${c.session_id === abierta ? "bg-sky-50" : ""}`}>
              <div className="font-mono text-xs">{c.session_id}</div>
              <div className="text-xs text-slate-500">{c.message_count} mensajes · {new Date(c.updated_at).toLocaleString("es-ES")}{c.contact_email ? ` · ${c.contact_email}` : ""}</div>
            </Link>
          ))}
          {convs.length === 0 && <div className="px-4 py-6 text-sm text-slate-400">Sin conversaciones.</div>}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 max-h-[70vh] overflow-y-auto">
          {seleccionada ? (
            <div className="space-y-2">
              {seleccionada.messages.map((m, i) => (
                <div key={i} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-slate-100" : "bg-sky-50 ml-auto"}`}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">{m.role === "user" ? "cliente" : "bot"} · {m.at ? new Date(m.at).toLocaleString("es-ES") : ""}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">Elige una conversación.</div>
          )}
        </div>
      </div>
    </div>
  );
}
