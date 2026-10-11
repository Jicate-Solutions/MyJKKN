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
--   No real keys. module_name on bug_reports is a
--   GENERATED column computed from page_url (20260906213000), so the intake
--   cannot set it; the app is recorded in application_id and
--   metadata.source_app instead.
--
-- CHANGES TO bug_reports (section 1b): status 'unverified' added to
--   bug_reports_status_check (the intake's quarantine status, read by no
--   automation); FK bug_reports_application_id_sibling_fkey → sibling_apps;
--   index idx_bug_reports_application_created; unique expression index
--   uq_bug_reports_intake_dedup. reporter_user_id, institution_id and
--   department_id are ALWAYS NULL on an intake row (the email is a claim).
-- ASSISTANT TOOLS (section 4b): ai_rpc_bug_reports and ai_rpc_bug_report_details
--   are replaced with quarantine-aware bodies (skip / refuse 'unverified'),
--   only if the live body matches the in-repo one (md5 check); else it stops.
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

-- ─── 1b. bug_reports: quarantine status, app link, intake lookups ─────────
-- 'unverified': every college-app bug arrives with this status. No automated
-- consumer reads it: fn_bug_cluster_scan clusters only new/seen/in_progress
-- (20261222000000), and the auto-resolve scan and the Max-lane cluster fixers
-- work from those clusters. An admin moves it to 'new' after reading it.
-- Same list as 20260717061500 plus 'unverified'; re-created every run.
-- Asserted first, in the same DO block as the DROP + ADD, so the file is safe
-- on its own: every status a live row holds must be in the new list. If a
-- later migration added a status this list does not know, it stops here and
-- the old check stays in place.
DO $$
DECLARE
  v_allowed text[] := ARRAY['new', 'unverified', 'seen', 'in_progress', 'resolved', 'wont_fix', 'duplicate'];
  v_unknown text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO v_unknown
    FROM public.bug_reports
   WHERE status IS NOT NULL AND NOT (status = ANY (v_allowed));
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'bug_reports holds statuses this migration does not list: %. Add them to v_allowed first.', v_unknown;
  END IF;
  ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
  ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_status_check
    CHECK (status = ANY (ARRAY['new'::text, 'unverified'::text, 'seen'::text, 'in_progress'::text,
                               'resolved'::text, 'wont_fix'::text, 'duplicate'::text]));
END $$;

-- application_id is a nullable uuid with no foreign key today, and no row uses
-- it (checked live 11 Oct 2026: 0 of 3,607). From now on it means "the college
-- app this bug came from", so it references sibling_apps. Added only if absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bug_reports_application_id_sibling_fkey'
                    AND conrelid = 'public.bug_reports'::regclass) THEN
    ALTER TABLE public.bug_reports
      ADD CONSTRAINT bug_reports_application_id_sibling_fkey
      FOREIGN KEY (application_id) REFERENCES public.sibling_apps(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- The intake's caps count an app's reports in the last day.
CREATE INDEX IF NOT EXISTS idx_bug_reports_application_created
  ON public.bug_reports (application_id, created_at)
  WHERE application_id IS NOT NULL;

-- Double-submit guard: the intake writes metadata.intake_dedup_key (a hash of
-- app, caller, reporter email, page, title, description and a 2-minute window;
-- the lookup checks this window and the previous one). Two
-- identical submits in one window collide here and the second is answered with
-- the first bug, atomically.
-- Partial: only intake rows (metadata.source = 'sibling_app' with an app).
-- A tool that copies a bug's metadata into another kind of row never collides.
-- A tool that clones an intake row itself must drop intake_dedup_key from the
-- copy. The intake's lookup repeats this predicate so it can use the index.
DROP INDEX IF EXISTS public.uq_bug_reports_intake_dedup;
CREATE UNIQUE INDEX uq_bug_reports_intake_dedup
  ON public.bug_reports ((metadata->>'intake_dedup_key'))
  WHERE (metadata->>'source') = 'sibling_app' AND application_id IS NOT NULL;

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
        -- COALESCE: a NULL kind is an administrator key and may not carry a link
        (sibling_app_id IS NULL OR COALESCE(key_kind, 'admin') = 'bug_intake')
        AND (
          COALESCE(key_kind, 'admin') <> 'bug_intake'
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

-- ─── 4b. Assistant tools never read quarantined bugs ───────────────────────
-- ai_rpc_bug_reports (list) and ai_rpc_bug_report_details are how the
-- assistant reads bug_reports. Both now skip status 'unverified'.
-- ai_rpc_my_bug_reports needs no change: it lists the caller's own bugs, and an
-- intake row has no reporter. Each body below is the latest in-repo one
-- (20260712134500 / 20270308090000) plus the quarantine lines. Before it is
-- replaced, the LIVE body is fingerprinted: if it differs from that in-repo
-- version, this stops rather than overwrite someone's newer change. A database
-- without the function (a fresh test database) is left alone.
DO $quarantine$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = to_regprocedure('public.ai_rpc_bug_reports(uuid,text,text,integer,integer)');
  IF v_md5 IS NOT NULL AND v_md5 NOT IN ('081db5b60bcd592fdb9b9d2b45f2607b', '27596b1c392b82c41b2b7b6ca7cc6194') THEN
    RAISE EXCEPTION 'live ai_rpc_bug_reports differs from 20260712134500 (md5 %); refresh section 4b of this migration', v_md5;
  END IF;
  IF v_md5 IS NOT NULL THEN
    EXECUTE $create_list$CREATE OR REPLACE FUNCTION public.ai_rpc_bug_reports(p_user_id uuid, p_status text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_count integer;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
    SELECT COUNT(*)
    INTO v_count
    FROM bug_reports br
    WHERE (p_status IS NULL OR br.status = p_status)
      AND br.status <> 'unverified'  -- [quarantine 20271010151437] college-app text never reaches the assistant
      AND (p_priority IS NULL OR br.priority = p_priority);

    SELECT jsonb_build_object(
        'success', true,
        'data', COALESCE(jsonb_agg(row_to_json(bug)), '[]'::jsonb),
        'metadata', jsonb_build_object(
            'total_count', v_count,
            'returned_count', COUNT(*),
            'has_more', v_count > p_offset + p_limit,
            'filters_applied', jsonb_build_object('status', p_status, 'priority', p_priority)
        ),
        'actions_available', '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT
            br.id,
            br.reporter_user_id,
            pr.full_name as reporter_name,
            br.status,
            br.priority,
            br.module,
            br.description,
            br.created_at
        FROM bug_reports br
        LEFT JOIN profiles pr ON br.reporter_user_id = pr.id
        WHERE (p_status IS NULL OR br.status = p_status)
      AND br.status <> 'unverified'  -- [quarantine 20271010151437] college-app text never reaches the assistant
          AND (p_priority IS NULL OR br.priority = p_priority)
        ORDER BY br.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) bug;

    RETURN v_result;
END;
$function$$create_list$;
  END IF;

  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = to_regprocedure('public.ai_rpc_bug_report_details(uuid,uuid)');
  IF v_md5 IS NOT NULL AND v_md5 NOT IN ('c6a13d61826ce9e857a569b40320c3d4', 'ffc009c3123a890480d973d1fdeee563') THEN
    RAISE EXCEPTION 'live ai_rpc_bug_report_details differs from 20270308090000 (md5 %); refresh section 4b of this migration', v_md5;
  END IF;
  IF v_md5 IS NOT NULL THEN
    EXECUTE $create_details$CREATE OR REPLACE FUNCTION public.ai_rpc_bug_report_details(p_user_id uuid, p_bug_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_bug record;       -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors the bug_reports SELECT policy ("Enhanced bug reports view access with
  -- department filtering", read live 2026-09-24): the reporter, or a profile whose
  -- role is super_admin / admin / ceo — the policy's own list, verbatim, because
  -- /admin/bug-reports reads through a security_invoker view and so shows exactly
  -- that. On top of the policy, a non-super caller only sees reports from colleges
  -- role_has_institution_access() admits (or with no college). A refusal reads the
  -- same as a missing report, as before.
  SELECT br.reporter_user_id, br.institution_id INTO v_bug FROM bug_reports br WHERE br.id = p_bug_report_id;
  IF NOT FOUND OR (  -- [fail-closed 2026-09-28] a NULL reporter or role used to skip this deny
       public.is_super_admin()
       OR v_bug.reporter_user_id = auth.uid()
       OR (public.get_current_user_role() IN ('super_admin', 'admin', 'ceo')
           AND (v_bug.institution_id IS NULL
                OR v_bug.institution_id = ANY(public._user_accessible_institutions())))
     ) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Bug report not found or access denied')
    );
  END IF;

  -- [quarantine 20271010151437] a college-app bug still 'unverified' came in on a
  -- public key; the assistant does not read it until a person promotes it.
  IF EXISTS (SELECT 1 FROM bug_reports WHERE id = p_bug_report_id AND status = 'unverified') THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'QUARANTINED', 'message', 'This college-app bug is unverified. A person must read it and move it to New first.')
    );
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', row_to_json(t),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object('bug_report_id', p_bug_report_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      br.id,
      br.display_id,
      br.description,
      br.page_url,
      br.screenshot_url,
      br.console_logs,
      br.metadata,
      br.status,
      br.priority,
      br.category,
      br.resolved_at,
      br.reporter_ip,
      br.reporter_user_agent,
      p.full_name as reporter_name,
      p.email as reporter_email,
      ap.full_name as assigned_to_name,
      i.name as institution_name,
      d.department_name,
      br.created_at,
      br.updated_at
    FROM bug_reports br
    LEFT JOIN profiles p ON br.reporter_user_id = p.id
    LEFT JOIN profiles ap ON br.assigned_to_user_id = ap.id
    LEFT JOIN institutions i ON br.institution_id = i.id
    LEFT JOIN departments d ON br.department_id = d.id
    WHERE br.id = p_bug_report_id   -- [scope-repair 2026-09-24] access decided above
  ) t;

  IF v_result IS NULL OR v_result->'data' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Bug report not found or access denied')
    );
  END IF;

  RETURN v_result;
END;
$function$$create_details$;
  END IF;
END $quarantine$;

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
