-- C4: HR Benefits Catalog + Enrollments
-- Foundation tables for benefits management.

-- =====================================================================================
-- hr_benefits_catalog
-- =====================================================================================

CREATE TABLE hr_benefits_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('health','insurance','retirement','education','transport','meal','other')),
  description text,
  cost_to_company numeric(12,2) DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  eligible_roles text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hr_benefits_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY hbc_read ON hr_benefits_catalog FOR SELECT TO authenticated USING (
  is_super_admin() OR institution_id IN (SELECT institution_id FROM user_hr_access WHERE user_id = auth.uid())
);

-- =====================================================================================
-- hr_benefits_enrollments
-- =====================================================================================

CREATE TABLE hr_benefits_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benefit_id uuid NOT NULL REFERENCES hr_benefits_catalog(id),
  staff_id uuid NOT NULL REFERENCES staff(id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  cancelled_at timestamptz,
  UNIQUE(benefit_id, staff_id)
);

ALTER TABLE hr_benefits_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY hbe_read ON hr_benefits_enrollments FOR SELECT TO authenticated USING (
  is_super_admin() OR staff_id IN (SELECT id FROM staff WHERE institution_id IN (SELECT institution_id FROM user_hr_access WHERE user_id = auth.uid()))
);
