-- One-off cleanup (2026-08-07) — block e096fe49-2e1e-4935-ae65-068c7a839082, floor 0.
--
-- The 8 vacated allocations on rooms 1, 2, 3, 4 and 10 were created 2026-08-05/06
-- while exercising the allocation flow. They carry no financial weight
-- (deposit_paid = 0.00, monthly_fee_at_allocation_inr NULL, zero hostel_deposits,
-- zero hostel_vacate_requests) but hostel_allocations_room_id_fkey is NO ACTION,
-- so they made all five rooms permanently undeletable while the rooms page
-- correctly showed them as "available" with 0 residents.
--
-- Snapshotted first, per the module's bak_* convention. To restore:
--   INSERT INTO hostel_allocations
--   SELECT * FROM bak_hostel_allocations_20260807_floor0;

CREATE TABLE IF NOT EXISTS bak_hostel_allocations_20260807_floor0 AS
SELECT a.*
FROM hostel_allocations a
JOIN hostel_rooms r ON r.id = a.room_id
WHERE r.block_id = 'e096fe49-2e1e-4935-ae65-068c7a839082'
  AND r.floor = 0;

-- The snapshot mirrors learner_id and contact details, so keep it out of
-- PostgREST entirely rather than relying on an absent policy.
ALTER TABLE bak_hostel_allocations_20260807_floor0 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bak_hostel_allocations_20260807_floor0 FROM anon;
REVOKE ALL ON TABLE bak_hostel_allocations_20260807_floor0 FROM authenticated;

-- check_out_date IS NOT NULL re-asserts "already moved out" at delete time —
-- if someone allocated one of these rooms between the audit and this migration,
-- that row is left alone.
DELETE FROM hostel_allocations a
USING hostel_rooms r
WHERE r.id = a.room_id
  AND r.block_id = 'e096fe49-2e1e-4935-ae65-068c7a839082'
  AND r.floor = 0
  AND a.check_out_date IS NOT NULL;
