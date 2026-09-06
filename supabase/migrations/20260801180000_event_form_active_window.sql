-- Per-form active window: a start date, an end date, and automatic closure.
--
-- An event holds many forms (one per monthly run). Each run should open and shut
-- on its own dates instead of an organizer remembering to flip a switch at
-- midnight.
--
-- AUTO-INACTIVE IS COMPUTED, NOT STORED. There is deliberately no cron flipping
-- is_enabled to false when ends_at passes, because a stored flag has three
-- failure modes a derived value cannot have:
--
--   1. If the job fails or is never scheduled, an expired form keeps collecting
--      registrations — and nothing looks wrong.
--   2. Extending the end date would not reopen the form; someone would have to
--      remember to flip the switch back too.
--   3. is_enabled would stop meaning one thing. "Closed by hand" and "closed
--      because time ran out" would be indistinguishable, so the UI could not
--      explain to an organizer WHY their form is shut.
--
-- Instead is_enabled stays the organizer's manual Active/Inactive switch, the
-- window is data, and openness is derived at every read:
--
--   open  ==  is_enabled AND (starts_at IS NULL OR now >= starts_at)
--                        AND (ends_at   IS NULL OR now <= ends_at)
--
-- That is enforced in code (formRegistrationState in types/tournament.ts) at
-- every gate that matters: the public page, the submit API and the upload API.
--
-- NULL means unbounded on that side, so every existing form keeps behaving
-- exactly as it does today.

ALTER TABLE public.event_registration_forms
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at   timestamptz;

-- An end before its start can never be open. Cheaper to refuse than to let an
-- organizer wonder why nobody can register.
ALTER TABLE public.event_registration_forms
  DROP CONSTRAINT IF EXISTS event_registration_forms_window_check;

ALTER TABLE public.event_registration_forms
  ADD CONSTRAINT event_registration_forms_window_check
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at);

COMMENT ON COLUMN public.event_registration_forms.starts_at IS
  'Registration opens at this moment. NULL = open as soon as is_enabled is true.';

COMMENT ON COLUMN public.event_registration_forms.ends_at IS
  'Registration closes at this moment; the form reads as Expired afterwards. NULL = no end. Enforced by deriving openness at read time, NOT by a job that flips is_enabled.';
