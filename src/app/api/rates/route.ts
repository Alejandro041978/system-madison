import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { APP_CURRENCY } from "@/lib/config";
import { historialTarifas } from "@/lib/rates";

/**
 * Tarifario inmutable por versiones.
 *  GET    ?program_id= | ?category_id=        → historial
 *  POST   {program_id|category_id, price_per_credit, currency?, effective_from, note?} → versión nueva
 *  DELETE {id}                                 → solo versiones que ninguna matrícula usó (lo impone el trigger, 003)
 * No hay PATCH a propósito: un cambio de precio es una versión nueva.
 */

export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const program_id = sp.get("program_id") ?? undefined;
  const category_id = sp.get("category_id") ?? undefined;
  if (!program_id && !category_id) return NextResponse.json({ error: "Indica program_id o category_id" }, { status: 400 });
  try {
    return NextResponse.json(await historialTarifas({ program_id, category_id }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const program_id = b?.program_id || null;
  const category_id = b?.category_id || null;
  const price = Number(b?.price_per_credit);
  const effective_from = String(b?.effective_from ?? "").slice(0, 10);
  if ((!program_id && !category_id) || (program_id && category_id)) {
    return NextResponse.json({ error: "La tarifa es de un programa O de una categoría" }, { status: 400 });
  }
  if (Number.isNaN(price) || price < 0) return NextResponse.json({ error: "Precio por crédito inválido" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective_from)) return NextResponse.json({ error: "Fecha de vigencia inválida (YYYY-MM-DD)" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("credit_rates")
    .insert({
      program_id, category_id, price_per_credit: price,
      currency: String(b?.currency || APP_CURRENCY).toUpperCase().slice(0, 3),
      effective_from, note: b?.note || null, created_by: g.identity.email,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya hay una versión con esa fecha de vigencia" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  // Mirar antes de borrar. La regla "solo si ninguna matrícula la usó" la
  // impone el trigger (003_credit_rates_delete.sql) y deja copia en
  // credit_rates_deleted; aquí solo completamos quién borró.
  const db = supabaseAdmin();
  const { data: row } = await db.from("credit_rates").select("id, effective_from, price_per_credit").eq("id", b.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  const { error } = await db.from("credit_rates").delete().eq("id", b.id);
  if (error) {
    const enUso = error.message.includes("ya fue usada");
    return NextResponse.json({ error: enUso ? error.message : `No se pudo borrar: ${error.message}` }, { status: enUso ? 409 : 500 });
  }
  await db.from("credit_rates_deleted").update({ deleted_by: g.identity.email }).eq("id", b.id);
  return NextResponse.json({ ok: true, borrada: row });
}
