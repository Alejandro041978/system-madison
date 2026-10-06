import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Importación de prospectos (2026-09-16). POST {items: [...], consent_confirmed: true}
 * Cada item: {phone (obligatorio, con prefijo país), name?, email?, profession?,
 * age?, employment?, specialty_interest?, language?, source?, notes?}
 *
 * `consent_confirmed` obliga a declarar que los contactos dieron su
 * consentimiento: sin él no se importa (enviar a listas frías bloquea el
 * número en Meta). Upsert por (bot ventas, phone): reimportar actualiza
 * el perfil sin duplicar ni pisar la etapa.
 */
export async function POST(req: Request) {
  const g = await guardApi(req, "leads");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => null);
  const items = Array.isArray(b?.items) ? b.items : [];
  if (items.length === 0) return NextResponse.json({ error: "Sin items" }, { status: 400 });
  if (items.length > 2000) return NextResponse.json({ error: "Máximo 2.000 por importación" }, { status: 400 });
  if (b?.consent_confirmed !== true) {
    return NextResponse.json({ error: "Debes confirmar que los contactos dieron su consentimiento (consent_confirmed)" }, { status: 400 });
  }

  const db = supabaseAdmin();
  let insertados = 0, actualizados = 0;
  const errores: string[] = [];
  for (const [i, item] of items.entries()) {
    const digits = String(item?.phone ?? "").replace(/[^0-9]/g, "");
    if (digits.length < 9) { errores.push(`fila ${i + 1}: teléfono inválido «${item?.phone ?? ""}»`); continue; }
    const phone = `+${digits}`;
    const perfil: Record<string, unknown> = { bot_key: "ventas", phone, consent: true };
    for (const k of ["name", "email", "profession", "employment", "specialty_interest", "language", "source", "notes", "program_interest"]) {
      const v = item?.[k];
      if (v != null && String(v).trim() !== "") perfil[k] = String(v).trim();
    }
    if (item?.age != null && String(item.age).trim() !== "") {
      const age = Number(item.age);
      if (age >= 14 && age <= 110) perfil.age = Math.round(age);
    }
    const { data: existente } = await db.from("sales_leads").select("id").eq("bot_key", "ventas").eq("phone", phone).maybeSingle();
    const { error } = await db.from("sales_leads").upsert(perfil, { onConflict: "bot_key,phone" });
    if (error) errores.push(`fila ${i + 1} (${phone.slice(0, 6)}…): ${error.message}`);
    else if (existente) actualizados++;
    else insertados++;
  }
  return NextResponse.json({ insertados, actualizados, errores: errores.slice(0, 20), totalErrores: errores.length });
}
