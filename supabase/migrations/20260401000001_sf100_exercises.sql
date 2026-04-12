-- SF100 Exercises: Admin-created interactive forms/exercises for teams
-- Part of the Solve for 100 module

-- Exercises (admin-created forms for teams)
CREATE TABLE sf100_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES sf100_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields schema: [{ id: string, type: 'text'|'textarea'|'select'|'radio'|'number'|'scale', label: string, required: boolean, options?: string[], placeholder?: string }]
  is_required BOOLEAN DEFAULT false,
  due_date DATE,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sf100_exercise_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES sf100_exercises(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  response_data JSONB NOT NULL DEFAULT '{}',
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, enrollment_id)
);

CREATE INDEX idx_sf100_exercises_program ON sf100_exercises(program_id);
CREATE INDEX idx_sf100_exercise_responses_exercise ON sf100_exercise_responses(exercise_id);
CREATE INDEX idx_sf100_exercise_responses_enrollment ON sf100_exercise_responses(enrollment_id);

ALTER TABLE sf100_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf100_exercise_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY sf100_exercises_select ON sf100_exercises FOR SELECT TO authenticated USING (true);
CREATE POLICY sf100_exercises_service ON sf100_exercises FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY sf100_exercise_responses_select ON sf100_exercise_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY sf100_exercise_responses_service ON sf100_exercise_responses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow authenticated users to insert/update their own responses
CREATE POLICY sf100_exercise_responses_insert ON sf100_exercise_responses
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY sf100_exercise_responses_update ON sf100_exercise_responses
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid())
  WITH CHECK (submitted_by = auth.uid());

-- Allow admins to insert/update exercises
CREATE POLICY sf100_exercises_insert ON sf100_exercises
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY sf100_exercises_update ON sf100_exercises
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- Seed the ICP Exercise
-- We need a program_id to reference — insert with a placeholder that admin will link
-- For now, create a function that seeds ICP into the first active program
DO $$
DECLARE
  v_program_id UUID;
BEGIN
  -- Find the first active or enrollment_open sf100 program
  SELECT id INTO v_program_id
  FROM sf100_programs
  WHERE status IN ('active', 'enrollment_open')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Only seed if a program exists
  IF v_program_id IS NOT NULL THEN
    INSERT INTO sf100_exercises (program_id, title, description, is_required, due_date, sort_order, status, fields)
    VALUES (
      v_program_id,
      'Ideal Customer Profile Builder',
      'Build a detailed picture of your ideal customer. Answer each question by thinking about ONE specific real person.',
      true,
      '2026-04-06',
      1,
      'published',
      '[
        {"id": "icp_person", "type": "text", "label": "Name ONE real person who has the problem your app solves", "required": true, "placeholder": "Full name — e.g., Dr. Ramesh Kumar"},
        {"id": "icp_age", "type": "text", "label": "How old are they? Male/Female?", "required": true},
        {"id": "icp_job", "type": "text", "label": "What is their job or role?", "required": true},
        {"id": "icp_location", "type": "text", "label": "Where do they work? (exact location)", "required": true},
        {"id": "icp_income", "type": "select", "label": "Approximate monthly income?", "required": true, "options": ["Below Rs.15,000", "Rs.15,000-30,000", "Rs.30,000-75,000", "Rs.75,000-1,50,000", "Above Rs.1,50,000", "This is a business"]},
        {"id": "icp_problem_words", "type": "textarea", "label": "Describe their problem in THEIR words", "required": true, "placeholder": "Write like they are talking..."},
        {"id": "icp_frequency", "type": "select", "label": "How often do they face this problem?", "required": true, "options": ["Every day", "2-3 times per week", "Once a week", "Few times a month", "Rarely but very painful"]},
        {"id": "icp_cost", "type": "text", "label": "How much does this problem cost them monthly? (money + time)", "required": true},
        {"id": "icp_current", "type": "select", "label": "How do they handle it today?", "required": true, "options": ["No solution — they suffer", "Paper/notebook", "WhatsApp", "Excel/Sheets", "Pay someone", "Another app", "Ignore it"]},
        {"id": "icp_pitch", "type": "textarea", "label": "In 2 sentences, what do you say to make them interested?", "required": true},
        {"id": "icp_price", "type": "text", "label": "What price will you ask for?", "required": true},
        {"id": "icp_why_pay", "type": "textarea", "label": "Why would they say YES to that price?", "required": true},
        {"id": "icp_objection", "type": "textarea", "label": "What is the #1 reason they might say NO? How will you respond?", "required": true},
        {"id": "icp_market_size", "type": "text", "label": "How many more people like them within 50 km?", "required": true},
        {"id": "icp_where_find", "type": "textarea", "label": "Where do these people gather? Where would you find 10 in one day?", "required": true},
        {"id": "icp_plan", "type": "textarea", "label": "Your plan to reach the first 10 customers — names, places, dates", "required": true},
        {"id": "icp_talked", "type": "radio", "label": "Have you TALKED to this person?", "required": true, "options": ["Yes — in person", "Yes — phone/video", "No — but seen them struggle", "No — guessing"]},
        {"id": "icp_when", "type": "text", "label": "If not yet — what day and time will you talk to them?", "required": false}
      ]'::jsonb
    );
  END IF;
END $$;
