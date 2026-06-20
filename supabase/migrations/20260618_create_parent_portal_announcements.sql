-- Migration: Parent Portal — Phase A2 (Announcements)
-- Created: 2026-06-18
-- Spec: docs/spec-Myjkkn-Parent-Portal.md → pp_announcements
--
-- Read-only for parents (the portal GETs these); staff author them in the
-- Phase A.5 admin surface. Targeting: institution-wide, or narrowed to a
-- program (class) / section / a single learner.

CREATE TABLE IF NOT EXISTS public.pp_announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  category        VARCHAR(50),                       -- general, exam, fee, holiday, event
  audience        VARCHAR(20) NOT NULL DEFAULT 'all'
                    CHECK (audience IN ('all','class','section','learner')),
  program_id         UUID,                           -- targeting (audience='class')
  section_id         UUID,                           -- targeting (audience='section')
  learner_profile_id UUID,                           -- targeting (audience='learner')
  banner_url      TEXT,
  link_url        TEXT,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  created_by      UUID,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_announcements_inst
  ON public.pp_announcements(institutions_id, is_active, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_announcements_section
  ON public.pp_announcements(section_id);

DROP TRIGGER IF EXISTS trg_pp_announcements_updated_at ON public.pp_announcements;
CREATE TRIGGER trg_pp_announcements_updated_at
  BEFORE UPDATE ON public.pp_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: defense-in-depth; the portal reads via the service-role client.
ALTER TABLE public.pp_announcements ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pp_announcements IS 'Parent Portal: announcements shown to parents, optionally targeted by class/section/learner.';
