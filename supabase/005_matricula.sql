-- =====================================================================
-- 005_matricula.sql · Madison
-- Módulo 3 · Matrícula: convocatorias, matrículas con snapshot de tarifa,
-- registro curricular, retiros y retornos.
--
-- 2026-08-23 (modelo heredado del proyecto base): no existe el retiro
-- temporal (LOA). Solo hay RETIRO (definitivo mientras está vigente) y
-- RETORNO (trámite que cierra el retiro y reactiva la matrícula; su importe
-- es RETORNO_FEE en la configuración de la app, 0 = sin pago). Sin
-- vencimientos ni conversiones automáticas.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Situación del estudiante: una sola situación de retiro.
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_students DROP CONSTRAINT IF EXISTS academic_students_situation_check;
UPDATE public.academic_students SET situation = 'retiro' WHERE situation IN ('retiro_permanente','retiro_temporal');
ALTER TABLE public.academic_students
  ADD CONSTRAINT academic_students_situation_check
  CHECK (situation IN ('activo','egresado','retiro','campus_socio'));

-- ---------------------------------------------------------------------
-- Prerrequisito por categoría: para matricularse en esta categoría hay que
-- tener FINALIZADO un programa de la categoría requerida (p. ej. Doctorado
-- exige Master). NULL = sin prerrequisito. Se comprueba en crearMatricula.
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_programs_category
  ADD COLUMN IF NOT EXISTS requires_category_id uuid REFERENCES public.academic_programs_category(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Convocatorias: única por (categoría, año, bloque). first_day gobierna
-- los vencimientos de cuotas (Módulo 4).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convocatorias (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  category_id              uuid NOT NULL REFERENCES public.academic_programs_category(id) ON DELETE RESTRICT,
  term_year                integer NOT NULL CHECK (term_year BETWEEN 2000 AND 2100),
  term_block               integer NOT NULL CHECK (term_block BETWEEN 1 AND 12),
  registration_start_date  date NOT NULL,
  deadline_date            date NOT NULL,
  first_day                date NOT NULL,
  end_date                 date,
  active                   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, term_year, term_block),
  CHECK (registration_start_date <= deadline_date),
  CHECK (end_date IS NULL OR end_date >= first_day)
);
GRANT ALL ON TABLE public.convocatorias TO service_role;
ALTER TABLE public.convocatorias ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_convocatorias_updated_at ON public.convocatorias;
CREATE TRIGGER trg_convocatorias_updated_at BEFORE UPDATE ON public.convocatorias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Matrículas. Snapshot CONGELADO de tarifa en enrollment_date: credit_rate,
-- credit_rate_source, list_price. Nunca se pisa (trigger).
-- status: pendiente_pago → activa → (retirada ⇄ activa por retiro/retorno) → finalizada
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_student_enrollments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid NOT NULL REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  program_id            uuid NOT NULL REFERENCES public.academic_programs(id) ON DELETE RESTRICT,
  convocatoria_id       uuid NOT NULL REFERENCES public.convocatorias(id) ON DELETE RESTRICT,
  enrollment_date       date NOT NULL DEFAULT current_date,
  status                text NOT NULL DEFAULT 'pendiente_pago'
                        CHECK (status IN ('pendiente_pago','activa','retirada','finalizada')),
  activated_at          timestamptz,
  activated_by          text,
  activation_mode       text CHECK (activation_mode IN ('pago','force')),
  activation_note       text,
  credit_rate           numeric(12,2),          -- NULL = no había tarifa al matricular (se avisa; no es 0)
  credit_rate_source    text CHECK (credit_rate_source IN ('program','category')),
  credit_rate_currency  char(3),
  credit_rate_id        uuid,                   -- trazabilidad de la versión usada
  list_price            numeric(12,2),          -- tarifa × créditos de la malla en enrollment_date (respaldo)
  external_id           text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, program_id)
);
GRANT ALL ON TABLE public.academic_student_enrollments TO service_role;
ALTER TABLE public.academic_student_enrollments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ase_student_idx ON public.academic_student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS ase_convocatoria_idx ON public.academic_student_enrollments(convocatoria_id);
CREATE INDEX IF NOT EXISTS ase_program_idx ON public.academic_student_enrollments(program_id);
DROP TRIGGER IF EXISTS trg_ase_updated_at ON public.academic_student_enrollments;
CREATE TRIGGER trg_ase_updated_at BEFORE UPDATE ON public.academic_student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- El snapshot no se pisa nunca.
CREATE OR REPLACE FUNCTION public.enrollment_snapshot_frozen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.credit_rate IS NOT NULL AND (
       NEW.credit_rate IS DISTINCT FROM OLD.credit_rate OR
       NEW.credit_rate_source IS DISTINCT FROM OLD.credit_rate_source OR
       NEW.credit_rate_currency IS DISTINCT FROM OLD.credit_rate_currency OR
       NEW.credit_rate_id IS DISTINCT FROM OLD.credit_rate_id OR
       NEW.list_price IS DISTINCT FROM OLD.list_price OR
       NEW.enrollment_date IS DISTINCT FROM OLD.enrollment_date) THEN
    RAISE EXCEPTION 'El snapshot de tarifa de la matrícula está congelado y no se modifica';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enrollment_snapshot_frozen ON public.academic_student_enrollments;
CREATE TRIGGER trg_enrollment_snapshot_frozen BEFORE UPDATE ON public.academic_student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enrollment_snapshot_frozen();

-- ---------------------------------------------------------------------
-- Registro curricular: la verdad sobre QUÉ está inscrito. Cada intento es
-- una fila (recursar consume créditos otra vez). Las notas (más adelante)
-- solo dicen cómo le fue.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_course_enrollments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             uuid NOT NULL REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  course_id              uuid NOT NULL REFERENCES public.academic_courses(id) ON DELETE RESTRICT,
  program_id             uuid NOT NULL REFERENCES public.academic_programs(id) ON DELETE RESTRICT,
  program_enrollment_id  uuid NOT NULL REFERENCES public.academic_student_enrollments(id) ON DELETE RESTRICT,
  attempt                integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  status                 text NOT NULL DEFAULT 'no_iniciada'
                         CHECK (status IN ('no_iniciada','en_curso','aprobada','reprobada','retirada')),
  source                 text NOT NULL DEFAULT 'matricula'
                         CHECK (source IN ('matricula','malla_nueva','retorno','recursado','manual','convalidacion')),
  opened_at              timestamptz,
  opened_by              text,
  closed_at              timestamptz,
  closed_by              text,
  note                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id, attempt)
);
GRANT ALL ON TABLE public.academic_course_enrollments TO service_role;
ALTER TABLE public.academic_course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ace_enrollment_idx ON public.academic_course_enrollments(program_enrollment_id);
CREATE INDEX IF NOT EXISTS ace_student_idx ON public.academic_course_enrollments(student_id);
DROP TRIGGER IF EXISTS trg_ace_updated_at ON public.academic_course_enrollments;
CREATE TRIGGER trg_ace_updated_at BEFORE UPDATE ON public.academic_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Retiros. EL RETIRO PERTENECE A LA MATRÍCULA: retirado de un programa, el
-- otro sigue activo. Un solo retiro vigente por matrícula (índice parcial).
-- Retorno = trámite pagado (20 €; el cobro automático llega con el Módulo 4,
-- mientras tanto se registra la referencia del pago a mano).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_withdrawals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             uuid NOT NULL REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  enrollment_id          uuid NOT NULL REFERENCES public.academic_student_enrollments(id) ON DELETE RESTRICT,
  status                 text NOT NULL DEFAULT 'vigente' CHECK (status IN ('vigente','retornado')),
  withdrawal_date        date NOT NULL DEFAULT current_date,
  reason                 text NOT NULL,
  resolution_number      text,
  created_by             text,
  return_fee_amount      numeric(12,2),
  return_fee_reference   text,                  -- recibo / referencia del trámite de retorno
  return_fee_paid_at     date,
  returned_at            timestamptz,
  returned_by            text,
  return_note            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.student_withdrawals TO service_role;
ALTER TABLE public.student_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS student_withdrawals_one_open_idx
  ON public.student_withdrawals(enrollment_id) WHERE status = 'vigente';
CREATE INDEX IF NOT EXISTS student_withdrawals_student_idx ON public.student_withdrawals(student_id);
DROP TRIGGER IF EXISTS trg_withdrawals_updated_at ON public.student_withdrawals;
CREATE TRIGGER trg_withdrawals_updated_at BEFORE UPDATE ON public.student_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Verificación: 4 tablas con RLS.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('convocatorias','academic_student_enrollments','academic_course_enrollments','student_withdrawals')
ORDER BY 1;
