import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";

const COLS = "id, user_id, email, full_name, role_id, is_helpdesk, active, phone, notes, created_at, updated_at";

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  try {
    const rows = await fetchAll(supabaseAdmin().from("hr_employees").select(COLS).order("full_name"));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Alta de colaborador. El usuario de Auth se crea aparte; se enlazan por email al primer login. */
export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const full_name = String(body?.full_name ?? "").trim();
  if (!email.includes("@") || !full_name) {
    return NextResponse.json({ error: "Correo y nombre son obligatorios" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("hr_employees")
    .insert({
      email,
      full_name,
      role_id: body?.role_id || null,
      is_helpdesk: !!body?.is_helpdesk,
      phone: body?.phone || null,
      notes: body?.notes || null,
    })
    .select(COLS)
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ error: dup ? "Ya existe una ficha con ese correo" : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/** Edición con lista blanca de campos. */
export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("full_name" in body) patch.full_name = String(body.full_name).trim();
  if ("role_id" in body) patch.role_id = body.role_id || null;
  if ("is_helpdesk" in body) patch.is_helpdesk = !!body.is_helpdesk;
  if ("active" in body) patch.active = !!body.active;
  if ("phone" in body) patch.phone = body.phone || null;
  if ("notes" in body) patch.notes = body.notes || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  // Nadie se desactiva a sí mismo por error.
  if (body.id === g.identity.employee.id && patch.active === false) {
    return NextResponse.json({ error: "No puedes desactivar tu propia ficha" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from("hr_employees").update(patch).eq("id", body.id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
