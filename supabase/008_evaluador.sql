-- =====================================================================
-- 008_evaluador.sql · Madison
-- Módulo 5 · entrega 3: sugerencias del supervisor. La tabla pertenece al
-- flujo del Módulo 6 (revisión y aprobación humana), pero la crea aquí el
-- evaluador porque es quien la alimenta (≤4/día por bot, nunca el inbox).
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.supervisor_suggestions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_key        text NOT NULL REFERENCES public.bots(key) ON DELETE CASCADE,
  report_date    date NOT NULL,
  type           text NOT NULL CHECK (type IN ('prompt','knowledge')),
  title          text NOT NULL,
  recommendation text NOT NULL,
  content        text,                  -- texto propuesto (viñeta de prompt o cuerpo del artículo)
  kb_topic       text,                  -- categoría del artículo si type=knowledge
  kb_question    text,                  -- pregunta que respondería (título del artículo)
  kb_tags        text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  applied_at     timestamptz,
  applied_ref    text,                  -- id del artículo creado o versión de prompt aplicada
  reviewed_by    text,
  campaign_key   text,                  -- obligatorio en retención (lo exige el Módulo 6)
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_key, type, title)
);
GRANT ALL ON TABLE public.supervisor_suggestions TO service_role;
ALTER TABLE public.supervisor_suggestions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS supervisor_suggestions_pending_idx
  ON public.supervisor_suggestions(bot_key, status) WHERE status = 'pending';

-- Verificación: 1 tabla con RLS.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'supervisor_suggestions';
