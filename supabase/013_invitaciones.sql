-- =====================================================================
-- 013 · Invitaciones de acceso al personal (2026-11-05) · Madison
--
-- Caso real: se crearon fichas en /staff esperando que el colaborador
-- recibiera sus credenciales por correo, y no salió ningún correo porque
-- el alta solo creaba la ficha. Ahora el alta genera el usuario en
-- Supabase Auth y envía por Resend un enlace para fijar la contraseña
-- (src/lib/invitations.ts). Aquí queda el rastro de ese envío.
--
-- invite_kind: 'invite' (usuario nuevo en Auth) | 'recovery' (ya existía;
-- el enlace fija una contraseña nueva). invite_error: motivo del último
-- intento fallido; NULL si el último envío salió bien.
--
-- Columnas nuevas en una tabla existente: el GRANT a service_role y el
-- RLS de 001 ya las cubren. Después de esto, re-ejecutar rls_lockdown.sql.
-- =====================================================================

ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS invited_at   timestamptz;
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS invited_by   text;
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS invite_kind  text
  CHECK (invite_kind IS NULL OR invite_kind IN ('invite','recovery'));
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS invite_error text;

-- Verificación: debe devolver 4 filas.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hr_employees'
  AND column_name IN ('invited_at','invited_by','invite_kind','invite_error')
ORDER BY column_name;
