import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (el antiguo middleware; Next 16 lo renombró). Hace dos cosas y nada más:
 *  1. Refresca la sesión de Supabase en cada petición (cookies).
 *  2. Sin sesión → /login. Con sesión en /login → /.
 *
 * NO decide si el usuario es personal ni qué puede ver: eso lo hacen los
 * guards (src/lib/api-guard.ts) con resolveIdentity(), que sí leen la base
 * con service_role. El proxy solo conoce la sesión.
 */

// /api/whatsapp: webhook de Twilio, autenticado por firma HMAC, no por sesión.
// /enroll y /api/enroll: ficha de inscripción pública, autenticada por token aleatorio.
const PUBLIC_PATHS = ["/login", "/no-access", "/api/auth/", "/api/whatsapp/", "/enroll/", "/api/enroll"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() valida el JWT contra Supabase (getSession() no lo valida).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Todo menos estáticos e imágenes. Los crons (/api/cron) van con CRON_SECRET,
  // no con sesión: se excluyen aquí y se protegen en su propia ruta.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
