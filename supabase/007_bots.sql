-- =====================================================================
-- 007_bots.sql · Madison
-- Módulo 5 · Bots y evaluador: bots, sesiones, conversaciones, leads,
-- códigos ENLACE, conocimiento (RAG con pgvector) y reportes del supervisor.
--
-- Después de ejecutar este archivo, volver a ejecutar rls_lockdown.sql.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- Bots. Un bot por número de WhatsApp; se elige por el `To` del webhook.
-- Las credenciales de Twilio viven en variables de entorno, NUNCA aquí.
-- bots.prompt es el prompt VIGENTE (el versionado llega en el Módulo 6).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bots (
  key            text PRIMARY KEY,          -- 'ventas', 'soporte', 'retencion', 'inbox'
  name           text NOT NULL,
  role           text NOT NULL CHECK (role IN ('soporte','ventas','retencion','inbox')),
  prompt         text NOT NULL DEFAULT '',
  twilio_number  text UNIQUE,               -- 'whatsapp:+34...' (solo el número, no credenciales)
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.bots TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_bots_updated_at ON public.bots;
CREATE TRIGGER trg_bots_updated_at BEFORE UPDATE ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Plantillas de WhatsApp (fuera de la ventana de 24 h solo sale plantilla).
-- Se aprueban por número en Meta; content_sid es el id de Twilio.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL,
  language     text NOT NULL DEFAULT 'es',
  content_sid  text NOT NULL,
  variables    jsonb NOT NULL DEFAULT '{}'::jsonb,
  bot_key      text REFERENCES public.bots(key) ON DELETE CASCADE,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, language, bot_key)
);
GRANT ALL ON TABLE public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Sesión de conversación por (teléfono, bot). Historial corto (≤20) para
-- el contexto del modelo; el espejo completo vive en bot_conversations.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text NOT NULL,             -- E.164 sin 'whatsapp:'
  bot_key         text NOT NULL REFERENCES public.bots(key) ON DELETE CASCADE,
  messages        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{role, content, at}] ≤ 20
  identified      boolean NOT NULL DEFAULT false,
  user_info       jsonb,                     -- {student_id, name, email, ...} cuando se identifica
  pending_verify  jsonb,                     -- verificación en dos pasos pendiente (documento → correo)
  pending_ticket  jsonb,                     -- propuesta de ticket esperando sí/no
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone, bot_key)
);
GRANT ALL ON TABLE public.whatsapp_sessions TO service_role;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_wa_sessions_updated_at ON public.whatsapp_sessions;
CREATE TRIGGER trg_wa_sessions_updated_at BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Espejo persistente de cada conversación; lo lee el evaluador (cron).
-- session_id = 'wa:{bot}:{phone}'.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_conversations (
  session_id     text PRIMARY KEY,
  bot_key        text NOT NULL REFERENCES public.bots(key) ON DELETE CASCADE,
  messages       jsonb NOT NULL DEFAULT '[]'::jsonb,
  message_count  integer NOT NULL DEFAULT 0,
  contact_email  text,
  source         text NOT NULL DEFAULT 'whatsapp',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.bot_conversations TO service_role;
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bot_conversations_bot_updated_idx ON public.bot_conversations(bot_key, updated_at DESC);
DROP TRIGGER IF EXISTS trg_bot_conversations_updated_at ON public.bot_conversations;
CREATE TRIGGER trg_bot_conversations_updated_at BEFORE UPDATE ON public.bot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Leads de ventas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_key           text REFERENCES public.bots(key) ON DELETE SET NULL,
  phone             text NOT NULL,
  name              text,
  email             text,
  program_interest  text,
  prior_studies     text,
  stage             text NOT NULL DEFAULT 'nuevo'
                    CHECK (stage IN ('nuevo','contactable','calificado','interesado','inscrito','descartado')),
  qualified         boolean NOT NULL DEFAULT false,
  notes             text,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_key, phone)
);
GRANT ALL ON TABLE public.sales_leads TO service_role;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_sales_leads_updated_at ON public.sales_leads;
CREATE TRIGGER trg_sales_leads_updated_at BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Códigos ENLACE-#### para pasar del bot al buzón humano. Caducan a 48 h.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handoff_codes (
  code             text PRIMARY KEY,          -- 'ENLACE-1234'
  customer_phone   text NOT NULL,
  bot_key          text REFERENCES public.bots(key) ON DELETE SET NULL,
  summary          text,
  language         text DEFAULT 'es',
  topic            text,
  student_name     text,
  document_number  text,
  used             boolean NOT NULL DEFAULT false,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at       timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.handoff_codes TO service_role;
ALTER TABLE public.handoff_codes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Conocimiento (RAG). El artículo entero en knowledge; los trozos con su
-- embedding en knowledge_chunks. Búsqueda híbrida en src/lib/knowledge.ts:
-- palabras clave primero, vectorial (umbral 0,20) en paralelo, nunca lanza.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knowledge (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_key      text NOT NULL REFERENCES public.bots(key) ON DELETE CASCADE,
  title        text NOT NULL,
  content      text NOT NULL,
  category     text,
  enabled      boolean NOT NULL DEFAULT true,
  chunk_count  integer NOT NULL DEFAULT 0,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.knowledge TO service_role;
ALTER TABLE public.knowledge ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS knowledge_bot_idx ON public.knowledge(bot_key) WHERE enabled;
DROP TRIGGER IF EXISTS trg_knowledge_updated_at ON public.knowledge;
CREATE TRIGGER trg_knowledge_updated_at BEFORE UPDATE ON public.knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id  uuid NOT NULL REFERENCES public.knowledge(id) ON DELETE CASCADE,
  bot_key       text NOT NULL,
  content       text NOT NULL,
  chunk_index   integer NOT NULL,
  embedding     vector(1536),
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.knowledge_chunks TO service_role;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS knowledge_chunks_knowledge_idx ON public.knowledge_chunks(knowledge_id);
-- ivfflat necesita filas para entrenar; con pocas funciona igual (seq scan).
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_bot_key text
)
RETURNS TABLE (knowledge_id uuid, title text, content text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.title, c.content, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge k ON k.id = c.knowledge_id
  WHERE c.bot_key = p_bot_key
    AND k.enabled
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
REVOKE ALL ON FUNCTION public.match_knowledge(vector, float, int, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(vector, float, int, text) TO service_role;

-- ---------------------------------------------------------------------
-- Reportes del supervisor (cron diario por bot). Único por (fecha, bot).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisor_reports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date             date NOT NULL,
  bot_key                 text NOT NULL REFERENCES public.bots(key) ON DELETE CASCADE,
  conversations_analyzed  integer NOT NULL DEFAULT 0,
  total_messages          integer NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','sin_conversaciones','error')),
  executive_summary       text,
  strengths               jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses              jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_gaps          jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_suggestions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  full_report             text,
  quality_score           numeric(4,1),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_date, bot_key)
);
GRANT ALL ON TABLE public.supervisor_reports TO service_role;
ALTER TABLE public.supervisor_reports ENABLE ROW LEVEL SECURITY;

-- Semilla: los cuatro bots (número de Twilio se rellena luego en la pantalla).
INSERT INTO public.bots (key, name, role, prompt) VALUES
  ('ventas', 'Bot de ventas', 'ventas', 'Eres el asistente comercial de Madison. Responde en el idioma del cliente, presenta los programas con claridad y pide con naturalidad nombre, correo y programa de interés. No inventes precios ni fechas: usa solo el conocimiento proporcionado.'),
  ('soporte', 'Bot de soporte', 'soporte', 'Eres el asistente de soporte para estudiantes de Madison. Solo ayudas a estudiantes identificados. Sé claro y breve; si no puedes resolver, ofrece crear un ticket o pasar con una persona.'),
  ('retencion', 'Bot de retención', 'retencion', 'Eres el asistente de acompañamiento académico de Madison. Contactas con estudiantes para interesarte por su avance y proponer compromisos concretos de retomar el estudio.'),
  ('inbox', 'Buzón humano', 'inbox', 'Buzón atendido por personas. No respondas automáticamente salvo para validar el código ENLACE y encuestas de cierre.')
ON CONFLICT (key) DO NOTHING;

-- Verificación: 9 tablas con RLS.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('bots','whatsapp_templates','whatsapp_sessions','bot_conversations','sales_leads','handoff_codes','knowledge','knowledge_chunks','supervisor_reports')
ORDER BY 1;
