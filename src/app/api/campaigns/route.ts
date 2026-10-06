import { NextResponse } from "next/server";

export const maxDuration = 300; // poblar/despachar colas grandes supera el límite por defecto (2026-09-23)
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { CAMPAIGN_COLS, audienciaDeCampana, poblarDestinatarios, despacharCampana, type Campaign } from "@/lib/campaigns";
import { DomainError } from "@/lib/enrollments";

function handle(e: unknown) {
  if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

/** GET → campañas con sus contadores de cola. */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  try {
    const db = supabaseAdmin();
    const campanas = await fetchAll<Campaign>(db.from("campaigns").select(CAMPAIGN_COLS).order("created_at", { ascending: false }));
    // 2026-09-24: sin paginar, PostgREST capa en 1.000 y la cola "encogía" en pantalla.
    const recs = await fetchAll<{ campaign_id: string; status: string }>(
      db.from("campaign_recipients").select("campaign_id, status").order("id"),
    );
    const stats: Record<string, Record<string, number>> = {};
    for (const r of recs ?? []) {
      const s = (stats[r.campaign_id] ??= {});
      s[r.status] = (s[r.status] ?? 0) + 1;
    }
    return NextResponse.json({ campanas, stats });
  } catch (e) { return handle(e); }
}

/** POST {name, template_id?, variables_map?, audience_filter?, pitch_notes?, daily_limit?} → crear (nace borrador). */
export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("campaigns").insert({
    name, template_id: b?.template_id || null,
    variables_map: b?.variables_map ?? {}, audience_filter: b?.audience_filter ?? {},
    pitch_notes: b?.pitch_notes?.trim() || null,
    daily_limit: Number(b?.daily_limit) >= 1 ? Math.min(1000, Number(b.daily_limit)) : 50,
    created_by: g.identity.email,
  }).select(CAMPAIGN_COLS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una campaña con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/**
 * PATCH {id, ...campos} → editar/estado. Acciones especiales:
 *  {id, action:'audience'} → tamaño de audiencia actual (ensayo, no toca nada)
 *  {id, action:'enqueue'}  → poblar la cola con la audiencia
 *  {id, action:'dispatch', dry?} → despacho manual (además del cron)
 */
export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const db = supabaseAdmin();
  try {
    if (b.action) {
      const { data: c } = await db.from("campaigns").select(CAMPAIGN_COLS).eq("id", b.id).maybeSingle();
      if (!c) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
      if (b.action === "audience") {
        const leads = await audienciaDeCampana(c as Campaign);
        return NextResponse.json({ audiencia: leads.length });
      }
      if (b.action === "enqueue") return NextResponse.json(await poblarDestinatarios(b.id));
      if (b.action === "dispatch") {
        if ((c as Campaign).status !== "activa" && !b.dry) return NextResponse.json({ error: "Solo se despacha una campaña activa" }, { status: 409 });
        return NextResponse.json(await despacharCampana(c as Campaign, !!b.dry));
      }
      return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if ("name" in b) patch.name = String(b.name).trim();
    if ("template_id" in b) patch.template_id = b.template_id || null;
    if ("variables_map" in b) patch.variables_map = b.variables_map ?? {};
    if ("audience_filter" in b) patch.audience_filter = b.audience_filter ?? {};
    if ("pitch_notes" in b) patch.pitch_notes = b.pitch_notes?.trim() || null;
    if ("daily_limit" in b) patch.daily_limit = Math.min(1000, Math.max(1, Number(b.daily_limit) || 50));
    if ("status" in b) {
      if (!["borrador", "activa", "pausada", "terminada"].includes(b.status)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      patch.status = b.status;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    if (patch.status === "activa") {
      const { data: c } = await db.from("campaigns").select("template_id").eq("id", b.id).single();
      if (!(patch.template_id ?? c?.template_id)) return NextResponse.json({ error: "No se puede activar sin plantilla" }, { status: 409 });
    }
    const { data, error } = await db.from("campaigns").update(patch).eq("id", b.id).select(CAMPAIGN_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) { return handle(e); }
}
