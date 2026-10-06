-- =====================================================================
-- 010_outbound.sql · Madison
-- Ventas saliente: perfil del prospecto, campañas y cola de envíos.
-- 2026-09-16 (pedido de la escuela): el bot de ventas no solo espera;
-- una plantilla aprobada abre la conversación y el bot la continúa
-- usando el perfil cargado (profesión, edad, empleo, especialidad).
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfil del prospecto en sales_leads. `consent`: los envíos salientes
-- exigen consentimiento (política de Meta; enviar a listas frías bloquea
-- el número). `meta` sigue libre para extras del origen.
-- ---------------------------------------------------------------------
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS age integer CHECK (age IS NULL OR (age BETWEEN 14 AND 110));
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS employment text;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS specialty_interest text;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es';
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS source text;   -- de dónde salió el contacto (feria, web, lista X)

-- ---------------------------------------------------------------------
-- Plantillas: body_preview es el texto aprobado con sus {{1}}, {{2}}…
-- Sirve para espejar en la conversación LO QUE se le envió al prospecto
-- (Twilio solo guarda el content_sid) y para que el bot sepa cómo se
-- abrió el diálogo.
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS body_preview text;

-- ---------------------------------------------------------------------
-- Campañas. audience_filter: {campo: [valores]} sobre el perfil del lead
-- (vacío = todos los consentidos). variables_map: posición de la plantilla
-- → campo del lead ({"1":"name","2":"specialty_interest"}).
-- pitch_notes: el guión/objetivo que el bot usará al continuar el diálogo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  bot_key          text NOT NULL DEFAULT 'ventas' REFERENCES public.bots(key) ON DELETE RESTRICT,
  template_id      uuid REFERENCES public.whatsapp_templates(id) ON DELETE RESTRICT,
  variables_map    jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_filter  jsonb NOT NULL DEFAULT '{}'::jsonb,
  pitch_notes      text,
  daily_limit      integer NOT NULL DEFAULT 50 CHECK (daily_limit BETWEEN 1 AND 1000),
  status           text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','activa','pausada','terminada')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Cola de envíos. Un lead solo puede estar PENDIENTE en una campaña a la
-- vez (índice parcial): dos campañas no se pisan el mismo teléfono.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente','enviado','respondido','error','excluido')),
  sent_at       timestamptz,
  message_sid   text,
  error_detail  text,
  responded_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
GRANT ALL ON TABLE public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_one_pending_idx
  ON public.campaign_recipients(lead_id) WHERE status = 'pendiente';
CREATE INDEX IF NOT EXISTS campaign_recipients_dispatch_idx
  ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS campaign_recipients_lead_sent_idx
  ON public.campaign_recipients(lead_id) WHERE status = 'enviado';

-- Verificación: 2 tablas nuevas con RLS + columnas de perfil.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('campaigns','campaign_recipients')
UNION ALL
SELECT 'sales_leads.columnas_perfil: ' || count(*)::text, count(*) = 7
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales_leads'
  AND column_name IN ('profession','age','employment','specialty_interest','language','consent','source')
ORDER BY 1;
