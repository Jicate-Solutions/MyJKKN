-- =============================================================================
-- Meetings — Routing Forms (Calendly "Routing Forms" parity)  [M1]
-- Migration: meet_routing_forms
-- Added: 2026-06-17 — Universal Booking Module 1
-- =============================================================================
--
-- A public form (headline + description + questions) whose answers route the
-- visitor to ONE of several destinations via ORDERED, first-match-wins rules
-- plus a default "in all other cases" destination. Three destination types:
--   1. event_link  — an internal scheduling URL (e.g. /meet/[handle] or /book/[slug])
--   2. url         — an external URL
--   3. message     — a rich (markdown) message rendered in place
--
-- Tables:
--   routing_forms          — the form (host, optional institution, slug, fields)
--   routing_form_rules     — ordered IF/THEN rules + the default destination
--   routing_form_responses — one row per public submission (answers + resolution)
--
-- PUBLIC ACCESS MODEL
--   Anonymous visitors must be able to (a) READ an active form by slug + its
--   rules to render it, and (b) WRITE a response. RLS denies anon on the base
--   tables; instead two SECURITY DEFINER RPCs are the ONLY anon entry points:
--     fn_get_active_routing_form(slug)      — public READ  (explicit GRANT anon)
--     fn_submit_routing_form_response(...)  — public WRITE (explicit GRANT anon)
--   These grants are DELIBERATE (the form is public-by-design); every other
--   new function is locked from anon per CLAUDE.md "MANDATORY: Lock new RPCs".
--
-- This migration is idempotent (CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE FUNCTION) and ends with NOTIFY pgrst, 'reload schema'.
-- DRAFT: NOT applied to any database — needs lead review.
-- =============================================================================

-- 1. ─── routing_forms ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.routing_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  headline text,
  description text,
  -- array of {key, label, type:'text'|'select'|'multiselect', options?, required}
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.routing_forms IS
  'Routing Forms (Calendly parity) — a public form at /r/[slug] whose answers route the visitor to a destination via ordered rules. fields is an array of {key,label,type,options?,required}.';

CREATE INDEX IF NOT EXISTS idx_routing_forms_host
  ON public.routing_forms(host_profile_id);
CREATE INDEX IF NOT EXISTS idx_routing_forms_slug_active
  ON public.routing_forms(slug) WHERE is_active = true;

-- 2. ─── routing_form_rules ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.routing_form_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.routing_forms(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  -- 'all' = every condition must match (AND); 'any' = at least one (OR)
  match_logic text NOT NULL DEFAULT 'all',
  -- array of {field_key, operator:'is'|'is_not'|'contains', value}
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  destination_type text NOT NULL,
  -- shape depends on destination_type: {url} for event_link/url, {markdown} for message
  destination_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- the single "in all other cases" fallback rule (conditions ignored)
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rfr_match_logic_check CHECK (match_logic IN ('all', 'any')),
  CONSTRAINT rfr_destination_type_check CHECK (
    destination_type IN ('event_link', 'url', 'message')
  )
);

COMMENT ON TABLE public.routing_form_rules IS
  'Ordered routing rules for a routing_form. Evaluated by order_index ASC, first match wins; the is_default row is the "in all other cases" fallback. conditions is an array of {field_key,operator,value}; destination_value is {url} for event_link/url or {markdown} for message.';

CREATE INDEX IF NOT EXISTS idx_routing_form_rules_form
  ON public.routing_form_rules(form_id, order_index);
-- At most one default rule per form.
CREATE UNIQUE INDEX IF NOT EXISTS uq_routing_form_rules_default
  ON public.routing_form_rules(form_id) WHERE is_default = true;

-- 3. ─── routing_form_responses ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.routing_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.routing_forms(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_rule_id uuid REFERENCES public.routing_form_rules(id) ON DELETE SET NULL,
  resolved_destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  attendee_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.routing_form_responses IS
  'One row per public submission of a routing_form: the visitor answers, which rule matched (null = default/no match), and the resolved destination. Written ONLY by fn_submit_routing_form_response (anon has no INSERT policy).';

CREATE INDEX IF NOT EXISTS idx_routing_form_responses_form
  ON public.routing_form_responses(form_id, created_at DESC);

-- =============================================================================
-- RLS — standard project pattern
--   read: is_super_admin() OR is_admin()
--         OR (user_has_permission('meetings.routing.view')
--             AND role_has_institution_access(institution_id))
--   The host themselves can always read their own forms/rules/responses.
--   No anon policies — public access is exclusively via the two RPCs below.
-- =============================================================================

ALTER TABLE public.routing_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_form_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_form_responses ENABLE ROW LEVEL SECURITY;

-- ── routing_forms ──
DROP POLICY IF EXISTS "routing_forms_select" ON public.routing_forms;
CREATE POLICY "routing_forms_select" ON public.routing_forms
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR host_profile_id = auth.uid()
  OR (user_has_permission('meetings.routing.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "routing_forms_insert" ON public.routing_forms;
CREATE POLICY "routing_forms_insert" ON public.routing_forms
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (host_profile_id = auth.uid()
      AND user_has_permission('meetings.routing.manage'))
);

DROP POLICY IF EXISTS "routing_forms_update" ON public.routing_forms;
CREATE POLICY "routing_forms_update" ON public.routing_forms
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR host_profile_id = auth.uid()
  OR (user_has_permission('meetings.routing.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "routing_forms_delete" ON public.routing_forms;
CREATE POLICY "routing_forms_delete" ON public.routing_forms
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR host_profile_id = auth.uid()
);

-- ── routing_form_rules (scoped through the parent form) ──
DROP POLICY IF EXISTS "routing_form_rules_select" ON public.routing_form_rules;
CREATE POLICY "routing_form_rules_select" ON public.routing_form_rules
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.routing_forms f
    WHERE f.id = routing_form_rules.form_id
      AND (
        f.host_profile_id = auth.uid()
        OR (user_has_permission('meetings.routing.view')
            AND role_has_institution_access(f.institution_id))
      )
  )
);

DROP POLICY IF EXISTS "routing_form_rules_write" ON public.routing_form_rules;
CREATE POLICY "routing_form_rules_write" ON public.routing_form_rules
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.routing_forms f
    WHERE f.id = routing_form_rules.form_id
      AND (
        f.host_profile_id = auth.uid()
        OR (user_has_permission('meetings.routing.manage')
            AND role_has_institution_access(f.institution_id))
      )
  )
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.routing_forms f
    WHERE f.id = routing_form_rules.form_id
      AND (
        f.host_profile_id = auth.uid()
        OR (user_has_permission('meetings.routing.manage')
            AND role_has_institution_access(f.institution_id))
      )
  )
);

-- ── routing_form_responses (read-only for staff; written via RPC) ──
DROP POLICY IF EXISTS "routing_form_responses_select" ON public.routing_form_responses;
CREATE POLICY "routing_form_responses_select" ON public.routing_form_responses
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.routing_forms f
    WHERE f.id = routing_form_responses.form_id
      AND (
        f.host_profile_id = auth.uid()
        OR (user_has_permission('meetings.routing.view')
            AND role_has_institution_access(f.institution_id))
      )
  )
);
-- No INSERT/UPDATE/DELETE policy — responses are written exclusively by
-- fn_submit_routing_form_response (SECURITY DEFINER, bypasses RLS).

-- =============================================================================
-- updated_at trigger for routing_forms (reuse the shared touch function if it
-- exists; otherwise create a local one).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_routing_forms_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_routing_forms_touch_updated_at() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_routing_forms_touch_updated_at() TO authenticated;

DROP TRIGGER IF EXISTS trg_routing_forms_touch ON public.routing_forms;
CREATE TRIGGER trg_routing_forms_touch
  BEFORE UPDATE ON public.routing_forms
  FOR EACH ROW EXECUTE FUNCTION public.fn_routing_forms_touch_updated_at();

-- =============================================================================
-- PUBLIC RPC 1 — read an active form + its rules by slug (anon-callable).
-- Returns a single jsonb document so the public page does ONE round-trip and
-- never touches the base tables (which deny anon). NULL when slug unknown or
-- the form is inactive — the public page renders an explicit "not found".
--
-- destination_value of rules IS returned (the public submit endpoint needs to
-- resolve event_link/url targets); this is public-by-design data — a routing
-- form's destinations are visible to anyone who completes the form anyway.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_active_routing_form(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form   public.routing_forms%ROWTYPE;
  v_rules  jsonb;
BEGIN
  SELECT * INTO v_form
  FROM public.routing_forms
  WHERE slug = p_slug
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'order_index', r.order_index,
               'match_logic', r.match_logic,
               'conditions', r.conditions,
               'destination_type', r.destination_type,
               'destination_value', r.destination_value,
               'is_default', r.is_default
             )
             ORDER BY r.is_default ASC, r.order_index ASC
           ),
           '[]'::jsonb
         )
  INTO v_rules
  FROM public.routing_form_rules r
  WHERE r.form_id = v_form.id;

  RETURN jsonb_build_object(
    'id', v_form.id,
    'slug', v_form.slug,
    'title', v_form.title,
    'headline', v_form.headline,
    'description', v_form.description,
    'fields', v_form.fields,
    'rules', v_rules
  );
END;
$$;

-- INTENTIONAL PUBLIC GRANT: routing forms render on an unauthenticated public
-- page (/r/[slug]); anon MUST be able to read the active form to fill it in.
-- This is the deliberate audit-trail signal that the anon grant is by design,
-- not the Supabase default (see CLAUDE.md "MANDATORY: Lock new RPCs from anon").
REVOKE EXECUTE ON FUNCTION public.fn_get_active_routing_form(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_active_routing_form(text) TO anon, authenticated;

-- =============================================================================
-- PUBLIC RPC 2 — persist a routing-form response (anon-callable).
-- The route handler does the rule evaluation (shared pure evaluator) and passes
-- the matched rule + resolved destination in; this RPC only validates the form
-- is active and inserts the row, returning its id. Inserting via the base table
-- is impossible for anon (no INSERT policy), so this SECURITY DEFINER RPC is the
-- only write path.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_submit_routing_form_response(
  p_slug                 text,
  p_answers              jsonb,
  p_matched_rule_id      uuid,
  p_resolved_destination jsonb,
  p_attendee_email       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_id uuid;
  v_resp_id uuid;
BEGIN
  SELECT id INTO v_form_id
  FROM public.routing_forms
  WHERE slug = p_slug
    AND is_active = true
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RAISE EXCEPTION 'routing form not found or inactive: %', p_slug
      USING ERRCODE = 'no_data_found';
  END IF;

  -- matched_rule_id must belong to this form (or be NULL for "no match").
  IF p_matched_rule_id IS NOT NULL THEN
    PERFORM 1
    FROM public.routing_form_rules
    WHERE id = p_matched_rule_id AND form_id = v_form_id;
    IF NOT FOUND THEN
      p_matched_rule_id := NULL; -- ignore a foreign/forged rule id
    END IF;
  END IF;

  INSERT INTO public.routing_form_responses
    (form_id, answers, matched_rule_id, resolved_destination, attendee_email)
  VALUES
    (v_form_id,
     COALESCE(p_answers, '{}'::jsonb),
     p_matched_rule_id,
     COALESCE(p_resolved_destination, '{}'::jsonb),
     NULLIF(trim(p_attendee_email), ''))
  RETURNING id INTO v_resp_id;

  RETURN v_resp_id;
END;
$$;

-- INTENTIONAL PUBLIC GRANT: a public visitor submits the routing form without
-- authenticating; anon MUST be able to record the response. Deliberate grant,
-- not the Supabase default.
REVOKE EXECUTE ON FUNCTION public.fn_submit_routing_form_response(text, jsonb, uuid, jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_submit_routing_form_response(text, jsonb, uuid, jsonb, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
