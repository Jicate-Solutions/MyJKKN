-- ============================================================
-- School Students Kumarapalayam Bypass Marathon 2026 - FREE Registrations
-- Generated: 2026-04-11T06:02:36.695Z
-- Total Records: 98 (payment_status = 'not_required')
-- Source Form: School Students Kumarapalayam Bypass Marathon - 2026
-- ============================================================

-- Step 1: Get event and category IDs
-- Run these queries first to get the IDs needed below:

-- SELECT id, name FROM events
-- WHERE name ILIKE '%marathon%' AND is_active = true
-- ORDER BY created_at DESC LIMIT 5;

-- SELECT id, name, code, fee_amount FROM event_categories
-- WHERE event_id = 'EVENT_ID' AND is_active = true
-- ORDER BY sort_order;

-- Step 2: REPLACE these placeholders with actual IDs from Step 1
-- EVENT_ID = '<paste-event-id-here>'
-- CATEGORY_5K_ID = '<paste-5k-category-id-here>'

-- ============================================================
-- INSERT STATEMENTS
-- ============================================================

-- #1 | aha | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'aha',
  '243567898765',
  'mahasri_v@jkkn.ac.in',
  0,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH-000004'
  ),
  '2026-03-21T15:23:47.98949+00:00'::timestamptz,
  '2026-03-21T15:23:47.98949+00:00'::timestamptz
);

-- #2 | fgdsg | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'fgdsg',
  '34567879654',
  'mahasri_v@jkkn.ac.in',
  0,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH-000005'
  ),
  '2026-03-21T15:25:16.913789+00:00'::timestamptz,
  '2026-03-21T15:25:16.913789+00:00'::timestamptz
);

-- #3 | Logitha R | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Logitha R',
  '9095626992',
  'raju.pureprint@gmail.com',
  10,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH744901981'
  ),
  '2026-03-31T04:54:54.744901+00:00'::timestamptz,
  '2026-03-31T04:54:54.744901+00:00'::timestamptz
);

-- #4 | Ashwin R | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Ashwin R',
  '9095626992',
  'raju.pureprint@gmail.com',
  6,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH929207958'
  ),
  '2026-03-31T04:56:01.929207+00:00'::timestamptz,
  '2026-03-31T04:56:01.929207+00:00'::timestamptz
);

-- #5 | Aadhavan A | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Aadhavan A',
  '9865213391',
  'arunkumar.udhay@gmail.com',
  11,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH003215212'
  ),
  '2026-04-01T04:58:26.003215+00:00'::timestamptz,
  '2026-04-01T04:58:26.003215+00:00'::timestamptz
);

-- #6 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH411594861'
  ),
  '2026-04-01T07:33:40.411594+00:00'::timestamptz,
  '2026-04-01T07:33:40.411594+00:00'::timestamptz
);

-- #7 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH094650643'
  ),
  '2026-04-01T07:33:43.09465+00:00'::timestamptz,
  '2026-04-01T07:33:43.09465+00:00'::timestamptz
);

-- #8 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH099646040'
  ),
  '2026-04-01T07:33:44.099646+00:00'::timestamptz,
  '2026-04-01T07:33:44.099646+00:00'::timestamptz
);

-- #9 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH919500674'
  ),
  '2026-04-01T07:33:46.9195+00:00'::timestamptz,
  '2026-04-01T07:33:46.9195+00:00'::timestamptz
);

-- #10 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH586723985'
  ),
  '2026-04-01T07:33:47.586723+00:00'::timestamptz,
  '2026-04-01T07:33:47.586723+00:00'::timestamptz
);

-- #11 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH528278264'
  ),
  '2026-04-01T07:33:48.528278+00:00'::timestamptz,
  '2026-04-01T07:33:48.528278+00:00'::timestamptz
);

-- #12 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH350068621'
  ),
  '2026-04-01T07:33:49.350068+00:00'::timestamptz,
  '2026-04-01T07:33:49.350068+00:00'::timestamptz
);

-- #13 | Jegan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jegan',
  '9600742651',
  'naveensattai@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH274204643'
  ),
  '2026-04-01T07:33:50.274204+00:00'::timestamptz,
  '2026-04-01T07:33:50.274204+00:00'::timestamptz
);

-- #14 | Kishore | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Kishore',
  '9600742651',
  'naveensattai@gmail.com',
  8,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH142000145'
  ),
  '2026-04-01T07:35:49.142+00:00'::timestamptz,
  '2026-04-01T07:35:49.142+00:00'::timestamptz
);

-- #15 | SABAREESHAN M K | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'SABAREESHAN M K',
  '9965540061',
  'mythilikarthikeyan2010@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH161972913'
  ),
  '2026-04-02T14:02:00.161972+00:00'::timestamptz,
  '2026-04-02T14:02:00.161972+00:00'::timestamptz
);

-- #16 | SABAREESHAN M K | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'SABAREESHAN M K',
  '9965540061',
  'mythilikarthikeyan2010@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH170117934'
  ),
  '2026-04-02T14:02:00.170117+00:00'::timestamptz,
  '2026-04-02T14:02:00.170117+00:00'::timestamptz
);

-- #17 | SABAREESHAN M K | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'SABAREESHAN M K',
  '9965540061',
  'mythilikarthikeyan2010@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH189132014'
  ),
  '2026-04-02T14:02:00.189132+00:00'::timestamptz,
  '2026-04-02T14:02:00.189132+00:00'::timestamptz
);

-- #18 | SABAREESHAN M K | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'SABAREESHAN M K',
  '9965540061',
  'mythilikarthikeyan2010@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH782370691'
  ),
  '2026-04-02T14:02:11.78237+00:00'::timestamptz,
  '2026-04-02T14:02:11.78237+00:00'::timestamptz
);

-- #19 | SABAREESHAN M K | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'SABAREESHAN M K',
  '9965540061',
  'mythilikarthikeyan2010@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH786869351'
  ),
  '2026-04-02T14:02:11.786869+00:00'::timestamptz,
  '2026-04-02T14:02:11.786869+00:00'::timestamptz
);

-- #20 | VISHNU M K | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'VISHNU M K',
  '9965540060',
  'mythilikarthikeyan2010@gmail.com',
  10,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH980459590'
  ),
  '2026-04-02T14:10:32.980459+00:00'::timestamptz,
  '2026-04-02T14:10:32.980459+00:00'::timestamptz
);

-- #21 | S. MADHANRAJ | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S. MADHANRAJ',
  '9486177909',
  'spspupl@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH390501331'
  ),
  '2026-04-02T15:58:51.390501+00:00'::timestamptz,
  '2026-04-02T15:58:51.390501+00:00'::timestamptz
);

-- #22 | S. MADHANRAJ | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S. MADHANRAJ',
  '9486177909',
  'spspupl@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH408741129'
  ),
  '2026-04-02T15:58:52.408741+00:00'::timestamptz,
  '2026-04-02T15:58:52.408741+00:00'::timestamptz
);

-- #23 | HAMSA VEENA . S | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'HAMSA VEENA . S',
  '9384169215',
  'spspupl@gmail.com',
  15,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH412548537'
  ),
  '2026-04-02T16:05:29.412548+00:00'::timestamptz,
  '2026-04-02T16:05:29.412548+00:00'::timestamptz
);

-- #24 | HAMSA VEENA . S | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'HAMSA VEENA . S',
  '9384169215',
  'spspupl@gmail.com',
  15,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH332092134'
  ),
  '2026-04-02T16:05:30.332092+00:00'::timestamptz,
  '2026-04-02T16:05:30.332092+00:00'::timestamptz
);

-- #25 | HASHINI | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'HASHINI',
  '9688007083',
  'ponnimjr1990@gmail.com',
  8,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH906067737'
  ),
  '2026-04-03T04:19:00.906067+00:00'::timestamptz,
  '2026-04-03T04:19:00.906067+00:00'::timestamptz
);

-- #26 | HASHINI | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'HASHINI',
  '9688007083',
  'ponnimjr1990@gmail.com',
  8,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH859687454'
  ),
  '2026-04-03T04:19:01.859687+00:00'::timestamptz,
  '2026-04-03T04:19:01.859687+00:00'::timestamptz
);

-- #27 | E.THIVIJA | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'E.THIVIJA',
  '9094405115',
  'helumalai09@gmail.com',
  10,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH040168355'
  ),
  '2026-04-03T07:28:40.040168+00:00'::timestamptz,
  '2026-04-03T07:28:40.040168+00:00'::timestamptz
);

-- #28 | S.B.Nityasree | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.B.Nityasree',
  '9524298670',
  'banupriyasekar39@gmail.com',
  9,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH079684384'
  ),
  '2026-04-04T07:31:06.079684+00:00'::timestamptz,
  '2026-04-04T07:31:06.079684+00:00'::timestamptz
);

-- #29 | T.Mahilan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'T.Mahilan',
  '9524298670',
  'banupriyasekar39@gmail.com',
  8,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH180546540'
  ),
  '2026-04-04T07:34:37.180546+00:00'::timestamptz,
  '2026-04-04T07:34:37.180546+00:00'::timestamptz
);

-- #30 | T.Mahilan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'T.Mahilan',
  '9524298670',
  'banupriyasekar39@gmail.com',
  8,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH451382614'
  ),
  '2026-04-04T07:34:38.451382+00:00'::timestamptz,
  '2026-04-04T07:34:38.451382+00:00'::timestamptz
);

-- #31 | கலைச்செல்வன். S | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'கலைச்செல்வன். S',
  '9677358280',
  'kalaiselvanidot@gmail.com',
  41,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH814952742'
  ),
  '2026-04-04T12:49:09.814952+00:00'::timestamptz,
  '2026-04-04T12:49:09.814952+00:00'::timestamptz
);

-- #32 | G.VEDAVIYAAS | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'G.VEDAVIYAAS',
  '9944815015',
  'gsmech312@gmail.com',
  10,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH861660274'
  ),
  '2026-04-04T14:55:36.86166+00:00'::timestamptz,
  '2026-04-04T14:55:36.86166+00:00'::timestamptz
);

-- #33 | PAVITHRAN.S | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'PAVITHRAN.S',
  '9944335423',
  'trishulsuresh2005@gmail.com',
  18,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH519992821'
  ),
  '2026-04-05T04:09:11.519992+00:00'::timestamptz,
  '2026-04-05T04:09:11.519992+00:00'::timestamptz
);

-- #34 | Kaviyugan M | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Kaviyugan M',
  '9942219877',
  'maha6055@gmail.com',
  10,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH908731052'
  ),
  '2026-04-05T06:07:40.908731+00:00'::timestamptz,
  '2026-04-05T06:07:40.908731+00:00'::timestamptz
);

-- #35 | A R.R.PRATHESH | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'A R.R.PRATHESH',
  '9787930606',
  'ramamirutham3939@gmail.com',
  8,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH475874612'
  ),
  '2026-04-05T12:36:36.475874+00:00'::timestamptz,
  '2026-04-05T12:36:36.475874+00:00'::timestamptz
);

-- #36 | A R.R.PRATHESH | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'A R.R.PRATHESH',
  '9787930606',
  'ramamirutham3939@gmail.com',
  8,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH091547304'
  ),
  '2026-04-05T12:36:38.091547+00:00'::timestamptz,
  '2026-04-05T12:36:38.091547+00:00'::timestamptz
);

-- #37 | A.R.R.PRANEESH | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'A.R.R.PRANEESH',
  '9787930606',
  'ramamirutham3939@gmail.com',
  8,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH908482332'
  ),
  '2026-04-05T12:40:30.908482+00:00'::timestamptz,
  '2026-04-05T12:40:30.908482+00:00'::timestamptz
);

-- #38 | A.R.R.KABILESH | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'A.R.R.KABILESH',
  '9787930606',
  'ramamirutham3939@gmail.com',
  6,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH438385179'
  ),
  '2026-04-05T12:44:11.438385+00:00'::timestamptz,
  '2026-04-05T12:44:11.438385+00:00'::timestamptz
);

-- #39 | Monish | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Monish',
  '9384355289',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH960193529'
  ),
  '2026-04-05T16:05:24.960193+00:00'::timestamptz,
  '2026-04-05T16:05:24.960193+00:00'::timestamptz
);

-- #40 | Monish | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Monish',
  '9384355289',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH971510927'
  ),
  '2026-04-05T16:05:24.97151+00:00'::timestamptz,
  '2026-04-05T16:05:24.97151+00:00'::timestamptz
);

-- #41 | Ashwanth | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Ashwanth',
  '6369111897',
  'monishsakthi2013@gmail.com',
  11,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH622469682'
  ),
  '2026-04-06T01:38:49.622469+00:00'::timestamptz,
  '2026-04-06T01:38:49.622469+00:00'::timestamptz
);

-- #42 | Ashwin Shanmugam | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Ashwin Shanmugam',
  '6369111897',
  'monishsakthi2013@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH730856833'
  ),
  '2026-04-06T01:41:09.730856+00:00'::timestamptz,
  '2026-04-06T01:41:09.730856+00:00'::timestamptz
);

-- #43 | Ashwin Shanmugam | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Ashwin Shanmugam',
  '6369111897',
  'monishsakthi2013@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH208733031'
  ),
  '2026-04-06T01:41:13.208733+00:00'::timestamptz,
  '2026-04-06T01:41:13.208733+00:00'::timestamptz
);

-- #44 | Jaswanth | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jaswanth',
  '9842099242',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH190985746'
  ),
  '2026-04-06T10:49:38.190985+00:00'::timestamptz,
  '2026-04-06T10:49:38.190985+00:00'::timestamptz
);

-- #45 | Dharsan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dharsan',
  '8015315005',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH384516636'
  ),
  '2026-04-06T10:51:27.384516+00:00'::timestamptz,
  '2026-04-06T10:51:27.384516+00:00'::timestamptz
);

-- #46 | Tamila | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Tamila',
  '9095645945',
  'monishsakthi2013@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH994271115'
  ),
  '2026-04-06T10:53:26.994271+00:00'::timestamptz,
  '2026-04-06T10:53:26.994271+00:00'::timestamptz
);

-- #47 | Pavish | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Pavish',
  '9500528330',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH314094784'
  ),
  '2026-04-06T10:58:58.314094+00:00'::timestamptz,
  '2026-04-06T10:58:58.314094+00:00'::timestamptz
);

-- #48 | Sanjay | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Sanjay',
  '9944977161',
  'monishsakthi2013@gmail.com',
  10,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH460064573'
  ),
  '2026-04-06T11:00:46.460064+00:00'::timestamptz,
  '2026-04-06T11:00:46.460064+00:00'::timestamptz
);

-- #49 | Gowthamarajan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Gowthamarajan',
  '9944977161',
  'monishsakthi2013@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH253009075'
  ),
  '2026-04-06T11:02:57.253009+00:00'::timestamptz,
  '2026-04-06T11:02:57.253009+00:00'::timestamptz
);

-- #50 | Jaswanth | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Jaswanth',
  '9842099242',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH925639083'
  ),
  '2026-04-06T14:08:24.925639+00:00'::timestamptz,
  '2026-04-06T14:08:24.925639+00:00'::timestamptz
);

-- #51 | Gowthamarajan | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Gowthamarajan',
  '9944977161',
  'monishsakthi2013@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH429145128'
  ),
  '2026-04-06T14:09:51.429145+00:00'::timestamptz,
  '2026-04-06T14:09:51.429145+00:00'::timestamptz
);

-- #52 | Dharsan | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dharsan',
  '8015315005',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH349111482'
  ),
  '2026-04-06T14:11:21.349111+00:00'::timestamptz,
  '2026-04-06T14:11:21.349111+00:00'::timestamptz
);

-- #53 | Sanjay | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Sanjay',
  '9944977161',
  'monishsakthi2013@gmail.com',
  10,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH006909315'
  ),
  '2026-04-06T14:12:48.006909+00:00'::timestamptz,
  '2026-04-06T14:12:48.006909+00:00'::timestamptz
);

-- #54 | Pavish | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Pavish',
  '9500528330',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH610230209'
  ),
  '2026-04-06T14:14:08.61023+00:00'::timestamptz,
  '2026-04-06T14:14:08.61023+00:00'::timestamptz
);

-- #55 | Tamila | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Tamila',
  '9095645945',
  'monishsakthi2013@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH353342273'
  ),
  '2026-04-06T14:15:42.353342+00:00'::timestamptz,
  '2026-04-06T14:15:42.353342+00:00'::timestamptz
);

-- #56 | Monish | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Monish',
  '9384355289',
  'monishsakthi2013@gmail.com',
  13,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH856099398'
  ),
  '2026-04-06T14:17:03.856099+00:00'::timestamptz,
  '2026-04-06T14:17:03.856099+00:00'::timestamptz
);

-- #57 | Ashwanth | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Ashwanth',
  '6369111897',
  'monishsakthi2013@gmail.com',
  11,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH708412396'
  ),
  '2026-04-06T14:34:01.708412+00:00'::timestamptz,
  '2026-04-06T14:34:01.708412+00:00'::timestamptz
);

-- #58 | S S YOGESH RAM | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S S YOGESH RAM',
  '8072895159',
  'balapanchapatchi18@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH222396073'
  ),
  '2026-04-07T07:20:36.222396+00:00'::timestamptz,
  '2026-04-07T07:20:36.222396+00:00'::timestamptz
);

-- #59 | S S YOGESH RAM | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S S YOGESH RAM',
  '8072895159',
  'balapanchapatchi18@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH264726735'
  ),
  '2026-04-07T07:20:36.264726+00:00'::timestamptz,
  '2026-04-07T07:20:36.264726+00:00'::timestamptz
);

-- #60 | Yashwanth | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Yashwanth',
  '8778631180',
  'raju.pureprint@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH872964703'
  ),
  '2026-04-07T10:48:57.872964+00:00'::timestamptz,
  '2026-04-07T10:48:57.872964+00:00'::timestamptz
);

-- #61 | Natshathiraa | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Natshathiraa',
  '8015315005',
  'monishsakthi2013@gmail.com',
  8,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH125639408'
  ),
  '2026-04-08T11:15:39.125639+00:00'::timestamptz,
  '2026-04-08T11:15:39.125639+00:00'::timestamptz
);

-- #62 | Natshathiraa | No | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Natshathiraa',
  '8015315005',
  'monishsakthi2013@gmail.com',
  8,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'No',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH656679989'
  ),
  '2026-04-08T11:16:41.656679+00:00'::timestamptz,
  '2026-04-08T11:16:41.656679+00:00'::timestamptz
);

-- #63 | KRISH M | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'KRISH M',
  '9790571418',
  'mtmsat1991@gmail.com',
  10,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH329430935'
  ),
  '2026-04-08T15:57:50.32943+00:00'::timestamptz,
  '2026-04-08T15:57:50.32943+00:00'::timestamptz
);

-- #64 | AADHARSH VEL | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'AADHARSH VEL',
  '9025337372',
  'vinodkandan3@gmail.com',
  14,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH652491087'
  ),
  '2026-04-09T07:24:36.652491+00:00'::timestamptz,
  '2026-04-09T07:24:36.652491+00:00'::timestamptz
);

-- #65 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH497206406'
  ),
  '2026-04-09T16:10:22.497206+00:00'::timestamptz,
  '2026-04-09T16:10:22.497206+00:00'::timestamptz
);

-- #66 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH729370073'
  ),
  '2026-04-09T16:10:23.72937+00:00'::timestamptz,
  '2026-04-09T16:10:23.72937+00:00'::timestamptz
);

-- #67 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH136075350'
  ),
  '2026-04-09T16:10:25.136075+00:00'::timestamptz,
  '2026-04-09T16:10:25.136075+00:00'::timestamptz
);

-- #68 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH642970432'
  ),
  '2026-04-09T16:10:25.64297+00:00'::timestamptz,
  '2026-04-09T16:10:25.64297+00:00'::timestamptz
);

-- #69 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH954143643'
  ),
  '2026-04-09T16:10:27.954143+00:00'::timestamptz,
  '2026-04-09T16:10:27.954143+00:00'::timestamptz
);

-- #70 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH818461494'
  ),
  '2026-04-09T16:10:28.818461+00:00'::timestamptz,
  '2026-04-09T16:10:28.818461+00:00'::timestamptz
);

-- #71 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH433548074'
  ),
  '2026-04-09T16:10:30.433548+00:00'::timestamptz,
  '2026-04-09T16:10:30.433548+00:00'::timestamptz
);

-- #72 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH084374982'
  ),
  '2026-04-09T16:10:32.084374+00:00'::timestamptz,
  '2026-04-09T16:10:32.084374+00:00'::timestamptz
);

-- #73 | K. ARULMURUGAN | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'K. ARULMURUGAN',
  '9791323108',
  'poongodi3231@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH693912741'
  ),
  '2026-04-09T16:10:33.693912+00:00'::timestamptz,
  '2026-04-09T16:10:33.693912+00:00'::timestamptz
);

-- #74 | MIRUTHULA A | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'MIRUTHULA A',
  '8870942892',
  'vembaianbu@gmail.com',
  13,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH475320498'
  ),
  '2026-04-09T17:15:17.47532+00:00'::timestamptz,
  '2026-04-09T17:15:17.47532+00:00'::timestamptz
);

-- #75 | lingan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'lingan',
  '8110801767',
  'arulrajravi237@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH838762664'
  ),
  '2026-04-10T08:28:04.838762+00:00'::timestamptz,
  '2026-04-10T08:28:04.838762+00:00'::timestamptz
);

-- #76 | lingan | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'lingan',
  '8110801767',
  'arulrajravi237@gmail.com',
  12,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH191448609'
  ),
  '2026-04-10T08:28:07.191448+00:00'::timestamptz,
  '2026-04-10T08:28:07.191448+00:00'::timestamptz
);

-- #77 | S.J.Ritiksha | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.J.Ritiksha',
  '7010929397',
  'sharmijbvn@gmail.com',
  11,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH056796399'
  ),
  '2026-04-10T11:09:38.056796+00:00'::timestamptz,
  '2026-04-10T11:09:38.056796+00:00'::timestamptz
);

-- #78 | S.HARISH | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.HARISH',
  '6383502129',
  'revathi02129@gmail.com',
  9,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH234054958'
  ),
  '2026-04-10T15:52:57.234054+00:00'::timestamptz,
  '2026-04-10T15:52:57.234054+00:00'::timestamptz
);

-- #79 | S.HARISH | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.HARISH',
  '6383502129',
  'revathi02129@gmail.com',
  9,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH532036658'
  ),
  '2026-04-10T15:52:57.532036+00:00'::timestamptz,
  '2026-04-10T15:52:57.532036+00:00'::timestamptz
);

-- #80 | R.P.Rakshita | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'R.P.Rakshita',
  '09952810873',
  'r461541@gmail.com',
  8,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH083892135'
  ),
  '2026-04-10T17:51:10.083892+00:00'::timestamptz,
  '2026-04-10T17:51:10.083892+00:00'::timestamptz
);

-- #81 | Nivas.S | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Nivas.S',
  '9524298670',
  'banupriyasekar39@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH476992984'
  ),
  '2026-04-11T02:36:33.476992+00:00'::timestamptz,
  '2026-04-11T02:36:33.476992+00:00'::timestamptz
);

-- #82 | Nivas.S | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Nivas.S',
  '9524298670',
  'banupriyasekar39@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH765088037'
  ),
  '2026-04-11T02:36:35.765088+00:00'::timestamptz,
  '2026-04-11T02:36:35.765088+00:00'::timestamptz
);

-- #83 | S.B.Nityasree | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.B.Nityasree',
  '9524298670',
  'banupriyasekar39@gmail.com',
  9,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH246217383'
  ),
  '2026-04-11T04:05:42.246217+00:00'::timestamptz,
  '2026-04-11T04:05:42.246217+00:00'::timestamptz
);

-- #84 | S.B.Nityasree | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.B.Nityasree',
  '9524298670',
  'banupriyasekar39@gmail.com',
  9,
  'female',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH260281517'
  ),
  '2026-04-11T04:05:42.260281+00:00'::timestamptz,
  '2026-04-11T04:05:42.260281+00:00'::timestamptz
);

-- #85 | M.praveen | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'M.praveen',
  '9524298670',
  'banupriyasekar39@gmail.com',
  17,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH656698939'
  ),
  '2026-04-11T04:11:36.656698+00:00'::timestamptz,
  '2026-04-11T04:11:36.656698+00:00'::timestamptz
);

-- #86 | S.Nivas | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.Nivas',
  '9524298670',
  'banupriyasekar39@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH145926041'
  ),
  '2026-04-11T04:14:38.145926+00:00'::timestamptz,
  '2026-04-11T04:14:38.145926+00:00'::timestamptz
);

-- #87 | S.Nivas | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.Nivas',
  '9524298670',
  'banupriyasekar39@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH419433086'
  ),
  '2026-04-11T04:14:51.419433+00:00'::timestamptz,
  '2026-04-11T04:14:51.419433+00:00'::timestamptz
);

-- #88 | S.Nivas | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.Nivas',
  '9524298670',
  'banupriyasekar39@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH004939541'
  ),
  '2026-04-11T04:14:58.004939+00:00'::timestamptz,
  '2026-04-11T04:14:58.004939+00:00'::timestamptz
);

-- #89 | S.Nivas | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'S.Nivas',
  '9524298670',
  'banupriyasekar39@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH124140225'
  ),
  '2026-04-11T04:14:58.12414+00:00'::timestamptz,
  '2026-04-11T04:14:58.12414+00:00'::timestamptz
);

-- #90 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH242429434'
  ),
  '2026-04-11T05:06:34.242429+00:00'::timestamptz,
  '2026-04-11T05:06:34.242429+00:00'::timestamptz
);

-- #91 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH731917614'
  ),
  '2026-04-11T05:07:04.731917+00:00'::timestamptz,
  '2026-04-11T05:07:04.731917+00:00'::timestamptz
);

-- #92 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH386837173'
  ),
  '2026-04-11T05:07:20.386837+00:00'::timestamptz,
  '2026-04-11T05:07:20.386837+00:00'::timestamptz
);

-- #93 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH498074586'
  ),
  '2026-04-11T05:07:20.498074+00:00'::timestamptz,
  '2026-04-11T05:07:20.498074+00:00'::timestamptz
);

-- #94 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH529120660'
  ),
  '2026-04-11T05:07:20.52912+00:00'::timestamptz,
  '2026-04-11T05:07:20.52912+00:00'::timestamptz
);

-- #95 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH552611182'
  ),
  '2026-04-11T05:07:20.552611+00:00'::timestamptz,
  '2026-04-11T05:07:20.552611+00:00'::timestamptz
);

-- #96 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH580021092'
  ),
  '2026-04-11T05:07:20.580021+00:00'::timestamptz,
  '2026-04-11T05:07:20.580021+00:00'::timestamptz
);

-- #97 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH595667841'
  ),
  '2026-04-11T05:07:20.595667+00:00'::timestamptz,
  '2026-04-11T05:07:20.595667+00:00'::timestamptz
);

-- #98 | Dhana Baraneesh.C | Yes | FREE
INSERT INTO events_registrations (
  id, event_id, category_id, participant_type,
  participant_name, participant_phone, participant_email,
  participant_age, participant_gender,
  institution_name, department,
  status, payment_status, payment_amount, payment_method, payment_reference,
  source, custom_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'd5e4698b-79d2-4b4a-8c4e-60af2ff14c83'::uuid,
  'aaf17b95-86fe-40fa-91ea-c2c5ad15914a'::uuid,
  'external',
  'Dhana Baraneesh.C',
  '9790239298',
  'dhanabaraneeshc.mh@jkkn.ac.in',
  15,
  'male',
  NULL,
  NULL,
  'registered',
  'not_required',
  0,
  NULL,
  NULL,
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-SCH017339693'
  ),
  '2026-04-11T05:07:21.017339+00:00'::timestamptz,
  '2026-04-11T05:07:21.017339+00:00'::timestamptz
);

-- ============================================================
-- END OF BULK IMPORT (School Students Marathon - Free)
-- Total: 98 INSERT statements
-- ============================================================
