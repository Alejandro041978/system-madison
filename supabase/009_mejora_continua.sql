-- =====================================================================
-- 009_mejora_continua.sql · Madison
-- Módulo 6 · Mejora continua: versionado obligatorio del prompt.
-- El bot no se edita de memoria: el supervisor propone, una persona revisa
-- y aprueba, y solo entonces se aplica, con rastro.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

-- bots.prompt es SIEMPRE la versión vigente; aquí queda la historia entera.
-- El prompt se estructura en dos bloques: el base y las mejoras aprobadas
-- bajo «═══ MEJORAS APROBADAS ═══», para poder regenerar el base sin
-- perder las mejoras.
CREATE TABLE IF NOT EXISTS public.bot_prompt_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_key        text NOT NULL REFERENCES public.bots(key) ON DELETE CASCADE,
  version        integer NOT NULL,
  prompt         text NOT NULL,
  reason         text NOT NULL,          -- 'edición manual', 'sugerencia aprobada: …', 'restaurada v3'
  suggestion_id  uuid REFERENCES public.supervisor_suggestions(id) ON DELETE SET NULL,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_key, version)
);
GRANT ALL ON TABLE public.bot_prompt_versions TO service_role;
ALTER TABLE public.bot_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bot_prompt_versions_bot_idx ON public.bot_prompt_versions(bot_key, version DESC);

-- Semilla: versión 1 = el prompt vigente actual de cada bot (si no hay versiones).
INSERT INTO public.bot_prompt_versions (bot_key, version, prompt, reason, created_by)
SELECT b.key, 1, b.prompt, 'versión inicial', 'sistema'
FROM public.bots b
WHERE NOT EXISTS (SELECT 1 FROM public.bot_prompt_versions v WHERE v.bot_key = b.key);

-- Verificación: 1 tabla con RLS y las versiones iniciales.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'bot_prompt_versions'
UNION ALL
SELECT 'versiones_sembradas: ' || count(*)::text, true FROM public.bot_prompt_versions;
