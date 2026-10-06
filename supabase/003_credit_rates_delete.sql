-- =====================================================================
-- 003_credit_rates_delete.sql · Madison
-- Borrado de versiones del tarifario NO USADAS.
--
-- 2026-08-23 (caso real, carga inicial): al rellenar el tarifario se crean
-- versiones con precio o fecha equivocados. El blueprint solo permite borrar
-- versiones futuras para proteger las que ya congelaron matrículas. Aquí se
-- mantiene esa protección de forma exacta: una versión se puede borrar si
-- NINGUNA matrícula la ha usado (no hay matrículas del programa/categoría
-- con enrollment_date >= effective_from). Mientras no exista la tabla de
-- matrículas (Módulo 3), ninguna versión está en uso.
-- Toda fila borrada se copia en credit_rates_deleted (rastro).
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.credit_rates_deleted (
  id                uuid PRIMARY KEY,            -- el mismo id que tenía
  category_id       uuid,
  program_id        uuid,
  price_per_credit  numeric(12,2) NOT NULL,
  currency          char(3) NOT NULL,
  effective_from    date NOT NULL,
  note              text,
  created_by        text,
  created_at        timestamptz NOT NULL,
  deleted_by        text,
  deleted_at        timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.credit_rates_deleted TO service_role;
ALTER TABLE public.credit_rates_deleted ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.credit_rates_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  en_uso integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'credit_rates es inmutable: crea una versión nueva con effective_from';
  END IF;

  -- DELETE: permitido solo si ninguna matrícula usó esta versión.
  IF to_regclass('public.academic_student_enrollments') IS NOT NULL THEN
    IF OLD.program_id IS NOT NULL THEN
      EXECUTE 'SELECT count(*) FROM public.academic_student_enrollments e
               WHERE e.program_id = $1 AND e.enrollment_date >= $2'
        INTO en_uso USING OLD.program_id, OLD.effective_from;
    ELSE
      EXECUTE 'SELECT count(*) FROM public.academic_student_enrollments e
               JOIN public.academic_programs p ON p.id = e.program_id
               WHERE p.category_id = $1 AND e.enrollment_date >= $2'
        INTO en_uso USING OLD.category_id, OLD.effective_from;
    END IF;
    IF en_uso > 0 THEN
      RAISE EXCEPTION 'Esta versión ya fue usada por % matrícula(s); no se puede borrar', en_uso;
    END IF;
  END IF;

  INSERT INTO public.credit_rates_deleted
    (id, category_id, program_id, price_per_credit, currency, effective_from, note, created_by, created_at, deleted_by)
  VALUES
    (OLD.id, OLD.category_id, OLD.program_id, OLD.price_per_credit, OLD.currency, OLD.effective_from, OLD.note, OLD.created_by, OLD.created_at,
     NULL);  -- deleted_by lo completa la API justo después (src/app/api/rates/route.ts)
  RETURN OLD;
END $$;

-- El trigger ya existe (002); solo cambió la función. Verificación:
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_credit_rates_immutable';
