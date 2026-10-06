-- =====================================================================
-- 004_estudiantes.sql · Madison
-- Módulo 2 · Estudiantes.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- academic_students
--  - situation se DERIVA (src/lib/situations.ts → recomputeSituations);
--    solo situation_source = 'manual' la congela, con rastro.
--  - phone_number (E.164) se recompone siempre desde phone_code + phone_local:
--    el bot identifica por teléfono, así que el formato tiene que ser único.
--  - disabled excluye de búsquedas e identificación sin borrar historial.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_students (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  second_last_name   text,
  document_type      text NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI','NIE','PASAPORTE','OTRO')),
  document_number    text NOT NULL,
  email              citext NOT NULL,
  email_alt          citext,
  phone_code         text,                                  -- '+34'
  phone_local        text,                                  -- '612345678'
  phone_number       text,                                  -- E.164 '+34612345678' (derivado por trigger)
  date_of_birth      date,
  city               text,
  country            char(3) NOT NULL DEFAULT 'ESP',        -- ISO-3
  situation          text NOT NULL DEFAULT 'activo'
                     CHECK (situation IN ('activo','egresado','retiro_permanente','retiro_temporal','campus_socio')),
  situation_source   text NOT NULL DEFAULT 'auto' CHECK (situation_source IN ('auto','manual')),
  situation_note     text,                                  -- motivo cuando es manual
  disabled           boolean NOT NULL DEFAULT false,
  external_id        text,
  notes              text,
  updated_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, document_number),
  UNIQUE (email)
);
GRANT ALL ON TABLE public.academic_students TO service_role;
ALTER TABLE public.academic_students ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_students_phone_idx ON public.academic_students(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS academic_students_name_idx ON public.academic_students(last_name, first_name);
CREATE INDEX IF NOT EXISTS academic_students_docnum_idx ON public.academic_students(document_number);
DROP TRIGGER IF EXISTS trg_students_updated_at ON public.academic_students;
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.academic_students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Teléfono E.164: solo dígitos en code y local; si falta alguno, NULL.
CREATE OR REPLACE FUNCTION public.students_phone_e164()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  code  text := regexp_replace(coalesce(NEW.phone_code, ''), '[^0-9]', '', 'g');
  local_ text := regexp_replace(coalesce(NEW.phone_local, ''), '[^0-9]', '', 'g');
BEGIN
  NEW.phone_code  := CASE WHEN code  = '' THEN NULL ELSE '+' || code END;
  NEW.phone_local := CASE WHEN local_ = '' THEN NULL ELSE local_ END;
  NEW.phone_number := CASE WHEN code = '' OR local_ = '' THEN NULL ELSE '+' || code || local_ END;
  NEW.document_number := upper(regexp_replace(coalesce(NEW.document_number, ''), '\s', '', 'g'));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_students_phone_e164 ON public.academic_students;
CREATE TRIGGER trg_students_phone_e164 BEFORE INSERT OR UPDATE ON public.academic_students
  FOR EACH ROW EXECUTE FUNCTION public.students_phone_e164();

-- ---------------------------------------------------------------------
-- UN CORREO, UN SOLO ROL. Un estudiante con sesión nunca es personal:
-- el mismo correo no puede estar en academic_students y en hr_employees.
-- Se comprueba en ambas direcciones (trigger en las dos tablas).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_un_solo_rol()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'academic_students' THEN
    IF EXISTS (SELECT 1 FROM public.hr_employees h WHERE h.email = NEW.email) THEN
      RAISE EXCEPTION 'El correo % pertenece a un colaborador; un correo solo puede tener un rol', NEW.email
        USING ERRCODE = 'unique_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_employees' THEN
    IF EXISTS (SELECT 1 FROM public.academic_students s WHERE s.email = NEW.email) THEN
      RAISE EXCEPTION 'El correo % pertenece a un estudiante; un correo solo puede tener un rol', NEW.email
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_students_email_rol ON public.academic_students;
CREATE TRIGGER trg_students_email_rol BEFORE INSERT OR UPDATE OF email ON public.academic_students
  FOR EACH ROW EXECUTE FUNCTION public.email_un_solo_rol();
DROP TRIGGER IF EXISTS trg_employees_email_rol ON public.hr_employees;
CREATE TRIGGER trg_employees_email_rol BEFORE INSERT OR UPDATE OF email ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.email_un_solo_rol();

-- ---------------------------------------------------------------------
-- Auditoría de cambios de la ficha: quién cambió qué (solo los campos
-- que cambiaron, valor anterior y nuevo).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_students_audit (
  id          bigserial PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES public.academic_students(id) ON DELETE CASCADE,
  changed_by  text,
  action      text NOT NULL CHECK (action IN ('insert','update')),
  changes     jsonb NOT NULL,          -- {campo: {antes, despues}}
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.academic_students_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.academic_students_audit_id_seq TO service_role;
ALTER TABLE public.academic_students_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_students_audit_student_idx ON public.academic_students_audit(student_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.students_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  diff jsonb := '{}'::jsonb;
  k text;
  antes jsonb; despues jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.academic_students_audit(student_id, changed_by, action, changes)
    VALUES (NEW.id, NEW.updated_by, 'insert', to_jsonb(NEW) - 'created_at' - 'updated_at');
    RETURN NEW;
  END IF;
  antes := to_jsonb(OLD); despues := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(despues) LOOP
    IF k IN ('updated_at','updated_by') THEN CONTINUE; END IF;
    IF antes -> k IS DISTINCT FROM despues -> k THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('antes', antes -> k, 'despues', despues -> k));
    END IF;
  END LOOP;
  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.academic_students_audit(student_id, changed_by, action, changes)
    VALUES (NEW.id, NEW.updated_by, 'update', diff);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_students_audit ON public.academic_students;
CREATE TRIGGER trg_students_audit AFTER INSERT OR UPDATE ON public.academic_students
  FOR EACH ROW EXECUTE FUNCTION public.students_audit();

-- Verificación: 2 tablas con RLS y 4 triggers.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('academic_students','academic_students_audit')
UNION ALL
SELECT tgname, tgenabled = 'O' FROM pg_trigger
WHERE tgname IN ('trg_students_phone_e164','trg_students_email_rol','trg_employees_email_rol','trg_students_audit')
ORDER BY 1;
