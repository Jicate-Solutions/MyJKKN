-- =============================================================================
-- Girls Hostel A: correct the recorded room and bed of Classic Room residents
-- to where they physically stay, per the hostel office sheet
-- "Girls_hostel A.xlsx" (224 rows). Data correction only; no schema change.
--
-- WHAT THIS DOES
--   1. Backs up every Girls Hostel A room, bed and live allocation, plus the
--      category tags of every learner touched, into bak_gha_roomfix_20260911_*
--      (RLS on, no policies, anon and authenticated revoked).
--   2. Inventory: rooms 19 and 31 become student rooms in Classic Room, and
--      nine rooms get capacity raised to the bed count the sheet uses. The
--      trg_hostel_rooms_ensure_beds trigger materialises the 30 new beds.
--   3. Re-seats 164 active allocations IN PLACE. The allocation id is kept,
--      so deposits, cleaning bookings, vacate requests and buyout consents keep
--      pointing at the learner. allocation_type is NOT changed: this corrects a
--      recording error, it is not a transfer.
--   4. Inserts 9 first allocations for blank-email sheet rows that resolve to
--      exactly one female learner in the sheet's institution with no live
--      allocation. The row shape mirrors fn_cl_admin_allocate_bed.
--   5. Frees every bed the batch vacates and occupies every bed it fills.
--      No trigger maintains hostel_beds.status.
--
-- NOT TOUCHED (decided with the user, 2026-09-11)
--   - 9 active residents absent from the sheet, and SRIVATHANA (Girls Hostel B,
--     Deluxe Room 35). Their beds stay theirs.
--   - 33 sheet learners whose target bed is held, directly or through a
--     chain, by one of the above or by the 2 pending_approval rows in room 5.
--   - 14 blank-email sheet rows that do not resolve to exactly one learner.
--
-- TRIGGERS THAT FIRE (each verified 2026-09-11)
--   hostel_allocations UPDATE of room_id / bed_id:
--     trg_allocation_guard_reserved_bed      no reserved beds in the block: no-op
--     trg_enforce_room_buyout_lock_update    no active buyouts: no-op
--     trg_allocation_settle_arrival_update   policy hostel.settle_bill.enabled
--                                            is off: no-op
--     trg_hostel_premium_audit               one 'room_change' row per move
--     trg_allocation_sync_learner_categories fires on status only: NOT fired
--   hostel_allocations INSERT (status 'active'):
--     trg_allocation_sync_learner_categories keeps a tag that sources the seated
--       room, else writes the room's category. 8 of the 9 already carry Classic
--       Room; 1 has no tag and becomes Classic Room.
--     trg_validate_hostel_allocation_gender  all 9 are Female: pass
--   hostel_rooms UPDATE of capacity / room_purpose:
--     trg_hostel_rooms_ensure_beds           creates missing beds '1'..capacity
--
-- WHY THE PARK STEP
--   hostel_allocations_room_bed_active_uidx is UNIQUE (room_id, bed_id) WHERE
--   check_out_date IS NULL, checked row by row. Moving learner A onto learner
--   B's bed before B has left raises 23505. Movers are first parked with a
--   temporary check_out_date, which drops them out of the index, then moved and
--   un-parked in one statement whose final (room, bed) pairs are all distinct.
--   The temporary date never survives the transaction.
--
-- Every written allocation carries metadata->'gha_roomfix_20260911'.
-- ROLLBACK: restore room_id, bed_id and metadata from
--   bak_gha_roomfix_20260911_alloc; delete the 9 rows whose marker kind is
--   'fresh'; restore hostel_beds status and occupant from
--   bak_gha_roomfix_20260911_beds; delete the 30 new beds, then restore rooms
--   from bak_gha_roomfix_20260911_rooms; restore tags from
--   bak_gha_roomfix_20260911_lp.
-- =============================================================================

-- 1. Backups --------------------------------------------------------------------
CREATE TABLE bak_gha_roomfix_20260911_rooms AS
  SELECT * FROM hostel_rooms WHERE block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
CREATE TABLE bak_gha_roomfix_20260911_beds AS
  SELECT b.* FROM hostel_beds b JOIN hostel_rooms r ON r.id = b.room_id
   WHERE r.block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
CREATE TABLE bak_gha_roomfix_20260911_alloc AS
  SELECT * FROM hostel_allocations
   WHERE block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a' AND check_out_date IS NULL;
CREATE TABLE bak_gha_roomfix_20260911_lp AS
  SELECT lp.id, lp.hostel_category_id, lp.mess_category_id, lp.updated_at
    FROM learners_profiles lp
   WHERE lp.id IN (SELECT p.learner_id FROM profiles p
                    JOIN hostel_allocations a ON a.learner_id = p.id
                   WHERE a.block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a' AND a.check_out_date IS NULL)
      OR lp.id IN ('d3083574-03db-411b-bffd-60621442202d', '885205d1-f2e9-48dc-a2f2-16e99b5cc244', '7cf98f26-e7fa-4b42-ba64-cac858ec9c34', '93fca68f-8d69-4891-a5ff-f4ac6303ad95', 'ec31476f-14eb-4af2-ad9a-e69c49c584b4', 'caef5087-5d7d-41f8-a5e6-34eb290fc6b1', '21d4d7df-84ac-4914-9708-375f8f325b7e', '7fc715eb-08f5-4a2f-a64d-ece8c21cd7c1', '3b14d507-01dc-4472-b329-b4e61a3747c3');

ALTER TABLE bak_gha_roomfix_20260911_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bak_gha_roomfix_20260911_beds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bak_gha_roomfix_20260911_alloc ENABLE ROW LEVEL SECURITY;
ALTER TABLE bak_gha_roomfix_20260911_lp    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bak_gha_roomfix_20260911_rooms, bak_gha_roomfix_20260911_beds,
              bak_gha_roomfix_20260911_alloc, bak_gha_roomfix_20260911_lp
  FROM anon, authenticated;

-- 2. Inventory ------------------------------------------------------------------
-- room 17: capacity 5 -> 10
UPDATE hostel_rooms SET capacity = 10
 WHERE id = 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 18: capacity 5 -> 9
UPDATE hostel_rooms SET capacity = 9
 WHERE id = '305f0b17-b5b3-4fe0-ace6-6307bea259e2' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 19: was warden, no category, capacity 5, 0 beds
UPDATE hostel_rooms SET room_purpose = 'student', category_id = '3039d5d8-3ddf-490e-9977-04a558b9062b', capacity = 10
 WHERE id = '46848149-3ff4-4b30-a527-aba18721f85b' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 23: capacity 5 -> 6
UPDATE hostel_rooms SET capacity = 6
 WHERE id = 'cdef97f7-f899-470f-8b5d-070efc696bc3' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 24: capacity 5 -> 6
UPDATE hostel_rooms SET capacity = 6
 WHERE id = '751020f5-debb-4ec3-876f-0b716709d015' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 25: capacity 2 -> 5
UPDATE hostel_rooms SET capacity = 5
 WHERE id = '7562f287-d8f7-490b-a9a8-fc1100828780' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 30: capacity 5 -> 6
UPDATE hostel_rooms SET capacity = 6
 WHERE id = 'a554d46c-88e7-4d16-b5d5-2dcaff876e37' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 31: was mess_warden, no category, capacity 1, 0 beds
UPDATE hostel_rooms SET room_purpose = 'student', category_id = '3039d5d8-3ddf-490e-9977-04a558b9062b', capacity = 4
 WHERE id = '0f0148bf-7f1b-4a60-91f0-8d47e240f3c5' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';
-- room 52: capacity 5 -> 6
UPDATE hostel_rooms SET capacity = 6
 WHERE id = '0b980c70-59af-4d2f-bb3e-b15068d7dc39' AND block_id = '74a6bea6-23b8-4c9f-8714-86f5060f641a';

-- 3 to 5. Re-seat, first allocations, bed status, assertions ------------------
DO $roomfix$
DECLARE
  c_gha     constant uuid := '74a6bea6-23b8-4c9f-8714-86f5060f641a';
  c_classic constant uuid := '3039d5d8-3ddf-490e-9977-04a558b9062b';
  v_tier        uuid;
  v_live_before int;
  v_live_after  int;
  v_beds_before int;
  v_beds_after  int;
  v_n           int;
  v_bad         text;
BEGIN
  CREATE TEMP TABLE _mv (alloc_id uuid PRIMARY KEY, from_room uuid, from_bed text,
                         to_room uuid, to_bed text, to_bed_id uuid, learner uuid) ON COMMIT DROP;
  INSERT INTO _mv (alloc_id, from_room, from_bed, to_room, to_bed) VALUES
      ('114a5b39-5b21-491f-8b3b-98a51aeb72c7'::uuid, '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '2', '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '1'),
      ('734ec92c-e454-4a66-b70d-2e1c99d17fd8'::uuid, '6c4a4e75-41b7-40e7-8c17-a700d0d20b78'::uuid, '4', '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '2'),
      ('c4681795-b8e7-4109-8dac-10645ca06ec3'::uuid, '11dddd8c-49b5-429f-86aa-1ca98ca43417'::uuid, '5', '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '3'),
      ('6db7c7ee-3b2b-42c3-b53d-edbbd5f735c6'::uuid, 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '1', '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '4'),
      ('eade1508-e27c-4215-8bd9-55a1c0284bb0'::uuid, '5ecc9778-05f6-47bd-b899-f4ddfff5566b'::uuid, '5', 'a27caf52-2cf8-4abb-9a78-75273faab4b1'::uuid, '1'),
      ('e6483bf7-2198-428f-9cbd-6add08f8c352'::uuid, 'fbbc6f36-5595-4473-8c7e-7f3780f96efc'::uuid, '2', 'a27caf52-2cf8-4abb-9a78-75273faab4b1'::uuid, '2'),
      ('7bd1ad51-9d33-4c7c-a8af-b4b5c872969b'::uuid, 'fbbc6f36-5595-4473-8c7e-7f3780f96efc'::uuid, '1', '83dccf68-91db-43ac-af42-4610f476cff2'::uuid, '1'),
      ('91312506-1768-40bf-b6c9-5de80f3fd41f'::uuid, '10ac5b82-e150-4d4e-a5eb-6deeee935c31'::uuid, '3', '10ac5b82-e150-4d4e-a5eb-6deeee935c31'::uuid, '1'),
      ('59f45af4-48ae-4071-a897-a1daf959e76c'::uuid, '10ac5b82-e150-4d4e-a5eb-6deeee935c31'::uuid, '5', '10ac5b82-e150-4d4e-a5eb-6deeee935c31'::uuid, '3'),
      ('e2073635-ccd7-47f7-aec1-4d32f62e05f5'::uuid, '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '10', '8a8799c0-e3a6-4db0-8280-203275ec9e4b'::uuid, '1'),
      ('67a4fb34-0da5-4bd4-9916-f15859c85e42'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '1', 'a8ec90f1-6a44-4742-8688-5db7c872e2ac'::uuid, '1'),
      ('935f125a-65b0-4e4f-b199-d1e9272d337c'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '10', 'a8ec90f1-6a44-4742-8688-5db7c872e2ac'::uuid, '2'),
      ('4925db7c-5c9b-4189-85e3-3fa4b7e57d7f'::uuid, '0a832ae7-ad4d-46c6-b079-49c4bf46e737'::uuid, '3', 'a8ec90f1-6a44-4742-8688-5db7c872e2ac'::uuid, '4'),
      ('a6b62ec8-12c3-462d-a4e2-8877583498be'::uuid, '8a8799c0-e3a6-4db0-8280-203275ec9e4b'::uuid, '1', '5ecc9778-05f6-47bd-b899-f4ddfff5566b'::uuid, '1'),
      ('c061468f-3692-42b9-bfa2-5b64683c90fa'::uuid, '0a832ae7-ad4d-46c6-b079-49c4bf46e737'::uuid, '4', '5ecc9778-05f6-47bd-b899-f4ddfff5566b'::uuid, '2'),
      ('5b359f45-1627-43d5-9be4-eda9b05cb5fa'::uuid, 'a8ec90f1-6a44-4742-8688-5db7c872e2ac'::uuid, '2', '5ecc9778-05f6-47bd-b899-f4ddfff5566b'::uuid, '3'),
      ('e1c3ee47-8569-4c62-ac7b-f5e817a58969'::uuid, '8a8799c0-e3a6-4db0-8280-203275ec9e4b'::uuid, '5', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '1'),
      ('19e3d6cd-ec38-4163-bcc5-3c0cd2080e2c'::uuid, '11dddd8c-49b5-429f-86aa-1ca98ca43417'::uuid, '1', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '2'),
      ('c21d7212-c2e0-4c0c-ae17-d84d61e3e9e1'::uuid, 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '3', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '3'),
      ('045eb70b-c5c2-46de-a45e-6589a0522c7d'::uuid, 'a27caf52-2cf8-4abb-9a78-75273faab4b1'::uuid, '5', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '4'),
      ('4815872b-708c-4c25-8e1c-00ce660bb002'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '4', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '5'),
      ('03fa6898-ccfe-486a-bfde-2d390e32fc07'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '7', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '6'),
      ('1e31b45e-36bd-456e-8444-88e66450f2f9'::uuid, '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '1', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '7'),
      ('e92d93e1-5004-4b3c-89d5-4332fee8a908'::uuid, '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '3', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '8'),
      ('9351ef45-922c-4576-9913-7918e535e2c4'::uuid, '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '3', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '9'),
      ('420bd77a-4f3e-44ce-be9f-39b17f487f69'::uuid, '10ac5b82-e150-4d4e-a5eb-6deeee935c31'::uuid, '4', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '10'),
      ('8c9cf33c-f740-43ff-8c07-12fca6a61a9a'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '2', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '11'),
      ('81998a7f-ef7d-40f9-8948-05385ebae605'::uuid, '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '5', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '12'),
      ('cddf6fcc-31c5-4037-b638-f81127f9336b'::uuid, 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '1', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '13'),
      ('8c04fb39-b7e9-4330-8bc4-df9de63a711b'::uuid, '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '4', '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '14'),
      ('26383660-2962-4008-9840-37d44280901d'::uuid, 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '4', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '1'),
      ('813b5ead-0a8b-41ae-a7de-4bc68da03e48'::uuid, 'a27caf52-2cf8-4abb-9a78-75273faab4b1'::uuid, '1', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '2'),
      ('372a606f-7a2e-40d5-b9fe-ea3c909a8bf4'::uuid, '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '3', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '3'),
      ('d3671869-018f-4022-a1cd-90b35593289e'::uuid, '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '2', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '4'),
      ('8688c0f4-5f1a-4a28-99e0-f345628724c6'::uuid, '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '3', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '5'),
      ('a67b5ad5-4ac9-4822-8893-9daa0e83f2b6'::uuid, '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '4', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '6'),
      ('16f5e3bd-dc46-4e9b-8dc2-eb708787f2a3'::uuid, '3e47d934-882e-4a83-a245-7e9a10681002'::uuid, '2', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '7'),
      ('dc96f34b-e279-4d44-9702-de05b4218ba4'::uuid, 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '1', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '8'),
      ('e1fe89a9-b1b1-4eeb-bb8c-bc036b8bcd52'::uuid, '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '4', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '9'),
      ('472e7907-36c0-411b-a055-dd66baf4b27f'::uuid, 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '5', 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '10'),
      ('6268e1b4-72d1-47c1-b798-b41b3c695f32'::uuid, '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '2', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '1'),
      ('58bfa5d6-257f-40af-9830-bed1772c6aab'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '13', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '2'),
      ('5d34e0fd-c350-40cc-82f9-62a2bad1e0e3'::uuid, 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '1', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '4'),
      ('9767dec0-b047-4b23-968f-4c068a46e00f'::uuid, 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '2', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '5'),
      ('0001c758-df23-4f11-93fc-693f627879c6'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '1', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '6'),
      ('ebf19e0c-e4dd-4228-9f3e-8c2a300990c3'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '5', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '7'),
      ('216014cb-1f1c-4b6e-a213-41b6ce655810'::uuid, '1276ed0e-e69f-47d3-b8f5-ed7b76e122f8'::uuid, '4', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '8'),
      ('88685606-92d8-4ab9-9cfb-f5a61b4e6ef0'::uuid, '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '5', '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '9'),
      ('132f49ac-ad18-4f2d-acd0-a579e736c52a'::uuid, 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '5', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '1'),
      ('470589ef-d59f-4cf2-838a-fa8eee2b89b3'::uuid, '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '5', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '2'),
      ('826873fa-e648-4dfc-93f9-2999d1baa723'::uuid, '8207537a-c2ee-4ae2-b56b-01ea5f92255b'::uuid, '1', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '3'),
      ('ce4b1621-c265-487f-ab68-41b739a20c6a'::uuid, '8207537a-c2ee-4ae2-b56b-01ea5f92255b'::uuid, '3', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '4'),
      ('264611e1-1dbf-403e-a351-b254d7d039aa'::uuid, '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '1', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '5'),
      ('f5f454eb-f211-42c8-b6c4-b7aa0bb890b8'::uuid, 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '2', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '6'),
      ('4c6ff796-8863-446a-aec3-a46c76ed99f5'::uuid, 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '3', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '7'),
      ('d8b591c2-47ae-4c91-b59b-9554683c0930'::uuid, 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '5', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '8'),
      ('4223fe35-a1aa-4f7c-9ddd-ad51c951151b'::uuid, '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '2', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '9'),
      ('9fae9fdf-f70c-4c1d-b500-fadc4a12d742'::uuid, '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '2', '46848149-3ff4-4b30-a527-aba18721f85b'::uuid, '10'),
      ('ee0fabaf-0d1a-443a-af7f-d3558e80ffe2'::uuid, 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '3', '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '1'),
      ('b01e7225-e92d-40b1-b64c-e6a3ebe65ca5'::uuid, '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '4', '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '2'),
      ('a9fa9f82-a35a-406f-b4ac-25e3feb4be33'::uuid, '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '4', '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '3'),
      ('5dd9d4c5-b53a-48d1-af14-79ea875ad5f1'::uuid, 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '2', '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '4'),
      ('0ad9a90f-928f-4522-b62e-0298328d00cc'::uuid, 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '3', '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '5'),
      ('fcbeeba4-744b-46c8-a475-875ebde76fa7'::uuid, 'a27caf52-2cf8-4abb-9a78-75273faab4b1'::uuid, '2', 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '1'),
      ('1f0e2037-48bd-4759-b35d-11799f49e585'::uuid, '9601e9ec-2572-47ae-8b24-4eb193f3f1be'::uuid, '4', 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '2'),
      ('fffb8b47-b8a2-4fc8-8098-57e03bbf6cc6'::uuid, '8207537a-c2ee-4ae2-b56b-01ea5f92255b'::uuid, '5', 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '3'),
      ('56150a2a-0308-4cb6-8080-ea0beb2e4805'::uuid, '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '2', 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '4'),
      ('b0d9f083-5250-45f0-b7bb-831c7c5fff63'::uuid, 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '4', 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '5'),
      ('9a660a1b-805b-45cf-91fa-bd81496f2b6e'::uuid, '91a90027-0c01-4be9-8de8-da32cf41adcf'::uuid, '2', 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '1'),
      ('7cb82d7a-f399-40f1-94f2-9b0571d9fce5'::uuid, 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '4', 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '2'),
      ('fadb7c25-bf41-4bad-ad85-e9ff8b2edf0c'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '3', 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '3'),
      ('88edead6-e4a6-453e-8015-a8cb132d1608'::uuid, 'b1d1cc7e-f32d-4d9a-87ad-c588917fd162'::uuid, '1', 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '4'),
      ('0fc10dfe-ef45-4ea0-b979-183c0c59298c'::uuid, 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '1', 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '5'),
      ('39c2ca4e-c36a-4076-8dae-e6aa5b4afe78'::uuid, 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '2', 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '6'),
      ('f77f1865-ddfa-4e50-aba8-d51d5905e775'::uuid, '5ecc9778-05f6-47bd-b899-f4ddfff5566b'::uuid, '1', '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '1'),
      ('1eca23a6-3cbe-4f41-b209-9dc11ed87c9c'::uuid, '8207537a-c2ee-4ae2-b56b-01ea5f92255b'::uuid, '2', '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '2'),
      ('aa6a9e47-9ea2-4307-94be-07c5d6ca269d'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '5', '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '3'),
      ('d0828d40-b76b-4cb5-a3f7-eb215931d880'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '6', '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '4'),
      ('65e2d8c8-8744-4711-a2b4-ec835999303e'::uuid, '1276ed0e-e69f-47d3-b8f5-ed7b76e122f8'::uuid, '1', '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '5'),
      ('3fc3242f-7b9e-4ce2-b566-6e8ce56344b3'::uuid, '1276ed0e-e69f-47d3-b8f5-ed7b76e122f8'::uuid, '5', '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '6'),
      ('100562e1-551d-4425-8174-d3564e4d4a60'::uuid, '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '2', '7562f287-d8f7-490b-a9a8-fc1100828780'::uuid, '1'),
      ('da9c66fa-a3f3-4003-aab8-e1c8c76e18e4'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '9', '7562f287-d8f7-490b-a9a8-fc1100828780'::uuid, '3'),
      ('867f0f58-4a6c-4013-af2a-00a58d07a2e8'::uuid, '91a90027-0c01-4be9-8de8-da32cf41adcf'::uuid, '3', '7562f287-d8f7-490b-a9a8-fc1100828780'::uuid, '4'),
      ('9fd7d96d-d965-423e-98a8-95177afd850e'::uuid, '91a90027-0c01-4be9-8de8-da32cf41adcf'::uuid, '4', '7562f287-d8f7-490b-a9a8-fc1100828780'::uuid, '5'),
      ('1160e6d1-02ee-4562-a9b2-c6704756dde7'::uuid, '8207537a-c2ee-4ae2-b56b-01ea5f92255b'::uuid, '4', 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '1'),
      ('0430270f-a67e-412b-a95b-f053e8fcbcab'::uuid, '3e47d934-882e-4a83-a245-7e9a10681002'::uuid, '4', 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '2'),
      ('c1dea077-6b62-49a2-aad7-32ffedebe9e1'::uuid, '751020f5-debb-4ec3-876f-0b716709d015'::uuid, '1', 'fab84503-127e-4df7-8322-6d9bad9f244c'::uuid, '3'),
      ('92d9664a-be59-4073-80fd-a3eea4a6c51d'::uuid, 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '1', 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '1'),
      ('d5b8fde3-dbfe-48c4-9cc9-4bada3de5299'::uuid, '13ff8cae-aa16-4c38-b068-7658f1cef68e'::uuid, '4', 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '2'),
      ('474a8941-6711-4a9b-bcfd-ad5940bdd894'::uuid, 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '3', 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '3'),
      ('b13a0b30-59ff-45a9-af01-2c279430a392'::uuid, 'ada631d8-600c-4568-9355-34d6664220ad'::uuid, '1', 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '4'),
      ('7f640dbf-191c-4f11-946d-c03997625597'::uuid, '13ff8cae-aa16-4c38-b068-7658f1cef68e'::uuid, '5', '11dddd8c-49b5-429f-86aa-1ca98ca43417'::uuid, '1'),
      ('fd34fab9-433c-4303-925b-1cb15fb89f84'::uuid, '5e29411b-b502-4baf-be79-8fce2a2c7ea0'::uuid, '1', '11dddd8c-49b5-429f-86aa-1ca98ca43417'::uuid, '2'),
      ('820e3aed-afd0-4fb5-8420-35f442a7a61f'::uuid, 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '2', '11dddd8c-49b5-429f-86aa-1ca98ca43417'::uuid, '5'),
      ('8ac46a07-9d91-4b43-ba68-0c33f0cba327'::uuid, 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '2', 'ada631d8-600c-4568-9355-34d6664220ad'::uuid, '1'),
      ('cc25b726-7d59-46d7-b090-a188d635d311'::uuid, 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '1', 'ada631d8-600c-4568-9355-34d6664220ad'::uuid, '3'),
      ('a5ed2477-ef29-4b9f-8be8-beffed49066d'::uuid, 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '4', 'ada631d8-600c-4568-9355-34d6664220ad'::uuid, '4'),
      ('e5fdd441-2828-4554-bfec-3a52e5a817f4'::uuid, '13ff8cae-aa16-4c38-b068-7658f1cef68e'::uuid, '1', 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '1'),
      ('2652fa3b-98fe-4177-9ec6-be33f1b71809'::uuid, 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '4', 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '2'),
      ('46a51ba0-7806-4e15-93b7-4a8fc4746587'::uuid, 'ada631d8-600c-4568-9355-34d6664220ad'::uuid, '4', 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '3'),
      ('aade18cb-7312-498f-acb8-4af1b9fa74d6'::uuid, 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '3', 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '4'),
      ('d33088c8-bb98-4e57-8d9e-90076058662f'::uuid, 'ada631d8-600c-4568-9355-34d6664220ad'::uuid, '3', 'a554d46c-88e7-4d16-b5d5-2dcaff876e37'::uuid, '6'),
      ('fbc2e450-6d87-4fce-8eed-0c0116642f69'::uuid, 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '5', '0f0148bf-7f1b-4a60-91f0-8d47e240f3c5'::uuid, '1'),
      ('1d612b81-4041-4bcb-bff8-fc252ab9d3ce'::uuid, '6c4a4e75-41b7-40e7-8c17-a700d0d20b78'::uuid, '1', '0f0148bf-7f1b-4a60-91f0-8d47e240f3c5'::uuid, '2'),
      ('be5bef5a-fef4-42d0-bd55-5d0f4a0b27a8'::uuid, '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '5', '0f0148bf-7f1b-4a60-91f0-8d47e240f3c5'::uuid, '3'),
      ('719ca1eb-c177-4688-b166-022ebd76fcdf'::uuid, '6c4a4e75-41b7-40e7-8c17-a700d0d20b78'::uuid, '3', '0f0148bf-7f1b-4a60-91f0-8d47e240f3c5'::uuid, '4'),
      ('b4e6bbad-6ac9-436f-b941-c8b699612354'::uuid, 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '3', '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '2'),
      ('1179342e-89ca-4c76-bf13-44c3f5d0dcd8'::uuid, '5e29411b-b502-4baf-be79-8fce2a2c7ea0'::uuid, '4', '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '3'),
      ('9d70a087-75b0-427d-97fb-2851687afa10'::uuid, '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '2', '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '4'),
      ('961b3ae7-2160-4b61-8323-897d131443a8'::uuid, '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '3', '31276d04-5b63-4212-8ae2-456cf241b4bb'::uuid, '5'),
      ('7fcc4f53-907a-43f6-b196-47d524f93d8d'::uuid, '5e29411b-b502-4baf-be79-8fce2a2c7ea0'::uuid, '3', '5e29411b-b502-4baf-be79-8fce2a2c7ea0'::uuid, '1'),
      ('5395e5eb-6a0e-4e0b-a63e-51602f20b100'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '11', '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '1'),
      ('64c544b4-055f-4757-954a-e3c45cfdbc0d'::uuid, 'a27caf52-2cf8-4abb-9a78-75273faab4b1'::uuid, '4', '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '2'),
      ('831d140b-0d74-427c-9afe-0c9bbef89979'::uuid, 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '4', '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '3'),
      ('ed1c752e-1ff3-4a12-b710-f81566904d1e'::uuid, 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '2', '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '5'),
      ('189a0b64-ca80-43ef-9454-5adb04da0829'::uuid, '11dddd8c-49b5-429f-86aa-1ca98ca43417'::uuid, '2', '13ff8cae-aa16-4c38-b068-7658f1cef68e'::uuid, '1'),
      ('730c4afc-3447-4895-8ccc-fe811ec6f603'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '3', '13ff8cae-aa16-4c38-b068-7658f1cef68e'::uuid, '4'),
      ('0a25c465-a907-438a-aea6-489a28242ad7'::uuid, '1276ed0e-e69f-47d3-b8f5-ed7b76e122f8'::uuid, '3', '13ff8cae-aa16-4c38-b068-7658f1cef68e'::uuid, '5'),
      ('6d8e84f4-216f-4278-ba13-e11c8a8def59'::uuid, 'a8ec90f1-6a44-4742-8688-5db7c872e2ac'::uuid, '4', 'fbbc6f36-5595-4473-8c7e-7f3780f96efc'::uuid, '1'),
      ('4399d902-dbcd-43e2-920e-465cf16ab0b6'::uuid, '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '5', 'fbbc6f36-5595-4473-8c7e-7f3780f96efc'::uuid, '2'),
      ('c9f7497e-b261-4928-9482-76c12d7943ef'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '8', 'fbbc6f36-5595-4473-8c7e-7f3780f96efc'::uuid, '4'),
      ('5e2fd5af-3d43-4a9a-a7b1-cb1960cf955d'::uuid, '6dee93d3-bb9c-413d-9263-5c8ab7224cf8'::uuid, '1', '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '1'),
      ('e009b823-1773-4639-810a-dea15ff88dec'::uuid, '0a832ae7-ad4d-46c6-b079-49c4bf46e737'::uuid, '1', '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '2'),
      ('b8f57ae2-9d79-45fc-bf7a-c1358318f502'::uuid, '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '4', '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '3'),
      ('3503f04b-1285-4044-b7e6-e783de309ed7'::uuid, '91a90027-0c01-4be9-8de8-da32cf41adcf'::uuid, '1', '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '4'),
      ('9bd7efc0-08af-4994-bc54-a7b154eebffc'::uuid, '774152a4-cd8a-4176-be4f-acddaf3527a7'::uuid, '1', '5db18f1b-35c9-4b27-b16d-fbbde72f40b5'::uuid, '5'),
      ('ee7e62a6-b606-47b8-ab05-abca28e0016a'::uuid, 'a8ec90f1-6a44-4742-8688-5db7c872e2ac'::uuid, '1', '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '1'),
      ('0860f8ea-673a-472b-8c86-e2e19a20d9d1'::uuid, '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '1', '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '2'),
      ('0d59f0e9-b48b-4b25-93f4-f5cb1921e057'::uuid, 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '3', '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '3'),
      ('87041303-f1f2-487c-bf00-962a72f14754'::uuid, 'cdef97f7-f899-470f-8b5d-070efc696bc3'::uuid, '5', '96402042-000f-4c49-817a-18891e5f2ff3'::uuid, '4'),
      ('2e970242-3e32-46d3-b129-8e4b22b12a27'::uuid, '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '2', 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '1'),
      ('a437ccf9-fe26-4def-bdde-02c82ab6632c'::uuid, '1431de9c-2c7a-4974-8f71-efd091c8cbf3'::uuid, '3', 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '2'),
      ('6e0d8dc2-8b7a-48fb-9ee0-12b2270e922b'::uuid, '305f0b17-b5b3-4fe0-ace6-6307bea259e2'::uuid, '1', 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '3'),
      ('642ffb29-ac31-4260-9a26-f8c2fc1e04d4'::uuid, 'c50f59af-7033-4a1a-b28e-35a029760dee'::uuid, '4', 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '4'),
      ('2eeb4c7d-bc1d-42fa-890b-f31d3325bdfc'::uuid, '7562f287-d8f7-490b-a9a8-fc1100828780'::uuid, '1', 'a11ec74f-48f9-47f6-ac9d-7abb5ac1ea24'::uuid, '5'),
      ('4d651e6b-0d84-4012-81f8-0f27761e2b5c'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '14', '3e47d934-882e-4a83-a245-7e9a10681002'::uuid, '2'),
      ('d88e8228-a338-4a2a-8ebd-0593dfc1490a'::uuid, 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '5', '3e47d934-882e-4a83-a245-7e9a10681002'::uuid, '4'),
      ('20d9e27c-116b-43c7-96ed-c198762fb39d'::uuid, '0a832ae7-ad4d-46c6-b079-49c4bf46e737'::uuid, '2', 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '1'),
      ('441a2c8e-d025-4835-8e2b-a44859c9df4f'::uuid, '1276ed0e-e69f-47d3-b8f5-ed7b76e122f8'::uuid, '2', 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '2'),
      ('e7cc5546-5604-4e88-a00d-1aad77b8acbc'::uuid, '91a90027-0c01-4be9-8de8-da32cf41adcf'::uuid, '5', 'af1dca8e-1211-4f08-832b-ea88d3f8fa73'::uuid, '3'),
      ('d2b010e0-fb47-4e7b-adf0-0a7d3e266ed8'::uuid, 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '3', '3997ab10-a7f8-4d59-b6d6-3661c8d6e0b1'::uuid, '2'),
      ('b5880a35-7d07-4086-807f-539de5eb7fe1'::uuid, '133cbc6d-c0b0-4f1a-abc1-577131635089'::uuid, '1', '3997ab10-a7f8-4d59-b6d6-3661c8d6e0b1'::uuid, '3'),
      ('f5cc547d-c97f-464f-89c5-c452006b72ae'::uuid, '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '4', '3997ab10-a7f8-4d59-b6d6-3661c8d6e0b1'::uuid, '5'),
      ('6589d252-0330-4a12-9b08-f3b4e7839a89'::uuid, 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '2', 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '1'),
      ('f0bbccf3-1721-470d-a17a-e3ad4bfe279d'::uuid, 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '4', 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '2'),
      ('8846c385-5b25-4d5a-8a20-7cac4ddd8a83'::uuid, '133cbc6d-c0b0-4f1a-abc1-577131635089'::uuid, '3', 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '3'),
      ('ccfa5bff-fbb9-4ea9-833f-aac36c3caf8f'::uuid, 'afc3dda8-3663-43af-982d-80ba05820e16'::uuid, '3', 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '4'),
      ('907f92b0-ebe3-459f-834f-9d42de5fb4d5'::uuid, 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '5', '133cbc6d-c0b0-4f1a-abc1-577131635089'::uuid, '1'),
      ('cff32b06-b272-4f95-87bd-4f590b0f0fa7'::uuid, 'afc3dda8-3663-43af-982d-80ba05820e16'::uuid, '5', '133cbc6d-c0b0-4f1a-abc1-577131635089'::uuid, '3'),
      ('130acb07-81e8-4ac2-9643-5778dac36810'::uuid, 'bd52a923-7dce-41be-b420-a479d5ff6615'::uuid, '5', '133cbc6d-c0b0-4f1a-abc1-577131635089'::uuid, '4'),
      ('c260a60e-b941-4850-b8c9-f09e564d013e'::uuid, '3997ab10-a7f8-4d59-b6d6-3661c8d6e0b1'::uuid, '3', '1601f93b-89cf-49eb-a370-e65cee6d13ca'::uuid, '1'),
      ('636302d3-916b-4e55-a37d-bbae33ffb62e'::uuid, 'd519240e-42ce-49a5-b194-564ec3974d62'::uuid, '1', '1601f93b-89cf-49eb-a370-e65cee6d13ca'::uuid, '2'),
      ('67733af5-d282-4abc-bf27-38c4b365f74d'::uuid, 'afc3dda8-3663-43af-982d-80ba05820e16'::uuid, '2', '1601f93b-89cf-49eb-a370-e65cee6d13ca'::uuid, '3'),
      ('3df16766-93e4-48f7-b356-f5375d95bbe0'::uuid, 'bd52a923-7dce-41be-b420-a479d5ff6615'::uuid, '1', '1601f93b-89cf-49eb-a370-e65cee6d13ca'::uuid, '4'),
      ('9a0e6553-c1e7-488d-8661-e79bda8ff6aa'::uuid, 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '2', '1601f93b-89cf-49eb-a370-e65cee6d13ca'::uuid, '5'),
      ('acf8e7bf-432d-4593-9ffd-f64955906f53'::uuid, '133cbc6d-c0b0-4f1a-abc1-577131635089'::uuid, '4', 'afc3dda8-3663-43af-982d-80ba05820e16'::uuid, '2'),
      ('96a357c7-a295-4da1-8b9b-f31f3e038c63'::uuid, '3997ab10-a7f8-4d59-b6d6-3661c8d6e0b1'::uuid, '5', '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '1'),
      ('bd5965ff-5640-48c5-abb2-79f8accf7d9b'::uuid, 'bd52a923-7dce-41be-b420-a479d5ff6615'::uuid, '2', '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '4'),
      ('6603d392-fd57-46dd-a6cd-66242c043ab0'::uuid, 'bd52a923-7dce-41be-b420-a479d5ff6615'::uuid, '4', '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '5'),
      ('654dc548-4f3e-4b9f-b366-502f1143d4ed'::uuid, '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '5', '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '6'),
      ('0c57b2b4-dc9c-4d71-8846-8e5f2de61893'::uuid, '3997ab10-a7f8-4d59-b6d6-3661c8d6e0b1'::uuid, '2', 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '1'),
      ('b6dd8e88-2fc0-4807-89ff-8247f83f2b1c'::uuid, 'bd52a923-7dce-41be-b420-a479d5ff6615'::uuid, '3', 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '2'),
      ('04fd6ff9-b2b4-40b5-b6a7-b0013a1bb106'::uuid, '0b980c70-59af-4d2f-bb3e-b15068d7dc39'::uuid, '1', 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '3'),
      ('17084cff-3b08-45ea-9b23-6ed60b3d1fe8'::uuid, 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '1', 'd6d9769a-b54c-4771-a5b0-ab93721144b5'::uuid, '4');

  CREATE TEMP TABLE _fr (src_row int, profile_id uuid PRIMARY KEY, lp_id uuid,
                         to_room uuid, to_bed text, to_bed_id uuid, alloc_id uuid) ON COMMIT DROP;
  INSERT INTO _fr (src_row, profile_id, lp_id, to_room, to_bed) VALUES
      (200, '430a9cea-4ada-4724-b89d-a2510af66515'::uuid, 'd3083574-03db-411b-bffd-60621442202d'::uuid, 'e784a624-5b62-4da0-bfa7-611788340e63'::uuid, '5'),
      (201, 'b3261ff3-7eeb-485f-8f50-a48193a7c287'::uuid, '885205d1-f2e9-48dc-a2f2-16e99b5cc244'::uuid, '5e29411b-b502-4baf-be79-8fce2a2c7ea0'::uuid, '3'),
      (208, 'fc0bfc84-d888-4bf4-a2e7-99914fd55c8c'::uuid, '7cf98f26-e7fa-4b42-ba64-cac858ec9c34'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '2'),
      (209, '0138ee3a-b1bd-4c9e-a163-444dfa92a161'::uuid, '93fca68f-8d69-4891-a5ff-f4ac6303ad95'::uuid, '0a832ae7-ad4d-46c6-b079-49c4bf46e737'::uuid, '5'),
      (212, 'a9cd50d9-f737-4169-ae15-3322d881c0b5'::uuid, 'ec31476f-14eb-4af2-ad9a-e69c49c584b4'::uuid, 'bd52a923-7dce-41be-b420-a479d5ff6615'::uuid, '1'),
      (214, 'c52731c5-f713-463c-8fb1-e8a64562be21'::uuid, 'caef5087-5d7d-41f8-a5e6-34eb290fc6b1'::uuid, 'b9fc13fd-1f8f-42b0-a1b4-408229eec34a'::uuid, '3'),
      (220, '240d76be-34ac-422d-861f-cf848ebdb219'::uuid, '21d4d7df-84ac-4914-9708-375f8f325b7e'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '2'),
      (222, '7987caab-1d48-434f-83ea-95ecf0b6f2e9'::uuid, '7fc715eb-08f5-4a2f-a64d-ece8c21cd7c1'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '4'),
      (223, 'fb7149d2-77fc-4bc6-9ff3-1665ec404ef1'::uuid, '3b14d507-01dc-4472-b329-b4e61a3747c3'::uuid, 'd8f8be1c-7531-4f7a-a56a-f3843cd73e7f'::uuid, '5');

  CREATE TEMP TABLE _held (alloc_id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _held SELECT unnest(ARRAY[
    '4ede7a93-a778-4ff5-a038-525f9f5492ee',
    '036553ea-f629-426b-b737-b9cebda0f846',
    '86dc059f-b049-4f26-b5be-8f700ef541f1',
    'dc1a3f53-b522-4c76-801e-61005aaa411c',
    '63a7effc-8a0e-4d1b-9a35-c852a44e075f',
    'c067754c-dd31-479a-95ae-83daf9aa6c6a',
    'e7498165-d284-4c19-b876-f7e28fc1f2c1',
    'e5d3d694-e56a-460f-94b6-12e008cfdb7c',
    '668588d8-ee11-4b0f-ab5a-d4a74e2400cd',
    'ffb12042-731e-4fae-8698-808d0941d57a',
    '28863cd2-17b1-48fb-873a-46e43507f93d',
    'a65ceefe-af30-4e94-a1b0-ef3bb8e94e45',
    'fe844894-1712-4271-bff6-7cf430b654b0',
    'e5f256de-7c54-4145-8bc2-3d3fd1209d5b',
    '6ebac58c-f767-4513-ac1c-7e0f3a70be04',
    'eef1ef61-09fa-4a4d-8342-d0a6e0052c6b',
    'dda7b22c-ef4e-4d48-a3fa-38135ec915f5',
    'eac3e187-3f28-4923-9c37-f3a687e70614',
    '9ca81948-73a4-432b-b0d2-c7224f6c816f',
    'bdf00038-e841-48be-bd3e-3d8e93dd62e3',
    'f33e784e-9dd0-4695-bc9d-e6cf15064310',
    '606a550c-e234-48a9-9a2e-e24e786cdc50',
    '8cde1967-9321-4ce8-9959-85c17cfb6de5',
    'fb6c7b7a-da01-4116-ad16-1a21db9f1567',
    '4491ea24-e218-4bf0-8ce4-7803c56c8927',
    'd25ea6ea-45bd-401f-89e6-1a4d42bd8b89',
    '01a77236-d536-4c8c-b6fb-837ca8256ae1',
    '97926724-db6f-4ced-aff9-533a3009bb30',
    '46d93007-8176-400e-9ff5-82a4a84de142',
    '854a0626-b67f-4722-a918-59521d5248bc',
    '6e47e925-ef89-4af2-b993-9f4ef7abf69d',
    '4f3185c3-898c-4e83-8001-b19fbcb81d53',
    '95b466d8-1a03-41e0-95ad-098fc2d6d030']::uuid[]);

  SELECT count(*) INTO v_live_before FROM hostel_allocations
   WHERE check_out_date IS NULL AND status IN ('active','pending_approval');
  SELECT count(*) INTO v_beds_before FROM bak_gha_roomfix_20260911_beds;

  -- Pre-flight: nothing drifted since the plan was computed.
  SELECT string_agg(m.alloc_id::text, ', ') INTO v_bad
    FROM _mv m
    LEFT JOIN hostel_allocations a ON a.id = m.alloc_id
    LEFT JOIN hostel_beds b ON b.id = a.bed_id
   WHERE a.id IS NULL OR a.status <> 'active' OR a.check_out_date IS NOT NULL
      OR a.block_id <> c_gha OR a.room_id <> m.from_room OR b.bed_number <> m.from_bed;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'roomfix: allocations drifted since planning: %', v_bad;
  END IF;

  SELECT string_agg(f.profile_id::text, ', ') INTO v_bad
    FROM _fr f LEFT JOIN profiles p ON p.id = f.profile_id
   WHERE p.learner_id IS DISTINCT FROM f.lp_id
      OR EXISTS (SELECT 1 FROM hostel_allocations a
                  WHERE a.learner_id = f.profile_id AND a.check_out_date IS NULL
                    AND a.status IN ('active','pending_approval'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'roomfix: first-allocation learners no longer eligible: %', v_bad;
  END IF;

  -- Resolve target beds. The new ones exist now, created by step 2.
  UPDATE _mv m SET to_bed_id = b.id
    FROM hostel_beds b WHERE b.room_id = m.to_room AND b.bed_number = m.to_bed;
  UPDATE _fr f SET to_bed_id = b.id
    FROM hostel_beds b WHERE b.room_id = f.to_room AND b.bed_number = f.to_bed;
  UPDATE _mv m SET learner = a.learner_id FROM hostel_allocations a WHERE a.id = m.alloc_id;

  SELECT count(*) INTO v_n FROM _mv WHERE to_bed_id IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % move targets have no bed row', v_n; END IF;
  SELECT count(*) INTO v_n FROM _fr WHERE to_bed_id IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % first-allocation targets have no bed row', v_n; END IF;

  -- No target may be held by someone who is not moving.
  SELECT string_agg(t.bed_id::text, ', ') INTO v_bad
    FROM (SELECT to_bed_id AS bed_id FROM _mv UNION ALL SELECT to_bed_id FROM _fr) t
    JOIN hostel_allocations a ON a.bed_id = t.bed_id AND a.check_out_date IS NULL
   WHERE a.id NOT IN (SELECT alloc_id FROM _mv);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'roomfix: target beds still held by a non-mover: %', v_bad;
  END IF;
  SELECT count(*) - count(DISTINCT bed_id) INTO v_n
    FROM (SELECT to_bed_id AS bed_id FROM _mv UNION ALL SELECT to_bed_id FROM _fr) t;
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % target beds claimed twice', v_n; END IF;

  -- 3. Park, then move and un-park in one statement.
  UPDATE hostel_allocations a SET check_out_date = CURRENT_DATE
    FROM _mv m WHERE a.id = m.alloc_id;

  UPDATE hostel_allocations a
     SET room_id = m.to_room,
         bed_id  = m.to_bed_id,
         check_out_date = NULL,
         metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
           'gha_roomfix_20260911', jsonb_build_object(
             'kind', 'room_correction',
             'from_room_id', m.from_room, 'from_bed', m.from_bed,
             'source', 'Girls_hostel A.xlsx'))
    FROM _mv m WHERE a.id = m.alloc_id;

  -- 4. First allocations, mirroring fn_cl_admin_allocate_bed.
  SELECT id INTO v_tier FROM hostel_tier_policy
   WHERE tier_key = 'standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'roomfix: no standard tier policy'; END IF;

  WITH ins AS (
    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, allocated_by, metadata)
    SELECT lp.institution_id, f.profile_id, c_gha, f.to_room, f.to_bed_id,
           COALESCE(lp.academic_year_id,
             (SELECT ay.id FROM academic_years ay
               WHERE ay.institution_id = lp.institution_id AND ay.is_active
               ORDER BY ay.start_date DESC LIMIT 1)),
           lp.semester_id,
           'fresh', CURRENT_DATE, 'active', '', '', '',
           v_tier, NULL,
           jsonb_build_object('gha_roomfix_20260911', jsonb_build_object(
             'kind', 'fresh', 'source_row', f.src_row, 'source', 'Girls_hostel A.xlsx'))
      FROM _fr f JOIN learners_profiles lp ON lp.id = f.lp_id
    RETURNING id, learner_id)
  UPDATE _fr f SET alloc_id = ins.id FROM ins WHERE ins.learner_id = f.profile_id;

  SELECT count(*) INTO v_n FROM _fr WHERE alloc_id IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % first allocations not inserted', v_n; END IF;

  -- 5. Bed status: free what the batch vacated, occupy what it filled.
  UPDATE hostel_beds b SET status = 'available', current_occupant_id = NULL
    FROM _mv m
   WHERE b.room_id = m.from_room AND b.bed_number = m.from_bed
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                      WHERE a.bed_id = b.id AND a.check_out_date IS NULL
                        AND a.status IN ('active','pending_approval'));
  UPDATE hostel_beds b SET status = 'occupied', current_occupant_id = m.learner
    FROM _mv m WHERE b.id = m.to_bed_id;
  UPDATE hostel_beds b SET status = 'occupied', current_occupant_id = f.profile_id
    FROM _fr f WHERE b.id = f.to_bed_id;

  -- Post-flight assertions ------------------------------------------------------
  SELECT count(*) INTO v_n FROM _mv m JOIN hostel_allocations a ON a.id = m.alloc_id
   WHERE a.room_id = m.to_room AND a.bed_id = m.to_bed_id AND a.check_out_date IS NULL
     AND a.status = 'active';
  IF v_n <> (SELECT count(*) FROM _mv) THEN
    RAISE EXCEPTION 'roomfix: only % of % movers landed', v_n, (SELECT count(*) FROM _mv);
  END IF;

  SELECT count(*) INTO v_live_after FROM hostel_allocations
   WHERE check_out_date IS NULL AND status IN ('active','pending_approval');
  IF v_live_after <> v_live_before + (SELECT count(*) FROM _fr) THEN
    RAISE EXCEPTION 'roomfix: live allocations % -> %, expected +%',
      v_live_before, v_live_after, (SELECT count(*) FROM _fr);
  END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT learner_id FROM hostel_allocations
     WHERE check_out_date IS NULL AND status IN ('active','pending_approval')
     GROUP BY learner_id HAVING count(*) > 1) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % learners hold two live allocations', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM hostel_allocations a JOIN bak_gha_roomfix_20260911_alloc k ON k.id = a.id
   WHERE a.id IN (SELECT alloc_id FROM _held)
     AND (a.room_id <> k.room_id OR a.bed_id <> k.bed_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % held learners were moved', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM hostel_allocations a JOIN bak_gha_roomfix_20260911_alloc k ON k.id = a.id
   WHERE a.id NOT IN (SELECT alloc_id FROM _mv)
     AND (a.room_id <> k.room_id OR a.bed_id <> k.bed_id OR a.check_out_date IS NOT NULL);
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % allocations outside the plan changed', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM learners_profiles lp JOIN bak_gha_roomfix_20260911_lp k ON k.id = lp.id
   WHERE lp.hostel_category_id IS DISTINCT FROM k.hostel_category_id
     AND lp.id NOT IN (SELECT lp_id FROM _fr);
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % existing residents had their category tag changed', v_n; END IF;

  SELECT count(*) INTO v_n FROM _fr f JOIN learners_profiles lp ON lp.id = f.lp_id
   WHERE lp.hostel_category_id IS DISTINCT FROM c_classic;
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % first allocations not tagged Classic Room', v_n; END IF;

  SELECT count(*) INTO v_n FROM hostel_beds b
   WHERE b.id IN (SELECT to_bed_id FROM _mv UNION SELECT to_bed_id FROM _fr)
     AND b.status <> 'occupied';
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % filled beds not marked occupied', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM _mv m JOIN hostel_beds b ON b.room_id = m.from_room AND b.bed_number = m.from_bed
   WHERE b.status = 'occupied'
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                      WHERE a.bed_id = b.id AND a.check_out_date IS NULL AND a.status = 'active');
  IF v_n > 0 THEN RAISE EXCEPTION 'roomfix: % vacated beds still marked occupied', v_n; END IF;

  SELECT count(*) INTO v_beds_after FROM hostel_beds b JOIN hostel_rooms r ON r.id = b.room_id
   WHERE r.block_id = c_gha;
  IF v_beds_after <> v_beds_before + 30 THEN
    RAISE EXCEPTION 'roomfix: Girls Hostel A beds % -> %, expected +30', v_beds_before, v_beds_after;
  END IF;

  PERFORM set_config('roomfix.summary', json_build_object(
    'moved', (SELECT count(*) FROM _mv),
    'first_allocations', (SELECT count(*) FROM _fr),
    'held', (SELECT count(*) FROM _held),
    'live_before', v_live_before, 'live_after', v_live_after,
    'gha_beds_before', v_beds_before, 'gha_beds_after', v_beds_after)::text, true);
END
$roomfix$;
