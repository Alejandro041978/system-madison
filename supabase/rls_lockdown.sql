-- =====================================================================
-- rls_lockdown.sql · Madison
-- Sin número a propósito: se ejecuta DESPUÉS de cada migración numerada
-- de cada migración que cree tablas o vistas. Es idempotente.
--
-- Por qué (2026-08-23, herencia del ERP anterior): los estudiantes también
-- tienen sesión de Supabase (rol `authenticated`). Si una tabla queda con
-- los privilegios por defecto, cualquier estudiante podría leerla desde el
-- navegador con la clave anónima. Todo acceso real va por el servidor con
-- la clave `service_role`, que salta RLS; los guards autorizan.
-- =====================================================================

-- 1) Privilegios por defecto: lo que se cree de ahora en adelante en
--    `public` no se concede a anon ni a authenticated.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TYPES FROM anon, authenticated;

-- 2) Lo que ya existe: quitar todo a anon y authenticated.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3) RLS activado en TODAS las tablas de public (sin políticas: nadie pasa
--    salvo service_role, que tiene bypassrls).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 4) Vistas con security_invoker: la vista no hereda los privilegios del
--    dueño (postgres) y respeta los del que consulta.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', r.relname);
  END LOOP;
END $$;

-- 5) service_role conserva todo (por si alguna tabla nació sin su GRANT).
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Verificación: debe devolver 0 filas.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
