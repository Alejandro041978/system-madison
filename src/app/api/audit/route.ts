import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Últimas 200 decisiones de permisos (filtro opcional ?email=). */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const email = new URL(req.url).searchParams.get("email");
  let q = supabaseAdmin().from("permission_audit").select("*").order("created_at", { ascending: false }).limit(200);
  if (email) q = q.ilike("email", `%${email}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
