-- 20260731_fix_bds25_stripped_roll_numbers.sql
--
-- Restore the "BDS25" prefix + leading zeros on 42 JKKN Dental learners whose
-- roll_number was stored as a bare sequence number ("1", "3", "14", "100")
-- instead of the real roll ("BDS25001", "BDS25003", "BDS25014", "BDS25100").
--
-- HOW WE KNOW: the /billing/schedule/bulk-create upload of the 2025-2026 BDS
-- batch failed on exactly 42 of 100 rows with "No learner found with roll
-- number". Joining those 42 rows against Dental learners on the STRIPPED roll
-- matched 42/42, and first_name + last_name matched exactly on all 42. The
-- arithmetic closes: 58 well-formed BDS25 rolls + 42 stripped = the 100 rows
-- in the file.
--
-- WHY THE ZEROS ARE GONE: "BDS25001" -> "1", not "001". A string slice would
-- have preserved "001"; only round-tripping the value through a NUMBER drops
-- them. An upstream import read the roll from a numeric/serial cell.
--
-- NOT FIXED HERE (deliberate):
--   * roll_number "16" = DHIVYA B. Target BDS25016 is already held by
--     BAVANI V, so this would collide. She is not in the upload file and her
--     correct roll needs a human decision. The NOT EXISTS guard skips her.
--   * 11 Dental learners with long numeric rolls (e.g. 4107060220) — looks
--     like a phone/Aadhaar landed in the roll field. Separate cleanup.
--   * SWETHA.V is "BDS2591" (missing a zero, likely BDS25091) in BOTH the DB
--     and the source file, so it matches and imports fine. Renaming it would
--     desync the file.
--
-- NOTE: learners_profiles has NO unique constraint on roll_number (only id,
-- application_id, college_email). Nothing rejected the bad values and nothing
-- blocks this correction. roll_number is not referenced as a foreign key, so
-- this update is referentially inert.

BEGIN;

UPDATE learners_profiles
SET roll_number = 'BDS25' || lpad(roll_number, 3, '0'),
    updated_at  = now()
WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'  -- JKKN Dental College and Hospital
  AND roll_number ~ '^[0-9]{1,3}$'
  -- Skip any row whose corrected roll is already taken (DHIVYA B / BDS25016).
  AND NOT EXISTS (
    SELECT 1
    FROM learners_profiles x
    WHERE x.roll_number = 'BDS25' || lpad(learners_profiles.roll_number, 3, '0')
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (exact before-state captured 2026-07-31, 42 rows):
--
-- UPDATE learners_profiles AS l
-- SET roll_number = v.old_roll
-- FROM (VALUES
--   ('1e3690db-0a62-4eda-9c76-6e37eb7cac0c'::uuid,'1'),
--   ('1d037247-9d96-4f1c-892b-6fe6a09e14d4'::uuid,'3'),
--   ('58a203b1-9f26-41da-8f64-ff470d7f72d6'::uuid,'5'),
--   ('665a951d-23e7-457d-ad10-3ebba20ee1ac'::uuid,'7'),
--   ('4bb53619-9d4f-4e24-ad93-d4d2a988bcf5'::uuid,'9'),
--   ('b497ca30-a858-4f08-8804-ffc36460b839'::uuid,'14'),
--   ('6c96e9ae-5efb-42ea-a158-041ca05d41ab'::uuid,'15'),
--   ('b2d009bf-acf5-4b35-9fc3-df8cf48bce3e'::uuid,'17'),
--   ('25dc7368-49cb-4f5e-aded-f4ea44e638f4'::uuid,'18'),
--   ('35cd7c5f-a72a-4724-80a5-220801d6e447'::uuid,'19'),
--   ('c578af5a-3c49-401c-9ad1-854c2600beb2'::uuid,'22'),
--   ('0d42520f-1c21-4f1d-bc50-d21af017433b'::uuid,'23'),
--   ('15d5f6d9-88c8-44a9-aaee-9df36d92496d'::uuid,'27'),
--   ('28069878-e861-4d99-9151-c64a665ea4e8'::uuid,'28'),
--   ('236a1a6a-b0a6-4cab-bb10-e07224635ddb'::uuid,'29'),
--   ('a4b835b7-004a-453d-838b-b1c67057f713'::uuid,'30'),
--   ('a0eb1d67-54d3-4af9-a39c-0d0e8e1605ff'::uuid,'31'),
--   ('fcf2ea00-990b-420d-a39b-d9050a7e1b14'::uuid,'32'),
--   ('b5dd19e0-3bf6-4c1e-ae51-f8a0ef2b449c'::uuid,'33'),
--   ('1260efc2-2563-429a-a991-9b84df04f981'::uuid,'35'),
--   ('41767cfc-441f-4dc8-8a10-6c1766c5139e'::uuid,'40'),
--   ('85db4607-71df-4b65-8630-8228dd154860'::uuid,'41'),
--   ('676fb570-357d-4c0c-ba04-26d32f62a2c4'::uuid,'44'),
--   ('3ba0fc34-ee8c-4dc2-a184-63716f69e12c'::uuid,'46'),
--   ('bed12fa1-d02d-49f0-970d-3bacbdf72039'::uuid,'51'),
--   ('85acc817-2d06-4fda-ac0d-d6afbd4fa16c'::uuid,'53'),
--   ('641e6d39-7910-45cc-9c6a-5f1995033c7d'::uuid,'54'),
--   ('b7c6eb63-4496-45f0-abb1-ef78d64164d2'::uuid,'59'),
--   ('5ea8aa5c-6580-4d9d-8697-fc59c8387bdf'::uuid,'62'),
--   ('7d2ae16e-a0ad-4b8b-8dea-3598cc9b46dc'::uuid,'65'),
--   ('d3cad061-1f1c-4920-b210-c26b90a55058'::uuid,'67'),
--   ('4d1cb847-a68c-4804-8725-9f3e74aa7a0a'::uuid,'74'),
--   ('c4d049c4-506b-4d7a-86a6-7473c8b65257'::uuid,'79'),
--   ('d9f91c0b-0d50-41bc-a6ca-9a8a11329920'::uuid,'85'),
--   ('66f0de6c-b9d8-4397-a279-133e75bd4723'::uuid,'86'),
--   ('c70b32f9-2426-4ab4-8474-df3ee0a9dfa1'::uuid,'87'),
--   ('e9896c1a-8cbe-41cf-a7a8-f17e889c4980'::uuid,'88'),
--   ('bf3bea9d-b4c3-4780-8b5f-5b3ce8e1da7a'::uuid,'89'),
--   ('10d747e7-7f53-4907-982c-ee4677b779f5'::uuid,'92'),
--   ('3b1b2f91-8c1e-4595-be4e-f7bf16b09fd9'::uuid,'98'),
--   ('a0cbdd28-686e-4ee8-9a97-40ba9e3d871f'::uuid,'99'),
--   ('0d2d7afb-2758-42d6-a946-8b952d0b20d9'::uuid,'100')
-- ) AS v(id, old_roll)
-- WHERE l.id = v.id;
-- ---------------------------------------------------------------------------
