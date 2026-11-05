import { NextResponse } from "next/server";
import { supabaseSession } from "@/lib/supabase/server";

/**
 * Canjea el enlace de invitación (token_hash de un solo uso generado por
 * src/lib/invitations.ts) por una sesión y lleva a fijar la contraseña.
 * Público (prefijo /api/auth/ en el proxy): la autenticidad la da el token.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const destino = new URL("/auth/set-password", req.url);

  if (!tokenHash || !["invite", "recovery", "magiclink"].includes(type)) {
    destino.searchParams.set("error", "invalido");
    return NextResponse.redirect(destino, { status: 303 });
  }

  const sb = await supabaseSession();
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as "invite" | "recovery" | "magiclink" });
  if (error) {
    destino.searchParams.set("error", "caducado");
    return NextResponse.redirect(destino, { status: 303 });
  }
  return NextResponse.redirect(destino, { status: 303 });
}
