import Link from "next/link";
import { guardPage } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata = { title: "Reportes del supervisor" };
export const dynamic = "force-dynamic";

type Reporte = {
  id: string; report_date: string; bot_key: string; conversations_analyzed: number; total_messages: number;
  status: string; executive_summary: string | null; strengths: string[]; weaknesses: string[];
  recommendations: string[]; knowledge_gaps: string[]; quality_score: number | null;
};

export default async function ReportsPage({ searchParams }: PageProps<"/bots/reports">) {
  await guardPage("bots", "/bots/reports");
  const sp = await searchParams;
  const db = supabaseAdmin();
  const abierto = typeof sp.r === "string" ? sp.r : "";

  const { data } = await db.from("supervisor_reports")
    .select("id, report_date, bot_key, conversations_analyzed, total_messages, status, executive_summary, strengths, weaknesses, recommendations, knowledge_gaps, quality_score")
    .order("report_date", { ascending: false }).order("bot_key").limit(120);
  const reportes = (data ?? []) as Reporte[];
  const sel = reportes.find((r) => r.id === abierto) ?? null;

  const score = (n: number | null) =>
    n == null ? "—" : <span className={`font-semibold ${n >= 7 ? "text-emerald-700" : n >= 5 ? "text-amber-700" : "text-red-700"}`}>{Number(n).toFixed(1)}</span>;

  return (
    <div>
      <Link href="/bots" className="text-sm text-sky-700 hover:underline">← Bots</Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">Reportes del supervisor</h1>
      <p className="text-sm text-slate-500 mb-4">El evaluador analiza cada noche las conversaciones del día anterior. Sus sugerencias se aprueban en Mejora continua (Módulo 6).</p>

      <div className="grid grid-cols-[360px_1fr] gap-5">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
          {reportes.map((r) => (
            <Link key={r.id} href={`/bots/reports?r=${r.id}`}
              className={`block px-4 py-2 border-b border-slate-100 last:border-0 text-sm hover:bg-slate-50 ${r.id === abierto ? "bg-sky-50" : ""}`}>
              <div className="flex justify-between">
                <span className="font-medium">{r.bot_key}</span>
                <span>{score(r.quality_score)}</span>
              </div>
              <div className="text-xs text-slate-500">
                {r.report_date} · {r.status === "ok" ? `${r.conversations_analyzed} conv. / ${r.total_messages} msgs` : r.status.replace("_", " ")}
              </div>
            </Link>
          ))}
          {reportes.length === 0 && <div className="px-4 py-6 text-sm text-slate-400">Aún no hay reportes: el cron corre cada noche a las 04:30, o se puede lanzar a mano.</div>}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 max-h-[70vh] overflow-y-auto">
          {sel ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{sel.bot_key} · {sel.report_date}</h2>
                <div>Nota: {score(sel.quality_score)} / 10</div>
              </div>
              {sel.executive_summary && <p className="text-slate-700">{sel.executive_summary}</p>}
              <Bloque titulo="Fortalezas" items={sel.strengths} cls="text-emerald-800" />
              <Bloque titulo="Debilidades" items={sel.weaknesses} cls="text-red-800" />
              <Bloque titulo="Recomendaciones" items={sel.recommendations} cls="text-slate-800" />
              <Bloque titulo="Huecos de conocimiento" items={sel.knowledge_gaps} cls="text-amber-800" />
            </div>
          ) : (
            <div className="text-sm text-slate-400">Elige un reporte.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloque({ titulo, items, cls }: { titulo: string; items: string[]; cls: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">{titulo}</div>
      <ul className={`list-disc pl-5 space-y-0.5 ${cls}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
