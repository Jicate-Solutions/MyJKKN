-- Girls Hostel B & C — allocation reconciliation against the physical occupancy
-- sheets (Girls_hostel B.xlsx / Girls_hostel C.xlsx, 2026-09-06).
--
-- WHAT THIS IS. The two sheets are exports of /campus-living/allocations that
-- were edited to record where learners ACTUALLY sleep. 194 of the 238 rows
-- already agreed with the database; this migration closes the remaining gap:
-- 10 in-place room moves, 10 category upgrades, and 12 fresh allocations of
-- learners the sheet places but who hold no bed. 1 row is deliberately not applied.
--
-- READ THIS BEFORE CHANGING ANY PHASE ORDER OR ANY WRITE PATH.
--
-- 1. "Room Category" in the sheet is learners_profiles.hostel_category_id — the
--    LEARNER's entitlement — not hostel_rooms.category_id. All 26 GHB rooms are
--    category 'Deluxe Room'; 'Deluxe Plus Room' resolves through
--    hostel_categories.room_source_category_id, which points at Deluxe Room.
--
-- 2. A MOVE MUST BE AN IN-PLACE UPDATE, NEVER A VACATE+INSERT.
--    trg_allocation_sync_learner_categories fires on INSERT and on
--    UPDATE OF status, and its body overwrites hostel_category_id with the new
--    room's category whenever the learner's own category does not resolve to
--    that room. Three learners here (SWATHI T, SUBAITHA M, ARCHANA K) are
--    Premium and the sheet moves them into GHC R27, a Deluxe room — rule 3 says
--    keep the higher category. Re-inserting them would strip Premium and orphan
--    a Rs.15,000 upgrade bill each (Rs.15,000 of it already collected from
--    ARCHANA K). Updating room_id/bed_id/block_id without touching status
--    leaves the trigger unfired, which is exactly what we want.
--
-- 3. PHASE 1 MUST RUN BEFORE PHASE 3. Three beds the sheet assigns are still
--    held by learners who are themselves moving:
--        SWATHI T   GHC R1 B4  -> R27 B1   frees R1 B4  for P MUTHAMIL
--        ARCHANA K  GHC R18 B2 -> R27 B3   frees R18 B2 for DERISHINI D DEVENDRAN
--        SUBAITHA M GHC R18 B4 -> R27 B2   frees R18 B4 for SWETHA.V BDS
--    _cl_room_options only offers beds with status='available', so running the
--    upgrades first fails with "That room/bed is not an available option".
--
-- 4. PHASE 4 SETS THE CATEGORY BEFORE THE INSERT. Same trigger as (2), used the
--    other way round: with hostel_category_id already at the target, the
--    trigger sees room_source_category_id = room.category_id and preserves it.
--    Insert-then-update would let the trigger promote a Classic learner into a
--    GHC Premium room for free — the exact hole that leaves 36 current GHB/GHC
--    residents sitting above their fee band with no bill.
--
-- 5. BILLING IS ANCHORED ON THE FEE BAND, not on the stored category (operator
--    decision, 2026-09-06). For all 10 upgrades the two agree, so
--    _cl_upgrade_room_category's own from->to billing is already correct and is
--    left to do the work. The single learner where they disagreed (VISHALI T,
--    stored Classic, band Deluxe, sheet Deluxe) is corrected to her band in
--    phase 2 with NO bill — she was never upgrading, her stored category was
--    simply stale — which demotes her from an upgrade to a plain move.
--
-- 6. NO BILL IS EVER CANCELLED. _cl_upgrade_room_category contains a branch
--    that cancels waitlist-linked unpaid bills aimed at a different category;
--    none of the 10 learners has such a row, and phase 5 asserts the count of
--    live hostel_category bills never drops, so that branch cannot fire
--    unnoticed.
--
-- 7. THE PLAN'S bill_amount IS A REQUIRED TOTAL, NOT AN AMOUNT TO RAISE.
--    billing_categories.once_per_learner is TRUE for 'Hostel Upgrade Fee', and
--    trg_billing_bills_once_per_learner enforces that across the WHOLE category
--    — every fee_source, every hostel year. _cl_apply_upgrade_fee_bill, by
--    contrast, only looks for fee_source='hostel_category' AND the current
--    hostel_year_id, so a bill tagged any other way is invisible to it and its
--    INSERT dies on BL001. T LEGAVARSHITHA is exactly that: a PAID Rs.7,500
--    upgrade bill raised by hand on 2026-08-19 with fee_source='academic' and a
--    NULL hostel_year_id. A first rehearsal of this migration aborted on her.
--    Six others (RESHMA R.P, JENISHA M, JERSHINI J, TAKSHANA S, SUJIVARSHA R,
--    PUSHPALATHA S) hold live bills the RPC CAN see, and billing them the plan
--    amount would have accumulated a second charge on top — Rs.52,500 of
--    duplicate billing between them. So phase 4 reads what the learner is
--    already billed and raises only the shortfall: no bill at all -> the RPC
--    creates one; a live bill short of the total -> topped up IN PLACE (which
--    the trigger explicitly permits and which cancels nothing); already at or
--    above the total -> left completely alone.
--
-- 8. This calls the internal _cl_* helpers rather than the fn_cl_admin_*
--    wrappers. The wrappers are identical except for an auth.uid()-based
--    permission gate, and auth.uid() is NULL under the service_role connection
--    that applies migrations. Verified 2026-09-06: none of _cl_upgrade_room_category,
--    _cl_execute_room_upgrade, _cl_apply_upgrade_fee_bill, _cl_room_options,
--    _cl_upgrade_threshold_check or _cl_execute_first_booking references
--    auth.uid() or any permission function.
--
-- SIDE EFFECT, ACCEPTED: hostel_categories.settle_billing_enabled is true for
-- the Premium categories, so trg_allocation_settle_arrival will open empty-bed
-- settle windows on the GHC Premium rooms this migration writes into. That is
-- normal behaviour for any room change and is recorded, not suppressed.
--
-- NOT APPLIED, reported back to the operator instead:
--   * MEGHAVARSHA E -> GHB R21 B2: the sheet double-books that bed with
--     KALAIVANI R, who already occupies it. Needs a human decision.
--   * 10 sheet rows whose Email column is blank and whose name matches 2-4
--     learners (or none). Guessing has previously linked 5 Nursing learners to
--     the wrong person.
--   * 4 mess-category Classic->Premium changes (Rs.20,000 each) — out of scope.
--   * The 36 pre-existing red audit rows. Their cause is configuration, not
--     data: hostel_category_upgrade_fees prices Deluxe -> Deluxe Plus at
--     net_amount 0, so _cl_apply_upgrade_fee_bill creates no bill and the audit
--     reports "above band, never billed" forever.

CREATE TABLE IF NOT EXISTS public.cl_girls_bc_reconcile_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL,
  run_at                timestamptz NOT NULL DEFAULT now(),
  seq                   integer NOT NULL,
  phase                 integer NOT NULL,
  action                text    NOT NULL,
  learner_name          text    NOT NULL,
  learner_profile_id    uuid,
  profile_id            uuid,
  before_allocation_id  uuid,
  before_block_id       uuid,
  before_room_id        uuid,
  before_bed_id         uuid,
  before_category_id    uuid,
  target_block_id       uuid,
  target_room_id        uuid,
  target_bed_id         uuid,
  target_category_id    uuid,
  after_allocation_id   uuid,
  after_category_id     uuid,
  bill_amount           numeric,
  bill_action           text,
  bill_id               uuid,
  outcome               text NOT NULL DEFAULT 'planned',
  note                  text
);

COMMENT ON TABLE public.cl_girls_bc_reconcile_log IS
  'One row per learner touched by the Girls B/C occupancy reconciliation (2026-09-06). Holds the before-state, the target, and what actually happened — the evidence trail for a data migration that moved beds and raised upgrade bills.';

ALTER TABLE public.cl_girls_bc_reconcile_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cl_girls_bc_reconcile_log_read ON public.cl_girls_bc_reconcile_log;
CREATE POLICY cl_girls_bc_reconcile_log_read
  ON public.cl_girls_bc_reconcile_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_permission('campus_living.upgrades.manage')
  );

REVOKE ALL ON public.cl_girls_bc_reconcile_log FROM anon;
GRANT SELECT ON public.cl_girls_bc_reconcile_log TO authenticated;

CREATE INDEX IF NOT EXISTS idx_cl_girls_bc_reconcile_log_run
  ON public.cl_girls_bc_reconcile_log (run_id, seq);

DO $mig$
DECLARE
  v_run          uuid := gen_random_uuid();
  v_hy           uuid;
  v_tier         uuid;
  r              record;
  v_old_room     uuid;
  v_old_bed      uuid;
  v_old_block    uuid;
  v_bed_status   text;
  v_res          jsonb;
  v_alloc        uuid;
  v_inst         uuid;
  v_ay           uuid;
  v_sem          uuid;
  v_bills_before integer;
  v_bills_after  integer;
  v_billed_before numeric;
  v_billed_after  numeric;
  v_bcat         uuid;
  v_bill_id      uuid;
  v_bill_final   numeric;
  v_bill_balance numeric;
  v_paid         numeric;
  v_topup        numeric;
  v_bad          integer;
  v_msg          text;
BEGIN
  SELECT id INTO v_hy FROM hostel_years WHERE is_current LIMIT 1;
  IF v_hy IS NULL THEN
    RAISE EXCEPTION 'No current hostel year configured — refusing to reconcile';
  END IF;

  -- The 'Hostel Upgrade Fee' billing category, resolved the same way
  -- _cl_apply_upgrade_fee_bill resolves it. Every bill assertion below is scoped
  -- to this category and NOT to fee_source/hostel_year_id, so it sees exactly
  -- what trg_billing_bills_once_per_learner sees (header note 7).
  v_bcat := public._cl_ensure_upgrade_billing_category('hostel');

  SELECT id INTO v_tier FROM hostel_tier_policy
   WHERE tier_key = 'standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key = 'standard' AND is_active LIMIT 1;
  END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  SELECT count(*), COALESCE(sum(final_amount), 0)
    INTO v_bills_before, v_billed_before
    FROM billing_student_bills
   WHERE item_category_id = v_bcat
     AND status NOT IN ('cancelled', 'superseded');

  ------------------------------------------------------------------ phase 0
  -- Stage the decided plan. The before-state is read live rather than
  -- hard-coded, so applying against a database that has already drifted shows
  -- up in phase 5's assertions instead of silently overwriting newer data.
  CREATE TEMP TABLE _cl_plan (
    seq integer, phase integer, action text, learner_name text,
    learner_profile_id uuid, profile_id uuid,
    target_block_id uuid, target_room_id uuid, target_bed_id uuid,
    target_category_id uuid, bill_amount numeric, note text
  ) ON COMMIT DROP;

  INSERT INTO _cl_plan
    (seq, phase, action, learner_name, learner_profile_id, profile_id,
     target_block_id, target_room_id, target_bed_id, target_category_id, bill_amount, note)
  VALUES
  (1, 1, 'move', 'SWATHI T', '68efbdd2-7245-41f4-a585-a7ef261b03cb'::uuid, 'ce210434-71e6-4a19-8e93-2d16f917e5bf'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'e60f4970-7038-4df2-94ec-6bfe6f576402'::uuid, '4e321094-4438-478f-accd-4dd328dd4cda'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, 'room cat Deluxe Room < learner cat Premium Room (kept, not downgraded)'),
  (2, 1, 'move', 'SUBAITHA M', '2c92397a-a62b-4fb3-9ea4-005326c97ee6'::uuid, 'a84e7200-2ede-42d3-aafb-37ea539b03d0'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'e60f4970-7038-4df2-94ec-6bfe6f576402'::uuid, '47c5ebc6-d7b2-42ee-8965-60c7a2b1647c'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, 'room cat Deluxe Room < learner cat Premium Room (kept, not downgraded)'),
  (3, 1, 'move', 'ARCHANA K', 'e6a7bb96-4b8b-4606-ad9d-6b87049ab904'::uuid, '50e984e2-4749-4ec7-9127-9c5d41b94caa'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'e60f4970-7038-4df2-94ec-6bfe6f576402'::uuid, 'f0b9e9d9-a142-4291-b947-cc3324d9ea0e'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, 'room cat Deluxe Room < learner cat Premium Room (kept, not downgraded)'),
  (4, 2, 'move', 'SANGEETHA R', '77f7cb15-915a-41a1-aac8-e76722a7e646'::uuid, '9ba7e93c-1daa-4deb-8dc0-d4430e468b3b'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '626a0ba6-720b-4110-82b1-a5a52075750f'::uuid, '71b1d120-7dfa-4b5b-bfe6-9789d73b015e'::uuid, 'f906b9b5-eeef-4160-b8c6-762b2ad3170f'::uuid, NULL, NULL),
  (5, 2, 'move', 'KEERTHANA S S', '3a1b1cb0-e6f4-4767-85f7-e180afb03ad2'::uuid, '9a15a54b-b8c6-4b6d-af95-991a13022f2f'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '626a0ba6-720b-4110-82b1-a5a52075750f'::uuid, 'de5f072e-9e3b-40cf-a8f7-3269cd9a7f48'::uuid, 'f906b9b5-eeef-4160-b8c6-762b2ad3170f'::uuid, NULL, NULL),
  (6, 2, 'move', 'LENCI S', 'df3db45e-e038-47fc-a245-13236af50e3f'::uuid, 'ed3c36fb-dc6d-4947-9639-7def6b0c0d40'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '22a9e9a8-81b5-4391-abc6-ee4cab0c3c77'::uuid, '18b0ff51-8368-4b56-9629-ad83dcdb08ab'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (7, 2, 'move', 'ROFINA J', '1fa3fa12-e944-45b5-afe7-cce5e94ca8d8'::uuid, '092caebd-3efc-4d5a-b5ac-7e205d6a1dbd'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '57d57113-e58b-41ec-ad74-9c4da22384fb'::uuid, '8ca33bc5-4910-474e-8382-9d133ed17c11'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (8, 2, 'move', 'VISHALI T', '2afbb376-997c-4af0-801d-d4d744ff5543'::uuid, '5171a774-f14a-43c2-8310-531f9edf58fb'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '9f8f4cdd-f64c-4983-a09a-7f8d8bb53b65'::uuid, 'af8569b9-6b53-4a26-b51f-dea33487c8b6'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (9, 2, 'move', 'MITHRA A', 'b292a3ac-cc09-4cf2-9680-d2de8494d071'::uuid, '54e7eeb4-4a39-48e3-bb2f-a245ca26619c'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, 'bd172dc2-3a7c-4702-93e8-564689107e20'::uuid, '9b1e809c-56b8-4a6a-8991-2d838b3a6b12'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (10, 2, 'move', 'SUBHASHREE V', 'c70b32f9-2426-4ab4-8474-df3ee0a9dfa1'::uuid, '70ecd177-1d09-4e57-8d5d-a2a34bae4c8e'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'fdc5e8ec-e2db-4fe3-b99d-736bd49107be'::uuid, '0ebf3cda-b649-431b-95db-41c0f3b50ad7'::uuid, 'f906b9b5-eeef-4160-b8c6-762b2ad3170f'::uuid, NULL, NULL),
  (11, 3, 'upgrade', 'PRIYADHARSHINI K', '837b58ab-38ee-4853-9213-aff80d2a6d31'::uuid, '20e20500-af64-4517-bb10-9b626b4b74aa'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '575f9ccb-ef55-448c-b5a2-d1fb88457c44'::uuid, '56eeb016-dc87-41c1-8846-8be9d79ac065'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (12, 3, 'upgrade', 'LAKSHMI N', 'af565eac-21b6-4718-bb7d-16598a528549'::uuid, '67ff9885-2fce-4a0f-a5f8-553c2709a18e'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '346630a4-9d7d-4865-b54d-3f3cbf6712c7'::uuid, 'd3cf86d9-b9e5-4805-993d-51020e7b6bde'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (13, 3, 'upgrade', 'KARISHMA', '2b509440-1a3c-4314-9e5e-6437c9d75230'::uuid, '4e57871b-fece-42d6-b993-5234467379c7'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '37286290-bb68-4ecd-9e30-785562b5bc55'::uuid, '552ed492-fbd2-4d41-9e54-56fdef35a891'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (14, 3, 'upgrade', 'P MUTHAMIL', '96d0a8c3-fc36-42fc-b0d0-28b3d93e135d'::uuid, '261a0a44-abcb-4ef4-8a8e-c18e76242319'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '37286290-bb68-4ecd-9e30-785562b5bc55'::uuid, '2673e7b0-00fd-4975-866e-610bc33527a8'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (15, 3, 'upgrade', 'DEEPA T', '88506836-9897-4c1a-a54e-ddd00ad34c4d'::uuid, '7c7ad3a5-dc36-4305-a861-b14e6a04399f'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'fe17fe55-b7d3-48c6-b342-73019bb52869'::uuid, 'ecf6e21f-4eff-42a0-9a61-d0e1309f35b3'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (16, 3, 'upgrade', 'DERISHINI D DEVENDRAN', '70fa6dd7-4bd5-4b36-b5d3-316bd976148e'::uuid, '3d2b4daa-c2f3-4f03-8e13-f5e3744e3189'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '1305487a-9797-4d79-acaa-bd8d771a154d'::uuid, '45bbf088-544b-49c8-9705-7db8e0d7006c'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (17, 3, 'upgrade', 'SWETHA.V BDS', '53cae4e5-bcc0-456c-a7d7-525fef32ed45'::uuid, '55b86aaa-9d8a-4158-87da-c6d192806635'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '1305487a-9797-4d79-acaa-bd8d771a154d'::uuid, '9d0f6794-45ae-4a1c-8cef-690534a4517b'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (18, 3, 'upgrade', 'HARSHINI E', '28069878-e861-4d99-9151-c64a665ea4e8'::uuid, '4d4b0bf5-39a2-4cbc-94c1-67761a7393eb'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'fdc5e8ec-e2db-4fe3-b99d-736bd49107be'::uuid, '14ddaf51-11f9-4cec-8062-02bf77fba930'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (19, 3, 'upgrade', 'JAYASRI S', '5056cd64-fb30-4bd2-938d-7a6185c5c0a1'::uuid, '7b4efb38-f9f1-4e11-8029-9bd4489411e4'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'b9c54d31-bcda-4de3-b5e0-253d861b36ea'::uuid, 'd6b1a13d-e477-4c70-809d-62a339645bd5'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, NULL, NULL),
  (20, 3, 'upgrade', 'NIVETHA M', 'a8092f59-4441-40ab-8dd2-fa302b7a181b'::uuid, '70483b36-a6d0-4849-9892-1da6e921e31c'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'a26850d9-a391-4ddf-a84d-498409909bf9'::uuid, '2451e35b-420f-422c-bedb-609d6b718010'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, NULL, NULL),
  (21, 4, 'fresh', 'R. P  RESHMA', '416211d8-6d5e-49a8-a070-62136491477d'::uuid, 'd741dcab-f81a-484d-9a40-2a855c280f1c'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '51216c62-0a80-4154-add9-d56a453eaa47'::uuid, '6f6a8a16-b313-44c0-9002-3f55ddfa8287'::uuid, 'f906b9b5-eeef-4160-b8c6-762b2ad3170f'::uuid, 10000, 'Hostel room upgrade: Classic Room -> Deluxe Plus Room (Girls B/C occupancy reconciliation)'),
  (22, 4, 'fresh', 'G GOWSIKA', '23147f5a-663c-4bea-8128-bfd22f9e6c64'::uuid, '76d60892-4666-4b94-a4d9-bbe473dbcf7b'::uuid, 'e096fe49-2e1e-4935-ae65-068c7a839082'::uuid, '51216c62-0a80-4154-add9-d56a453eaa47'::uuid, 'b55d578a-90b9-4727-aa09-bd92657ef870'::uuid, 'f906b9b5-eeef-4160-b8c6-762b2ad3170f'::uuid, 10000, 'Hostel room upgrade: Classic Room -> Deluxe Plus Room (Girls B/C occupancy reconciliation)'),
  (23, 4, 'fresh', 'M JENISHA', 'ef54c8c6-32c1-4cfc-8cdf-fb5a5a1ed5c9'::uuid, 'f4b0e808-c848-4442-8feb-93f45652438c'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '91a35bc5-b0bc-4d5b-a099-2f3202547f8b'::uuid, 'f4c8e4e4-8062-40bc-bf35-46003a9248e1'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, 7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (24, 4, 'fresh', 'J JERSHINI', '2eda189c-e00d-47a8-9c2f-73e6c035aa58'::uuid, '7aaa6b66-e66f-4358-ab4a-ab08ae2c303d'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '91a35bc5-b0bc-4d5b-a099-2f3202547f8b'::uuid, 'e9d4e191-7cdb-4201-946b-f525961859c0'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, 7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (25, 4, 'fresh', 'S TAKSHANA', '49653da9-cadb-4cd2-9276-b3dde7f5af26'::uuid, 'b3287992-7dde-43d2-b000-5028e3acab71'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '91a35bc5-b0bc-4d5b-a099-2f3202547f8b'::uuid, '2ff379e9-22ce-4040-9d48-e26859d3ab68'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, 7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (26, 4, 'fresh', 'R SUJIVARSHA', '4ca0f296-0c27-42a8-b190-80da31c42c47'::uuid, '2bbea865-6642-4837-b6ae-232b6edc907a'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '91a35bc5-b0bc-4d5b-a099-2f3202547f8b'::uuid, 'c65ae87a-eaaa-4899-9cb4-314343d5e3de'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, 7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (27, 4, 'fresh', 'S PUSHPALATHA', '069c3643-b289-4cb8-95db-e0b4c391fa2f'::uuid, '3627c525-d3b5-44b1-a5e0-06eccc614adc'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '1493e417-94df-47c3-a5d9-0d2bf98bf392'::uuid, '43fa36c5-d87e-47c7-abc0-5040ae7a9edb'::uuid, 'a679e730-5539-4f8f-a695-f9111c141058'::uuid, 7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (28, 4, 'fresh', 'A NAHIDA MARIYAM', '745587da-5a42-4e37-980e-4149b5e5cd5f'::uuid, 'd1e607bb-c804-4960-a3df-8c19bb881b33'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'eec5fb8e-d2e4-4edb-a918-b54ab8e228ae'::uuid, 'a0f3c746-b2bd-4c2a-b0e5-18dffff820b0'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, 7500, 'Hostel room upgrade: Deluxe Room -> Premium Room (Girls B/C occupancy reconciliation)'),
  (29, 4, 'fresh', 'A KEERTHANA SHRI', '96e50b57-78ca-4328-8fb1-219b09826667'::uuid, '98e3cd29-7fa1-4ee7-9ac1-38b85dd3d325'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'eec5fb8e-d2e4-4edb-a918-b54ab8e228ae'::uuid, '29edc853-9908-4e99-ba85-5f54e7440fa8'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, 7500, 'Hostel room upgrade: Deluxe Room -> Premium Room (Girls B/C occupancy reconciliation)'),
  (30, 4, 'fresh', 'B SYED ALI FATHIMA', 'b6aa6a4e-daf1-4597-bc56-8dd092ac8a19'::uuid, '1f2e9835-f022-49e1-b5ca-4d586eb2e0aa'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, 'eec5fb8e-d2e4-4edb-a918-b54ab8e228ae'::uuid, '7dbd0d67-f9d7-43ed-b065-3c32b3a2baeb'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, 7500, 'Hostel room upgrade: Deluxe Room -> Premium Room (Girls B/C occupancy reconciliation)'),
  (31, 4, 'fresh', 'T LEGAVARSHITHA', 'f7cc2777-1510-4bd6-8001-7441c03eb4b4'::uuid, 'c7407f4a-a559-43f0-9aa4-5fd98f37948f'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '94edabe7-a518-4ceb-8e42-5a82a8a639d3'::uuid, '581e1786-85e3-4b53-b9b6-af4f638a2e8d'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, 15000, 'Hostel room upgrade: Classic Room -> Premium Room (Girls B/C occupancy reconciliation)'),
  (32, 4, 'fresh', 'N SAVITHRI', '4eda37b0-88d9-4a98-9b92-aaadca00bdc2'::uuid, '3f2885c5-46c2-4078-af9a-d7e8dd671afe'::uuid, 'a4022e63-62b2-4777-a36f-7527de0795aa'::uuid, '2e51b230-e0d5-4ce7-8be6-838b3a096365'::uuid, '66b7b74a-a871-4435-8cc9-9d417041ccfb'::uuid, 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d'::uuid, 7500, 'Hostel room upgrade: Deluxe Room -> Premium Room (Girls B/C occupancy reconciliation)'),
  (33, 9, 'skip', 'MEGHAVARSHA E', '8047e0ee-ab90-4119-bc25-caa2f8b5fc40'::uuid, 'e05e9338-86a7-41a5-b601-04ef2b8b82b8'::uuid, NULL, NULL, NULL, NULL, NULL, 'GHB R21 B2 double-booked with KALAIVANI R');

  INSERT INTO public.cl_girls_bc_reconcile_log
    (run_id, seq, phase, action, learner_name, learner_profile_id, profile_id,
     before_allocation_id, before_block_id, before_room_id, before_bed_id, before_category_id,
     target_block_id, target_room_id, target_bed_id, target_category_id,
     bill_amount, note, outcome)
  SELECT v_run, p.seq, p.phase, p.action, p.learner_name, p.learner_profile_id, p.profile_id,
         a.id, a.block_id, a.room_id, a.bed_id, lp.hostel_category_id,
         p.target_block_id, p.target_room_id, p.target_bed_id, p.target_category_id,
         p.bill_amount, p.note, 'planned'
    FROM _cl_plan p
    LEFT JOIN learners_profiles lp ON lp.id = p.learner_profile_id
    LEFT JOIN LATERAL (
      SELECT h.id, h.block_id, h.room_id, h.bed_id
        FROM hostel_allocations h
       WHERE h.learner_id = p.profile_id
         AND h.status = 'active'
         AND h.check_out_date IS NULL
       ORDER BY h.allocation_date DESC
       LIMIT 1
    ) a ON true;

  UPDATE public.cl_girls_bc_reconcile_log
     SET outcome = 'skipped'
   WHERE run_id = v_run AND action = 'skip';

  --------------------------------------------------- phases 1 & 2 — in-place moves
  -- Mirrors fn_cl_admin_transfer_allocation's body minus its auth.uid() gate.
  -- Touches room_id/bed_id/block_id only; status is left alone precisely so
  -- trg_allocation_sync_learner_categories stays unfired (see header note 2).
  FOR r IN
    SELECT * FROM public.cl_girls_bc_reconcile_log
     WHERE run_id = v_run AND phase IN (1, 2) ORDER BY phase, seq
  LOOP
    IF r.before_allocation_id IS NULL THEN
      RAISE EXCEPTION 'Move planned for % but they hold no active allocation', r.learner_name;
    END IF;

    SELECT room_id, bed_id, block_id INTO v_old_room, v_old_bed, v_old_block
      FROM hostel_allocations WHERE id = r.before_allocation_id FOR UPDATE;

    IF r.target_bed_id IS DISTINCT FROM v_old_bed THEN
      SELECT status::text INTO v_bed_status FROM hostel_beds
       WHERE id = r.target_bed_id AND room_id = r.target_room_id;
      IF v_bed_status IS NULL THEN
        RAISE EXCEPTION 'Target bed for % does not belong to the target room', r.learner_name;
      END IF;
      IF EXISTS (SELECT 1 FROM hostel_allocations h
                  WHERE h.bed_id = r.target_bed_id
                    AND h.status IN ('active','pending_approval')
                    AND h.check_out_date IS NULL
                    AND h.id <> r.before_allocation_id) THEN
        RAISE EXCEPTION 'Target bed for % is still occupied — phase order is wrong', r.learner_name;
      END IF;
    END IF;

    -- A move never changes the category. The one exception is VISHALI T, whose
    -- stored category (Classic) lags the entitlement her admission-year bill
    -- already buys (Deluxe); correcting it is not an upgrade and raises no bill.
    IF r.target_category_id IS DISTINCT FROM r.before_category_id THEN
      IF COALESCE((SELECT amount FROM hostel_fees
                    WHERE hostel_category_id = r.target_category_id
                      AND hostel_year_id = v_hy AND mess_category_id IS NULL AND is_active LIMIT 1), 0)
         < COALESCE((SELECT amount FROM hostel_fees
                    WHERE hostel_category_id = r.before_category_id
                      AND hostel_year_id = v_hy AND mess_category_id IS NULL AND is_active LIMIT 1), 0)
      THEN
        RAISE EXCEPTION 'Refusing to downgrade % during a move', r.learner_name;
      END IF;
      UPDATE learners_profiles
         SET hostel_category_id = r.target_category_id, updated_at = now()
       WHERE id = r.learner_profile_id;
    END IF;

    UPDATE hostel_allocations
       SET room_id = r.target_room_id,
           bed_id = r.target_bed_id,
           block_id = r.target_block_id,
           allocation_type = 'transfer',
           updated_at = now()
     WHERE id = r.before_allocation_id;

    IF v_old_bed IS NOT NULL AND v_old_bed IS DISTINCT FROM r.target_bed_id THEN
      UPDATE hostel_beds SET status = 'available', current_occupant_id = NULL, updated_at = now()
       WHERE id = v_old_bed;
    END IF;
    UPDATE hostel_beds SET status = 'occupied', current_occupant_id = r.profile_id, updated_at = now()
     WHERE id = r.target_bed_id;

    UPDATE public.cl_girls_bc_reconcile_log
       SET outcome = 'applied',
           after_allocation_id = r.before_allocation_id,
           after_category_id = (SELECT hostel_category_id FROM learners_profiles WHERE id = r.learner_profile_id)
     WHERE id = r.id;
  END LOOP;

  --------------------------------------------------------- phase 3 — upgrades
  -- _cl_upgrade_room_category is the exact code path the admin UI runs. It
  -- vacates the old allocation, inserts the new one, moves the category and
  -- raises the upgrade bill through _cl_apply_upgrade_fee_bill (which
  -- ACCUMULATES onto any existing live bill rather than creating a second, so
  -- a re-run cannot double-bill).
  FOR r IN
    SELECT * FROM public.cl_girls_bc_reconcile_log
     WHERE run_id = v_run AND phase = 3 ORDER BY seq
  LOOP
    SELECT status::text INTO v_bed_status FROM hostel_beds
     WHERE id = r.target_bed_id AND room_id = r.target_room_id;
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'Upgrade target bed for % is % (expected available) — phase order is wrong',
        r.learner_name, COALESCE(v_bed_status, 'missing');
    END IF;

    -- _cl_upgrade_room_category finishes in _cl_apply_upgrade_fee_bill, whose
    -- INSERT dies on BL001 if this learner already holds a live 'Hostel Upgrade
    -- Fee' bill the RPC's narrower lookup cannot see (header note 7). None of
    -- the ten does today; refuse loudly rather than abort mid-run if that
    -- changes before this is applied.
    IF EXISTS (
      SELECT 1 FROM billing_student_bills
       WHERE student_id = r.learner_profile_id
         AND item_category_id = v_bcat
         AND status NOT IN ('cancelled', 'superseded')
         AND (fee_source IS DISTINCT FROM 'hostel_category'
              OR hostel_year_id IS DISTINCT FROM v_hy)
    ) THEN
      RAISE EXCEPTION
        '% holds a live Hostel Upgrade Fee bill that _cl_apply_upgrade_fee_bill cannot see (wrong fee_source or hostel year). Top that bill up by hand instead of upgrading through the RPC.',
        r.learner_name;
    END IF;

    v_res := public._cl_upgrade_room_category(
               r.profile_id, r.learner_profile_id, r.target_category_id,
               r.target_room_id, r.target_bed_id, false);

    UPDATE public.cl_girls_bc_reconcile_log
       SET outcome = 'applied',
           after_allocation_id = NULLIF(v_res->>'new_allocation_id', '')::uuid,
           after_category_id = (SELECT hostel_category_id FROM learners_profiles WHERE id = r.learner_profile_id),
           bill_amount = NULLIF(v_res->'bill'->>'billed', '')::numeric,
           bill_action = v_res->'bill'->>'action',
           bill_id = NULLIF(v_res->'bill'->>'bill_id', '')::uuid
     WHERE id = r.id;
  END LOOP;

  ------------------------------------------------- phase 4 — fresh allocations
  -- Bill, then set the category, THEN insert (header note 4).
  FOR r IN
    SELECT * FROM public.cl_girls_bc_reconcile_log
     WHERE run_id = v_run AND phase = 4 ORDER BY seq
  LOOP
    IF r.before_allocation_id IS NOT NULL THEN
      RAISE EXCEPTION '% already holds an active allocation — expected unplaced', r.learner_name;
    END IF;
    IF r.profile_id IS NULL THEN
      RAISE EXCEPTION '% has no profiles row; hostel_allocations.learner_id cannot be set', r.learner_name;
    END IF;

    SELECT status::text INTO v_bed_status FROM hostel_beds
     WHERE id = r.target_bed_id AND room_id = r.target_room_id;
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'Fresh target bed for % is % (expected available)',
        r.learner_name, COALESCE(v_bed_status, 'missing');
    END IF;

    SELECT lp.institution_id, lp.semester_id,
           COALESCE(lp.academic_year_id,
             (SELECT id FROM academic_years
               WHERE institution_id = lp.institution_id AND is_active
               ORDER BY start_date DESC LIMIT 1))
      INTO v_inst, v_sem, v_ay
      FROM learners_profiles lp WHERE lp.id = r.learner_profile_id;
    IF v_ay IS NULL THEN
      RAISE EXCEPTION 'No academic year resolved for %', r.learner_name;
    END IF;

    -- Billing. r.bill_amount is the REQUIRED TOTAL for this learner's
    -- band -> target rung; the shortfall is derived here so a bill someone
    -- raised by hand since the plan was built is honoured, never duplicated,
    -- and never cancelled (header note 7, and rule 4).
    v_bill_id := NULL; v_bill_final := NULL; v_bill_balance := NULL;
    SELECT id, COALESCE(final_amount, 0), COALESCE(balance_amount, 0)
      INTO v_bill_id, v_bill_final, v_bill_balance
      FROM billing_student_bills
     WHERE student_id = r.learner_profile_id
       AND item_category_id = v_bcat
       AND status NOT IN ('cancelled', 'superseded')
     ORDER BY created_at
     LIMIT 1;

    v_topup := COALESCE(r.bill_amount, 0) - COALESCE(v_bill_final, 0);

    IF v_bill_id IS NULL AND v_topup > 0 THEN
      -- Nothing billed yet: let the RPC create the bill, so the category, the
      -- due date and the description all match every other upgrade bill.
      v_res := public._cl_apply_upgrade_fee_bill(
                 r.learner_profile_id, v_hy, 'hostel', v_topup, r.note, v_topup);
      UPDATE public.cl_girls_bc_reconcile_log
         SET bill_action = v_res->>'action',
             bill_id = NULLIF(v_res->>'bill_id', '')::uuid,
             bill_amount = v_topup
       WHERE id = r.id;

    ELSIF v_bill_id IS NOT NULL AND v_topup > 0 THEN
      -- Short of the required total: top the existing bill up in place, exactly
      -- as _cl_apply_upgrade_fee_bill's own 'accumulated' branch does. An UPDATE
      -- that keeps student_id + item_category_id and was not previously
      -- cancelled returns early from trg_billing_bills_once_per_learner, so this
      -- is the one safe way to add to a learner who already has a bill.
      v_paid := COALESCE(v_bill_final, 0) - COALESCE(v_bill_balance, 0);
      UPDATE billing_student_bills
         SET final_amount   = v_bill_final + v_topup,
             total_amount   = COALESCE(total_amount, 0) + v_topup,
             unit_amount    = v_bill_final + v_topup,
             quantity       = 1,
             balance_amount = (v_bill_final + v_topup) - v_paid,
             status         = CASE WHEN v_paid <= 0 THEN 'unpaid'
                                   WHEN v_paid >= (v_bill_final + v_topup) THEN 'paid'
                                   ELSE 'partially_paid' END,
             bill_description = left(
               CASE WHEN COALESCE(bill_description, '') = '' THEN r.note
                    ELSE bill_description || ' + ' || r.note END, 500),
             updated_at = now()
       WHERE id = v_bill_id;
      UPDATE public.cl_girls_bc_reconcile_log
         SET bill_action = 'topped_up', bill_id = v_bill_id, bill_amount = v_topup
       WHERE id = r.id;

    ELSE
      -- Already billed at or above the rung. Rule 4: leave it entirely alone.
      UPDATE public.cl_girls_bc_reconcile_log
         SET bill_action = 'already_billed', bill_id = v_bill_id, bill_amount = 0
       WHERE id = r.id;
    END IF;

    UPDATE learners_profiles
       SET hostel_category_id = r.target_category_id, updated_at = now()
     WHERE id = r.learner_profile_id;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id,
      academic_year_id, semester_id, allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, allocated_by
    ) VALUES (
      v_inst, r.profile_id, r.target_block_id, r.target_room_id, r.target_bed_id,
      v_ay, v_sem, 'fresh', CURRENT_DATE, 'active',
      '', '', '', v_tier, NULL
    ) RETURNING id INTO v_alloc;

    UPDATE hostel_beds
       SET status = 'occupied', current_occupant_id = r.profile_id, updated_at = now()
     WHERE id = r.target_bed_id;

    UPDATE public.cl_girls_bc_reconcile_log
       SET outcome = 'applied',
           after_allocation_id = v_alloc,
           after_category_id = (SELECT hostel_category_id FROM learners_profiles WHERE id = r.learner_profile_id)
     WHERE id = r.id;
  END LOOP;

  ------------------------------------------------------- phase 5 — assertions
  -- Everything below runs in the same transaction as the writes, so any failure
  -- rolls the whole reconciliation back.

  -- (a) every planned row was applied
  SELECT count(*) INTO v_bad FROM public.cl_girls_bc_reconcile_log
   WHERE run_id = v_run AND outcome = 'planned';
  IF v_bad > 0 THEN RAISE EXCEPTION '% planned rows were never applied', v_bad; END IF;

  -- (b) nobody was downgraded
  SELECT count(*) INTO v_bad
    FROM public.cl_girls_bc_reconcile_log l
   WHERE l.run_id = v_run AND l.outcome = 'applied'
     AND COALESCE((SELECT amount FROM hostel_fees WHERE hostel_category_id = l.after_category_id
                    AND hostel_year_id = v_hy AND mess_category_id IS NULL AND is_active LIMIT 1), 0)
       < COALESCE((SELECT amount FROM hostel_fees WHERE hostel_category_id = l.before_category_id
                    AND hostel_year_id = v_hy AND mess_category_id IS NULL AND is_active LIMIT 1), 0);
  IF v_bad > 0 THEN RAISE EXCEPTION '% learners ended on a cheaper category than they started', v_bad; END IF;

  -- (c) the learner's category is exactly what was planned
  SELECT count(*) INTO v_bad FROM public.cl_girls_bc_reconcile_log
   WHERE run_id = v_run AND outcome = 'applied'
     AND after_category_id IS DISTINCT FROM target_category_id;
  IF v_bad > 0 THEN
    SELECT string_agg(learner_name, ', ') INTO v_msg FROM public.cl_girls_bc_reconcile_log
     WHERE run_id = v_run AND outcome = 'applied' AND after_category_id IS DISTINCT FROM target_category_id;
    RAISE EXCEPTION 'Category not as planned for: % (the allocation sync trigger overwrote it)', v_msg;
  END IF;

  -- (d) each learner sits on the bed the sheet asked for
  SELECT count(*) INTO v_bad
    FROM public.cl_girls_bc_reconcile_log l
    JOIN hostel_allocations h ON h.id = l.after_allocation_id
   WHERE l.run_id = v_run AND l.outcome = 'applied'
     AND (h.bed_id IS DISTINCT FROM l.target_bed_id
          OR h.room_id IS DISTINCT FROM l.target_room_id
          OR h.status <> 'active' OR h.check_out_date IS NOT NULL);
  IF v_bad > 0 THEN RAISE EXCEPTION '% allocations did not land on their target bed', v_bad; END IF;

  -- (e) no bed carries two live allocations, anywhere in the girls estate
  SELECT count(*) INTO v_bad FROM (
    SELECT h.bed_id FROM hostel_allocations h
      JOIN hostel_blocks b ON b.id = h.block_id
     WHERE h.status = 'active' AND h.check_out_date IS NULL AND b.hostel_type = 'girls'
     GROUP BY h.bed_id HAVING count(*) > 1
  ) d;
  IF v_bad > 0 THEN RAISE EXCEPTION '% girls-hostel beds hold more than one live allocation', v_bad; END IF;

  -- (f) rule 4: not one hostel bill was cancelled or superseded by this run
  SELECT count(*), COALESCE(sum(final_amount), 0)
    INTO v_bills_after, v_billed_after
    FROM billing_student_bills
   WHERE item_category_id = v_bcat
     AND status NOT IN ('cancelled', 'superseded');
  IF v_bills_after < v_bills_before THEN
    RAISE EXCEPTION 'Live hostel upgrade bills dropped from % to % — a bill was cancelled', v_bills_before, v_bills_after;
  END IF;

  -- (g) the money raised is exactly what was approved
  IF (v_billed_after - v_billed_before) <> 162500 THEN
    RAISE EXCEPTION 'Expected Rs.% of new hostel upgrade billing, got Rs.%',
      162500, (v_billed_after - v_billed_before);
  END IF;

  RAISE NOTICE 'Girls B/C reconciliation run % applied: % moves, % upgrades, % fresh, % skipped. New billing Rs.%',
    v_run, 10, 10, 12, 1, (v_billed_after - v_billed_before);
END
$mig$;
