-- Fix: Google login mukeshu26ahs@jkkn.ac.in (MUKESH U) is bound to MUKESH K's learner record.
--
-- GROUND TRUTH: auth.identities holds google:mukeshu26ahs@jkkn.ac.in for auth user
-- dfaeccd6-1c35-4f3d-b501-c9961fda2184. The Google identity cannot be reassigned, so the
-- profile must be re-aligned to it -- not the other way round.
--
-- CAUSE: at first login (2026-08-19 04:35) auto_link_profile_to_approved_learner() matched
-- the learner row that held that email AT THAT TIME (MUKESH K, 04cec7d5). A later correction
-- of MUKESH K's college_email (06:26) fired sync_learner_email_to_profile(), which found the
-- profile via learner_id and rewrote profiles.email to mukeshk26ahs -- desyncing it from auth.
--
-- SIDE EFFECT: the UPDATE on profiles fires trigger_sync_user_update_webhook ->
-- POST https://auth.jkkn.ai/api/auth/sync-user (external SSO server). That propagation is
-- desirable here, but it IS an outward-facing call.
--
-- learners_profiles.college_email needs NO change: both rows already hold the correct values.

BEGIN;

-- 1. Re-align the profile to its own Google identity and to MUKESH U's learner row.
UPDATE profiles
SET email      = 'mukeshu26ahs@jkkn.ac.in',
    full_name  = 'MUKESH U',
    learner_id = '99f959bf-4530-4ddb-831e-8bcb42cc40a0',   -- MUKESH U
    updated_at = NOW()
WHERE id = 'dfaeccd6-1c35-4f3d-b501-c9961fda2184'
  AND learner_id = '04cec7d5-c153-446c-9714-1c118cb86a22'; -- guard: only if still crossed

-- 2. Set the reverse link on MUKESH U's learner row (5288/7266 learners carry profile_id).
UPDATE learners_profiles
SET profile_id = 'dfaeccd6-1c35-4f3d-b501-c9961fda2184'
WHERE id = '99f959bf-4530-4ddb-831e-8bcb42cc40a0';

-- 3. MUKESH K intentionally gets NO login here. learners_profiles.profile_id is ALREADY
--    NULL on 04cec7d5, so no write is issued -- a no-op UPDATE would still fire the
--    BEFORE UPDATE validation triggers on that row for zero benefit. K is linked on their
--    own first Google sign-in (lifecycle 'reserved' is on the auto-link eligible list).

COMMIT;
