import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { versionarPrompt } from "@/lib/suggestions";

const COLS = "key, name, role, prompt, twilio_number, active, created_at, updated_at";

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const { data, error } = await supabaseAdmin().from("bots").select(COLS).order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * PATCH {key, name?, prompt?, twilio_number?, active?}.
 * El prompt vigente se edita aquí hasta que el Módulo 6 traiga el
 * versionado con aprobación; el rol y la key no se cambian.
 */
export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.key) return NextResponse.json({ error: "Falta key" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = String(b.name).trim();
  if ("prompt" in b) patch.prompt = String(b.prompt);
  if ("twilio_number" in b) patch.twilio_number = b.twilio_number ? String(b.twilio_number).trim() : null;
  if ("active" in b) patch.active = !!b.active;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  // Versionado obligatorio (Módulo 6): editar el prompt crea una versión.
  if (typeof patch.prompt === "string") {
    try {
      await versionarPrompt(b.key, patch.prompt, "edición manual", g.identity.email);
      delete patch.prompt; // versionarPrompt ya dejó bots.prompt vigente
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
    if (Object.keys(patch).length === 0) {
      const { data } = await supabaseAdmin().from("bots").select(COLS).eq("key", b.key).single();
      return NextResponse.json(data);
    }
  }
  const { data, error } = await supabaseAdmin().from("bots").update(patch).eq("key", b.key).select(COLS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ese número ya está asignado a otro bot" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
