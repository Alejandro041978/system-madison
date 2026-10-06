-- =====================================================================
-- 001_cimientos.sql · Madison
-- Etapa 1 · Cimientos: personal, roles, permisos por página, superadmins,
-- auditoría de permisos. Idempotente (IF NOT EXISTS en todo).
--
-- Después de ejecutar este archivo, volver a ejecutar 000_rls_lockdown.sql.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- correos sin distinguir mayúsculas

-- ---------------------------------------------------------------------
-- updated_at automático (lo usan todas las tablas editables)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_roles_updated_at ON public.roles;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- role_permissions · permisos por página. Nacen en false: un rol nuevo
-- no ve nada hasta que alguien se lo concede (identidad por presencia).
-- page_key coincide con ROUTE_TO_PAGE_KEY / API_ROUTE_TO_PAGE_KEY en código.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id     uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  page_key    text NOT NULL,
  can_view    boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, page_key)
);
GRANT ALL ON TABLE public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- hr_employees · quien tiene ficha es personal. La ficha manda sobre ser
-- estudiante. user_id enlaza con auth.users cuando la persona ya inició
-- sesión al menos una vez; mientras tanto el emparejamiento es por email.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_employees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email        citext NOT NULL UNIQUE,
  full_name    text NOT NULL,
  role_id      uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  is_helpdesk  boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  phone        text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.hr_employees TO service_role;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS hr_employees_role_id_idx ON public.hr_employees(role_id);
DROP TRIGGER IF EXISTS trg_hr_employees_updated_at ON public.hr_employees;
CREATE TRIGGER trg_hr_employees_updated_at BEFORE UPDATE ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- app_superadmins · lista explícita. Superadmin = ficha en hr_employees
-- SIN role_id Y correo en esta lista. "Sin rol" a secas no es superadmin.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_superadmins (
  email       citext PRIMARY KEY,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.app_superadmins TO service_role;
ALTER TABLE public.app_superadmins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- permission_audit · cada decisión del middleware/guards queda registrada.
-- En modo auditoría (por defecto) bloqueado=false y se deja pasar; con
-- PERMISOS_MODO=estricto se bloquea y bloqueado=true.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permission_audit (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  email       citext,
  role_id     uuid,
  page_key    text,
  accion      text NOT NULL,           -- ver | editar | borrar
  metodo      text NOT NULL,           -- GET | POST | PUT | PATCH | DELETE
  ruta        text NOT NULL,
  bloqueado   boolean NOT NULL DEFAULT false,
  motivo      text,                    -- sin_ficha | sin_permiso | sin_sesion | ...
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.permission_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.permission_audit_id_seq TO service_role;
ALTER TABLE public.permission_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS permission_audit_created_at_idx ON public.permission_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS permission_audit_email_idx ON public.permission_audit(email);

-- ---------------------------------------------------------------------
-- Semilla mínima: un rol de administración sin permisos (se conceden
-- desde la pantalla de roles). El superadmin se da de alta a mano:
--
--   INSERT INTO public.app_superadmins(email, note) VALUES ('tu@correo.es', 'fundador');
--   INSERT INTO public.hr_employees(email, full_name) VALUES ('tu@correo.es', 'Tu Nombre');
--
-- y el usuario se crea en Authentication → Users con ese mismo correo.
-- ---------------------------------------------------------------------
INSERT INTO public.roles(name, description)
VALUES ('Administración', 'Rol inicial; conceder permisos por página desde la pantalla de roles')
ON CONFLICT (name) DO NOTHING;

-- Verificación: 5 tablas con RLS activo.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('roles','role_permissions','hr_employees','app_superadmins','permission_audit')
ORDER BY 1;
