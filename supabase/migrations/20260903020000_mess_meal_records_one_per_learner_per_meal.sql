-- =====================================================================
-- mess_meal_records — one meal per learner per meal per day
-- Added: 2026-09-03
-- =====================================================================
-- WHY
-- mess_meal_records has carried no duplicate guard of any kind since it was
-- created in 20260222000015: the only unique index is the primary key on
-- `id`, and the three btree indexes on institution_id / learner_id / date /
-- (learner_id, date) are all non-unique. There are no triggers. The write path
-- is a direct client insert, so nothing anywhere refuses a second scan.
--
-- That was survivable only because the screen above it had never successfully
-- written a row — the card QR encodes a learners_profiles.id while
-- mess_meal_records.learner_id is FK'd to profiles(id), so every insert died
-- on a 23503. The companion change fixes that resolution. The moment it lands,
-- a real camera running at fps 10 turns a card held in frame into a stream of
-- rows, and mess billing is computed off that headcount.
--
-- WHY `IS NOT TRUE` AND NOT `= false`
-- is_guest_meal is BOOLEAN DEFAULT false — nullable. A row written by a caller
-- that omits the column entirely (bulkRecordMeals does not set it) stores NULL,
-- and `WHERE is_guest_meal = false` would not cover it, leaving exactly the
-- rows least likely to be deliberate outside the guard. `IS NOT TRUE` covers
-- both false and NULL.
--
-- GUEST MEALS ARE DELIBERATELY EXEMPT
-- A guest meal is keyed by guest_name/guest_count against the host learner, and
-- one host may sign in several guests across a single meal. Constraining them
-- on (learner_id, date, meal_type) would make the second guest impossible to
-- record, so the predicate excludes them.
--
-- SAFETY
-- No data is modified. If duplicate rows somehow already exist, CREATE UNIQUE
-- INDEX fails loudly and names the offending key rather than silently dropping
-- anything — which is the correct outcome for a headcount that money is
-- computed from.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS mess_meal_records_one_per_learner_per_meal
  ON public.mess_meal_records (learner_id, date, meal_type)
  WHERE is_guest_meal IS NOT TRUE;

COMMENT ON INDEX public.mess_meal_records_one_per_learner_per_meal IS
  'One meal per learner per meal type per day. Guest meals (is_guest_meal = true) are exempt: a single host may sign in several guests for the same sitting. A second scan of the same card raises 23505, which the mess scan screen reads as "already scanned" rather than as an error.';
