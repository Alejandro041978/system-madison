import Link from "next/link";
import { guardPage } from "@/lib/api-guard";
import { metricasVentas, type SerieDia } from "@/lib/performance";

export const metadata = { title: "Desempeño de ventas" };
export const dynamic = "force-dynamic";

const ETAPAS = ["nuevo", "contactable", "calificado", "interesado", "inscrito", "descartado"] as const;
const COLOR_ETAPA: Record<string, string> = {
  nuevo: "bg-slate-400", contactable: "bg-sky-500", calificado: "bg-violet-500",
  interesado: "bg-amber-500", inscrito: "bg-emerald-600", descartado: "bg-red-400",
};

export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  await guardPage("performance", "/performance");
  const sp = await searchParams;
  const dias = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const m = await metricasVentas(dias);
  const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)} %` : "—";

  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <h1 className="text-2xl font-semibold">Desempeño del agente de ventas</h1>
        <div className="flex gap-2 text-sm">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/performance?days=${d}`}
              className={`rounded-full px-3 py-1 border ${dias === d ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-300"}`}>{d} días</Link>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-5">Desde el {m.desde}. Ana atiende, califica y cierra; aquí se ve cuánto y cómo.</p>

      {!m.embudoCierra && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 font-medium">
          El embudo NO cierra por identidad (total ≠ suma de etapas): hay un dato roto. Revisar antes de usar estas cifras.
        </div>
      )}

      <div className="grid grid-cols-5 gap-3 mb-6">
        <Card t="Conversaciones" v={String(m.conversacionesPeriodo)}
          s={`${m.conversacionesDeCampana} de campaña · ${m.conversacionesEntrantes} entrantes · ${m.mensajesCliente} mensajes de prospectos`} />
        <Card t="Leads nuevos" v={String(m.leadsNuevosPeriodo)} s={`${m.leadsTotal.toLocaleString("es-ES")} en cartera`} />
        <Card t="Interesados" v={String(m.leadsPorEtapa.interesado ?? 0)} s={`${pct(m.leadsPorEtapa.interesado ?? 0, m.leadsTotal)} de la cartera`} />
        <Card t="Inscritos" v={String(m.leadsPorEtapa.inscrito ?? 0)} s={`fichas pagadas: ${m.fichas.pagadas}`} strong />
        <Card t="Nota del supervisor" v={m.ultimaNota != null ? `${m.ultimaNota.toFixed(1)}` : "—"} s={m.notas.length ? `${m.notas.length} evaluaciones en el periodo` : "sin evaluaciones aún"}
          warn={m.ultimaNota != null && m.ultimaNota < 5} />
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        <Panel titulo={`Conversaciones por día (el prospecto escribió)`}>
          <Barras serie={m.conversacionesPorDia} clase="bg-sky-500" />
        </Panel>
        <Panel titulo={`Leads nuevos por día`}>
          <Barras serie={m.leadsNuevosPorDia} clase="bg-violet-500" />
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        <Panel titulo="Embudo de la cartera">
          <div className="space-y-2">
            {ETAPAS.map((e) => {
              const n = m.leadsPorEtapa[e] ?? 0;
              const w = m.leadsTotal > 0 ? Math.max(1, Math.round((n / m.leadsTotal) * 100)) : 0;
              return (
                <div key={e} className="flex items-center gap-2 text-sm">
                  <div className="w-24 capitalize text-slate-600">{e}</div>
                  <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                    <div className={`h-5 ${COLOR_ETAPA[e]}`} style={{ width: `${w}%` }} />
                  </div>
                  <div className="w-16 text-right font-medium">{n.toLocaleString("es-ES")}</div>
                </div>
              );
            })}
            <div className="text-xs text-slate-400 pt-1">Identidad: {m.leadsTotal.toLocaleString("es-ES")} = suma de etapas {m.embudoCierra ? "✓" : "✗"}</div>
          </div>
        </Panel>

        <Panel titulo="Fichas de inscripción (histórico)">
          <div className="space-y-2 text-sm">
            <FilaFicha label="Enviadas por Ana" n={m.fichas.enviadas} base={m.fichas.enviadas} />
            <FilaFicha label="Completadas" n={m.fichas.completadas} base={m.fichas.enviadas} />
            <FilaFicha label="Pagadas" n={m.fichas.pagadas} base={m.fichas.enviadas} destaca />
            <FilaFicha label="Formalizadas en Admisión" n={m.fichas.formalizadas} base={m.fichas.enviadas} />
            {m.fichas.anuladas > 0 && <div className="text-xs text-slate-400">{m.fichas.anuladas} anuladas</div>}
            <div className="text-xs text-slate-400 pt-1">Conversión enviada → pagada: {pct(m.fichas.pagadas, m.fichas.enviadas)}</div>
          </div>
        </Panel>
      </div>

      <div className="mb-5">
        <Panel titulo="Campañas salientes · entrega y respuesta">
          {m.campanas.length === 0 ? <div className="text-sm text-slate-400">Sin campañas todavía.</div> : (
            <div className="space-y-5">
              {!m.entregaDisponible && (
                <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
                  Aún no se conoce el estado de entrega (falta ejecutar <code>supabase/012_delivery_status.sql</code>). Los vistos aparecerán aquí al ejecutarlo.
                </div>
              )}
              {m.campanas.map((c) => (
                <div key={c.name}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-sm font-medium">{c.name} <span className="text-xs font-normal text-slate-400">({c.status})</span></div>
                    <div className="text-xs text-slate-500">
                      {c.enviados.toLocaleString("es-ES")} enviados · {c.pendientes.toLocaleString("es-ES")} en cola
                      {c.errores > 0 && <span className="text-red-600"> · {c.errores} rechazados al enviar</span>}
                    </div>
                  </div>
                  {c.entrega && !c.entrega.cierra && (
                    <div className="mb-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 font-medium">
                      La entrega NO cierra por identidad (enviados ≠ suma de estados): hay un dato roto.
                    </div>
                  )}
                  <div className="grid grid-cols-6 gap-2">
                    <Visto icono="✓✓" azul t="Leídos" n={c.entrega?.leidos ?? null} base={c.enviados} nota="vistos azules o respondió (mínimo)" />
                    <Visto icono="✓✓" t="Entregados" n={c.entrega?.entregados ?? null} base={c.enviados} nota="dos vistos, sin confirmar lectura" />
                    <Visto icono="✓" t="Un visto" n={c.entrega?.unVisto ?? null} base={c.enviados} nota="salió, aún no llegó al teléfono" />
                    <Visto icono="✕" rojo t="No entregados" n={c.entrega?.noEntregados ?? null} base={c.enviados} nota="WhatsApp no lo entregó" />
                    <Visto icono="↩" verde t="Respondieron" n={c.respondidos} base={c.enviados}
                      nota={c.entrega?.tasaSobreEntregados != null ? `${c.entrega.tasaSobreEntregados} % de los entregados` : "del total enviado"} />
                    <Visto icono="…" t="Sin respuesta" n={c.sinRespuesta} base={c.enviados} nota="solo nuestro mensaje" />
                  </div>
                  {c.entrega && c.entrega.sinEstado > 0 && (
                    <div className="text-xs text-amber-700 mt-2">
                      {c.entrega.sinEstado.toLocaleString("es-ES")} envíos todavía sin estado de entrega: se consultan a Twilio cada hora (minuto 30). No están contados en ninguna casilla de vistos.
                    </div>
                  )}
                  {c.entrega && c.entrega.motivosNoEntrega.length > 0 && (
                    <div className="text-xs text-slate-500 mt-2">
                      Motivos de no entrega: {c.entrega.motivosNoEntrega.map((x) => `${x.n} · ${MOTIVO_NO_ENTREGA[x.codigo] ?? `código ${x.codigo}`}`).join("  |  ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div>
        <Panel titulo="Nota del supervisor (serie)">
          {m.notas.length === 0 ? (
            <div className="text-sm text-slate-400">Sin evaluaciones en el periodo: el supervisor evalúa cada madrugada los días con conversaciones.</div>
          ) : (
            <div className="flex items-end gap-1 h-28">
              {m.notas.map((n) => (
                <div key={n.dia} className="flex-1 flex flex-col items-center gap-1" title={`${n.dia}: ${n.nota}`}>
                  <div className={`w-full rounded-t ${n.nota >= 7 ? "bg-emerald-500" : n.nota >= 5 ? "bg-amber-400" : "bg-red-400"}`} style={{ height: `${Math.max(4, n.nota * 10)}%` }} />
                  <div className="text-[9px] text-slate-400">{n.dia.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// Códigos de Twilio vistos en los primeros 500 envíos (2026-10-02).
const MOTIVO_NO_ENTREGA: Record<string, string> = {
  "63024": "número sin WhatsApp o no válido (63024)",
  "63049": "Meta limitó el mensaje de marketing a ese usuario (63049)",
  "63032": "limitación de WhatsApp para ese usuario (63032)",
};

function Visto({ icono, t, n, base, nota, azul, rojo, verde }: { icono: string; t: string; n: number | null; base: number; nota: string; azul?: boolean; rojo?: boolean; verde?: boolean }) {
  const color = azul ? "text-sky-500" : rojo ? "text-red-500" : verde ? "text-emerald-600" : "text-slate-400";
  return (
    <div className={`rounded-lg border p-3 ${rojo && (n ?? 0) > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400"><span className={`${color} font-semibold mr-1`}>{icono}</span>{t}</div>
      <div className="text-2xl font-semibold">{n == null ? "—" : n.toLocaleString("es-ES")}</div>
      <div className="text-xs text-slate-500">{n != null && base > 0 ? `${Math.round((n / base) * 100)} % · ` : ""}{nota}</div>
    </div>
  );
}

function Card({ t, v, s, warn, strong }: { t: string; v: string; s: string; warn?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "bg-red-50 border-red-200" : strong ? "bg-[#0f2a44] text-white border-[#0f2a44]" : "bg-white border-slate-200"}`}>
      <div className={`text-[11px] uppercase tracking-wider ${strong ? "text-slate-300" : "text-slate-400"}`}>{t}</div>
      <div className="text-2xl font-semibold">{v}</div>
      <div className={`text-xs ${strong ? "text-slate-300" : "text-slate-500"}`}>{s}</div>
    </div>
  );
}

function FilaFicha({ label, n, base, destaca }: { label: string; n: number; base: number; destaca?: boolean }) {
  const w = base > 0 ? Math.max(2, Math.round((n / base) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-44 text-slate-600">{label}</div>
      <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
        <div className={`h-5 ${destaca ? "bg-emerald-600" : "bg-[#0f2a44]"}`} style={{ width: `${w}%`, opacity: destaca ? 1 : 0.75 }} />
      </div>
      <div className="w-10 text-right font-medium">{n}</div>
    </div>
  );
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-sm font-medium mb-3">{titulo}</div>
      {children}
    </div>
  );
}

function Barras({ serie, clase }: { serie: SerieDia[]; clase: string }) {
  const max = Math.max(1, ...serie.map((s) => s.valor));
  const paso = Math.max(1, Math.floor(serie.length / 10));
  return (
    <div>
      <div className="flex items-end gap-px h-24">
        {serie.map((s) => (
          <div key={s.dia} className="flex-1 group relative" title={`${s.dia}: ${s.valor}`}>
            <div className={`${clase} rounded-t w-full`} style={{ height: `${Math.max(s.valor > 0 ? 6 : 2, (s.valor / max) * 96)}px`, opacity: s.valor > 0 ? 1 : 0.15 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-slate-400 mt-1">
        {serie.filter((_, i) => i % paso === 0).map((s) => <span key={s.dia}>{s.dia.slice(5)}</span>)}
      </div>
    </div>
  );
}
