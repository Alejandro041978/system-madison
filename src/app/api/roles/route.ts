import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const db = supabaseAdmin();
  const [roles, perms] = await Promise.all([
    db.from("roles").select("id, name, description, created_at").order("name"),
    db.from("role_permissions").select("role_id, page_key, can_view, can_edit, can_delete"),
  ]);
  if (roles.error) return NextResponse.json({ error: roles.error.message }, { status: 500 });
  if (perms.error) return NextResponse.json({ error: perms.error.message }, { status: 500 });
  return NextResponse.json({ roles: roles.data, permissions: perms.data });
}

export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("roles")
    .insert({ name, description: body?.description || null })
    .select()
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ error: dup ? "Ya existe un rol con ese nombre" : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("name" in body) patch.name = String(body.name).trim();
  if ("description" in body) patch.description = body.description || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("roles").update(patch).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
