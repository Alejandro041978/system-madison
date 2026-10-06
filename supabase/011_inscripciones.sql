-- =====================================================================
-- 011_inscripciones.sql · Madison
-- Ficha de inscripción pública para prospectos del bot de ventas
-- (2026-09-24): el bot genera un enlace con token, el prospecto completa
-- sus datos, paga la matrícula (100 €) vía Flywire y el equipo confirma
-- y formaliza en Admisión. La matrícula del ERP se crea a mano por el
-- personal: esta tabla es la antesala comercial, no el registro académico.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.enrollment_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token              text NOT NULL UNIQUE,          -- va en la URL pública; aleatorio de 32 hex
  bot_key            text REFERENCES public.bots(key) ON DELETE SET NULL,
  lead_id            uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  phone              text NOT NULL,
  status             text NOT NULL DEFAULT 'enviada'
                     CHECK (status IN ('enviada','completada','pagada','formalizada','anulada')),
  -- datos del formulario
  full_name          text,
  document_type      text CHECK (document_type IS NULL OR document_type IN ('DNI','NIE','PASAPORTE','OTRO')),
  document_number    text,
  email              text,
  birth_date         date,
  city               text,
  country            text,
  program_name       text,                          -- programa del catálogo comercial elegido
  notes              text,
  -- pago (Flywire; confirmación manual del equipo hasta tener webhook)
  payment_reference  text,
  paid_confirmed_at  timestamptz,
  paid_confirmed_by  text,
  completed_at       timestamptz,
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.enrollment_requests TO service_role;
ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS enrollment_requests_phone_idx ON public.enrollment_requests(phone);
CREATE INDEX IF NOT EXISTS enrollment_requests_status_idx ON public.enrollment_requests(status) WHERE status IN ('enviada','completada');
DROP TRIGGER IF EXISTS trg_enrollment_requests_updated_at ON public.enrollment_requests;
CREATE TRIGGER trg_enrollment_requests_updated_at BEFORE UPDATE ON public.enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Verificación: 1 tabla con RLS.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'enrollment_requests';
