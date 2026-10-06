import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { editarSugerencia, aprobarSugerencia, rechazarSugerencia, SUGGESTION_COLS } from "@/lib/suggestions";
import { DomainError } from "@/lib/enrollments";

function handle(e: unknown) {
  if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

/** GET ?bot=&status= → bandeja con conteo de pendientes por bot. */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  try {
    let q = supabaseAdmin().from("supervisor_suggestions").select(SUGGESTION_COLS).order("created_at", { ascending: false });
    if (sp.get("bot")) q = q.eq("bot_key", sp.get("bot")!);
    q = q.eq("status", sp.get("status") || "pending");
    const filas = await fetchAll(q);
    const { data: pendientes } = await supabaseAdmin().from("supervisor_suggestions").select("bot_key").eq("status", "pending");
    const conteo: Record<string, number> = {};
    for (const p of pendientes ?? []) conteo[p.bot_key] = (conteo[p.bot_key] ?? 0) + 1;
    return NextResponse.json({ filas, conteo });
  } catch (e) {
    return handle(e);
  }
}

/** PUT {id, title?, recommendation?, content?, kb_topic?, kb_question?, kb_tags?} → edición (solo pending). */
export async function PUT(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  try {
    return NextResponse.json(await editarSugerencia(b.id, b));
  } catch (e) {
    return handle(e);
  }
}

/** PATCH {id, action: 'approve' | 'reject'} → decisión. Aprobar: primero aplica, luego marca. */
export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id || !["approve", "reject"].includes(b?.action)) {
    return NextResponse.json({ error: "id y action (approve|reject) son obligatorios" }, { status: 400 });
  }
  try {
    if (b.action === "reject") return NextResponse.json(await rechazarSugerencia(b.id, g.identity.email));
    const r = await aprobarSugerencia(b.id, g.identity.email);
    return NextResponse.json(r);
  } catch (e) {
    return handle(e);
  }
}
