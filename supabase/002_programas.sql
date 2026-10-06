-- =====================================================================
-- 002_programas.sql · Madison
-- Módulo 1 · Programas y categorías: el plan de estudios es la única
-- fuente de nombres, códigos y créditos. Notas, matrículas y precios
-- apuntan a él por id.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías (Bachelor, Master, Doctorado, Curso…). La NOTA MÍNIMA
-- APROBATORIA es de la categoría y manda sobre cualquier valor guardado
-- en una nota.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_programs_category (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,
  sigla          text NOT NULL UNIQUE CHECK (char_length(sigla) BETWEEN 1 AND 5),
  passing_score  numeric(5,2) NOT NULL CHECK (passing_score >= 0),
  description    text,
  external_id    text,                  -- trazabilidad del origen; nunca para emparejar
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.academic_programs_category TO service_role;
ALTER TABLE public.academic_programs_category ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_apc_updated_at ON public.academic_programs_category;
CREATE TRIGGER trg_apc_updated_at BEFORE UPDATE ON public.academic_programs_category
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Programas. partner_campus: se dicta en un campus socio, no en el LMS.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.academic_programs_category(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  code            text NOT NULL UNIQUE,
  description     text,
  partner_campus  boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  external_id     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.academic_programs TO service_role;
ALTER TABLE public.academic_programs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_programs_category_idx ON public.academic_programs(category_id);
DROP TRIGGER IF EXISTS trg_ap_updated_at ON public.academic_programs;
CREATE TRIGGER trg_ap_updated_at BEFORE UPDATE ON public.academic_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Asignaturas (la malla). Los créditos de aquí son los que se facturan.
-- 2026-08-23: al crear una asignatura hay que inyectar su fila
-- `no_iniciada` en el registro curricular de los ya matriculados; eso
-- vive en src/lib/courses.ts y se activa cuando exista
-- academic_course_enrollments (Módulo 3).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_courses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id              uuid NOT NULL REFERENCES public.academic_programs(id) ON DELETE RESTRICT,
  name                    text NOT NULL,
  code                    text NOT NULL,
  credits                 numeric(6,2) NOT NULL CHECK (credits >= 0),
  hours                   numeric(7,2) CHECK (hours IS NULL OR hours >= 0),
  level                   integer NOT NULL DEFAULT 1 CHECK (level >= 1),   -- semestre/bloque dentro del programa
  sort_order              integer NOT NULL DEFAULT 0,
  is_capstone             boolean NOT NULL DEFAULT false,
  graduation_requirement  boolean NOT NULL DEFAULT true,
  partner_campus          boolean NOT NULL DEFAULT false,
  active                  boolean NOT NULL DEFAULT true,
  external_id             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, code)
);
GRANT ALL ON TABLE public.academic_courses TO service_role;
ALTER TABLE public.academic_courses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_courses_program_idx ON public.academic_courses(program_id, level, sort_order);
DROP TRIGGER IF EXISTS trg_ac_updated_at ON public.academic_courses;
CREATE TRIGGER trg_ac_updated_at BEFORE UPDATE ON public.academic_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Tarifario por crédito, INMUTABLE POR VERSIONES.
--  - Una tarifa es de categoría O de programa (CHECK XOR).
--  - Un cambio de precio = fila nueva con effective_from; nunca UPDATE.
--  - Solo se borran versiones futuras (effective_from > hoy).
--  - Vigente = mayor effective_from <= fecha; programa manda sobre categoría.
-- 2026-08-23: el ERP anterior tuvo tres pantallas con tres precios. Aquí el
-- precio se resuelve en UNA función (src/lib/rates.ts → tarifaVigente).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_rates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid REFERENCES public.academic_programs_category(id) ON DELETE RESTRICT,
  program_id        uuid REFERENCES public.academic_programs(id) ON DELETE RESTRICT,
  price_per_credit  numeric(12,2) NOT NULL CHECK (price_per_credit >= 0),
  currency          char(3) NOT NULL DEFAULT 'EUR',
  effective_from    date NOT NULL,
  note              text,
  created_by        text,                -- email de quien la creó
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((category_id IS NULL) <> (program_id IS NULL)),
  UNIQUE (category_id, effective_from),
  UNIQUE (program_id, effective_from)
);
GRANT ALL ON TABLE public.credit_rates TO service_role;
ALTER TABLE public.credit_rates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS credit_rates_program_idx ON public.credit_rates(program_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS credit_rates_category_idx ON public.credit_rates(category_id, effective_from DESC);

-- Inmutabilidad: sin UPDATE; DELETE solo de versiones futuras.
CREATE OR REPLACE FUNCTION public.credit_rates_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'credit_rates es inmutable: crea una versión nueva con effective_from';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.effective_from <= current_date THEN
    RAISE EXCEPTION 'Solo se pueden borrar versiones futuras (effective_from > hoy)';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_credit_rates_immutable ON public.credit_rates;
CREATE TRIGGER trg_credit_rates_immutable BEFORE UPDATE OR DELETE ON public.credit_rates
  FOR EACH ROW EXECUTE FUNCTION public.credit_rates_immutable();

-- Verificación: 4 tablas con RLS activo.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('academic_programs_category','academic_programs','academic_courses','credit_rates')
ORDER BY 1;
