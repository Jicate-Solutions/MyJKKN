-- Migration: Department Management System
-- Adds: Nomination workflow, eligibility criteria engine, capabilities population, PG department re-evaluation
-- Date: 2026-02-22

-- ============================================================
-- 1. DEPARTMENT NOMINATIONS TABLE
-- Tracks nominations of academic departments to become solution departments
-- ============================================================
CREATE TABLE IF NOT EXISTS sh_department_nominations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  nominated_by UUID REFERENCES auth.users(id),
  nomination_reason TEXT NOT NULL,
  suggested_capabilities TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_pending_nomination UNIQUE (department_id, status)
);

-- Partial unique index: only one pending nomination per department at a time
DROP INDEX IF EXISTS idx_unique_pending_nomination;
CREATE UNIQUE INDEX idx_unique_pending_nomination
  ON sh_department_nominations (department_id)
  WHERE status = 'pending';

CREATE INDEX idx_nominations_status ON sh_department_nominations(status);
CREATE INDEX idx_nominations_institution ON sh_department_nominations(institution_id);
CREATE INDEX idx_nominations_department ON sh_department_nominations(department_id);

-- RLS
ALTER TABLE sh_department_nominations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view nominations"
  ON sh_department_nominations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create nominations"
  ON sh_department_nominations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update nominations"
  ON sh_department_nominations FOR UPDATE
  TO authenticated
  USING (true);

-- Auto-update timestamp
CREATE TRIGGER set_nominations_updated_at
  BEFORE UPDATE ON sh_department_nominations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. ELIGIBILITY CRITERIA TABLE
-- Configurable rules for what makes a department eligible
-- ============================================================
CREATE TABLE IF NOT EXISTS sh_department_eligibility_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_name TEXT NOT NULL UNIQUE,
  criteria_type TEXT NOT NULL CHECK (criteria_type IN ('inclusion', 'exclusion')),
  description TEXT NOT NULL,
  rule_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_criteria_active ON sh_department_eligibility_criteria(is_active);
CREATE INDEX idx_criteria_type ON sh_department_eligibility_criteria(criteria_type);

-- RLS
ALTER TABLE sh_department_eligibility_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view criteria"
  ON sh_department_eligibility_criteria FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage criteria"
  ON sh_department_eligibility_criteria FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update criteria"
  ON sh_department_eligibility_criteria FOR UPDATE
  TO authenticated
  USING (true);

-- Auto-update timestamp
CREATE TRIGGER set_criteria_updated_at
  BEFORE UPDATE ON sh_department_eligibility_criteria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. SEED ELIGIBILITY CRITERIA
-- Documents the selection rules (previously implicit, now explicit)
-- ============================================================
INSERT INTO sh_department_eligibility_criteria (criteria_name, criteria_type, description, rule_config, priority) VALUES
  -- Exclusion rules
  ('aided_institution', 'exclusion',
   'Government-aided institutions cannot participate in commercial activities due to funding restrictions',
   '{"institution_name_contains": "Aided", "institution_code_prefix": "CAS-AD"}', 10),

  ('education_college', 'exclusion',
   'College of Education focuses on pedagogy training, not domain-specific commercial solutions',
   '{"institution_name_contains": "Education", "institution_code_prefix": "COE"}', 20),

  ('legacy_institution', 'exclusion',
   'Legacy engineering college (pre-CET) is excluded - use CET departments instead',
   '{"institution_name": "JKKN College of Engineering", "department_codes": ["CSE", "ECE", "MBA", "MATH", "PHM"]}', 30),

  ('test_institution', 'exclusion',
   'Test institutions are excluded from solution department tracking',
   '{"institution_name_contains": "Testing"}', 40),

  ('umbrella_department', 'exclusion',
   'Administrative umbrella departments (UG/Diploma wrappers) are not teaching-specific departments',
   '{"department_code_suffix": "-1", "department_name_contains": ["(UG)", "(Diploma)"], "note": "These aggregate departments like Dept of Allied (UG), Dept of Nursing (UG)"}', 50),

  ('service_department', 'exclusion',
   'Service/foundation departments (Science & Humanities) support other programs but do not produce domain-specific solutions',
   '{"department_names": ["Science and Humanities"], "department_codes": ["CET-1"]}', 60),

  -- Inclusion rules
  ('self_financing', 'inclusion',
   'Self-financing institutions can engage in commercial activities without government restrictions',
   '{"institution_types": ["self-financing", "private"], "note": "All JKKN institutions except CAS-AD are self-financing"}', 10),

  ('teaching_department', 'inclusion',
   'Must be an active teaching department with domain expertise (not administrative)',
   '{"requires": "is_active = true", "has_faculty": true, "has_students": true}', 20),

  ('pg_departments_eligible', 'inclusion',
   'PG departments from self-financing institutions are eligible - they often have stronger research capabilities than UG',
   '{"note": "Re-evaluated Feb 2026. PG departments were previously excluded but MBA (CET-6) was already included, making exclusion inconsistent. PG departments typically produce more applied research."}', 30)
ON CONFLICT (criteria_name) DO NOTHING;

-- ============================================================
-- 4. POPULATE CAPABILITIES FOR ALL 44 EXISTING DEPARTMENTS
-- Domain-specific capabilities based on department expertise
-- ============================================================

-- AHS: Allied Health Sciences (9 departments)
UPDATE sh_solution_departments SET capabilities = ARRAY['emergency-care-training', 'first-aid-solutions', 'trauma-management', 'emergency-protocols']
WHERE id = 'abfd9200-4472-4696-8c70-5901909cfe8c'; -- Accident and Emergency Care Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['cardiac-diagnostics', 'ecg-monitoring', 'cardiac-rehabilitation', 'heart-health-programs']
WHERE id = '8d2558af-6315-4089-8192-bbb8fe086977'; -- Cardiac Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['icu-management', 'critical-care-training', 'ventilator-technology', 'life-support-systems']
WHERE id = '93d45a9d-473d-432f-afbd-7a514f6e6a57'; -- Critical Care Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['dialysis-services', 'renal-care', 'nephrology-technology', 'water-treatment-systems']
WHERE id = '9a21225c-3746-4124-98df-88aa90e78f14'; -- Dialysis Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['health-informatics', 'medical-coding', 'hospital-information-systems', 'health-records-digitization']
WHERE id = 'e211bf58-bfb2-4135-8068-c80bc9f3e752'; -- Medical Record Science

UPDATE sh_solution_departments SET capabilities = ARRAY['surgical-technology', 'anesthesia-management', 'ot-equipment-training', 'surgical-protocols']
WHERE id = '726c743c-854d-4af5-99d3-32cc94c53791'; -- Operation Theatre and Anesthesia Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['clinical-services', 'primary-care', 'patient-assessment', 'health-screening']
WHERE id = 'e2775485-4c28-41fd-923e-258379d92d23'; -- Physician Assistant

UPDATE sh_solution_departments SET capabilities = ARRAY['medical-imaging', 'radiology-services', 'diagnostic-imaging', 'imaging-technology']
WHERE id = '29b881d0-e5f5-46bd-836e-48cd140e0aa6'; -- Radiography and Imaging Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['respiratory-care', 'pulmonary-rehabilitation', 'ventilation-management', 'breathing-therapy']
WHERE id = '559ae9a1-e9fa-4d18-a43d-58c3e0ce4aa4'; -- Respiratory Therapy

-- CAS-SF: Arts and Science Self-Financing (9 departments)
UPDATE sh_solution_departments SET capabilities = ARRAY['financial-consulting', 'accounting-services', 'business-analytics', 'tax-advisory']
WHERE id = 'c1dd61a7-7599-494a-8c20-0f8a73d5a427'; -- Commerce

UPDATE sh_solution_departments SET capabilities = ARRAY['software-development', 'web-applications', 'data-analytics', 'ai-ml', 'mobile-apps']
WHERE id = '667dc4a6-ce0f-40a9-b40e-b387b107252f'; -- Computer Science

UPDATE sh_solution_departments SET capabilities = ARRAY['content-creation', 'technical-writing', 'communication-training', 'translation-services']
WHERE id = '3a369f67-9dd9-4068-9b6e-96ad109e77c5'; -- English

UPDATE sh_solution_departments SET capabilities = ARRAY['data-analytics', 'statistical-modeling', 'quantitative-research', 'mathematical-consulting']
WHERE id = 'aa79d7e2-b823-4a92-a77c-f63485985e48'; -- Mathematics

UPDATE sh_solution_departments SET capabilities = ARRAY['microbial-testing', 'food-safety-analysis', 'environmental-testing', 'lab-services']
WHERE id = '6feeaab1-0c55-42d9-92c8-19a2aa8a1e86'; -- Microbiology

UPDATE sh_solution_departments SET capabilities = ARRAY['instrumentation', 'quality-testing', 'material-analysis', 'physics-lab-services']
WHERE id = 'cd62e69f-c671-4147-b222-01aa41a16a78'; -- Physics

UPDATE sh_solution_departments SET capabilities = ARRAY['tamil-content-creation', 'cultural-documentation', 'language-training', 'literary-services']
WHERE id = '6f7a29c9-d1e9-4083-802d-ee3499944f10'; -- Tamil

UPDATE sh_solution_departments SET capabilities = ARRAY['fashion-design', 'textile-testing', 'garment-technology', 'pattern-making']
WHERE id = '7790cb54-d9e8-45a6-9473-b9cf4312be62'; -- Textile Fashion Designing

UPDATE sh_solution_departments SET capabilities = ARRAY['graphic-design', 'multimedia-production', 'branding', 'video-production', 'ui-ux-design']
WHERE id = '88f032d6-8bdb-44fc-9ab0-119bca62a05a'; -- Visual Communication

-- CET: Engineering and Technology (6 departments)
UPDATE sh_solution_departments SET capabilities = ARRAY['software-engineering', 'iot-solutions', 'cloud-computing', 'ai-ml', 'full-stack-development']
WHERE id = 'cf04ffb2-0f3a-4fe7-8af1-679e578e382a'; -- Computer Science and Engineering

UPDATE sh_solution_departments SET capabilities = ARRAY['electrical-systems', 'power-electronics', 'automation', 'energy-solutions', 'plc-programming']
WHERE id = '718fe00f-0139-477c-a2e1-3cc2709207ba'; -- Electrical and Electronics Engineering

UPDATE sh_solution_departments SET capabilities = ARRAY['embedded-systems', 'communication-systems', 'vlsi-design', 'signal-processing', 'iot-hardware']
WHERE id = 'b5ed86c8-045c-4c7a-b409-9300d31da765'; -- Electronics and Communication Engineering

UPDATE sh_solution_departments SET capabilities = ARRAY['it-services', 'cybersecurity', 'network-solutions', 'web-development', 'database-management']
WHERE id = '311bb294-9839-45e9-a10f-8d5b5eb21921'; -- Information Technology

UPDATE sh_solution_departments SET capabilities = ARRAY['business-consulting', 'management-training', 'startup-mentoring', 'market-research', 'project-management']
WHERE id = '88ff81d6-299c-4e4c-a72b-d4ff7e322f88'; -- MBA (PG)

UPDATE sh_solution_departments SET capabilities = ARRAY['cad-cam', 'manufacturing-solutions', 'product-design', '3d-printing', 'industrial-automation']
WHERE id = '19e508c7-ef75-4e84-a2a8-4ac0a083d5f8'; -- Mechanical Engineering

-- CNR: Nursing and Research (5 departments)
UPDATE sh_solution_departments SET capabilities = ARRAY['pediatric-care-training', 'child-health-programs', 'neonatal-care', 'immunization-drives']
WHERE id = '1a8aeb82-dcfa-4175-b384-18aa31855969'; -- Child Health Nursing

UPDATE sh_solution_departments SET capabilities = ARRAY['community-health-programs', 'public-health-consulting', 'health-education', 'epidemiology']
WHERE id = 'fbdf09e5-295d-4ab9-964f-ccadf4a2cb62'; -- Community Health Nursing

UPDATE sh_solution_departments SET capabilities = ARRAY['surgical-nursing-training', 'clinical-skills-training', 'hospital-consulting', 'patient-care-protocols']
WHERE id = '9c35850b-399f-45ca-be9f-11afd3a77e1f'; -- Medical Surgical Nursing

UPDATE sh_solution_departments SET capabilities = ARRAY['mental-health-programs', 'counseling-training', 'psychiatric-care', 'wellness-programs']
WHERE id = '8b313765-1cb2-4548-b93e-0ce8c43d05c1'; -- Mental Health Nursing

UPDATE sh_solution_departments SET capabilities = ARRAY['maternal-care-training', 'reproductive-health', 'midwifery-programs', 'womens-health']
WHERE id = 'bc398a45-5777-4f72-a1a2-5cf2e670bc14'; -- Obstetrics and Gynaecological Nursing

-- COP: Pharmacy (6 departments)
UPDATE sh_solution_departments SET capabilities = ARRAY['drug-analysis', 'quality-control', 'analytical-testing', 'method-validation']
WHERE id = 'd8848fc4-9893-4468-9f9c-4e611c4c386b'; -- Pharmaceutical Analysis

UPDATE sh_solution_departments SET capabilities = ARRAY['drug-synthesis', 'chemical-research', 'formulation-development', 'medicinal-chemistry']
WHERE id = 'a31bf206-12d4-4663-a9dd-420ea506f8c7'; -- Pharmaceutical Chemistry

UPDATE sh_solution_departments SET capabilities = ARRAY['drug-formulation', 'drug-delivery-systems', 'pharmaceutical-manufacturing', 'dosage-form-design']
WHERE id = 'a8235f3a-c189-452c-8bbb-38a216a3e410'; -- Pharmaceutics

UPDATE sh_solution_departments SET capabilities = ARRAY['herbal-research', 'natural-products', 'phytochemistry', 'traditional-medicine']
WHERE id = 'fe1e68a5-2bf1-4220-aaaa-087d6fad4235'; -- Pharmacognosy

UPDATE sh_solution_departments SET capabilities = ARRAY['drug-testing', 'pharmacovigilance', 'clinical-trials', 'toxicology']
WHERE id = 'bf9019c3-97a0-4ec8-9609-3a2c7beb360b'; -- Pharmacology

UPDATE sh_solution_departments SET capabilities = ARRAY['clinical-pharmacy', 'patient-counseling', 'medication-management', 'hospital-pharmacy']
WHERE id = '8acc5963-5919-47e9-aeb0-5633ef365f7b'; -- Pharmacy Practice

-- DCH: Dental College and Hospital (9 departments)
UPDATE sh_solution_departments SET capabilities = ARRAY['root-canal-training', 'restorative-dentistry', 'dental-materials-research', 'endodontic-procedures']
WHERE id = 'ce4ef384-d229-4021-b03e-d9aa4a48defe'; -- Conservative and Endodontics

UPDATE sh_solution_departments SET capabilities = ARRAY['surgical-training', 'implantology', 'trauma-management', 'maxillofacial-prosthetics']
WHERE id = '9542f413-887a-41d0-9ab5-7480191f45e5'; -- Oral and Maxillofacial Surgery

UPDATE sh_solution_departments SET capabilities = ARRAY['diagnostic-radiology', 'oral-pathology-detection', 'dental-imaging', 'teleradiology']
WHERE id = '9a7c1850-8618-4905-8ca6-3b67cc0f40f4'; -- Oral Medicine and Radiology

UPDATE sh_solution_departments SET capabilities = ARRAY['histopathology', 'dental-research', 'diagnostic-services', 'forensic-odontology']
WHERE id = '159a35e0-38a5-4198-879d-3e12abb9c1b0'; -- Oral Pathology and Dental Anatomy

UPDATE sh_solution_departments SET capabilities = ARRAY['orthodontic-solutions', 'dental-appliances', 'craniofacial-research', 'aligner-technology']
WHERE id = '8f1a0848-ff48-49c2-9aca-e974f04cf293'; -- Orthodontics

UPDATE sh_solution_departments SET capabilities = ARRAY['pediatric-dentistry', 'child-dental-care', 'preventive-programs', 'school-dental-health']
WHERE id = 'bf85304d-095f-4752-8cfc-7a2e5094e948'; -- Pediatrics

UPDATE sh_solution_departments SET capabilities = ARRAY['gum-care-training', 'periodontal-research', 'implant-training', 'laser-dentistry']
WHERE id = 'fb5d058e-ffe4-4d20-86de-8e00a9ee9db5'; -- Periodontics

UPDATE sh_solution_departments SET capabilities = ARRAY['dental-prosthetics', 'crown-bridge-technology', 'digital-dentistry', 'cad-cam-dentistry']
WHERE id = '4afc46e4-10a0-4efd-8bbc-a93654c6035c'; -- Prosthodontics

UPDATE sh_solution_departments SET capabilities = ARRAY['dental-public-health', 'community-programs', 'oral-health-education', 'preventive-dentistry']
WHERE id = '8a057a28-9100-43ac-9e34-d56943b92a01'; -- Public Health Dentistry

-- ============================================================
-- 5. ADD PG DEPARTMENTS (Re-evaluated: previously excluded, now included)
-- Rationale: MBA (CET-6) was already included, making PG exclusion inconsistent.
-- PG departments from self-financing institutions have strong research capabilities.
-- ============================================================

INSERT INTO sh_solution_departments (department_id, institution_id, status, capabilities, activated_at, metadata)
VALUES
  -- Computer Science (PG) - CAS-SF
  ('03210674-cdbd-421b-9130-5d9a31a84ccb', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active',
   ARRAY['advanced-software-development', 'ai-ml-research', 'data-science', 'research-computing', 'thesis-consulting'],
   NOW(), '{"added_reason": "PG re-evaluation Feb 2026", "pg_department": true}'::jsonb),

  -- Mathematics (PG) - CAS-SF
  ('2e57929e-49a0-4ad3-b274-1b3647a9e3b4', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active',
   ARRAY['mathematical-modeling', 'data-science', 'operations-research', 'statistical-consulting', 'actuarial-services'],
   NOW(), '{"added_reason": "PG re-evaluation Feb 2026", "pg_department": true}'::jsonb),

  -- Commerce (PG) - CAS-SF
  ('76921a44-e5ba-4348-af8a-18e12140d1ac', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active',
   ARRAY['business-research', 'financial-analysis', 'management-consulting', 'market-research', 'strategic-planning'],
   NOW(), '{"added_reason": "PG re-evaluation Feb 2026", "pg_department": true}'::jsonb),

  -- English (PG) - CAS-SF
  ('66e67f61-782f-494b-9755-952a6c1c1cac', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active',
   ARRAY['academic-writing', 'research-communication', 'linguistic-consulting', 'editing-services', 'curriculum-design'],
   NOW(), '{"added_reason": "PG re-evaluation Feb 2026", "pg_department": true}'::jsonb),

  -- Computer Science and Engineering (PG) - CET
  ('c68b5f2a-a86a-4c78-ba69-2a1d8c7cc957', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active',
   ARRAY['advanced-engineering', 'research-projects', 'ai-ml-systems', 'cloud-architecture', 'thesis-mentoring'],
   NOW(), '{"added_reason": "PG re-evaluation Feb 2026", "pg_department": true}'::jsonb)
ON CONFLICT (department_id) DO NOTHING;

-- Add status history for new PG departments
INSERT INTO sh_department_status_history (solution_department_id, previous_status, new_status, reason)
SELECT sd.id, 'pending_approval', 'active', 'PG department re-evaluation Feb 2026: Self-financing PG departments eligible for solution work'
FROM sh_solution_departments sd
JOIN departments d ON sd.department_id = d.id
WHERE d.department_code IN ('CAS-SF-10', 'CAS-SF-11', 'CAS-SF-12', 'CAS-SF-9', 'CET-7');

-- ============================================================
-- 6. FUNCTION: Check department eligibility
-- Returns eligible departments that aren't yet solution departments
-- ============================================================
CREATE OR REPLACE FUNCTION get_eligible_departments()
RETURNS TABLE (
  department_id UUID,
  department_name VARCHAR,
  department_code VARCHAR,
  institution_id UUID,
  institution_name VARCHAR,
  is_eligible BOOLEAN,
  exclusion_reasons TEXT[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS department_id,
    d.department_name,
    d.department_code,
    d.institution_id,
    i.name AS institution_name,
    CASE
      WHEN d.is_active = false THEN false
      WHEN d.is_active = false THEN false
      WHEN i.name ILIKE '%Aided%' THEN false
      WHEN i.name ILIKE '%Education%' THEN false
      WHEN i.name ILIKE '%Testing%' THEN false
      WHEN i.name = 'JKKN College of Engineering' THEN false
      WHEN d.department_name ILIKE '%(UG)%' OR d.department_name ILIKE '%(Diploma)%' THEN false
      WHEN d.department_name = 'Science and Humanities' THEN false
      ELSE true
    END AS is_eligible,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN d.is_active = false THEN 'Department is inactive' END,
      CASE WHEN i.name ILIKE '%Aided%' THEN 'Aided institution: government funding restrictions' END,
      CASE WHEN i.name ILIKE '%Education%' THEN 'Education college: pedagogy focus, not domain expertise' END,
      CASE WHEN i.name ILIKE '%Testing%' THEN 'Test institution' END,
      CASE WHEN i.name = 'JKKN College of Engineering' THEN 'Legacy institution: use CET departments instead' END,
      CASE WHEN d.department_name ILIKE '%(UG)%' OR d.department_name ILIKE '%(Diploma)%' THEN 'Umbrella/administrative department' END,
      CASE WHEN d.department_name = 'Science and Humanities' THEN 'Service/foundation department' END
    ], NULL) AS exclusion_reasons
  FROM departments d
  JOIN institutions i ON d.institution_id = i.id
  WHERE d.id NOT IN (SELECT sd.department_id FROM sh_solution_departments sd)
  ORDER BY i.name, d.department_name;
END;
$$;

-- ============================================================
-- 7. FUNCTION: Approve nomination and create solution department
-- ============================================================
CREATE OR REPLACE FUNCTION approve_department_nomination(
  p_nomination_id UUID,
  p_reviewer_id UUID,
  p_review_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_nomination RECORD;
  v_solution_dept_id UUID;
BEGIN
  -- Get the nomination
  SELECT * INTO v_nomination FROM sh_department_nominations WHERE id = p_nomination_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nomination not found or not in pending status';
  END IF;

  -- Check if department is already a solution department
  IF EXISTS (SELECT 1 FROM sh_solution_departments WHERE department_id = v_nomination.department_id) THEN
    RAISE EXCEPTION 'Department is already a solution department';
  END IF;

  -- Create the solution department
  INSERT INTO sh_solution_departments (department_id, institution_id, status, capabilities, nominated_by, approved_by, activated_at)
  VALUES (v_nomination.department_id, v_nomination.institution_id, 'active', v_nomination.suggested_capabilities, v_nomination.nominated_by, p_reviewer_id, NOW())
  RETURNING id INTO v_solution_dept_id;

  -- Update the nomination
  UPDATE sh_department_nominations
  SET status = 'approved', reviewed_by = p_reviewer_id, reviewed_at = NOW(), review_notes = p_review_notes
  WHERE id = p_nomination_id;

  -- Add status history
  INSERT INTO sh_department_status_history (solution_department_id, previous_status, new_status, reason, changed_by)
  VALUES (v_solution_dept_id, 'pending_approval', 'active', COALESCE(p_review_notes, 'Nomination approved'), p_reviewer_id);

  RETURN v_solution_dept_id;
END;
$$;
