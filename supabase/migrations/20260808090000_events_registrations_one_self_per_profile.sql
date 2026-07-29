-- Internal event registration: one registration per person per event.
--
-- Scoped to source='event_self' ON PURPOSE. A blanket unique index on
-- (event_id, profile_id) would fail to create AND would break tournaments:
-- one profile legitimately holds several tournament_entries in the same
-- tournament (multiple teams across divisions), each with its own
-- events_registrations row carrying source='tournament_self'.
--
-- status <> 'cancelled' mirrors EventRegistrationsService, which filters
-- cancelled rows out — so cancelling a registration frees the slot.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  events_registrations_one_self_per_profile
  ON events_registrations (event_id, profile_id)
  WHERE profile_id IS NOT NULL
    AND source = 'event_self'
    AND status <> 'cancelled';
