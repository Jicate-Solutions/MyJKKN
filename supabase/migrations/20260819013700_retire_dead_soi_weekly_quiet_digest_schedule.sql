-- Updated: 2026-08-11 - Retire the dead 'soi-weekly-quiet-digest' schedule row.
-- It is fully configured, enabled, on time — and has never once been able to fire.
--
-- ── WHAT IS WRONG ON PRODUCTION ──────────────────────────────────────────────
-- public.ai_routine_schedules holds:
--     routine_id    = 'soi-weekly-quiet-digest'
--     enabled       = true
--     managed       = true
--     minute_of_day = 525                      -- 08:45 IST
--     last_status   = 'skipped: not in registry'
--     last_fired_at = 2026-08-10 03:15Z        -- 08:45 IST, exactly its own slot
-- So it IS claimed every day, punctually, and every day the dispatcher throws it
-- away. /admin/ai-routines shows a healthy scheduled routine. Nothing happens,
-- and on the current code nothing ever can.
--
-- ── WHY IT CAN NEVER FIRE ────────────────────────────────────────────────────
-- app/api/cron/ai-routine-dispatcher/route.ts:
--     const routine = getRoutineById(rid);
--     if (!routine || !routine.triggerPath) { await record(rid, 'skipped: not in registry'); ... }
-- An id absent from lib/ai-routines/registry.ts is unresolvable by construction.
-- The status string is not an error report; it is the dispatcher saying it was
-- handed a name it has never heard of.
--
-- ── WHY THE OBVIOUS FIX IS THE WRONG FIX ─────────────────────────────────────
-- The tempting repair is to add the routine to the registry so it starts firing.
-- That is wrong here, because the route it would point at DOES NOT EXIST on main:
--     $ git ls-tree jicate/main -r --name-only | grep -i soi
--     ... app/api/cron/soi-inactivity/route.ts     <- a DIFFERENT routine (a
--                                                     dry-run recorder, not a digest)
--     (there is no app/api/cron/soi-weekly-quiet-digest/route.ts)
-- Registering it would upgrade a routine that does nothing into a routine that
-- fetches a 404 every morning and records that as its health. The repo already
-- refuses this: __tests__/lib/ai-routines/registry-cron-wiring.test.ts asserts
-- "points every registered /api/cron triggerPath at a route that exists on disk",
-- so such an entry fails the build rather than shipping. lib/ai-routines/misc-ai.ts
-- is therefore deliberately NOT touched by this change.
--
-- ── WHERE THE ROW CAME FROM (the actual bug) ─────────────────────────────────
-- PR #2767 "feat(school-of-influence): a weekly summary of who has gone quiet"
-- (commit e36c2335, branch feat/soi-weekly-quiet-member-digest) is STILL OPEN and
-- CONFLICTING, ten days after it was raised. It carries every half of the feature:
-- the route (504 lines), the registry entry, the SQL, and its own schedule seed of
--     ('soi-weekly-quiet-digest', true, true, all 7 days, 525)  ON CONFLICT DO NOTHING
-- That 525 is the same 525 live on production, which identifies the origin beyond
-- doubt. Its commit message states "The migration is a FILE ONLY and has been
-- applied to no database" — yet the schedule half reached production while the
-- code half never merged. This is the database-ahead-of-code split, and this file
-- closes it from the database side. It does not attempt to ship the feature; only
-- merging #2767 does that.
--
-- ── DISABLE, NOT DELETE — the load-bearing choice ────────────────────────────
--   * fn_ai_routine_claim_due() selects `WHERE s.enabled = true AND s.managed = true`,
--     so enabled=false stops the daily claim outright, and the pointless
--     'skipped: not in registry' write stops with it.
--   * scripts/ci/ai-estate-guard.mjs classifies `if (!enabled) return 'OFF'` BEFORE
--     any failure tier, and OFF is folded into the quiet tiers while still being
--     COUNTED ("Off: N"). The routine therefore leaves the daily DOWN list
--     honestly — as switched off, which is what it is — rather than being hidden.
--   * DELETE would drop the row out of the guard's query altogether: the feature
--     would vanish from the report instead of being reported as off. Worse, PR
--     #2767's seed is ON CONFLICT DO NOTHING, so if its migration is already
--     recorded in the ledger it would not re-seed on merge and the routine would
--     be silently ABSENT rather than loudly broken. Trading a loud failure for a
--     quiet one is the opposite of a fix.
--   * Re-arming costs one toggle in /admin/ai-routines the moment #2767 merges and
--     deploys. No migration, no release.
--
-- ── THE PREDICATE IS PART OF THE FIX, NOT DEFENSIVE DECORATION ───────────────
-- The UPDATE only touches a row whose last_status is literally the dead string.
-- That matters because migrations replay in timestamp order on any rebuilt
-- database: if #2767 merges, 20260808230000 seeds the row (last_status NULL, never
-- fired) and then THIS file runs. Unqualified, it would switch the freshly shipped
-- feature off in every new environment, permanently. Qualified, it is a no-op
-- there and only ever retires a row that has PROVEN itself dead.
--
-- No BEGIN/COMMIT in this file on purpose, so a reviewer's BEGIN .. ROLLBACK
-- rehearsal against production actually rolls back.

UPDATE public.ai_routine_schedules
   SET enabled    = false,
       updated_at = now()
 WHERE routine_id  = 'soi-weekly-quiet-digest'
   AND last_status = 'skipped: not in registry';

-- Guard on the END STATE, and RAISE EXCEPTION rather than RAISE NOTICE: a
-- NOTICE-only miss path stamps zero rows and reads as success (Studio hides
-- NOTICE), which is how a migration gets recorded as applied while having done
-- nothing at all. This deliberately does NOT re-test the UPDATE's own predicate —
-- an assertion that shares the predicate above it can never fail. It tests the
-- broader property that the row is in one of the three states this file was
-- written to accept, so the case that matters most — the row still enabled AND
-- still carrying the dead status, i.e. the UPDATE matched nothing — is caught.
DO $assert$
DECLARE
  v_found   boolean;
  v_enabled boolean;
  v_status  text;
BEGIN
  SELECT true, s.enabled, s.last_status
    INTO v_found, v_enabled, v_status
    FROM public.ai_routine_schedules s
   WHERE s.routine_id = 'soi-weekly-quiet-digest';

  -- (A) No such row. Nothing to retire; another environment, or already removed.
  IF NOT COALESCE(v_found, false) THEN
    RETURN;
  END IF;

  -- (B) Retired. The production case, and the whole point of this file.
  IF v_enabled IS FALSE THEN
    RETURN;
  END IF;

  -- (C) Enabled but never fired: a rebuilt database in which PR #2767's seed ran
  -- moments ago and its route shipped alongside it. Correctly left armed.
  IF v_status IS NULL THEN
    RETURN;
  END IF;

  RAISE EXCEPTION
    'soi-weekly-quiet-digest was not retired: enabled=%, last_status=%. Expected the row to be absent, disabled, or enabled-and-never-fired. If this routine is genuinely firing now, its route has shipped and this migration is obsolete — read the header before forcing it through.',
    v_enabled, v_status;
END
$assert$;
