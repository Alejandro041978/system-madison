-- =====================================================================
-- 012 · Estado de entrega de los envíos de campaña (2026-10-02)
--
-- Caso real: el tablero decía "500 enviados" y Twilio decía que 93 de
-- ellos nunca se entregaron (número sin WhatsApp, límite de marketing de
-- Meta). "Enviado" solo significaba "Twilio aceptó el mensaje".
--
-- delivery_status es el estado de WhatsApp tal cual lo informa Twilio:
--   sent        → un visto (salió, aún no llegó al teléfono)
--   delivered   → dos vistos (entregado)
--   read        → vistos azules (leído; solo si el usuario tiene activada
--                 la confirmación de lectura: es un mínimo, no un total)
--   undelivered / failed → no se entregó (delivery_error = código Twilio)
-- NULL = todavía no lo sabemos (null ≠ "no entregado").
--
-- Lo escriben el webhook /api/whatsapp/status y el cron de respaldo
-- /api/cron/delivery-sync; ambos pasan por registrarEntrega() en
-- src/lib/campaigns.ts, que solo deja AVANZAR el estado.
--
-- Columnas nuevas en una tabla existente: el GRANT a service_role y el
-- RLS de 010 ya las cubren. Después de esto, re-ejecutar rls_lockdown.sql.
-- =====================================================================

ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS delivery_status text
  CHECK (delivery_status IS NULL OR delivery_status IN ('sent','delivered','read','undelivered','failed'));
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS delivery_error text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS campaign_recipients_message_sid_idx
  ON public.campaign_recipients(message_sid) WHERE message_sid IS NOT NULL;

-- Verificación: debe devolver 3 filas.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaign_recipients'
  AND column_name IN ('delivery_status','delivery_error','delivery_updated_at')
ORDER BY column_name;
