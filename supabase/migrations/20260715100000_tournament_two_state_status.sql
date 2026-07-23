-- Tournaments move to a 2-state status model: Draft <-> Active.
--
-- WHY NO ENUM/CONSTRAINT CHANGE:
-- `events` is shared with marathon, induction, startup-studio, lecture, alumni,
-- convocation and cultural, which still legitimately use planning / preparation
-- / execution / live / post_event / archived / cancelled. Those values stay in
-- events_status_check and in the EventStatus type. Tournaments simply never
-- OFFER them: "Active" reuses the existing 'live' value, and the tournament UI
-- + TournamentEventService gate on TOURNAMENT_STATUS_TRANSITIONS (a
-- tournament-only map) rather than the shared EVENT_STATUS_TRANSITIONS, whose
-- draft entry is ['planning','cancelled'] and would reject draft->live.
--
-- WHY THESE ROWS ARE STRANDED:
-- The old UI forced a 5-step chain (draft -> planning -> preparation ->
-- execution -> live), so no tournament ever reached 'live'; 6 rows sat
-- mid-chain in planning(4) / preparation(2).
--
-- WHY 'live' AND NOT 'draft':
-- The public register page blocks ONLY ['draft','cancelled'], so those 6 rows
-- are already publicly registerable, inside open registration windows. Mapping
-- them to 'live' is therefore BEHAVIOUR-PRESERVING -- students see no change; it
-- only makes the stored status honest. Mapping them to 'draft' would have
-- silently closed 6 live school tournaments mid-window.
--
-- Scope: sports_tournament rows only. Other event types are untouched.

BEGIN;

UPDATE events
SET status = 'live'
WHERE event_type = 'sports_tournament'
  AND status NOT IN ('draft', 'live');

COMMIT;
