-- ============================================================================
-- event_ig_posts — link an Events Hub event to the Instagram posts that
-- covered it, so an event's console can answer one question: "how was this
-- received on Instagram?"
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- Nothing in the Events UI works until it is applied. Apply with Supabase
-- `apply_migration` (never `execute_sql` — that runs the SQL but writes no
-- supabase_migrations.schema_migrations row, which is how most of this repo's
-- migrations ended up with no ledger entry).
--
-- ---------------------------------------------------------------------------
-- WHY A NEW TABLE — checked before writing, not assumed
-- ---------------------------------------------------------------------------
-- `events` already carries poster_url, caption_text, social_published_at and
-- social_platforms (added by 20260417000001_events_phase_1a_extend_events_and_
-- categories.sql). They are NOT reusable here, for three separate reasons:
--
--   1. Wrong direction. They describe OUTBOUND publishing — the poster we
--      intend to post, the caption we intend to use, when we published, which
--      platforms we published to. Reception is INBOUND: posts that already
--      exist as ig_posts rows, with engagement we did not author.
--   2. Wrong cardinality. One text column cannot hold N posts. An event is
--      routinely covered by several posts (and one post can cover several
--      events), so the link is many-to-many and needs its own grain.
--   3. They are dead. No file in the repo reads or writes any of the four
--      outside the migration that created them and the generated
--      types/supabase.ts. In production: 0 of 51 events have a poster_url,
--      0 have caption_text, 0 have social_published_at, and social_platforms
--      is '{}' on all 51.
--
-- Those four columns are therefore left completely untouched by this migration.
--
-- ---------------------------------------------------------------------------
-- GRAIN
-- ---------------------------------------------------------------------------
-- One row per (event, ig post). UNIQUE on the pair, so linking the same post
-- twice is a constraint violation the API turns into a plain message rather
-- than a duplicate row.
--
-- This table records a HUMAN's claim that a post covered an event. It is
-- deliberately not inferred: time proximity between a post and an event is a
-- suggestion, never proof, so nothing here is ever written automatically.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_ig_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id)    ON DELETE CASCADE,
  ig_post_id     UUID NOT NULL REFERENCES public.ig_posts(id)  ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  linked_by      UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  linked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_ig_posts UNIQUE (event_id, ig_post_id)
);

COMMENT ON TABLE public.event_ig_posts IS
  'Instagram posts a person has said covered an event — one row per (event, ig post). It is a claim of coverage, not a measurement: nothing writes here automatically, because a post published near an event is not evidence it was about that event.';
COMMENT ON COLUMN public.event_ig_posts.institution_id IS
  'The institution, stamped from the EVENT by trg_event_ig_posts_scope. It carries the multi-tenant RLS and is not a free field. Deliberately taken from the event and not from the posting account: a central handle may legitimately cover one institution''s event, and scoping by the event is what decides who may read that event''s reception.';
COMMENT ON COLUMN public.event_ig_posts.linked_by IS
  'Who claimed the coverage. Kept because the link is a judgement call that another person may want to question.';

CREATE INDEX IF NOT EXISTS idx_event_ig_posts_event
  ON public.event_ig_posts (event_id);
CREATE INDEX IF NOT EXISTS idx_event_ig_posts_post
  ON public.event_ig_posts (ig_post_id);
CREATE INDEX IF NOT EXISTS idx_event_ig_posts_institution
  ON public.event_ig_posts (institution_id);

REVOKE ALL ON public.event_ig_posts FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.event_ig_posts TO authenticated;
ALTER TABLE public.event_ig_posts ENABLE ROW LEVEL SECURITY;

-- No UPDATE grant and no UPDATE policy, on purpose: a link has no editable
-- field. Correcting a wrong link means deleting it and linking the right post,
-- which keeps linked_by/linked_at honest about who made the surviving claim.

-- ---------------------------------------------------------------------------
-- Tenant stamp
-- ---------------------------------------------------------------------------
-- Without this the RLS below is decorative: a caller could send any
-- institution_id they happen to be allowed to see and file an event's
-- reception under a different institution.
--
-- Unlike fn_event_target_class_scope, this does NOT reject a post whose
-- account belongs to another institution. JKKN runs central handles that cover
-- individual institutions' events, so blocking that would make legitimate
-- links impossible. The API surfaces the mismatch to the person linking
-- instead of refusing it.
CREATE OR REPLACE FUNCTION public.fn_event_ig_post_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_institution UUID;
BEGIN
  SELECT e.institution_id INTO v_event_institution
    FROM public.events e WHERE e.id = NEW.event_id;

  IF v_event_institution IS NULL THEN
    RAISE EXCEPTION 'event_ig_posts: event % does not exist, or has no institution', NEW.event_id
      USING ERRCODE = '23503';
  END IF;

  NEW.institution_id := v_event_institution;
  RETURN NEW;
END;
$$;

-- Trigger-only, same reasoning as fn_event_target_class_scope: EXECUTE is
-- checked at CREATE TRIGGER time, not per firing, so no role is granted it.
REVOKE EXECUTE ON FUNCTION public.fn_event_ig_post_scope() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_ig_posts_scope ON public.event_ig_posts;
CREATE TRIGGER trg_event_ig_posts_scope
  BEFORE INSERT ON public.event_ig_posts
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_ig_post_scope();

-- ---------------------------------------------------------------------------
-- RLS — the standard MyJKKN shape. No role name is named anywhere.
-- ---------------------------------------------------------------------------
-- Reading an event's reception rides events.view: whoever can see the event can
-- see how it was received. Making the claim needs its own key, because saying
-- "this post was about this event" is an assertion the institution's
-- accreditation evidence may later lean on.

DROP POLICY IF EXISTS event_ig_posts_select ON public.event_ig_posts;
CREATE POLICY event_ig_posts_select ON public.event_ig_posts
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.view')
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS event_ig_posts_insert ON public.event_ig_posts;
CREATE POLICY event_ig_posts_insert ON public.event_ig_posts
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.social.manage')
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS event_ig_posts_delete ON public.event_ig_posts;
CREATE POLICY event_ig_posts_delete ON public.event_ig_posts
  FOR DELETE
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.social.manage')
        AND public.role_has_institution_access(institution_id))
  );
