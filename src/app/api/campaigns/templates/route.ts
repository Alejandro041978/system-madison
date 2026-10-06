import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

const COLS = "id, key, language, content_sid, variables, bot_key, body_preview, active, created_at";

/** Plantillas de WhatsApp (los ContentSid aprobados en Twilio/Meta). */
export async function GET(req: Request) {
  const g = await guardApi(req, "campaigns");
  if (!g.ok) return g.response;
  const { data, error } = await supabaseAdmin().from("whatsapp_templates").select(COLS).order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST {key, content_sid, body_preview, language?, bot_key?} */
export async function POST(req: Request) {
  const g = await guardApi(req, "campaigns");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const key = String(b?.key ?? "").trim();
  const content_sid = String(b?.content_sid ?? "").trim();
  if (!key || !content_sid.startsWith("HX")) {
    return NextResponse.json({ error: "key y content_sid (empieza por HX, de Twilio Content) son obligatorios" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().from("whatsapp_templates").insert({
    key, content_sid, language: b?.language?.trim() || "es",
    bot_key: b?.bot_key || "ventas", body_preview: b?.body_preview?.trim() || null,
  }).select(COLS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe una plantilla con esa key e idioma para ese bot" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/** PATCH {id, ...} */
export async function PATCH(req: Request) {
  const g = await guardApi(req, "campaigns");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("key" in b) patch.key = String(b.key).trim();
  if ("content_sid" in b) patch.content_sid = String(b.content_sid).trim();
  if ("body_preview" in b) patch.body_preview = b.body_preview?.trim() || null;
  if ("language" in b) patch.language = String(b.language).trim() || "es";
  if ("active" in b) patch.active = !!b.active;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("whatsapp_templates").update(patch).eq("id", b.id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
