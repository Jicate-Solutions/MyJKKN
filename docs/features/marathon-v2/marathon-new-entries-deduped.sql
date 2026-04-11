-- ============================================================
-- Kumarapalayam Bypass Marathon 2026 - NEW Entries (Deduplicated)
-- Generated: 2026-04-11T18:09:19.743Z
-- New Completed (paid): 20
-- New Not Required (free): 30
-- Total New Unique: 50
-- Duplicates removed: 46
-- Source Form: Kumarapalayam Bypass Marathon - 2026
-- ============================================================

-- REPLACE these placeholders with actual IDs:
-- EVENT_ID = '<paste-event-id-here>'
-- CATEGORY_5K_ID = '<paste-5k-category-id-here>'
-- CATEGORY_10K_ID = '<paste-10k-category-id-here>'

-- ============================================================
-- INSERT STATEMENTS
-- ============================================================

-- #1 | A.Aruna | 5 kms | ₹100 | completed
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
  'A.Aruna',
  '7824910574',
  'arunaa25pb@jkkn.ac.in',
  18,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc41pgAuwrOSEb',
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
    'original_submission_id', 'SUB-KUM354284869'
  ),
  '2026-04-11T05:05:25.354284+00:00'::timestamptz,
  '2026-04-11T05:05:25.354284+00:00'::timestamptz
);

-- #2 | Ashadheep | 5 kms | ₹100 | completed
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
  'Ashadheep',
  '9047527184',
  'ashadheep@jkkn.ac.in',
  24,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc46SK3iljEYDI',
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
    'original_submission_id', 'SUB-KUM625729644'
  ),
  '2026-04-11T05:09:30.625729+00:00'::timestamptz,
  '2026-04-11T05:09:30.625729+00:00'::timestamptz
);

-- #3 | Anju.T | 5 kms | ₹100 | completed
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
  'Anju.T',
  '9042164488',
  'anju@jkkn.ac.in',
  25,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc4qfsYaJ8lFLJ',
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
    'original_submission_id', 'SUB-KUM604543251'
  ),
  '2026-04-11T05:48:42.604543+00:00'::timestamptz,
  '2026-04-11T05:48:42.604543+00:00'::timestamptz
);

-- #4 | Baladharshini | 5 kms | ₹100 | completed
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
  'Baladharshini',
  '9943599294',
  'baladharshini@jkkn.ac.in',
  22,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc4qEmYulpFrE1',
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
    'original_submission_id', 'SUB-KUM719429266'
  ),
  '2026-04-11T05:52:57.719429+00:00'::timestamptz,
  '2026-04-11T05:52:57.719429+00:00'::timestamptz
);

-- #5 | Janagaraj P | 5 kms | ₹100 | completed
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
  'Janagaraj P',
  '9942070740',
  'janavp08@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc4w060h6fZm5f',
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
    'original_submission_id', 'SUB-KUM127591673'
  ),
  '2026-04-11T05:58:17.127591+00:00'::timestamptz,
  '2026-04-11T05:58:17.127591+00:00'::timestamptz
);

-- #6 | ABI | 5 kms | ₹100 | completed
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
  'ABI',
  '7010995234',
  'rasuthanga098@gmail.com',
  23,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc5pcEPyR1EZBU',
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
    'original_submission_id', 'SUB-KUM255413086'
  ),
  '2026-04-11T06:51:04.255413+00:00'::timestamptz,
  '2026-04-11T06:51:04.255413+00:00'::timestamptz
);

-- #7 | Balaji V | 5 kms | ₹200 | completed
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
  'Balaji V',
  '6385474402',
  'venkateshbalaji110@gmail.com',
  19,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sc6SF1BnEYGmA1',
  'bulk_upload',
  jsonb_build_object(
    'tshirt_size', 'L',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '777',
    'distance', '5 kms',
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-KUM640600160'
  ),
  '2026-04-11T07:27:34.6406+00:00'::timestamptz,
  '2026-04-11T07:27:34.6406+00:00'::timestamptz
);

-- #8 | Jyothi d | 5 kms | ₹200 | completed
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
  'Jyothi d',
  '7348821658',
  'dilipkallithodi@gmail.com',
  47,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  200,
  'online',
  'pay_Sc6lfIgZUg9yUR',
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
    'original_submission_id', 'SUB-KUM367980564'
  ),
  '2026-04-11T07:28:11.36798+00:00'::timestamptz,
  '2026-04-11T07:28:11.36798+00:00'::timestamptz
);

-- #9 | Rajnish Kumar A | 5 kms | ₹100 | completed
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
  'Rajnish Kumar A',
  '7667865339',
  'rajnishkumar33348@gmail.com',
  23,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc6kiKGvUKFoA6',
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
    'original_submission_id', 'SUB-KUM896294786'
  ),
  '2026-04-11T07:44:49.896294+00:00'::timestamptz,
  '2026-04-11T07:44:49.896294+00:00'::timestamptz
);

-- #10 | Jagan R | 5 kms | ₹100 | completed
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
  'Jagan R',
  '8217894551',
  'devopsimp@gmail.com',
  43,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc6zS831Ao9Col',
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
    'original_submission_id', 'SUB-KUM790755478'
  ),
  '2026-04-11T07:58:58.790755+00:00'::timestamptz,
  '2026-04-11T07:58:58.790755+00:00'::timestamptz
);

-- #11 | YUGESH P | 5 kms | ₹100 | completed
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
  'YUGESH P',
  '9965169426',
  'ytec.solutionz@gmail.com',
  30,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc9YZO4aejMtJN',
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
    'original_submission_id', 'SUB-KUM792876333'
  ),
  '2026-04-11T10:28:03.792876+00:00'::timestamptz,
  '2026-04-11T10:28:03.792876+00:00'::timestamptz
);

-- #12 | Kishore S | 10 kms | ₹100 | completed
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
  'Kishore S',
  '8760712682',
  'kishorekishore9190@gmail.com',
  25,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_Sc9oOzgbVWYqiO',
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
    'original_submission_id', 'SUB-KUM267456461'
  ),
  '2026-04-11T10:44:16.267456+00:00'::timestamptz,
  '2026-04-11T10:44:16.267456+00:00'::timestamptz
);

-- #13 | M.eniya | 5 kms | ₹100 | completed
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
  'M.eniya',
  '8438761018',
  'keerthana23ucsai@jkkn.ac.in',
  17,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScALSIDvKRAjGi',
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
    'original_submission_id', 'SUB-KUM561128770'
  ),
  '2026-04-11T11:16:04.561128+00:00'::timestamptz,
  '2026-04-11T11:16:04.561128+00:00'::timestamptz
);

-- #14 | Raja K R | 5 kms | ₹100 | completed
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
  'Raja K R',
  '9842783732',
  'padsou12@gmail.com',
  49,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScAYJyi81TAQoX',
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
    'original_submission_id', 'SUB-KUM656020907'
  ),
  '2026-04-11T11:27:55.65602+00:00'::timestamptz,
  '2026-04-11T11:27:55.65602+00:00'::timestamptz
);

-- #15 | Kavin.d.p | 5 kms | ₹100 | completed
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
  'Kavin.d.p',
  '9944588712',
  'vikash25pb@jkkn.ac.in',
  17,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScB7mRlynzOdWR',
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
    'original_submission_id', 'SUB-KUM623625057'
  ),
  '2026-04-11T12:01:47.623625+00:00'::timestamptz,
  '2026-04-11T12:01:47.623625+00:00'::timestamptz
);

-- #16 | B.deva dharshini | 5 kms | ₹100 | completed
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
  'B.deva dharshini',
  '8072266224',
  'keerthana23ucsai@jkkn.ac.in',
  17,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScBIjMxsbifIWv',
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
    'original_submission_id', 'SUB-KUM093917604'
  ),
  '2026-04-11T12:12:02.093917+00:00'::timestamptz,
  '2026-04-11T12:12:02.093917+00:00'::timestamptz
);

-- #17 | Vignesh | 5 kms | ₹100 | completed
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
  'Vignesh',
  '6383534191',
  'makesh0017@gmail.com',
  20,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScBWBoT5Izv7iB',
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
    'original_submission_id', 'SUB-KUM731799696'
  ),
  '2026-04-11T12:24:56.731799+00:00'::timestamptz,
  '2026-04-11T12:24:56.731799+00:00'::timestamptz
);

-- #18 | Sabharna s | 5 kms | ₹100 | completed
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
  'Sabharna s',
  '9865453750',
  'srisakthirosystems@gmail.com',
  16,
  'female',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScD1YNQwbkeeY2',
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
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-KUM322482010'
  ),
  '2026-04-11T13:51:45.322482+00:00'::timestamptz,
  '2026-04-11T13:51:45.322482+00:00'::timestamptz
);

-- #19 | Santhosh R | 10 kms | ₹100 | completed
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
  'Santhosh R',
  '8072802115',
  'sureshkumar2182003@gmail.com',
  16,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScE4kvsMkzzErB',
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
    'original_submission_id', 'SUB-KUM062829099'
  ),
  '2026-04-11T14:54:19.062829+00:00'::timestamptz,
  '2026-04-11T14:54:19.062829+00:00'::timestamptz
);

-- #20 | Saravanan | 5 kms | ₹100 | completed
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
  'Saravanan',
  '9080520716',
  'saravananmech3@gmail.com',
  40,
  'male',
  NULL,
  NULL,
  'registered',
  'paid',
  100,
  'online',
  'pay_ScENoCdVr6qs0P',
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
    'original_submission_id', 'SUB-KUM792775166'
  ),
  '2026-04-11T15:13:00.792775+00:00'::timestamptz,
  '2026-04-11T15:13:00.792775+00:00'::timestamptz
);

-- #21 | HIVANNI | Yes | FREE | not_required
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
  'HIVANNI',
  '9865056669',
  'manikkam0046@gmail.com',
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
    'tshirt_size', 'M',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-KUM233137234'
  ),
  '2026-04-11T07:50:04.233137+00:00'::timestamptz,
  '2026-04-11T07:50:04.233137+00:00'::timestamptz
);

-- #22 | J.Aadithya | Yes | FREE | not_required
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
  'J.Aadithya',
  '8217894551',
  'devopsimp@gmail.com',
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
    'original_submission_id', 'SUB-KUM956316108'
  ),
  '2026-04-11T07:55:16.956316+00:00'::timestamptz,
  '2026-04-11T07:55:16.956316+00:00'::timestamptz
);

-- #23 | Yashwanth | Yes | FREE | not_required
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
  '9345340492',
  'christinapooja755@gmail.com',
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
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-KUM719972413'
  ),
  '2026-04-11T09:11:18.719972+00:00'::timestamptz,
  '2026-04-11T09:11:18.719972+00:00'::timestamptz
);

-- #24 | Naren | Yes | FREE | not_required
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
  'Naren',
  '9345340492',
  'christinapooja755@gmail.com',
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
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-KUM204491136'
  ),
  '2026-04-11T09:13:26.204491+00:00'::timestamptz,
  '2026-04-11T09:13:26.204491+00:00'::timestamptz
);

-- #25 | Gokul | Yes | FREE | not_required
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
  'Gokul',
  '9345340492',
  'christinapooja755@gmail.com',
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
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-KUM778267470'
  ),
  '2026-04-11T09:15:06.778267+00:00'::timestamptz,
  '2026-04-11T09:15:06.778267+00:00'::timestamptz
);

-- #26 | S.SIVA | Yes | FREE | not_required
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
  'S.SIVA',
  '9791998144',
  'sivatamil206@gmail.com',
  -1,
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
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-KUM086986142'
  ),
  '2026-04-11T09:16:09.086986+00:00'::timestamptz,
  '2026-04-11T09:16:09.086986+00:00'::timestamptz
);

-- #27 | MOHITH.K | Yes | FREE | not_required
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
  'MOHITH.K',
  '8675696005',
  'renuga0301@gmail.com',
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
    'original_submission_id', 'SUB-KUM442644806'
  ),
  '2026-04-11T09:36:00.442644+00:00'::timestamptz,
  '2026-04-11T09:36:00.442644+00:00'::timestamptz
);

-- #28 | K.MANJU | Yes | FREE | not_required
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
  'K.MANJU',
  '84381123841',
  'manju007deepa@gmail.com',
  -1,
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
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-KUM095123874'
  ),
  '2026-04-11T09:37:43.095123+00:00'::timestamptz,
  '2026-04-11T09:37:43.095123+00:00'::timestamptz
);

-- #29 | K.MANJU | Yes | FREE | not_required
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
  'K.MANJU',
  '8438113381',
  'manju007deepa@gmail.com',
  -1,
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
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-KUM534238370'
  ),
  '2026-04-11T09:46:24.534238+00:00'::timestamptz,
  '2026-04-11T09:46:24.534238+00:00'::timestamptz
);

-- #30 | K.MANJU | Yes | FREE | not_required
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
  'K.MANJU',
  '84381123681',
  'manju007deepa@gmail.com',
  -1,
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
    'participant_category', 'Adult',
    'original_submission_id', 'SUB-KUM149529263'
  ),
  '2026-04-11T09:49:39.149529+00:00'::timestamptz,
  '2026-04-11T09:49:39.149529+00:00'::timestamptz
);

-- #31 | GM prithivvan | Yes | FREE | not_required
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
  'GM prithivvan',
  '9159160735',
  'thebeastprithivvan@gmail.com',
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
    'tshirt_size', 'XS',
    'blood_group', '',
    'emergency_contact_name', '',
    'emergency_contact_phone', '',
    'medical_conditions', '',
    'previous_marathon_experience', '',
    'coupon_code', '',
    'distance', 'Yes',
    'participant_category', 'School Student',
    'original_submission_id', 'SUB-KUM324558216'
  ),
  '2026-04-11T11:12:05.324558+00:00'::timestamptz,
  '2026-04-11T11:12:05.324558+00:00'::timestamptz
);

-- #32 | Kiruthick R R | Yes | FREE | not_required
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
  'Kiruthick R R',
  '9842783732',
  'padsou12@gmail.com',
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
    'original_submission_id', 'SUB-KUM940808601'
  ),
  '2026-04-11T11:23:45.940808+00:00'::timestamptz,
  '2026-04-11T11:23:45.940808+00:00'::timestamptz
);

-- #33 | Somesh waran | Yes | FREE | not_required
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
  'Somesh waran',
  '9087783252',
  'nsenthilnsenthil42@gmail.com',
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
    'original_submission_id', 'SUB-KUM833761260'
  ),
  '2026-04-11T12:11:29.833761+00:00'::timestamptz,
  '2026-04-11T12:11:29.833761+00:00'::timestamptz
);

-- #34 | Sanjay T | Yes | FREE | not_required
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
  'Sanjay T',
  '9944609007',
  'sathishselvi2009ks@gmail.com',
  0,
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
    'original_submission_id', 'SUB-KUM768334151'
  ),
  '2026-04-11T13:36:43.768334+00:00'::timestamptz,
  '2026-04-11T13:36:43.768334+00:00'::timestamptz
);

-- #35 | Preveen kumar S | Yes | FREE | not_required
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
  'Preveen kumar S',
  '7696612044',
  'sathishselvi2009ks@gmail.com',
  1,
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
    'original_submission_id', 'SUB-KUM692652576'
  ),
  '2026-04-11T13:38:21.692652+00:00'::timestamptz,
  '2026-04-11T13:38:21.692652+00:00'::timestamptz
);

-- #36 | K.ranjith kumar | Yes | FREE | not_required
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
  'K.ranjith kumar',
  '9943745296',
  'karthikeyanvkarthikeyan776@gmail.com',
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
    'original_submission_id', 'SUB-KUM642821409'
  ),
  '2026-04-11T13:40:06.642821+00:00'::timestamptz,
  '2026-04-11T13:40:06.642821+00:00'::timestamptz
);

-- #37 | Mahish s.k | Yes | FREE | not_required
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
  'Mahish s.k',
  '9123552766',
  'mahishvajesh@gmail.com',
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
    'original_submission_id', 'SUB-KUM608090466'
  ),
  '2026-04-11T13:47:48.60809+00:00'::timestamptz,
  '2026-04-11T13:47:48.60809+00:00'::timestamptz
);

-- #38 | SUGUNTHAN S | Yes | FREE | not_required
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
  'SUGUNTHAN S',
  '9994151441',
  'dhanapalrekha6464@gmail.com',
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
    'original_submission_id', 'SUB-KUM391050955'
  ),
  '2026-04-11T13:54:45.39105+00:00'::timestamptz,
  '2026-04-11T13:54:45.39105+00:00'::timestamptz
);

-- #39 | Harish M K | Yes | FREE | not_required
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
  'Harish M K',
  '9025594747',
  'sathishselvi2009ks@gmail.com',
  1,
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
    'original_submission_id', 'SUB-KUM636087532'
  ),
  '2026-04-11T13:57:51.636087+00:00'::timestamptz,
  '2026-04-11T13:57:51.636087+00:00'::timestamptz
);

-- #40 | Nithilan  R | Yes | FREE | not_required
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
  'Nithilan  R',
  '8838629675',
  'samugapriya697@gmail.com',
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
    'original_submission_id', 'SUB-KUM177625749'
  ),
  '2026-04-11T14:26:49.177625+00:00'::timestamptz,
  '2026-04-11T14:26:49.177625+00:00'::timestamptz
);

-- #41 | R  Nithilan | Yes | FREE | not_required
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
  'R  Nithilan',
  '8838629675',
  'samugapriya697@gmail.com',
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
    'original_submission_id', 'SUB-KUM838838047'
  ),
  '2026-04-11T14:31:32.838838+00:00'::timestamptz,
  '2026-04-11T14:31:32.838838+00:00'::timestamptz
);

-- #42 | Nithilan R | Yes | FREE | not_required
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
  'Nithilan R',
  '8832629675',
  'samugapriya697@gmail.com',
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
    'original_submission_id', 'SUB-KUM908761857'
  ),
  '2026-04-11T14:38:25.908761+00:00'::timestamptz,
  '2026-04-11T14:38:25.908761+00:00'::timestamptz
);

-- #43 | P.M.Praneshh | Yes | FREE | not_required
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
  'P.M.Praneshh',
  '9543348412',
  'ushamuthukumar12@gmail.com',
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
    'original_submission_id', 'SUB-KUM463426297'
  ),
  '2026-04-11T14:43:49.463426+00:00'::timestamptz,
  '2026-04-11T14:43:49.463426+00:00'::timestamptz
);

-- #44 | Aswin.V | Yes | FREE | not_required
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
  'Aswin.V',
  '9342146868',
  'arunkavitha47111@gmail.com',
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
    'original_submission_id', 'SUB-KUM647192685'
  ),
  '2026-04-11T14:51:05.647192+00:00'::timestamptz,
  '2026-04-11T14:51:05.647192+00:00'::timestamptz
);

-- #45 | G. Vishal | Yes | FREE | not_required
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
  'G. Vishal',
  '9566543197',
  'a3700067@gmail.com',
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
    'original_submission_id', 'SUB-KUM191922252'
  ),
  '2026-04-11T15:09:54.191922+00:00'::timestamptz,
  '2026-04-11T15:09:54.191922+00:00'::timestamptz
);

-- #46 | P Suthan | Yes | FREE | not_required
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
  'P Suthan',
  '9488021058',
  'sgandhimathi1006@gmail.com',
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
    'original_submission_id', 'SUB-KUM996133651'
  ),
  '2026-04-11T15:30:25.996133+00:00'::timestamptz,
  '2026-04-11T15:30:25.996133+00:00'::timestamptz
);

-- #47 | G. S. Harish | Yes | FREE | not_required
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
  'G. S. Harish',
  '9865785175',
  'magimaisundarg@gmail.com',
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
    'original_submission_id', 'SUB-KUM203382617'
  ),
  '2026-04-11T15:38:37.203382+00:00'::timestamptz,
  '2026-04-11T15:38:37.203382+00:00'::timestamptz
);

-- #48 | Poorna sri | Yes | FREE | not_required
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
  'Poorna sri',
  '8883075148',
  'poornazo78@gmail.com',
  -1,
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
    'original_submission_id', 'SUB-KUM077625479'
  ),
  '2026-04-11T15:48:51.077625+00:00'::timestamptz,
  '2026-04-11T15:48:51.077625+00:00'::timestamptz
);

-- #49 | B.Rathivarman | Yes | FREE | not_required
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
  'B.Rathivarman',
  '9597524826',
  'sujithvanitha2019@gmail.com',
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
    'original_submission_id', 'SUB-KUM211104757'
  ),
  '2026-04-11T16:14:35.211104+00:00'::timestamptz,
  '2026-04-11T16:14:35.211104+00:00'::timestamptz
);

-- #50 | Pavithra.M | Yes | FREE | not_required
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
  'Pavithra.M',
  '8610000973',
  'manikandankathirvel72@gmail.com',
  -1,
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
    'original_submission_id', 'SUB-KUM779934628'
  ),
  '2026-04-11T16:28:01.779934+00:00'::timestamptz,
  '2026-04-11T16:28:01.779934+00:00'::timestamptz
);

-- ============================================================
-- END OF NEW ENTRIES IMPORT
-- Completed (paid): 20
-- Not Required (free): 30
-- Total: 50 INSERT statements
-- ============================================================
