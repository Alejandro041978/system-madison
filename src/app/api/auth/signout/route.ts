import { NextResponse } from "next/server";
import { supabaseSession } from "@/lib/supabase/server";
import { VER_COMO_COOKIE } from "@/lib/identity";

export async function POST(req: Request) {
  const sb = await supabaseSession();
  await sb.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.delete(VER_COMO_COOKIE);
  return res;
}
