-- ============================================================================
-- 20260919010000_enable_activate_learner_on_first_present.sql
--
-- Switches ON the rule the Director set on 2026-08-11:
--   "a learner becomes `active` by ATTENDING — the FIRST time they are marked
--    PRESENT."
--
-- This file changes ONE THING: the value of the existing master switch
--   platform_policies → 'learners.activate_on_first_present.enabled'
-- from `false` to `true`. It creates nothing, drops nothing, deletes nothing.
--
-- ── WHY NOW — DIRECTOR'S DECISION 2026-09-18 23:48 ──────────────────────────
--
--   ~300 learners sit at `admitted` on production and have never been
--   activated (304, read-only 2026-09-18). Draft PR #3909 proposed activating
--   them when INDUCTION COMPLETES. At the W12 desk interview on 2026-09-18 at
--   23:48 the Director chose the OTHER rule instead — his own of 2026-08-11,
--   first attendance marked present — and #3909 was closed in favour of this
--   file. The induction rule is not built; no second route to `active` is
--   added by this PR, because the route it turns on already exists.
--
-- ── THE MECHANISM ALREADY EXISTS AND IS LIVE; ONLY THE SWITCH IS OFF ────────
--
--   `fn_activate_learner_on_first_present()` + the AFTER INSERT OR UPDATE OF
--   `attendance_data` trigger `trg_activate_learner_on_first_present` on
--   `public.student_attendance` were shipped by migration
--   20260821030000_attendance_activates_learner.sql, deliberately gated OFF.
--   Nothing about the function or the trigger is touched here.
--
--   Read-only from production 2026-09-18:
--     · the policy row exists, `value = false`, `is_system = true`,
--       `ui_category = 'Learners — Lifecycle'`
--     · `fn_get_policy_bool('learners.activate_on_first_present.enabled',
--        false, NULL)` — the exact expression the trigger evaluates —
--       returns **false**
--     · `learners_profile_status_history` holds **zero** rows with
--       `reason_code = 'first_present_attendance'`, so the rule has never
--       fired for anybody.
--
-- ── THE APPLY-ORDER BLOCK FROM 20260821030000 IS CLEARED ────────────────────
--
--   That file said, in capitals, DO NOT ENABLE until PR #2936 (provisional
--   freshers on the marking roster) is merged and proven live — before that, a
--   `reserved` / `admitted` learner is on no marking screen at all, so the rule
--   could only freeze them where they are.
--
--   #2936 merged 2026-08-13T16:00:39Z, and it is proven live by behaviour, not
--   by a catalog read: in the last 30 days on production **37 of the 304
--   `admitted` learners and 7 of the 112 `reserved` learners already carry at
--   least one `Present` mark**. Provisional learners are being marked today.
--   The block is cleared on evidence.
--
-- ── WHAT ENABLING COSTS — STATED, NOT DISCOVERED ────────────────────────────
--
--   This makes attendance a THIRD producer of `active`, beside
--   `evaluate_learner_status_after_payment` (which only ever produces
--   `reserved` / `admitted`) and `fn_activate_learner_from_onboarding`. Because
--   the 2026-08-11 ruling names `reserved` as eligible too, a learner who has
--   cleared neither the ~30% nor the notional 60% fee threshold in
--   `admission_statuses` becomes `active` on one Present mark. Every activation
--   records `fee_thresholds_bypassed: true` in its audit row, so the money
--   consequence is visible in the data and not only in this comment.
--
--   NOT RETROACTIVE. Flipping this switch activates nobody by itself: the
--   trigger fires on an attendance WRITE. The 37 admitted and 7 reserved
--   learners above activate at their NEXT Present mark, not for the marks they
--   already have. No backfill is shipped here and none is implied.
--
-- ── IDEMPOTENT, AND LOUD WHEN IT CANNOT DO ITS JOB ──────────────────────────
--
--   An UPDATE that matches no row is a SILENT no-op — it reports success and
--   changes nothing. That is precisely the failure mode this file must not
--   have, so the row's presence is asserted BEFORE the write, the value is read
--   BACK after it, and a value that is not `true` afterwards raises. Re-running
--   the file is safe: the second run finds the switch already on, updates zero
--   rows, and still reports `true`.
--
-- Deliberately carries NO `BEGIN;`/`COMMIT;` so a reviewer's `BEGIN … ROLLBACK`
-- rehearsal against production actually rolls back.
--
-- ── 🛑 IT REFUSES TO TURN ON OVER AN UNHARDENED TRIGGER (repair round 1) ─────
--
--   The reviewer's first finding was that an activation failure could reject a
--   whole attendance save, and the second that editing an OLD
--   attendance row could activate learners retroactively. Both are fixed in
--   20260919005000_harden_first_present_activation.sql, which is numbered below
--   this file so `supabase db push` applies it first.
--
--   Version order is not a guarantee anybody has to trust here: the guard block
--   below asserts, before the switch is touched, that the trigger is installed
--   AND that the body installed is the hardened one. If either is untrue the
--   file raises and the rule stays off. The PR body's old caveat — "an operator
--   should confirm the trigger is installed before merging" — is now enforced by
--   the migration instead of asked of a person.
--
-- MIGRATION IS FILE ONLY — NOT APPLIED. Director-gated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Pre-flight. Nothing is switched on over a mechanism that is absent, or
--    over the pre-repair body that could reject an attendance save.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_body text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class     c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'student_attendance'
      AND t.tgname  = 'trg_activate_learner_on_first_present'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'trg_activate_learner_on_first_present is not installed on public.student_attendance — migration 20260821030000_attendance_activates_learner.sql has not been applied to this database. Turning the switch on here would be silent, not broken: the policy would read true and nothing would ever activate'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF to_regprocedure('public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'migration 20260919005000_harden_first_present_activation.sql has not been applied — the rule must not be switched on while an activation failure can still reject an attendance save'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_body := pg_get_functiondef('public.fn_activate_learner_on_first_present()'::regprocedure);

  IF position('EXCEPTION' in v_body) = 0
     OR position('learner_activation_failures' in v_body) = 0
     OR position('fn_activate_learners_for_first_present' in v_body) = 0 THEN
    RAISE EXCEPTION
      'the installed fn_activate_learner_on_first_present() is the UNHARDENED 2026-08-11 body — apply 20260919005000_harden_first_present_activation.sql first'
      USING ERRCODE = 'check_violation';
  END IF;
END
$guard$;

DO $do$
DECLARE
  k_policy_key constant text := 'learners.activate_on_first_present.enabled';
  v_before     boolean;
  v_after      boolean;
  v_rows       integer;
BEGIN
  -- 1. The row must already exist. If 20260821030000 never reached this
  --    database, there is no switch to flip and no trigger to gate — failing
  --    here is the only honest outcome, because an UPDATE matching zero rows
  --    would otherwise read as a clean apply.
  SELECT (pp.value #>> '{}')::boolean
    INTO v_before
    FROM public.platform_policies pp
   WHERE pp.policy_key = k_policy_key
     AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'policy row % (global) does not exist — migration 20260821030000_attendance_activates_learner.sql has not been applied to this database, so there is nothing to switch on',
      k_policy_key
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 2. The switch itself. UPDATE of an existing row — never DELETE, never
  --    re-INSERT: `is_system`, `classification`, `publication_state` and
  --    `ui_category` stay exactly as shipped, and `id`, `created_at` and every
  --    per-institution override row are untouched.
  --
  --    `description` IS rewritten, deliberately and in the same statement. The
  --    text on the row today is the ships-OFF text, and it ends with
  --    "DO NOT ENABLE until PR #2936 … is merged and proven live". That warning
  --    is spent — #2936 merged 2026-08-13 — but it renders on the super-admin
  --    Policies screen beside the switch. Leaving a "DO NOT ENABLE" note on a
  --    switch that is now ON is an invitation to turn it off, which would
  --    silently revert the Director's decision. A row whose own text argues
  --    against its own value is worse than no text.
  --
  --    `AND pp.value IS DISTINCT FROM 'true'::jsonb` makes the write a no-op on
  --    a re-run instead of bumping `updated_at` every time.
  UPDATE public.platform_policies pp
     SET value       = 'true'::jsonb,
         description =
           'MASTER SWITCH — ON since 2026-09-18. A learner sitting at '
           '`reserved` or `admitted` is moved to `active` the FIRST time they '
           'are marked PRESENT (Director ruling 2026-08-11, chosen again on '
           '2026-09-18 over the induction-completion alternative). NOT '
           'RETROACTIVE: the trigger fires on an attendance write, so Present '
           'marks already recorded activate nobody — a learner activates at '
           'their NEXT one. Turning this OFF stops all future automatic '
           'activation and reverses nothing already done. While ON, a '
           '`reserved` learner can reach `active` WITHOUT clearing the 30% / '
           '60% fee thresholds in admission_statuses; every activation is '
           'audited to learners_profile_status_history with reason_code '
           'first_present_attendance and fee_thresholds_bypassed: true.',
         updated_at  = now()
   WHERE pp.policy_key = k_policy_key
     AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL
     AND pp.value IS DISTINCT FROM 'true'::jsonb;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 3. Read the value BACK from the table. Not from a variable, not from the
  --    UPDATE's own RETURNING: the point is to observe what the next reader —
  --    `fn_get_policy_bool`, called by the trigger — will observe.
  SELECT (pp.value #>> '{}')::boolean
    INTO v_after
    FROM public.platform_policies pp
   WHERE pp.policy_key = k_policy_key
     AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL;

  IF v_after IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'switch % did not take: value reads back as % after the update',
      k_policy_key, coalesce(v_after::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RAISE NOTICE
    'learners.activate_on_first_present.enabled: % -> % (% row(s) updated; 0 means it was already on). A reserved/admitted learner now becomes active at their NEXT Present mark. Not retroactive.',
    coalesce(v_before::text, 'NULL'), v_after, v_rows;
END
$do$;
