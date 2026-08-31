-- VERSION NOTE: numbered 20260810103452 because that is the version this
-- migration was actually applied under on production. It previously claimed
-- 20260810120000, which main already holds three times over
-- (backfill_leadership_schedules_and_types, hr_academic_years,
-- revoke_learner_side_hostel_vacate_requests). schema_migrations keys on
-- `version` ALONE, so this file could never own a ledger row and would be
-- skipped forever by any ledger-driven apply. Do NOT "fix" this by renumbering
-- forward to one tick past the newest version on main — that is precisely how
-- the collision was produced. See scripts/ci/check-migration-version-cross-pr.sh.
--
-- Uniqueness for self-service event submissions moves from
--   one per PERSON per EVENT   →   one per PERSON per FORM.
--
-- WHY
-- `events_registrations` is the single table behind EVERY event form. An event
-- holds many forms (event_registration_forms) and each row records which one
-- answered it via `form_id` — that column exists precisely so custom_fields stay
-- interpretable once two forms share a field_key.
--
-- The old partial unique index keyed only (event_id, profile_id). form_id was
-- absent, so the instant a signed-in learner submitted ANY form on an event,
-- every other form on that event failed for them with
--   23505 duplicate key value violates unique constraint
--         "events_registrations_one_self_per_profile"
-- An organizer could author and share a feedback or quiz form, but the people
-- who attended could never answer it. Guests (profile_id IS NULL) were never
-- affected, which is why this never surfaced as an error in the organizer UI.
--
-- Per-form uniqueness preserves every guarantee that actually mattered:
--   * one registration per learner on the registration form
--   * one feedback response per learner
--   * one quiz attempt per learner (no retakes)
--
-- SAFETY
-- Verified on production before writing this: 0 profiles have more than one
-- non-cancelled self submission on any event, and 0 self rows have a NULL
-- form_id — so no existing row violates the new key and no dedupe is needed.
-- NULLS NOT DISTINCT (PG15+) keeps a future NULL form_id from silently
-- re-opening the duplicate-registration hole that the old index closed.
--
-- Not referenced as an ON CONFLICT target anywhere in the codebase (checked),
-- so no upsert depends on the old index name or column list.

DROP INDEX IF EXISTS events_registrations_one_self_per_profile;

CREATE UNIQUE INDEX IF NOT EXISTS events_registrations_one_self_per_form
  ON events_registrations (event_id, form_id, profile_id)
  NULLS NOT DISTINCT
  WHERE profile_id IS NOT NULL
    AND source = 'event_self'
    AND status <> 'cancelled';
