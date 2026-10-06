import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente de SESIÓN (clave anónima + cookies). Solo sirve para saber quién es
 * el usuario autenticado. No lee tablas: anon/authenticated no tienen
 * privilegios en `public` (rls_lockdown.sql).
 */
export async function supabaseSession() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // En Server Components no se pueden escribir cookies; el proxy
            // (src/proxy.ts) ya refresca la sesión en cada petición.
          }
        },
      },
    },
  );
}

let adminSingleton: SupabaseClient | null = null;

/**
 * Cliente ADMIN (service_role). Salta RLS. Solo en servidor; la autorización
 * la hacen los guards (src/lib/api-guard.ts), nunca RLS.
 *
 * 2026-08-23: si una consulta devuelve `permission denied`, la tabla nació sin
 * `GRANT ALL ... TO service_role`. Ver supabase/README.md.
 */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() solo puede usarse en el servidor");
  }
  if (!adminSingleton) {
    adminSingleton = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminSingleton;
}
