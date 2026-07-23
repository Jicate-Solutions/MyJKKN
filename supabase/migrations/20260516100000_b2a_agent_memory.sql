-- ============================================================
-- B2A Phase 5 — Agent Memory System
-- ============================================================
-- Per HANDOFF-B2A-Transformation.md §7
-- Two tables:
--   b2a_agent_memories — generic memory entries (decision/observation/pattern/changelog/preference/context)
--   b2a_decision_log    — structured decision log subset
--
-- Access model: service-role only at runtime (B2A routes use service role
-- client per §10.1 of handoff). Admins can read for audit purposes.
-- ============================================================

-- ─── b2a_agent_memories ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.b2a_agent_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id      UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  institution_id  UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  memory_type     TEXT NOT NULL CHECK (memory_type IN (
                    'decision','observation','pattern','changelog','preference','context'
                  )),
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  importance      INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  expires_at      TIMESTAMPTZ,
  superseded_by   UUID REFERENCES public.b2a_agent_memories(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2a_memories_key         ON public.b2a_agent_memories(api_key_id);
CREATE INDEX IF NOT EXISTS idx_b2a_memories_institution ON public.b2a_agent_memories(institution_id);
CREATE INDEX IF NOT EXISTS idx_b2a_memories_type        ON public.b2a_agent_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_b2a_memories_tags        ON public.b2a_agent_memories USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_b2a_memories_importance  ON public.b2a_agent_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_b2a_memories_created     ON public.b2a_agent_memories(created_at DESC);

COMMENT ON TABLE public.b2a_agent_memories IS
  'B2A Phase 5: Agent memory entries. Service-role writes only via /api/b2a/memory routes.';
COMMENT ON COLUMN public.b2a_agent_memories.content IS
  'Free-form JSONB payload — shape varies by memory_type. See handoff §7.3 for canonical schemas.';
COMMENT ON COLUMN public.b2a_agent_memories.superseded_by IS
  'Self-reference for memory evolution — a newer memory that replaces this one.';

-- ─── b2a_decision_log ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.b2a_decision_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id         UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  institution_id     UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  decision_title     TEXT NOT NULL CHECK (length(decision_title) BETWEEN 1 AND 500),
  context            JSONB NOT NULL DEFAULT '{}'::jsonb,
  options_considered JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision_made      TEXT NOT NULL,
  rationale          TEXT NOT NULL,
  outcome            JSONB,
  modules_involved   TEXT[] NOT NULL DEFAULT '{}',
  decided_by         TEXT NOT NULL CHECK (decided_by IN ('agent','human','human_via_agent')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2a_decisions_key         ON public.b2a_decision_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_b2a_decisions_institution ON public.b2a_decision_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_b2a_decisions_modules     ON public.b2a_decision_log USING GIN(modules_involved);
CREATE INDEX IF NOT EXISTS idx_b2a_decisions_created     ON public.b2a_decision_log(created_at DESC);

COMMENT ON TABLE public.b2a_decision_log IS
  'B2A Phase 5: Structured decision log. Outcome filled in after-the-fact when results land.';

-- ─── updated_at triggers ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.b2a_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_b2a_memories_touch ON public.b2a_agent_memories;
CREATE TRIGGER trg_b2a_memories_touch
  BEFORE UPDATE ON public.b2a_agent_memories
  FOR EACH ROW EXECUTE FUNCTION public.b2a_touch_updated_at();

DROP TRIGGER IF EXISTS trg_b2a_decisions_touch ON public.b2a_decision_log;
CREATE TRIGGER trg_b2a_decisions_touch
  BEFORE UPDATE ON public.b2a_decision_log
  FOR EACH ROW EXECUTE FUNCTION public.b2a_touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────
-- Service role bypasses RLS automatically. Policies here exist for:
--   (a) Admins reading memories/decisions via admin UI (future)
--   (b) Defense in depth — if anon/authenticated client ever queries directly, returns nothing

ALTER TABLE public.b2a_agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2a_decision_log    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to make this migration idempotent
DROP POLICY IF EXISTS "Admins view b2a memories"  ON public.b2a_agent_memories;
DROP POLICY IF EXISTS "Admins view b2a decisions" ON public.b2a_decision_log;

CREATE POLICY "Admins view b2a memories" ON public.b2a_agent_memories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin')
    )
  );

CREATE POLICY "Admins view b2a decisions" ON public.b2a_decision_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin')
    )
  );
