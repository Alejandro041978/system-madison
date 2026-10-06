-- =====================================================================
-- 006_cuentas.sql · Madison
-- Módulo 4 · Estados de cuenta: conceptos, cargos, pagos, becas, bonos,
-- plantillas de facturación.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo de conceptos (cargos y tipos de pago).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_concepts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('charge','payment')),
  type_code   text NOT NULL,
  abbr        text NOT NULL,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, type_code)
);
GRANT ALL ON TABLE public.account_concepts TO service_role;
ALTER TABLE public.account_concepts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.account_concepts (kind, type_code, abbr, name) VALUES
  ('charge','MATRICULA','MAT','Matrícula (concepto inicial)'),
  ('charge','CUOTA','CUO','Cuota de tuition'),
  ('charge','RETORNO','RET','Trámite de retorno'),
  ('payment','TRANSFERENCIA','TRF','Transferencia bancaria'),
  ('payment','TARJETA','TAR','Tarjeta'),
  ('payment','EFECTIVO','EFE','Efectivo'),
  ('payment','PASARELA','PAS','Pasarela de pago'),
  ('payment','DESCUENTO','DTO','Descuento (reduce deuda; no es ingreso)')
ON CONFLICT (kind, type_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Cargos. `is_initial`: su pago completo activa la matrícula.
-- `withdrawal_id`: enlaza el cargo RETORNO con su retiro.
-- `source`: plan (generado por plantilla) | retiro | manual.
-- external_id UNIQUE para importaciones futuras (id de origen, trazabilidad).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_charges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id    text UNIQUE,
  student_id     uuid NOT NULL REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  enrollment_id  uuid REFERENCES public.academic_student_enrollments(id) ON DELETE RESTRICT,
  convocatoria_id uuid REFERENCES public.convocatorias(id) ON DELETE RESTRICT,
  withdrawal_id  uuid REFERENCES public.student_withdrawals(id) ON DELETE SET NULL,
  charge_type    text NOT NULL,          -- type_code de account_concepts (kind=charge)
  description    text,
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency       char(3) NOT NULL DEFAULT 'EUR',
  due_date       date NOT NULL,
  reference      text,
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('plan','retiro','manual')),
  is_initial     boolean NOT NULL DEFAULT false,
  installment_no integer,                -- nº de cuota dentro del plan (1..n); NULL si no aplica
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.account_charges TO service_role;
ALTER TABLE public.account_charges ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS account_charges_enrollment_idx ON public.account_charges(enrollment_id, due_date);
CREATE INDEX IF NOT EXISTS account_charges_student_idx ON public.account_charges(student_id);
DROP TRIGGER IF EXISTS trg_charges_updated_at ON public.account_charges;
CREATE TRIGGER trg_charges_updated_at BEFORE UPDATE ON public.account_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Pagos: SIEMPRE contra un cargo. series_code='DESCUENTO' reduce deuda
-- pero no es ingreso (los reportes de caja lo excluyen).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id           text UNIQUE,
  charge_id             uuid NOT NULL REFERENCES public.account_charges(id) ON DELETE RESTRICT,
  student_id            uuid NOT NULL REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_date             date NOT NULL DEFAULT current_date,
  payment_type          text NOT NULL,   -- type_code de account_concepts (kind=payment)
  series_code           text,            -- 'DESCUENTO' = no ingreso
  receipt_number        text,
  transaction_reference text,
  note                  text,
  voided_at             timestamptz,     -- anulado (no se borra; null = válido)
  voided_by             text,
  void_reason           text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.account_payments TO service_role;
ALTER TABLE public.account_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS account_payments_charge_idx ON public.account_payments(charge_id);
CREATE INDEX IF NOT EXISTS account_payments_student_idx ON public.account_payments(student_id, paid_date);

-- Un pago pertenece al mismo estudiante que su cargo. Nunca entre estudiantes.
CREATE OR REPLACE FUNCTION public.payment_same_student()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cs uuid;
BEGIN
  SELECT student_id INTO cs FROM public.account_charges WHERE id = NEW.charge_id;
  IF cs IS NULL THEN RAISE EXCEPTION 'El cargo no existe'; END IF;
  IF cs <> NEW.student_id THEN RAISE EXCEPTION 'El pago y el cargo pertenecen a estudiantes distintos'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_same_student ON public.account_payments;
CREATE TRIGGER trg_payment_same_student BEFORE INSERT OR UPDATE ON public.account_payments
  FOR EACH ROW EXECUTE FUNCTION public.payment_same_student();

-- ---------------------------------------------------------------------
-- Becas: SOLO el porcentaje; el monto se deriva en computeTuition.
-- Una activa por matrícula (índice parcial).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scholarships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.academic_student_enrollments(id) ON DELETE RESTRICT,
  percentage     numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  note           text,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  granted_by     text,
  revoked_at     timestamptz,
  revoked_by     text,
  revoke_reason  text
);
GRANT ALL ON TABLE public.scholarships TO service_role;
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS scholarships_one_active_idx
  ON public.scholarships(enrollment_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- Bonos: porcentaje O monto fijo (XOR), motivo obligatorio. Se aplican
-- después de la beca (ver cascada en src/lib/tuition.ts).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bonuses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.academic_student_enrollments(id) ON DELETE RESTRICT,
  percentage     numeric(5,2) CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100)),
  amount         numeric(12,2) CHECK (amount IS NULL OR amount > 0),
  reason         text NOT NULL,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  granted_by     text,
  revoked_at     timestamptz,
  revoked_by     text,
  revoke_reason  text,
  CHECK ((percentage IS NULL) <> (amount IS NULL))
);
GRANT ALL ON TABLE public.bonuses TO service_role;
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bonuses_enrollment_idx ON public.bonuses(enrollment_id);

-- ---------------------------------------------------------------------
-- Plantillas de facturación. El plan de una matrícula se resuelve
-- programa > categoría (la más específica gana).
--  - initial_amount forma PARTE del total: cuota = (total − inicial) / n.
--  - Cuotas mensuales (frequency_months) desde first_day de la convocatoria
--    (+ offset); la matrícula inicial vence en la fecha de matrícula.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_templates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL UNIQUE,
  initial_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (initial_amount >= 0),
  installments            integer NOT NULL CHECK (installments >= 1),
  frequency_months        integer NOT NULL DEFAULT 1 CHECK (frequency_months >= 1),
  first_installment_offset_months integer NOT NULL DEFAULT 0 CHECK (first_installment_offset_months >= 0),
  active                  boolean NOT NULL DEFAULT true,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.billing_templates TO service_role;
ALTER TABLE public.billing_templates ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_billing_templates_updated_at ON public.billing_templates;
CREATE TRIGGER trg_billing_templates_updated_at BEFORE UPDATE ON public.billing_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.billing_template_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.billing_templates(id) ON DELETE CASCADE,
  program_id   uuid REFERENCES public.academic_programs(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES public.academic_programs_category(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((program_id IS NULL) <> (category_id IS NULL))
);
GRANT ALL ON TABLE public.billing_template_targets TO service_role;
ALTER TABLE public.billing_template_targets ENABLE ROW LEVEL SECURITY;
-- Un destino solo puede apuntar a una plantilla.
CREATE UNIQUE INDEX IF NOT EXISTS btt_program_unique ON public.billing_template_targets(program_id) WHERE program_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS btt_category_unique ON public.billing_template_targets(category_id) WHERE category_id IS NOT NULL;

-- Verificación: 7 tablas con RLS.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('account_concepts','account_charges','account_payments','scholarships','bonuses','billing_templates','billing_template_targets')
ORDER BY 1;
