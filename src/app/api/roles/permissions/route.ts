import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PAGE_KEYS } from "@/lib/pages";

/**
 * PUT {role_id, page_key, can_view, can_edit, can_delete} → upsert.
 * Editar o borrar implica ver: se normaliza aquí para que la matriz nunca
 * quede incoherente (can_edit sin can_view).
 */
export async function PUT(req: Request) {
  const g = await guardApi(req, "roles");
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!body?.role_id || !(PAGE_KEYS as string[]).includes(body?.page_key)) {
    return NextResponse.json({ error: "role_id y page_key válidos son obligatorios" }, { status: 400 });
  }
  const can_edit = !!body.can_edit;
  const can_delete = !!body.can_delete;
  const can_view = !!body.can_view || can_edit || can_delete;

  const { data, error } = await supabaseAdmin()
    .from("role_permissions")
    .upsert(
      { role_id: body.role_id, page_key: body.page_key, can_view, can_edit, can_delete },
      { onConflict: "role_id,page_key" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
