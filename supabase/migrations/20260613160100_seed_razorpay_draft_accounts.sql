-- 20260613160100_seed_razorpay_draft_accounts.sql
-- Stage the 14 confirmed JKKN institution x fee-head accounts as DRAFTS (no keys).
-- Each is inert until activated with keys (resolver skips key_id IS NULL rows).
-- Idempotent via fn_create_razorpay_draft (upserts the slot's draft).
-- Mapping reference: docs/hdfc-new-integration/Institution-FeeHead-MID-Mapping.md
-- (Trust #10 intentionally skipped; keys added later via the admin panel "Activate".)
SELECT public.fn_create_razorpay_draft('b0b8a724-7c65-4f07-8047-2a38e8100ad5', NULL,            'Arts & Science (Self)',        'SnzjAmEWfFjEpG', '70508967', 'JKKN CLG OF ARTS AND SCIENCE AUTONOMOUS', 'live', NULL);
SELECT public.fn_create_razorpay_draft('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', NULL,            'Pharmacy',                     'T0iCX5lDTjrZgl', '70508968', 'JKK NATTARAJA COLLEGE OF PHARMACY',        'live', NULL);
SELECT public.fn_create_razorpay_draft('70e54e51-9b98-4e07-9534-a85310609bfd', NULL,            'Nursing & Research',           'T0iCi9WHmycSXF', '70508969', 'SRESAKTHIMAYEIL INS OF NURSING AND RES',   'live', NULL);
SELECT public.fn_create_razorpay_draft('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', NULL,            'Dental',                       'T0iCruBUUsTT1q', '70508970', 'JKK NATARAJA DENTAL COLLEGE AND HOSPITAL', 'live', NULL);
SELECT public.fn_create_razorpay_draft('5de4fba1-4564-41ed-8c73-5d948b74b843', NULL,            'Engineering & Technology',     'T0iD1OQ5bUsesl', '70508971', 'JKKN CLG OF ENGINEERING AND TECHNOLOGY',   'live', NULL);
SELECT public.fn_create_razorpay_draft('9380358f-7020-4c23-89c3-e9538b47cf33', NULL,            'College of Education',         'T0iDBT3lucxfkC', '70508972', 'JKK NATTRAJA COLLEGE OF EDUCATION',        'live', NULL);
SELECT public.fn_create_razorpay_draft('e04b8a7f-1445-4ef1-92e9-bde3d32b1f44', NULL,            'Matric Hr Sec School',         'T0iDM4tijFESV5', '70508973', 'JKKN MATRIC HR SEC SCHOOL',                'live', NULL);
SELECT public.fn_create_razorpay_draft('29c221d1-b918-4c46-9d67-857273b0b553', NULL,            'Nattraja Vidhyalya CBSE',      'T0iDVnArzlIPKo', '70508974', 'NATTRAJA VIDHYALYA',                       'live', NULL);
SELECT public.fn_create_razorpay_draft('9c1554e8-12a2-4b76-a9d6-8242bb05eba1', NULL,            'Allied Health Sciences',       'T0iDhK9sudh6Xl', '70508975', 'JKKN DENTAL CLG AND HOSPITAL-AHS',         'live', NULL);
SELECT public.fn_create_razorpay_draft('b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'transport',     'Arts & Science - Bus Fee',     'T0iE28PvbVFtnj', '70508977', 'JKKN CLG OF ARTS AND SCI AUTO-BUS FEE',    'live', NULL);
SELECT public.fn_create_razorpay_draft('5de4fba1-4564-41ed-8c73-5d948b74b843', 'university_fee', 'Engineering - University Fee', 'T0iEBcF4dUim9F', '70508978', 'JKKN CLG OF ENG AND TECH-UNIVERSITY FEE',  'live', NULL);
SELECT public.fn_create_razorpay_draft('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'university_fee', 'Dental - University Fee',      'T0iELW5GyxikQf', '70508979', 'JKKN DENTAL CLG AND HOSPITAL-UNI FEE',     'live', NULL);
SELECT public.fn_create_razorpay_draft('70e54e51-9b98-4e07-9534-a85310609bfd', 'university_fee', 'Nursing - University Fee',     'T0iEV1qA7sBZp9', '70508980', 'SRESAKTHIMAYEIL INS OF NUR AND RES-UF',    'live', NULL);
SELECT public.fn_create_razorpay_draft('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'establishment', 'Dental - Establishment Fee',   'T0iEeTnTGx8pYe', '70508981', 'JKKN DENTAL CLG AND HOSPITAL-ESTAB FEE',   'live', NULL);
