-- ============================================================================
-- 20271010151437_sibling_app_bug_intake.sql
-- ----------------------------------------------------------------------------
-- WHY
--   Director, 10 Oct 2026: the bug button in the five college apps (Mentor,
--   TMS, COE, Library, Event Forms) sends its reports into MyJKKN's own
--   bug_reports table instead of the separate central bug reporter. The apps
--   keep their button (@boobalan_jkkn/bug-reporter-sdk) and only change two
--   settings: the API URL (to www.jkkn.ai) and the API key.
--   The route that receives them is app/api/v1/public/bug-reports.
--
-- WHAT THIS ADDS
--   1. public.sibling_apps — one row per college app that may send bugs in.
--      Seeded with the five apps (slug + name only; github_repo and app_url are
--      left NULL because they were not verified when this was written).
--      RLS on. Read: super admins and admins. No client writes.
--   2. A third kind of api_keys row, key_kind = 'bug_intake', tied to one app
--      through the new nullable column api_keys.sibling_app_id.
--
--      THE KEY SHIPS TO EVERY BROWSER (the SDK reads it from a NEXT_PUBLIC_
--      variable), so it must be able to do exactly one thing: file a bug for
--      its own app. It is locked down four ways:
--        a. api_keys_bug_intake_shape_check pins every bug_intake row to
--           permissions {"read": false, "write": false}, no user, no role, no
--           college, no department, and a sibling app. The ~40 older routes
--           that hash a key and then check permissions.read refuse it for that
--           reason (the same way they refuse personal keys — see
--           20270301090000), and lib/mcp/auth-bridge.ts refuses it because it
--           is bound to no college.
--        b. lib/api-keys/authenticate.ts (every /api/b2a route) now accepts
--           only key_kind = 'admin' and refuses the jkkn_bi_ prefix before any
--           lookup. Several b2a/memory routes call it with no module, so the
--           permissions check alone would NOT have stopped this key there.
--        c. app/api/v1/transport-requests compares the raw bearer with
--           key_value. The plaintext of an intake key is public, so anyone can
--           compute its SHA-256; that route now refuses every row whose kind
--           is set and is not 'admin'.
--        d. fn_api_keys_bug_intake_guard freezes a bug_intake row: its kind,
--           secret, app, permissions, user and college can never change, it
--           cannot be turned back on once off, and clients cannot insert one.
--      The intake route itself accepts ONLY a bug_intake key (so the apps'
--      existing MYJKKN_API_KEY values, which read learner data, never work
--      there).
--   3. fn_bug_intake_key_create(p_app_slug, p_name) — issues a key. Returns
--      the plaintext ONCE; only its SHA-256 is stored, the same hashing as
--      every other api_keys row (lib/api-keys/authenticate.ts). Service role
--      only: a person runs it from the Supabase SQL editor. Not callable by
--      anon or signed-in users.
--   4. add_bug_reporter_as_participant() learns to skip a NULL reporter.
--      A bug from a college app is always filed with reporter_user_id = NULL:
--      its reporter email comes from a public key, so it is a claim and is
--      never matched to a MyJKKN profile. The AFTER INSERT trigger
--      trigger_add_bug_reporter_participant used to insert that NULL into
--      bug_report_participants.user_id (NOT NULL) and so failed the whole bug
--      insert. Body otherwise identical to the latest in-repo definition
--      (fix_bug_report_participants_rls.sql: SECURITY DEFINER), except a bare
--      ON CONFLICT DO NOTHING, which works whether or not the
--      (bug_report_id, user_id) unique constraint is present.
--
-- NOT IN THIS FILE
--   No real keys. No change to bug_reports. module_name on bug_reports is a
--   GENERATED column computed from page_url (20260906213000), so the intake
--   cannot set it; the app is recorded in application_id and
--   metadata.source_app instead.
--
-- FILE ONLY — NOT APPLIED. A person applies it after the PR is approved.
-- No BEGIN/COMMIT in the file. Safe to run twice.
-- ============================================================================

-- ─── 1. sibling_apps ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sibling_apps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  github_repo text,
  app_url     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sibling_apps IS
  'College apps outside MyJKKN (Mentor, TMS, COE, Library, Event Forms) that may file bugs into bug_reports through /api/v1/public/bug-reports with a bug_intake api key. bug_reports.application_id holds the id of the app a bug came from.';

ALTER TABLE public.sibling_apps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sibling_apps FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.sibling_apps TO authenticated;

DROP POLICY IF EXISTS sibling_apps_select_admin ON public.sibling_apps;
CREATE POLICY sibling_apps_select_admin ON public.sibling_apps
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()));

INSERT INTO public.sibling_apps (slug, name) VALUES
  ('mentor',      'Mentor'),
  ('tms',         'TMS'),
  ('coe',         'COE'),
  ('library',     'Library'),
  ('event-forms', 'Event Forms')
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. api_keys: the bug_intake kind ──────────────────────────────────────
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS sibling_app_id uuid REFERENCES public.sibling_apps(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.api_keys.sibling_app_id IS
  'Set only on key_kind = bug_intake: the college app this key files bugs for. NULL on every other key.';

COMMENT ON COLUMN public.api_keys.key_kind IS
  'admin = issued by an administrator in the API key screen (unchanged behaviour). personal = a person''s own key for the outside-AI MCP door; created only by fn_ai_personal_key_create, owner in user_id, never grants read/write to the service-role routes. bug_intake = a public, submit-only key for one sibling app (sibling_app_id); created only by fn_bug_intake_key_create, accepted only by /api/v1/public/bug-reports, never grants read/write anywhere.';

DO $$
BEGIN
  -- Widen the kind list. Re-created every run so a re-apply ends in the same
  -- state whichever list was there before.
  ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_key_kind_check;
  ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_key_kind_check CHECK (key_kind IN ('admin', 'personal', 'bug_intake'));

  -- Same for the shape rule: dropped and re-created every run, so a re-apply
  -- after its body changes never keeps the old definition silently.
  ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_bug_intake_shape_check;
  ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_bug_intake_shape_check CHECK (
        -- an app link is only ever on an intake key ...
        (sibling_app_id IS NULL OR key_kind = 'bug_intake')
        AND (
          key_kind <> 'bug_intake'
          -- ... and an intake key is linked to an app and can read/write nothing
          OR (
                sibling_app_id IS NOT NULL
            AND user_id IS NULL
            AND user_role IS NULL
            AND institution_id IS NULL
            AND department_id IS NULL
            AND permissions = '{"read": false, "write": false}'::jsonb
          )
        )
      );
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_bug_intake_app
  ON public.api_keys (sibling_app_id)
  WHERE key_kind = 'bug_intake';

-- ─── 2b. Freeze what makes an intake row safe ──────────────────────────────
-- Mirrors fn_api_keys_personal_guard (20270301090000, section 4b). SECURITY
-- INVOKER on purpose, so current_user names the role running the statement.
CREATE OR REPLACE FUNCTION public.fn_api_keys_bug_intake_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND TG_OP = 'INSERT' AND NEW.key_kind = 'bug_intake' THEN
    RAISE EXCEPTION 'Bug intake keys are made only with fn_bug_intake_key_create'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.key_kind = 'bug_intake' OR NEW.key_kind = 'bug_intake') THEN
    IF NEW.key_kind          IS DISTINCT FROM OLD.key_kind
       OR NEW.key_value      IS DISTINCT FROM OLD.key_value
       OR NEW.sibling_app_id IS DISTINCT FROM OLD.sibling_app_id
       OR NEW.permissions    IS DISTINCT FROM OLD.permissions
       OR NEW.user_id        IS DISTINCT FROM OLD.user_id
       OR NEW.user_role      IS DISTINCT FROM OLD.user_role
       OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
       OR NEW.created_at     IS DISTINCT FROM OLD.created_at
       OR (NEW.is_active IS TRUE AND OLD.is_active IS NOT TRUE)
    THEN
      RAISE EXCEPTION 'A bug intake key cannot be changed or turned back on. Make a new key instead.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_api_keys_bug_intake_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_api_keys_bug_intake_guard ON public.api_keys;
CREATE TRIGGER trg_api_keys_bug_intake_guard
  BEFORE INSERT OR UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.fn_api_keys_bug_intake_guard();

-- ─── 3. Issue a key ────────────────────────────────────────────────────────
-- Run as the service role (Supabase SQL editor):
--   SELECT public.fn_bug_intake_key_create('mentor');
-- Copy "key" from the result into the app's bug-reporter API key setting.
-- It is shown once and cannot be read back. To rotate, make a new key, switch
-- the app over, then turn the old one off in the API Keys screen.
CREATE OR REPLACE FUNCTION public.fn_bug_intake_key_create(
  p_app_slug text,
  p_name     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app   public.sibling_apps%ROWTYPE;
  v_name  text;
  v_plain text;
  v_now   timestamptz := now();
  v_row   public.api_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_app
    FROM public.sibling_apps
   WHERE slug = btrim(lower(COALESCE(p_app_slug, '')));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No sibling app with slug %', p_app_slug USING ERRCODE = 'P0002';
  END IF;
  IF v_app.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Sibling app % is turned off', v_app.slug USING ERRCODE = '22023';
  END IF;

  v_name := COALESCE(NULLIF(btrim(COALESCE(p_name, '')), ''), v_app.name || ' bug intake');
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Keep the key name under 80 characters' USING ERRCODE = '22023';
  END IF;

  v_plain := 'jkkn_bi_' || encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.api_keys (
    name, key_value, created_by, user_id, user_role, institution_id, department_id,
    key_kind, sibling_app_id, is_active, permissions, created_at, updated_at, expires_at
  ) VALUES (
    v_name,
    encode(extensions.digest(v_plain, 'sha256'), 'hex'),
    NULL, NULL, NULL, NULL, NULL,
    'bug_intake', v_app.id, true, '{"read": false, "write": false}'::jsonb,
    v_now, v_now, NULL
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',         v_row.id,
    'name',       v_row.name,
    'app',        v_app.slug,
    'key',        v_plain,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_intake_key_create(text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_intake_key_create(text, text) TO service_role;

COMMENT ON FUNCTION public.fn_bug_intake_key_create(text, text) IS
  'Issues a submit-only bug_intake api key for one sibling app. Returns the plaintext once; stores its SHA-256. Service role only.';

-- ─── 4. Participant trigger: skip a NULL reporter ──────────────────────────
CREATE OR REPLACE FUNCTION public.add_bug_reporter_as_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- bypasses RLS on bug_report_participants (fix_bug_report_participants_rls.sql)
SET search_path = public
AS $$
BEGIN
    -- Updated: 2026-10-10 - a bug filed by a college app carries no verified
    -- reporter (NULL), so there is no one to add; inserting NULL into the NOT NULL
    -- user_id failed the whole bug insert.
    IF NEW.reporter_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.bug_report_participants (
        bug_report_id,
        user_id,
        role,
        can_view_internal,
        is_active,
        joined_at
    )
    VALUES (
        NEW.id,
        NEW.reporter_user_id,
        'reporter',
        false,
        true,
        now()
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

-- ─── 5. Apply-time checks ──────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sibling_apps
       WHERE slug IN ('mentor', 'tms', 'coe', 'library', 'event-forms')) <> 5 THEN
    RAISE EXCEPTION 'sibling_apps seed incomplete';
  END IF;
  IF has_function_privilege('anon', 'public.fn_bug_intake_key_create(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_bug_intake_key_create(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_bug_intake_key_create must not be callable by anon or authenticated';
  END IF;
  IF has_table_privilege('anon', 'public.sibling_apps', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read sibling_apps';
  END IF;
END $$;
