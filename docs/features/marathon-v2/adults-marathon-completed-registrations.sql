-- ============================================================
-- Adults Kumarapalayam Bypass Marathon 2026 - Paid Registrations
-- Generated: 2026-04-11T05:55:22.642Z
-- Total Records: 79 (payment_status = 'completed')
-- Source Form: Adults Kumarapalayam Bypass Marathon - 2026
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
-- CATEGORY_10K_ID = '<paste-10k-category-id-here>'

-- ============================================================
-- INSERT STATEMENTS
-- ============================================================

-- #1 | SIVAKUMAR MANI | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'SIVAKUMAR MANI',
  '9688668977',
  'sivakumarmani.sk85@gmail.com',
  40,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SWJ3NWvjSFOosY',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU347315093'
  ),
  '2026-03-27T15:52:49.347315+00:00'::timestamptz,
  '2026-03-27T15:52:49.347315+00:00'::timestamptz
);

-- #2 | G.sakthi | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'G.sakthi',
  '9842145679',
  'anbhumasala@gmail.com',
  45,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXh2wDbx8vu2Dv',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU092091819'
  ),
  '2026-03-31T03:59:50.092091+00:00'::timestamptz,
  '2026-03-31T03:59:50.092091+00:00'::timestamptz
);

-- #3 | MANIMEGALAI M | 5 kms | ₹200
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
  'MANIMEGALAI M',
  '8778482818',
  'mahendranpm2024@gmail.com',
  36,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXhfbR5pC7wsKH',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU714939903'
  ),
  '2026-03-31T04:36:21.714939+00:00'::timestamptz,
  '2026-03-31T04:36:21.714939+00:00'::timestamptz
);

-- #4 | Abdul vahid mp | 5 kms | ₹200
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
  'Abdul vahid mp',
  '9566468163',
  'vahirizump@gmail.com',
  37,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXkG5djEDCO4eE',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU522884122'
  ),
  '2026-03-31T07:08:39.522884+00:00'::timestamptz,
  '2026-03-31T07:08:39.522884+00:00'::timestamptz
);

-- #5 | Matheswaran R | 5 kms | ₹200
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
  'Matheswaran R',
  '9894768007',
  'mathes2010@gmail.com',
  42,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXlIrBnM7ITaPU',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU224934216'
  ),
  '2026-03-31T08:09:28.224934+00:00'::timestamptz,
  '2026-03-31T08:09:28.224934+00:00'::timestamptz
);

-- #6 | Govendran S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Govendran S',
  '9524315505',
  'govendrans@gmail.com',
  32,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXtDFFhXyGfZl2',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU391587615'
  ),
  '2026-03-31T15:54:01.391587+00:00'::timestamptz,
  '2026-03-31T15:54:01.391587+00:00'::timestamptz
);

-- #7 | Mani | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Mani',
  '9500850139',
  'maniraju0604@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXtaOHdY5tgjYd',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU163124703'
  ),
  '2026-03-31T16:16:13.163124+00:00'::timestamptz,
  '2026-03-31T16:16:13.163124+00:00'::timestamptz
);

-- #8 | Dinesh Mirugesan | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Dinesh Mirugesan',
  '9788008836',
  'dineshmurugesan16@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SXu4jMRIX7uksL',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU110818225'
  ),
  '2026-03-31T16:45:02.110818+00:00'::timestamptz,
  '2026-03-31T16:45:02.110818+00:00'::timestamptz
);

-- #9 | Vinoth Kumar | 5 kms | ₹200
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
  'Vinoth Kumar',
  '9677929390',
  'balavinoth59@gmail.com',
  35,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY0s1nikz4dz2V',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU305613896'
  ),
  '2026-03-31T23:23:36.305613+00:00'::timestamptz,
  '2026-03-31T23:23:36.305613+00:00'::timestamptz
);

-- #10 | Sathishkumar M | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Sathishkumar M',
  '9790571418',
  'mtmsat1991@gmail.com',
  35,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY4AltGA9IM9EB',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU384633247'
  ),
  '2026-04-01T02:37:33.384633+00:00'::timestamptz,
  '2026-04-01T02:37:33.384633+00:00'::timestamptz
);

-- #11 | Sabari K | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Sabari K',
  '9600740818',
  'sabarisagu8@gmail.com',
  31,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY4OOA3dW9snSU',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU584024842'
  ),
  '2026-04-01T02:50:10.584024+00:00'::timestamptz,
  '2026-04-01T02:50:10.584024+00:00'::timestamptz
);

-- #12 | Keerthivasan S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Keerthivasan S',
  '9942934599',
  'keerthivasan65441@gmail.com',
  23,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY6FrRNz8Q1H20',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU634089802'
  ),
  '2026-04-01T04:39:02.634089+00:00'::timestamptz,
  '2026-04-01T04:39:02.634089+00:00'::timestamptz
);

-- #13 | Krishnan S | 5 kms | ₹200
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
  'Krishnan S',
  '9655225376',
  'shreekrishnan38@gmail.com',
  31,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY6FvGnzlLpZYW',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU990683329'
  ),
  '2026-04-01T04:39:47.990683+00:00'::timestamptz,
  '2026-04-01T04:39:47.990683+00:00'::timestamptz
);

-- #14 | Arun Kumar U | 5 kms | ₹200
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
  'Arun Kumar U',
  '9865213391',
  'arunkumar.udhay@gmail.com',
  39,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY6THXlBpI9rs6',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU214854976'
  ),
  '2026-04-01T04:52:30.214854+00:00'::timestamptz,
  '2026-04-01T04:52:30.214854+00:00'::timestamptz
);

-- #15 | Nagesh pawar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Nagesh pawar',
  '8778767737',
  'balavinoth59@gmail.com',
  42,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY6c0gALqtHfNC',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU745697093'
  ),
  '2026-04-01T05:00:49.745697+00:00'::timestamptz,
  '2026-04-01T05:00:49.745697+00:00'::timestamptz
);

-- #16 | Gopi J | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Gopi J',
  '9500812132',
  'gopi.mmft@gmail.com',
  37,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY78kxxdi4mgTP',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN10050%',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU301004868'
  ),
  '2026-04-01T05:31:57.301004+00:00'::timestamptz,
  '2026-04-01T05:31:57.301004+00:00'::timestamptz
);

-- #17 | Kapil M | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Kapil M',
  '9944780788',
  'gopi.mmft@gmail.com',
  34,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY7DGKdLoJhgSY',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU956871024'
  ),
  '2026-04-01T05:36:13.956871+00:00'::timestamptz,
  '2026-04-01T05:36:13.956871+00:00'::timestamptz
);

-- #18 | Jayakumar S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Jayakumar S',
  '9790196366',
  'gopi.mmft@gmail.com',
  34,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY7I6mdpDTCLfH',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU023814129'
  ),
  '2026-04-01T05:40:57.023814+00:00'::timestamptz,
  '2026-04-01T05:40:57.023814+00:00'::timestamptz
);

-- #19 | Sathish Natarajan | 5 kms | ₹200
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
  'Sathish Natarajan',
  '7904030875',
  'arunkumar.udhay@gmail.com',
  31,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY7YvGVs1b2GYC',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU641601047'
  ),
  '2026-04-01T05:55:46.641601+00:00'::timestamptz,
  '2026-04-01T05:55:46.641601+00:00'::timestamptz
);

-- #20 | Dileep k | 5 kms | ₹200
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
  'Dileep k',
  '7348821658',
  'dilipkallithodi@gmail.com',
  48,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SY89ZHf1q9ToSp',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU076547831'
  ),
  '2026-04-01T06:31:08.076547+00:00'::timestamptz,
  '2026-04-01T06:31:08.076547+00:00'::timestamptz
);

-- #21 | C.RAJENDRAN | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'C.RAJENDRAN',
  '9443359557',
  'rajcrajendran@gmail.com',
  65,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYCin5kv1WXIc5',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU139674832'
  ),
  '2026-04-01T10:58:42.139674+00:00'::timestamptz,
  '2026-04-01T10:58:42.139674+00:00'::timestamptz
);

-- #22 | R.DINESH | 5 kms | ₹200
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
  'R.DINESH',
  '9994827540',
  'dineshece66@gmail.com',
  33,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYREhZNwzcs83n',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU818591876'
  ),
  '2026-04-02T01:11:08.818591+00:00'::timestamptz,
  '2026-04-02T01:11:08.818591+00:00'::timestamptz
);

-- #23 | Dinesh kumar | 5 kms | ₹200
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
  'Dinesh kumar',
  '9940385651',
  'dinesh.tptkumar@gmail.com',
  37,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYVhOwQC6ePp2s',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU498357800'
  ),
  '2026-04-02T05:33:08.498357+00:00'::timestamptz,
  '2026-04-02T05:33:08.498357+00:00'::timestamptz
);

-- #24 | DHANASEKAR T | 5 kms | ₹200
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
  'DHANASEKAR T',
  '8973077757',
  'dhanaeeesekar@gmail.com',
  39,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYVs66VVsGiq20',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU494331612'
  ),
  '2026-04-02T05:43:21.494331+00:00'::timestamptz,
  '2026-04-02T05:43:21.494331+00:00'::timestamptz
);

-- #25 | Ranjit | 5 kms | ₹200
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
  'Ranjit',
  '7904153365',
  'ranjith.govindan26@gmail.com',
  29,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYX9c0eTlnaRVs',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU839051612'
  ),
  '2026-04-02T06:58:28.839051+00:00'::timestamptz,
  '2026-04-02T06:58:28.839051+00:00'::timestamptz
);

-- #26 | Rameshkkumar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Rameshkkumar',
  '9842910436',
  'palanichamy355@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYXUZGKhEZuvVR',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU208153148'
  ),
  '2026-04-02T07:18:17.208153+00:00'::timestamptz,
  '2026-04-02T07:18:17.208153+00:00'::timestamptz
);

-- #27 | Santhosh kumar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Santhosh kumar',
  '9688370611',
  'santhoshinjob@gmail.com',
  38,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYY6iXJmKjxkvQ',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU333745117'
  ),
  '2026-04-02T07:54:35.333745+00:00'::timestamptz,
  '2026-04-02T07:54:35.333745+00:00'::timestamptz
);

-- #28 | Sivaprakasam P | 5 kms | ₹200
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
  'Sivaprakasam P',
  '9364362525',
  'spspupl@gmail.com',
  46,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYbh5Vksr43Vj1',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU499129378'
  ),
  '2026-04-02T11:24:30.499129+00:00'::timestamptz,
  '2026-04-02T11:24:30.499129+00:00'::timestamptz
);

-- #29 | Saravanan s | 5 kms | ₹200
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
  'Saravanan s',
  '9842820700',
  'saravananagm@gmail.com',
  42,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYcHTTcPX00a7a',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU945923319'
  ),
  '2026-04-02T11:59:31.945923+00:00'::timestamptz,
  '2026-04-02T11:59:31.945923+00:00'::timestamptz
);

-- #30 | Sathish kumar | 5 kms | ₹200
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
  'Sathish kumar',
  '7010140248',
  'sathishmsd002@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYcTW4o6iQBrte',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '638315',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU604523315'
  ),
  '2026-04-02T12:10:21.604523+00:00'::timestamptz,
  '2026-04-02T12:10:21.604523+00:00'::timestamptz
);

-- #31 | Sureshkumar mynaa | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Sureshkumar mynaa',
  '8870505908',
  'sureshkumarmyna@gmail.com',
  32,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYds0NR7RkyS8R',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU534521324'
  ),
  '2026-04-02T13:31:12.534521+00:00'::timestamptz,
  '2026-04-02T13:31:12.534521+00:00'::timestamptz
);

-- #32 | VENKATESAN R | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'VENKATESAN R',
  '8903783310',
  'venkatesanr947@gmail.com',
  47,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYgF8I5egdX1WH',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU134674652'
  ),
  '2026-04-02T15:51:21.134674+00:00'::timestamptz,
  '2026-04-02T15:51:21.134674+00:00'::timestamptz
);

-- #33 | MANI KANDAN K | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'MANI KANDAN K',
  '9003573355',
  'manik27101998@gmail.com',
  27,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYh3qGQVWux7kt',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU171159965'
  ),
  '2026-04-02T16:40:04.171159+00:00'::timestamptz,
  '2026-04-02T16:40:04.171159+00:00'::timestamptz
);

-- #34 | Ramakrishnan P S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Ramakrishnan P S',
  '9843017013',
  'ramakrishnan28666@gmail.com',
  59,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYqzwbd3Ec6Kjn',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU069130946'
  ),
  '2026-04-03T02:21:45.06913+00:00'::timestamptz,
  '2026-04-03T02:21:45.06913+00:00'::timestamptz
);

-- #35 | Jayaraman | 5 kms | ₹200
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
  'Jayaraman',
  '9688007083',
  'ponnimjr1990@gmail.com',
  35,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYt6iA3SdDokq7',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU627353628'
  ),
  '2026-04-03T04:25:17.627353+00:00'::timestamptz,
  '2026-04-03T04:25:17.627353+00:00'::timestamptz
);

-- #36 | Prabhakaran K C | 5 kms | ₹200
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
  'Prabhakaran K C',
  '8344771004',
  'kcp5546@gmail.com',
  33,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYv5shblvL5gZ9',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU573397230'
  ),
  '2026-04-03T06:23:48.573397+00:00'::timestamptz,
  '2026-04-03T06:23:48.573397+00:00'::timestamptz
);

-- #37 | Naveen S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Naveen S',
  '7339665122',
  'lionelnaveen10@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SYvtlCGKUiYRtS',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU998791459'
  ),
  '2026-04-03T07:10:48.998791+00:00'::timestamptz,
  '2026-04-03T07:10:48.998791+00:00'::timestamptz
);

-- #38 | Tamilmani S | 5 kms | ₹200
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
  'Tamilmani S',
  '9788474630',
  'stamilmani27@gmail.com',
  32,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZ5zv6jmS0bHS9',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU309510609'
  ),
  '2026-04-03T17:03:45.30951+00:00'::timestamptz,
  '2026-04-03T17:03:45.30951+00:00'::timestamptz
);

-- #39 | C Vidhya | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'C Vidhya',
  '9080546370',
  'vidhyasporty@gmail.com',
  23,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZMOb4BgTmInkD',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU604396111'
  ),
  '2026-04-04T09:05:39.604396+00:00'::timestamptz,
  '2026-04-04T09:05:39.604396+00:00'::timestamptz
);

-- #40 | Mohanraj.V | 5 kms | ₹200
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
  'Mohanraj.V',
  '7373182751',
  'mohanrajvelliyangiri@gmail.com',
  29,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZNtZsP9uqUOJx',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU631091200'
  ),
  '2026-04-04T10:34:10.631091+00:00'::timestamptz,
  '2026-04-04T10:34:10.631091+00:00'::timestamptz
);

-- #41 | Radheshyam Haripal | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Radheshyam Haripal',
  '6370049743',
  'radheshyamharipal82@gmail.com',
  32,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZdujSX8LJyXx5',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU922684596'
  ),
  '2026-04-05T02:11:45.922684+00:00'::timestamptz,
  '2026-04-05T02:11:45.922684+00:00'::timestamptz
);

-- #42 | Netramani sabar | 5 kms | ₹200
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
  'Netramani sabar',
  '9348765272',
  'radheshyamharipal82@gmail.com',
  26,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZe4ZWffw4aHMr',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU008991899'
  ),
  '2026-04-05T02:23:19.008991+00:00'::timestamptz,
  '2026-04-05T02:23:19.008991+00:00'::timestamptz
);

-- #43 | Mahendran N | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Mahendran N',
  '09942219877',
  'maha6055@gmail.com',
  37,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZhgw0PdgDhZ1D',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU403206854'
  ),
  '2026-04-05T05:56:12.403206+00:00'::timestamptz,
  '2026-04-05T05:56:12.403206+00:00'::timestamptz
);

-- #44 | Manimekalai N | 5 kms | ₹200
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
  'Manimekalai N',
  '9942219877',
  'maha6055@gmail.com',
  38,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZhk8855eo9ZVx',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU957034270'
  ),
  '2026-04-05T05:59:22.957034+00:00'::timestamptz,
  '2026-04-05T05:59:22.957034+00:00'::timestamptz
);

-- #45 | Sivanantha ramakrishna N | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Sivanantha ramakrishna N',
  '9025793031',
  'hockeyhunter0606@gmail.com',
  22,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZmXYl4SEhCK5X',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU746328244'
  ),
  '2026-04-05T10:40:58.746328+00:00'::timestamptz,
  '2026-04-05T10:40:58.746328+00:00'::timestamptz
);

-- #46 | VIGNESH D | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'VIGNESH D',
  '9629915281',
  'vv5965466@gmail.com',
  25,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SZtgh3RC1yLTFA',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU621042504'
  ),
  '2026-04-05T17:39:31.621042+00:00'::timestamptz,
  '2026-04-05T17:39:31.621042+00:00'::timestamptz
);

-- #47 | KARTHIYAYAN G | 5 kms | ₹200
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
  'KARTHIYAYAN G',
  '8754157831',
  'karthiyayan@gmail.com',
  23,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sa2I5bMezH4Sch',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU631522212'
  ),
  '2026-04-06T02:04:20.631522+00:00'::timestamptz,
  '2026-04-06T02:04:20.631522+00:00'::timestamptz
);

-- #48 | Sasikumar P | 5 kms | ₹200
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
  'Sasikumar P',
  '6383551154',
  'gopi.mmft@gmail.com',
  37,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sa8xENjj05jWSH',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU569187536'
  ),
  '2026-04-06T08:36:23.569187+00:00'::timestamptz,
  '2026-04-06T08:36:23.569187+00:00'::timestamptz
);

-- #49 | Mathi Vanan | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Mathi Vanan',
  '09677676933',
  'pkmathi94@gmail.com',
  31,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sa9RkjJaDSJ8l4',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU481746266'
  ),
  '2026-04-06T09:04:48.481746+00:00'::timestamptz,
  '2026-04-06T09:04:48.481746+00:00'::timestamptz
);

-- #50 | SRIDHAR R | 5 kms | ₹200
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
  'SRIDHAR R',
  '09159232193',
  'sribharathrc@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaDbOtTk9oxoQZ',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU758024646'
  ),
  '2026-04-06T13:09:16.758024+00:00'::timestamptz,
  '2026-04-06T13:09:16.758024+00:00'::timestamptz
);

-- #51 | Arunraj R | 5 kms | ₹200
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
  'Arunraj R',
  '9025250531',
  'sribharathrc@gmail.com',
  23,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaDjK4Dms97rGA',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU178128570'
  ),
  '2026-04-06T13:16:31.178128+00:00'::timestamptz,
  '2026-04-06T13:16:31.178128+00:00'::timestamptz
);

-- #52 | Manikandan | 5 kms | ₹200
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
  'Manikandan',
  '8973409395',
  'keyankarthi54165@gmail.com',
  33,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaFy29tzElSuLb',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU636615896'
  ),
  '2026-04-06T15:27:58.636615+00:00'::timestamptz,
  '2026-04-06T15:27:58.636615+00:00'::timestamptz
);

-- #53 | Ashok kumar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Ashok kumar',
  '9894874944',
  'akforu444@gmail.com',
  29,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaXm3hVAjzKOpK',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU675456404'
  ),
  '2026-04-07T08:53:06.675456+00:00'::timestamptz,
  '2026-04-07T08:53:06.675456+00:00'::timestamptz
);

-- #54 | SANTHOSH S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'SANTHOSH S',
  '9042222370',
  'santhoshhardtofind@gmail.com',
  29,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaXtZ8lIXDNU4P',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU905678805'
  ),
  '2026-04-07T09:00:08.905678+00:00'::timestamptz,
  '2026-04-07T09:00:08.905678+00:00'::timestamptz
);

-- #55 | Nishanth N | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Nishanth N',
  '6379518389',
  'nnishanth848@gmail.com',
  26,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaYslFWq32wawa',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU297769370'
  ),
  '2026-04-07T09:57:26.297769+00:00'::timestamptz,
  '2026-04-07T09:57:26.297769+00:00'::timestamptz
);

-- #56 | Sureshkrishna S | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Sureshkrishna S',
  '7373480450',
  'suresh28kri@gmail.com',
  24,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaaMdEsvfBZzdt',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU373550113'
  ),
  '2026-04-07T11:25:15.37355+00:00'::timestamptz,
  '2026-04-07T11:25:15.37355+00:00'::timestamptz
);

-- #57 | S. ALBERT | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'S. ALBERT',
  '9345907123',
  'aactingalbert@gmail.com',
  22,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sab3yHFlfiUVIX',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU653906882'
  ),
  '2026-04-07T12:06:08.653906+00:00'::timestamptz,
  '2026-04-07T12:06:08.653906+00:00'::timestamptz
);

-- #58 | YOGA | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'YOGA',
  '9342725895',
  'yoogayoga471@gmail.com',
  17,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SabfiXRK9KgNXA',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU952925623'
  ),
  '2026-04-07T12:39:57.952925+00:00'::timestamptz,
  '2026-04-07T12:39:57.952925+00:00'::timestamptz
);

-- #59 | Sivanesan | 5 kms | ₹200
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
  'Sivanesan',
  '7868824949',
  'balavinoth59@gmail.com',
  26,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SacJpU8unRpmBN',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU151104397'
  ),
  '2026-04-07T13:19:49.151104+00:00'::timestamptz,
  '2026-04-07T13:19:49.151104+00:00'::timestamptz
);

-- #60 | Rajesh kumar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Rajesh kumar',
  '8765837170',
  'brijeshkumar1732005@gmail.com',
  22,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SadlhCxPawVeM5',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU286049370'
  ),
  '2026-04-07T14:44:30.286049+00:00'::timestamptz,
  '2026-04-07T14:44:30.286049+00:00'::timestamptz
);

-- #61 | Srinivasaramanan M | 5 kms | ₹200
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
  'Srinivasaramanan M',
  '9789547751',
  'manismshopify@gmail.com',
  41,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SafZvc9nh0qVIw',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU714414735'
  ),
  '2026-04-07T16:30:58.714414+00:00'::timestamptz,
  '2026-04-07T16:30:58.714414+00:00'::timestamptz
);

-- #62 | Parameshwaran | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Parameshwaran',
  '6380705361',
  'selvamkumars@twss.edu.in',
  19,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SapALPiW0zo7Tw',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU240365845'
  ),
  '2026-04-08T01:54:03.240365+00:00'::timestamptz,
  '2026-04-08T01:54:03.240365+00:00'::timestamptz
);

-- #63 | ALDRIN JENNIS | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'ALDRIN JENNIS',
  '8281544087',
  'aldrinjennis24mds@jkkn.ac.in',
  27,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaupNzTbW0tU8e',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU797162731'
  ),
  '2026-04-08T07:26:07.797162+00:00'::timestamptz,
  '2026-04-08T07:26:07.797162+00:00'::timestamptz
);

-- #64 | Rakesh Murali.A | 5 kms | ₹200
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
  'Rakesh Murali.A',
  '7010961002',
  'rakeshmurali.a24mds@jkkn.ac.in',
  27,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SauqwMScE23vJS',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU758929627'
  ),
  '2026-04-08T07:27:27.758929+00:00'::timestamptz,
  '2026-04-08T07:27:27.758929+00:00'::timestamptz
);

-- #65 | Krithika S | 5 kms | ₹200
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
  'Krithika S',
  '9500636923',
  'mail2drkrithika@gmail.com',
  31,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SavAObXpTiRTTR',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XXL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU578497677'
  ),
  '2026-04-08T07:45:09.578497+00:00'::timestamptz,
  '2026-04-08T07:45:09.578497+00:00'::timestamptz
);

-- #66 | kaviya M | 5 kms | ₹200
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
  'kaviya M',
  '7639404985',
  'kaviya.m24mds@jkkn.ac.in',
  26,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SawWWW2gX2Qzyc',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU699831184'
  ),
  '2026-04-08T08:55:48.699831+00:00'::timestamptz,
  '2026-04-08T08:55:48.699831+00:00'::timestamptz
);

-- #67 | Rajamanickam D | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Rajamanickam D',
  '8248791514',
  'rrajamanickamm3200@gmail.com',
  23,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SaxES99Fe1cdx2',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU473446536'
  ),
  '2026-04-08T09:46:23.473446+00:00'::timestamptz,
  '2026-04-08T09:46:23.473446+00:00'::timestamptz
);

-- #68 | Hemavarshini B | 5 kms | ₹200
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
  'Hemavarshini B',
  '9698894969',
  'hemavarshini23endo@jkkn.ac.in',
  26,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Saya2gWpqq3Jck',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU432369082'
  ),
  '2026-04-08T11:06:23.432369+00:00'::timestamptz,
  '2026-04-08T11:06:23.432369+00:00'::timestamptz
);

-- #69 | Srinithi S | 5 kms | ₹200
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
  'Srinithi S',
  '9597329377',
  'srinithi2988@gmail.com',
  25,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sb1XBM3eNCxivM',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU215368556'
  ),
  '2026-04-08T13:59:51.215368+00:00'::timestamptz,
  '2026-04-08T13:59:51.215368+00:00'::timestamptz
);

-- #70 | S.Durga | 5 kms | ₹200
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
  'S.Durga',
  '6380161650',
  'durga25endo@jkkn.ac.in',
  0,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbFtZr0sp2rQ6d',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU642104416'
  ),
  '2026-04-09T04:02:38.642104+00:00'::timestamptz,
  '2026-04-09T04:02:38.642104+00:00'::timestamptz
);

-- #71 | Dinesh E | 5 kms | ₹200
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
  'Dinesh E',
  '8778419310',
  'dinesh.d@jkkn.ac.in',
  26,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbGQNVZuXDwE7q',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU228768949'
  ),
  '2026-04-09T04:33:18.228768+00:00'::timestamptz,
  '2026-04-09T04:33:18.228768+00:00'::timestamptz
);

-- #72 | PRINO S S | 5 kms | ₹200
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
  'PRINO S S',
  '9361491672',
  'prino.ss@jkkn.ac.in',
  25,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbGRMf76yHofZY',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU381494009'
  ),
  '2026-04-09T04:34:28.381494+00:00'::timestamptz,
  '2026-04-09T04:34:28.381494+00:00'::timestamptz
);

-- #73 | Shanitha salim | 5 kms | ₹200
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
  'Shanitha salim',
  '8848856126',
  'shanitha25endo@jkkn.ac.in',
  28,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbGeJp63dN94g3',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU907402176'
  ),
  '2026-04-09T04:46:17.907402+00:00'::timestamptz,
  '2026-04-09T04:46:17.907402+00:00'::timestamptz
);

-- #74 | Nithya Shree. A.C | 5 kms | ₹200
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
  'Nithya Shree. A.C',
  '7200844527',
  'nithyashree25endo@jkkn.ac.in',
  25,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbIp7mr9XIF3NR',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU639045110'
  ),
  '2026-04-09T06:54:31.639045+00:00'::timestamptz,
  '2026-04-09T06:54:31.639045+00:00'::timestamptz
);

-- #75 | Vinod kumar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Vinod kumar',
  '9443229329',
  'vinodkandan3@gmail.com',
  42,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbJ83kwsBTE3Tg',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU014913568'
  ),
  '2026-04-09T07:12:25.014913+00:00'::timestamptz,
  '2026-04-09T07:12:25.014913+00:00'::timestamptz
);

-- #76 | Rajasekar | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Rajasekar',
  '09952810873',
  'r461541@gmail.com',
  39,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbKTAnHvsyH5LH',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XL',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN50',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU321595699'
  ),
  '2026-04-09T08:31:12.321595+00:00'::timestamptz,
  '2026-04-09T08:31:12.321595+00:00'::timestamptz
);

-- #77 | Vikashini | 10 kms | ₹200
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
  'e15be923-bcc7-4516-bb98-166f71ba42f2'::uuid,
  'external',
  'Vikashini',
  '6374360066',
  'dharanvignesh8@gmail.com',
  19,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbhM3w3WALeEn8',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '10 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU046475775'
  ),
  '2026-04-10T06:54:24.046475+00:00'::timestamptz,
  '2026-04-10T06:54:24.046475+00:00'::timestamptz
);

-- #78 | Sharmila r | 5 kms | ₹200
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
  'Sharmila r',
  '7092243582',
  'selvamkumars@twss.edu.in',
  19,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_SbmAVk3xNOLOmF',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'S',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKNN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU266554150'
  ),
  '2026-04-10T11:36:53.266554+00:00'::timestamptz,
  '2026-04-10T11:36:53.266554+00:00'::timestamptz
);

-- #79 | Gowri | 5 kms | ₹200
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
  'Gowri',
  '9025031029',
  'gowria936@gmail.com',
  20,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sc1nnx546cswYn',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', 'JKKN100',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-ADU079032190'
  ),
  '2026-04-11T02:53:39.079032+00:00'::timestamptz,
  '2026-04-11T02:53:39.079032+00:00'::timestamptz
);

-- ============================================================
-- END OF BULK IMPORT (Adults Marathon - Paid)
-- Total: 79 INSERT statements
-- ============================================================
