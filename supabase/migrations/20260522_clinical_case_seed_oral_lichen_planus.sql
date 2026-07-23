-- ============================================================================
-- Migration: 20260522_clinical_case_seed_oral_lichen_planus
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A9
-- ============================================================================
-- Seeds the FIRST clinical case for MyJKKN clinical_reasoning module.
--
-- Source: ported verbatim from AICBL standalone phase1 seed
-- (/Users/omm/PROJECTS/aicbl/supabase/seeds/phase1_oral_medicine_cases.sql,
-- first case — Oral Lichen Planus Mrs. Lalitha 52F).
--
-- Why this case and not Leukoplakia: the original Leukoplakia case content
-- lives in AICBL standalone Supabase data only (not in code). This is a
-- structurally equivalent, fully-authored case — gives downstream agents
-- (B coach, C student UI, D faculty CRUD) a real case to test against.
-- Sakthi will author Leukoplakia + other oral medicine cases via the
-- faculty UI when Agent D ships /pde/faculty/cases/new.
--
-- Creates 3 rows:
--   - vac_lessons (case_scenario JSONB with patient details)
--   - pde_assessments (assessment_type='clinical_case', status='draft' so
--     faculty publishes after review)
--   - pde_assessment_questions × 6 (free_text_socratic; metadata has
--     ground_truth + key_concepts + q_number + osce_domain)
--
-- Idempotent via DELETE-then-INSERT (clean namespace; case is anchored by
-- the lesson title and assessment course_id + title combination).
-- ============================================================================

DO $$
DECLARE
  v_course_id UUID;
  v_lesson_id UUID;
  v_assessment_id UUID;
BEGIN
  -- Locate course
  SELECT id INTO v_course_id FROM vac_courses WHERE code = 'BDS-CR-101' LIMIT 1;
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'BDS-CR-101 course not found. Apply A6 first.';
  END IF;

  -- Idempotency: remove any prior seed for this case
  DELETE FROM pde_assessment_questions WHERE assessment_id IN (
    SELECT id FROM pde_assessments WHERE course_id = v_course_id AND title = 'Oral Lichen Planus — Mrs. Lalitha, 52F'
  );
  DELETE FROM pde_assessments WHERE course_id = v_course_id AND title = 'Oral Lichen Planus — Mrs. Lalitha, 52F';
  DELETE FROM vac_lessons WHERE course_id = v_course_id AND title = 'Oral Lichen Planus — Mrs. Lalitha, 52F';

  -- 1. vac_lessons row
  INSERT INTO vac_lessons (course_id, week, hour, title, duration_minutes, is_published, case_scenario)
  VALUES (
    v_course_id, 1, 1,
    'Oral Lichen Planus — Mrs. Lalitha, 52F',
    30, false,
    '{
      "patient_name": "Mrs. Lalitha",
      "age": 52,
      "gender": "Female",
      "occupation": "Homemaker",
      "chief_complaint": "Burning sensation in both cheeks while eating spicy food since 3 months.",
      "hopi": "Insidious onset 3 months ago. Burning is intermittent, worsens with spicy/citrus food, partially relieved by cold water. No pain at rest. No history of trauma or recent dental work. Patient noticed white lines on the inside of cheeks 1 month ago.",
      "medical_history": "Hypertensive for 4 years on Amlodipine 5 mg OD. No diabetes, no thyroid disorder, no known allergies.",
      "habit_history": {
        "type": "None",
        "duration_years": 0,
        "frequency": "NA",
        "quantity": "NA",
        "current_status": "Non-smoker, non-alcoholic, no betel/tobacco use."
      },
      "additional_clinical_details": "Bilateral lesions on posterior buccal mucosa. Lesions are non-scrapable, non-tender on palpation, soft in consistency. No regional lymphadenopathy."
    }'::jsonb
  )
  RETURNING id INTO v_lesson_id;

  -- 2. pde_assessments row (assessment_type=clinical_case, status=draft)
  INSERT INTO pde_assessments (
    title, description,
    assessment_type, status, version,
    lesson_id, course_id,
    is_active, pass_threshold,
    metadata
  )
  VALUES (
    'Oral Lichen Planus — Mrs. Lalitha, 52F',
    'Reticular oral lichen planus case for clinical reasoning practice. 6 Socratic questions; OSCE-scored across 5 domains.',
    'clinical_case', 'draft', 1,
    v_lesson_id, v_course_id,
    true, 60.00,
    '{
      "domain_weights": {
        "data_gathering": 0.20,
        "hypothesis_generation": 0.20,
        "management_planning": 0.20,
        "patient_communication": 0.20,
        "professionalism": 0.20
      },
      "discipline": "oral_medicine",
      "source": "aicbl_phase1_port"
    }'::jsonb
  )
  RETURNING id INTO v_assessment_id;

  -- 3. pde_assessment_questions × 6 (free_text_socratic)
  INSERT INTO pde_assessment_questions (
    assessment_id, question_type, question_text, order_index, points, metadata
  ) VALUES
  (
    v_assessment_id, 'free_text_socratic',
    'Describe the lesion (Site, Size, Shape, Colour, Surface texture, Margins, Extension).',
    1, 10,
    '{
      "q_number": 1,
      "osce_domain": "data_gathering",
      "ground_truth": "Bilateral whitish lesions on the posterior buccal mucosa, extending from the retromolar region anteriorly along the occlusal line. Lesions are arranged as fine interlacing white lines (Wickham striae) forming a reticular/lacy pattern, with no surface ulceration. Margins are diffuse and ill-defined. Surrounding mucosa appears erythematous in patches but otherwise normal.",
      "key_concepts": ["Site: bilateral posterior buccal mucosa", "Reticular/lacy pattern", "Wickham striae", "Non-scrapable", "Diffuse margins", "Patchy background erythema"]
    }'::jsonb
  ),
  (
    v_assessment_id, 'free_text_socratic',
    'A. Give your provisional diagnosis. B. Which findings most influenced your diagnosis?',
    2, 10,
    '{
      "q_number": 2,
      "osce_domain": "hypothesis_generation",
      "ground_truth": "A. Provisional Diagnosis: Reticular Oral Lichen Planus (bilateral buccal mucosa). B. Influencing findings: bilateral symmetrical distribution, Wickham striae (lacy white lines), non-scrapable, burning sensation aggravated by spicy food, middle-aged female demographic.",
      "key_concepts": ["Diagnosis: Reticular OLP", "Bilateral symmetry", "Wickham striae", "Burning sensation pattern", "Non-scrapable"]
    }'::jsonb
  ),
  (
    v_assessment_id, 'free_text_socratic',
    'What are your differential diagnoses? List with reasons for exclusion.',
    3, 10,
    '{
      "q_number": 3,
      "osce_domain": "hypothesis_generation",
      "ground_truth": "Lichenoid drug reaction (Amlodipine can cause lichenoid lesions — must consider; usually unilateral or related to amalgam contact). Leukoplakia — typically unilateral, homogeneous white patch, no Wickham striae, strong tobacco association. Candidiasis (chronic hyperplastic) — would be scrapable in pseudomembranous form, KOH would show hyphae. Frictional keratosis — confined to areas of mechanical trauma, no striae. Lupus erythematosus (oral) — radiating white striae with central erythema/atrophy, often associated with cutaneous lesions.",
      "key_concepts": ["Lichenoid drug reaction (Amlodipine) — closest mimic", "Leukoplakia — no striae, unilateral", "Candidiasis — scrapable", "Frictional keratosis — trauma-confined", "Lupus — cutaneous association"]
    }'::jsonb
  ),
  (
    v_assessment_id, 'free_text_socratic',
    'Which feature ruled out the closest differential diagnosis?',
    4, 10,
    '{
      "q_number": 4,
      "osce_domain": "hypothesis_generation",
      "ground_truth": "Bilateral symmetric distribution with classic Wickham striae makes idiopathic OLP more likely than lichenoid drug reaction; however, definitive distinction requires histopathology and clinical correlation with drug timeline (Amlodipine started 4 years ago, lesions only 3 months old — temporally weak association).",
      "key_concepts": ["Bilateral symmetry favours OLP", "Wickham striae morphology", "Drug temporality weak (4 yr drug vs 3 mo lesion)"]
    }'::jsonb
  ),
  (
    v_assessment_id, 'free_text_socratic',
    'Justify investigation/biopsy based on clinical risk factors.',
    5, 10,
    '{
      "q_number": 5,
      "osce_domain": "management_planning",
      "ground_truth": "Incisional biopsy is justified to confirm OLP histopathologically (saw-toothed rete ridges, basal cell liquefaction, band-like sub-epithelial lymphocytic infiltrate) and to rule out epithelial dysplasia, since OLP carries a small but documented malignant transformation risk (~1% over 10 years). Direct immunofluorescence helps differentiate from lichenoid drug reaction and lupus.",
      "key_concepts": ["Confirm OLP histology (saw-tooth rete, basal liquefaction)", "Rule out dysplasia (~1% transformation)", "DIF for differential vs lichenoid drug reaction", "Rule out lupus"]
    }'::jsonb
  ),
  (
    v_assessment_id, 'free_text_socratic',
    'Write about the management.',
    6, 10,
    '{
      "q_number": 6,
      "osce_domain": "management_planning",
      "ground_truth": "Reassurance and symptomatic management: topical corticosteroids (triamcinolone 0.1% in orabase, applied 2-3 times/day) for symptomatic erosive areas; topical anaesthetic (lignocaine 2% gel) before meals if burning is severe. Avoid spicy/acidic foods. Liaise with physician regarding alternative antihypertensive (e.g. Losartan) only if drug-related lichenoid reaction is suspected. 6-monthly follow-up for surveillance of malignant transformation. Patient education regarding chronic, relapsing nature.",
      "key_concepts": ["Topical triamcinolone 0.1% in orabase", "Topical lignocaine 2% before meals", "Dietary avoidance (spicy/acidic)", "Liaise with physician re: Amlodipine alternative", "6-monthly malignancy surveillance", "Patient education on chronic course"]
    }'::jsonb
  );

  RAISE NOTICE 'Seeded Oral Lichen Planus case. Lesson: %, Assessment: %', v_lesson_id, v_assessment_id;
END $$;
