import { NextResponse } from "next/server";
import { supabaseSession } from "@/lib/supabase/server";

/** El propio usuario fija su contraseña con la sesión abierta por /api/auth/confirm. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = String(body?.password ?? "");
  if (password.length < 8) return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });

  const sb = await supabaseSession();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sesión no válida; abre de nuevo el enlace del correo" }, { status: 401 });

  const { error } = await sb.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
