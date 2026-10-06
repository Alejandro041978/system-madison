import { NextResponse } from "next/server";
import { guardSuperadmin } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { VER_COMO_COOKIE } from "@/lib/identity";

/**
 * "Ver como colaborador": solo superadmin real. Guarda el id de la ficha en
 * una cookie httpOnly que resolveIdentity() convierte en identidad completa.
 * Solo lectura (guardApi niega escrituras) y auditada.
 *
 * POST form: employee_id=<uuid>  → activar
 * POST form: stop=1              → desactivar
 */
export async function POST(req: Request) {
  const g = await guardSuperadmin(req);
  if (!g.ok) return g.response;

  const form = await req.formData();
  const home = new URL("/", req.url);

  if (form.get("stop")) {
    const res = NextResponse.redirect(home, { status: 303 });
    res.cookies.delete(VER_COMO_COOKIE);
    await supabaseAdmin().from("permission_audit").insert({
      user_id: g.identity.userId, email: g.identity.email, role_id: null, page_key: "staff",
      accion: "ver", metodo: "POST", ruta: "/api/auth/impersonate", bloqueado: false, motivo: "ver_como_fin",
    });
    return res;
  }

  const employeeId = String(form.get("employee_id") ?? "");
  const { data: target } = await supabaseAdmin()
    .from("hr_employees").select("id, email, active").eq("id", employeeId).maybeSingle();
  if (!target || !target.active) return NextResponse.json({ error: "Colaborador no encontrado o inactivo" }, { status: 404 });

  await supabaseAdmin().from("permission_audit").insert({
    user_id: g.identity.userId, email: g.identity.email, role_id: null, page_key: "staff",
    accion: "ver", metodo: "POST", ruta: "/api/auth/impersonate", bloqueado: false, motivo: `ver_como_inicio:${target.email}`,
  });

  const res = NextResponse.redirect(home, { status: 303 });
  res.cookies.set(VER_COMO_COOKIE, target.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
  return res;
}
