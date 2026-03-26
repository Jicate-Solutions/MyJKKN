# CASE Graduation Tracker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Extend MyJKKN's VAC module with a 6-track (180h) graduation requirement system that auto-calculates each Learner's pace, enforces prerequisites, and alerts when they're behind.

**Architecture:** New `case_*` tables in Supabase extend the existing `vac_*` schema. A new `case-service.ts` service layer reads from both `case_*` and `vac_*` tables. New pages under `/vac/case/` for Learner dashboard, and `/vac/admin/case/` for coordinator/HOD/MD views. TanStack Query hooks for data fetching. Prerequisite enforcement via Postgres trigger.

**Tech Stack:** Next.js 16.1 (App Router), Supabase (SSR), TanStack Query v5, shadcn/ui + Radix, Tailwind, recharts for dashboards, Zod for validation, react-hook-form for forms.

**Supabase Staging:** `hhprjbgknupaplivtoib`

---

## Phase 1: Database Schema (Sequential — Foundation)

### Task 1.1: Create migration file for case_tracks table

**Files:**
- Create: `supabase/migrations/20260327000001_case_tracks.sql`

**Step 1: Write migration**

```sql
-- 20260327000001_case_tracks.sql
-- CASE Graduation Tracker: Track definitions

CREATE TABLE IF NOT EXISTS case_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_code TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  track_type TEXT NOT NULL CHECK (track_type IN ('ai_mastery', 'human_excellence')),
  sequence_order INT NOT NULL,
  prerequisite_track_id UUID REFERENCES case_tracks(id),
  duration_hours INT NOT NULL DEFAULT 30,
  description TEXT,
  completion_attendance_threshold NUMERIC DEFAULT 0.75,
  completion_grader_threshold NUMERIC DEFAULT 0.80,
  completion_project_required BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the 6 tracks
INSERT INTO case_tracks (track_code, track_name, track_type, sequence_order, description) VALUES
  ('AI-1', 'AI Fluency', 'ai_mastery', 1, 'Prompt engineering, no-code AI, Copilot basics, AI ethics. 30 hours.'),
  ('AI-2', 'MATLAB Domain Applications', 'ai_mastery', 2, 'Domain-specific computational solutions using MATLAB. 86 programme-specific courses. 30 hours.'),
  ('AI-3', 'Cross-Functional AI Innovation', 'ai_mastery', 3, 'Team projects across departments, multi-disciplinary AI prototypes. 30 hours.'),
  ('AI-4', 'AI Capstone + Industry Deployment', 'ai_mastery', 4, 'Production-ready solutions, Solutions Hub graduation, JICATE pipeline. 30 hours.'),
  ('H-1', 'Personal Branding & Communication', 'human_excellence', 1, 'Personal brand, digital presence, verbal/non-verbal communication. 30 hours.'),
  ('H-2', 'Leadership & Negotiation', 'human_excellence', 2, 'Advanced communication, conflict resolution, team leadership, public speaking. 30 hours.');

-- Set prerequisites: AI-1 -> AI-2 -> AI-3 -> AI-4, H-1 -> H-2
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-1') WHERE track_code = 'AI-2';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-2') WHERE track_code = 'AI-3';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'AI-3') WHERE track_code = 'AI-4';
UPDATE case_tracks SET prerequisite_track_id = (SELECT id FROM case_tracks WHERE track_code = 'H-1') WHERE track_code = 'H-2';

-- Enable RLS
ALTER TABLE case_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_tracks_read_all" ON case_tracks FOR SELECT USING (true);
CREATE POLICY "case_tracks_admin_write" ON case_tracks FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);

-- Index
CREATE INDEX idx_case_tracks_code ON case_tracks(track_code);
CREATE INDEX idx_case_tracks_type ON case_tracks(track_type);
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260327000001_case_tracks.sql | head -5`
Expected: First lines of the SQL file

### Task 1.2: Create migration for case_track_courses (links tracks to VAC courses)

**Files:**
- Create: `supabase/migrations/20260327000002_case_track_courses.sql`

**Step 1: Write migration**

```sql
-- 20260327000002_case_track_courses.sql
-- Links CASE tracks to specific VAC courses per programme

CREATE TABLE IF NOT EXISTS case_track_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(track_id, course_id)
);

ALTER TABLE case_track_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_track_courses_read_all" ON case_track_courses FOR SELECT USING (true);
CREATE POLICY "case_track_courses_admin_write" ON case_track_courses FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_track_courses_track ON case_track_courses(track_id);
CREATE INDEX idx_case_track_courses_course ON case_track_courses(course_id);
CREATE INDEX idx_case_track_courses_programme ON case_track_courses(programme_id);
```

### Task 1.3: Create migration for case_graduation_requirements

**Files:**
- Create: `supabase/migrations/20260327000003_case_graduation_requirements.sql`

**Step 1: Write migration**

```sql
-- 20260327000003_case_graduation_requirements.sql
-- Per-programme graduation configuration

CREATE TABLE IF NOT EXISTS case_graduation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  total_tracks_required INT DEFAULT 6,
  total_hours_required INT DEFAULT 180,
  programme_duration_semesters INT NOT NULL,
  enforcement_days_before_exam INT DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(programme_id, institution_id)
);

ALTER TABLE case_graduation_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_grad_req_read_all" ON case_graduation_requirements FOR SELECT USING (true);
CREATE POLICY "case_grad_req_admin_write" ON case_graduation_requirements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);
```

### Task 1.4: Create migration for case_learner_progress

**Files:**
- Create: `supabase/migrations/20260327000004_case_learner_progress.sql`

**Step 1: Write migration**

```sql
-- 20260327000004_case_learner_progress.sql
-- Tracks each Learner's overall CASE journey

CREATE TABLE IF NOT EXISTS case_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  admission_semester INT NOT NULL DEFAULT 1,
  current_semester INT NOT NULL DEFAULT 1,
  tracks_completed INT DEFAULT 0,
  total_hours_completed NUMERIC DEFAULT 0,
  graduation_ready BOOLEAN DEFAULT false,
  estimated_exam_date DATE,
  risk_level TEXT DEFAULT 'on_track' CHECK (risk_level IN ('on_track', 'at_risk', 'critical', 'overdue', 'completed')),
  last_alert_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE case_learner_progress ENABLE ROW LEVEL SECURITY;

-- Learners see their own progress
CREATE POLICY "case_progress_own" ON case_learner_progress FOR SELECT USING (auth.uid() = user_id);
-- Admin/faculty see all
CREATE POLICY "case_progress_admin_read" ON case_learner_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin', 'faculty', 'hod', 'staff'))
);
-- Admin can update
CREATE POLICY "case_progress_admin_write" ON case_learner_progress FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_progress_user ON case_learner_progress(user_id);
CREATE INDEX idx_case_progress_institution ON case_learner_progress(institution_id);
CREATE INDEX idx_case_progress_risk ON case_learner_progress(risk_level);
```

### Task 1.5: Create migration for case_track_enrollments + prerequisite trigger

**Files:**
- Create: `supabase/migrations/20260327000005_case_track_enrollments.sql`

**Step 1: Write migration**

```sql
-- 20260327000005_case_track_enrollments.sql
-- Per-track enrollment with triple gate completion

CREATE TABLE IF NOT EXISTS case_track_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  course_id UUID REFERENCES vac_courses(id),
  batch_id UUID, -- FK added after case_batches table created
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'incomplete', 'retry')),
  -- Triple gate
  attendance_percentage NUMERIC DEFAULT 0,
  grader_score_average NUMERIC DEFAULT 0,
  project_submitted BOOLEAN DEFAULT false,
  project_score NUMERIC,
  completion_gate_attendance BOOLEAN DEFAULT false,
  completion_gate_grader BOOLEAN DEFAULT false,
  completion_gate_project BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  previous_enrollment_id UUID REFERENCES case_track_enrollments(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Prerequisite enforcement trigger
CREATE OR REPLACE FUNCTION check_case_track_prerequisite()
RETURNS TRIGGER AS $$
DECLARE
  prereq_track_id UUID;
  prereq_completed BOOLEAN;
BEGIN
  SELECT prerequisite_track_id INTO prereq_track_id
  FROM case_tracks WHERE id = NEW.track_id;

  IF prereq_track_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM case_track_enrollments
    WHERE user_id = NEW.user_id
    AND track_id = prereq_track_id
    AND status = 'completed'
  ) INTO prereq_completed;

  IF NOT prereq_completed THEN
    RAISE EXCEPTION 'Prerequisite track not completed. Complete the previous track first.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_case_track_prerequisite
  BEFORE INSERT ON case_track_enrollments
  FOR EACH ROW EXECUTE FUNCTION check_case_track_prerequisite();

-- Auto-update learner progress when track completed
CREATE OR REPLACE FUNCTION update_case_learner_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE case_learner_progress
    SET
      tracks_completed = (
        SELECT COUNT(*) FROM case_track_enrollments
        WHERE user_id = NEW.user_id AND status = 'completed'
      ),
      total_hours_completed = (
        SELECT COALESCE(SUM(ct.duration_hours), 0)
        FROM case_track_enrollments cte
        JOIN case_tracks ct ON cte.track_id = ct.id
        WHERE cte.user_id = NEW.user_id AND cte.status = 'completed'
      ),
      graduation_ready = (
        SELECT COUNT(*) >= 6 FROM case_track_enrollments
        WHERE user_id = NEW.user_id AND status = 'completed'
      ),
      risk_level = CASE
        WHEN (SELECT COUNT(*) FROM case_track_enrollments WHERE user_id = NEW.user_id AND status = 'completed') >= 6
        THEN 'completed'
        ELSE risk_level
      END,
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_progress_on_completion
  AFTER UPDATE ON case_track_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_case_learner_progress();

ALTER TABLE case_track_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_enrollments_own" ON case_track_enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "case_enrollments_admin_read" ON case_track_enrollments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin', 'faculty', 'hod', 'staff'))
);
CREATE POLICY "case_enrollments_admin_write" ON case_track_enrollments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_enrollments_user ON case_track_enrollments(user_id);
CREATE INDEX idx_case_enrollments_track ON case_track_enrollments(track_id);
CREATE INDEX idx_case_enrollments_status ON case_track_enrollments(status);
CREATE INDEX idx_case_enrollments_batch ON case_track_enrollments(batch_id);
```

### Task 1.6: Create migration for case_batches

**Files:**
- Create: `supabase/migrations/20260327000006_case_batches.sql`

**Step 1: Write migration**

```sql
-- 20260327000006_case_batches.sql
-- Batch scheduling for CASE tracks

CREATE TABLE IF NOT EXISTS case_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  batch_code TEXT NOT NULL,
  delivery_format TEXT DEFAULT 'moderate' CHECK (delivery_format IN ('spread', 'moderate', 'intensive', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  schedule_json JSONB,
  max_capacity INT DEFAULT 60,
  current_enrollment INT DEFAULT 0,
  facilitator_id UUID,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  is_auto_suggested BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK from case_track_enrollments to case_batches
ALTER TABLE case_track_enrollments
  ADD CONSTRAINT fk_case_enrollment_batch
  FOREIGN KEY (batch_id) REFERENCES case_batches(id);

ALTER TABLE case_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_batches_read_all" ON case_batches FOR SELECT USING (true);
CREATE POLICY "case_batches_admin_write" ON case_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);

CREATE INDEX idx_case_batches_track ON case_batches(track_id);
CREATE INDEX idx_case_batches_institution ON case_batches(institution_id);
CREATE INDEX idx_case_batches_status ON case_batches(status);
```

### Task 1.7: Create migration for case_alerts + risk calculator view

**Files:**
- Create: `supabase/migrations/20260327000007_case_alerts_and_views.sql`

**Step 1: Write migration**

```sql
-- 20260327000007_case_alerts_and_views.sql
-- Alert log + risk calculator view

CREATE TABLE IF NOT EXISTS case_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'welcome', 'track_available', 'behind_schedule',
    '90_day', '60_day', '30_day', '25_day_hard', 'completed'
  )),
  message TEXT NOT NULL,
  sent_via TEXT[] DEFAULT ARRAY['push'],
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  coordinator_id UUID
);

ALTER TABLE case_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_alerts_own" ON case_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "case_alerts_admin" ON case_alerts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('administrator', 'super_admin'))
);

-- Risk calculator view
CREATE OR REPLACE VIEW case_risk_calculator AS
SELECT
  clp.user_id,
  clp.programme_id,
  clp.institution_id,
  clp.current_semester,
  clp.tracks_completed,
  clp.graduation_ready,
  clp.estimated_exam_date,
  cgr.programme_duration_semesters,
  cgr.programme_duration_semesters - clp.current_semester AS semesters_remaining,
  6 - clp.tracks_completed AS tracks_remaining,
  CEIL((6 - clp.tracks_completed)::NUMERIC / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)) AS tracks_per_semester_needed,
  clp.estimated_exam_date - CURRENT_DATE AS days_to_exam,
  CASE
    WHEN clp.tracks_completed >= 6 THEN 'completed'
    WHEN clp.estimated_exam_date IS NOT NULL
      AND clp.estimated_exam_date - CURRENT_DATE <= 25
      AND clp.tracks_completed < 6 THEN 'overdue'
    WHEN CEIL((6 - clp.tracks_completed)::NUMERIC / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)) > 3 THEN 'critical'
    WHEN CEIL((6 - clp.tracks_completed)::NUMERIC / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)) > 1 THEN 'at_risk'
    ELSE 'on_track'
  END AS calculated_risk_level
FROM case_learner_progress clp
JOIN case_graduation_requirements cgr
  ON clp.programme_id = cgr.programme_id
  AND clp.institution_id = cgr.institution_id
WHERE cgr.is_active = true;

-- Graduation readiness view (for MD dashboard)
CREATE OR REPLACE VIEW case_graduation_readiness AS
SELECT
  i.name AS institution_name,
  p.program_name,
  clp.current_semester,
  COUNT(*) AS total_learners,
  COUNT(*) FILTER (WHERE clp.tracks_completed >= 6) AS graduation_ready_count,
  COUNT(*) FILTER (WHERE clp.tracks_completed >= 6)::NUMERIC / GREATEST(COUNT(*), 1) * 100 AS readiness_percentage,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'at_risk') AS at_risk_count,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE rc.calculated_risk_level = 'overdue') AS overdue_count,
  ROUND(AVG(clp.tracks_completed), 1) AS avg_tracks_completed,
  ROUND(AVG(clp.total_hours_completed), 0) AS avg_hours_completed
FROM case_learner_progress clp
JOIN institutions i ON clp.institution_id = i.id
JOIN programs p ON clp.programme_id = p.id
LEFT JOIN case_risk_calculator rc ON clp.user_id = rc.user_id
GROUP BY i.name, p.program_name, clp.current_semester
ORDER BY readiness_percentage ASC;
```

### Task 1.8: Push all migrations to staging

**Step 1: Push migrations**

Run: `cd /Users/omm/PROJECTS/MyJKKN && ~/bin/supabase db push --linked`
Expected: All 7 migrations applied successfully

**Step 2: Verify tables exist**

Run: `curl -s "https://hhprjbgknupaplivtoib.supabase.co/rest/v1/" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | python3 -c "import sys,json; [print(k) for k in sorted(json.load(sys.stdin)['definitions'].keys()) if k.startswith('case_')]"`

Expected output:
```
case_alerts
case_batches
case_graduation_readiness
case_graduation_requirements
case_learner_progress
case_risk_calculator
case_track_courses
case_track_enrollments
case_tracks
```

**Step 3: Verify seed data**

Run: `curl -s "$SB_URL/rest/v1/case_tracks?select=track_code,track_name,track_type,sequence_order&order=track_type,sequence_order" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"`

Expected: 6 rows — AI-1 through AI-4 + H-1, H-2

**Step 4: Commit**

```bash
git add supabase/migrations/20260327*.sql
git commit -m "feat(case): add CASE graduation tracker schema — 6 tables + 2 views + prerequisite trigger"
```

---

## Phase 2: Types + Service Layer (Sequential)

### Task 2.1: Create CASE types

**Files:**
- Create: `types/case.ts`

**Step 1: Write types**

```typescript
// types/case.ts
// CASE Graduation Tracker types

export type CaseTrackType = 'ai_mastery' | 'human_excellence';
export type CaseTrackCode = 'AI-1' | 'AI-2' | 'AI-3' | 'AI-4' | 'H-1' | 'H-2';
export type CaseRiskLevel = 'on_track' | 'at_risk' | 'critical' | 'overdue' | 'completed';
export type CaseEnrollmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'incomplete' | 'retry';
export type CaseBatchStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type CaseDeliveryFormat = 'spread' | 'moderate' | 'intensive' | 'custom';
export type CaseAlertType = 'welcome' | 'track_available' | 'behind_schedule' | '90_day' | '60_day' | '30_day' | '25_day_hard' | 'completed';

export interface CaseTrack {
  id: string;
  track_code: CaseTrackCode;
  track_name: string;
  track_type: CaseTrackType;
  sequence_order: number;
  prerequisite_track_id: string | null;
  duration_hours: number;
  description: string | null;
  completion_attendance_threshold: number;
  completion_grader_threshold: number;
  completion_project_required: boolean;
  is_active: boolean;
}

export interface CaseLearnerProgress {
  id: string;
  user_id: string;
  programme_id: string;
  institution_id: string;
  admission_semester: number;
  current_semester: number;
  tracks_completed: number;
  total_hours_completed: number;
  graduation_ready: boolean;
  estimated_exam_date: string | null;
  risk_level: CaseRiskLevel;
}

export interface CaseTrackEnrollment {
  id: string;
  user_id: string;
  track_id: string;
  course_id: string | null;
  batch_id: string | null;
  status: CaseEnrollmentStatus;
  attendance_percentage: number;
  grader_score_average: number;
  project_submitted: boolean;
  project_score: number | null;
  completion_gate_attendance: boolean;
  completion_gate_grader: boolean;
  completion_gate_project: boolean;
  completed_at: string | null;
  retry_count: number;
  // Joined fields
  track?: CaseTrack;
}

export interface CaseBatch {
  id: string;
  track_id: string;
  institution_id: string;
  batch_code: string;
  delivery_format: CaseDeliveryFormat;
  start_date: string;
  end_date: string;
  schedule_json: Record<string, unknown> | null;
  max_capacity: number;
  current_enrollment: number;
  status: CaseBatchStatus;
  // Joined
  track?: CaseTrack;
}

export interface CaseRiskCalculation {
  user_id: string;
  programme_id: string;
  institution_id: string;
  current_semester: number;
  tracks_completed: number;
  programme_duration_semesters: number;
  semesters_remaining: number;
  tracks_remaining: number;
  tracks_per_semester_needed: number;
  days_to_exam: number | null;
  calculated_risk_level: CaseRiskLevel;
}

export interface CaseGraduationReadiness {
  institution_name: string;
  program_name: string;
  current_semester: number;
  total_learners: number;
  graduation_ready_count: number;
  readiness_percentage: number;
  at_risk_count: number;
  critical_count: number;
  overdue_count: number;
  avg_tracks_completed: number;
  avg_hours_completed: number;
}

// Dashboard composite type
export interface CaseLearnerDashboard {
  progress: CaseLearnerProgress;
  enrollments: CaseTrackEnrollment[];
  tracks: CaseTrack[];
  risk: CaseRiskCalculation | null;
  next_available_tracks: CaseTrack[];
}

// Coordinator at-risk view
export interface CaseAtRiskLearner {
  user_id: string;
  user_name: string;
  user_email: string;
  programme_name: string;
  institution_name: string;
  tracks_completed: number;
  tracks_remaining: number;
  semesters_remaining: number;
  days_to_exam: number | null;
  risk_level: CaseRiskLevel;
  tracks_per_semester_needed: number;
}
```

**Step 2: Commit**

```bash
git add types/case.ts
git commit -m "feat(case): add CASE graduation tracker types"
```

### Task 2.2: Create CASE service

**Files:**
- Create: `lib/services/case-service.ts`

**Step 1: Write service**

```typescript
// lib/services/case-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CaseTrack, CaseLearnerProgress, CaseTrackEnrollment,
  CaseBatch, CaseRiskCalculation, CaseGraduationReadiness,
  CaseLearnerDashboard, CaseAtRiskLearner
} from '@/types/case';

export class CaseService {
  private static getClient() {
    return createClientSupabaseClient();
  }

  // ---- TRACKS ----

  static async getTracks(): Promise<CaseTrack[]> {
    const { data, error } = await this.getClient()
      .from('case_tracks')
      .select('*')
      .eq('is_active', true)
      .order('track_type')
      .order('sequence_order');
    if (error) throw error;
    return data || [];
  }

  static async getTrackByCode(code: string): Promise<CaseTrack | null> {
    const { data, error } = await this.getClient()
      .from('case_tracks')
      .select('*')
      .eq('track_code', code)
      .single();
    if (error) return null;
    return data;
  }

  // ---- LEARNER PROGRESS ----

  static async getLearnerProgress(userId: string): Promise<CaseLearnerProgress | null> {
    const { data, error } = await this.getClient()
      .from('case_learner_progress')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return data;
  }

  static async getLearnerDashboard(userId: string): Promise<CaseLearnerDashboard> {
    const [tracks, progress, enrollments] = await Promise.all([
      this.getTracks(),
      this.getLearnerProgress(userId),
      this.getLearnerEnrollments(userId),
    ]);

    // Calculate which tracks are available next
    const completedTrackIds = new Set(
      enrollments.filter(e => e.status === 'completed').map(e => e.track_id)
    );
    const next_available_tracks = tracks.filter(t => {
      if (completedTrackIds.has(t.id)) return false;
      if (enrollments.some(e => e.track_id === t.id && e.status !== 'incomplete')) return false;
      if (t.prerequisite_track_id && !completedTrackIds.has(t.prerequisite_track_id)) return false;
      return true;
    });

    let risk: CaseRiskCalculation | null = null;
    if (progress) {
      const { data } = await this.getClient()
        .from('case_risk_calculator')
        .select('*')
        .eq('user_id', userId)
        .single();
      risk = data;
    }

    return {
      progress: progress || {
        id: '', user_id: userId, programme_id: '', institution_id: '',
        admission_semester: 1, current_semester: 1, tracks_completed: 0,
        total_hours_completed: 0, graduation_ready: false,
        estimated_exam_date: null, risk_level: 'on_track' as const
      },
      enrollments,
      tracks,
      risk,
      next_available_tracks,
    };
  }

  // ---- ENROLLMENTS ----

  static async getLearnerEnrollments(userId: string): Promise<CaseTrackEnrollment[]> {
    const { data, error } = await this.getClient()
      .from('case_track_enrollments')
      .select('*, track:case_tracks(*)')
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  static async enrollInTrack(userId: string, trackId: string, courseId?: string, batchId?: string) {
    const { data, error } = await this.getClient()
      .from('case_track_enrollments')
      .insert({
        user_id: userId,
        track_id: trackId,
        course_id: courseId || null,
        batch_id: batchId || null,
        status: 'enrolled',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ---- BATCHES ----

  static async getBatches(filters?: {
    trackId?: string;
    institutionId?: string;
    status?: string;
  }): Promise<CaseBatch[]> {
    let query = this.getClient()
      .from('case_batches')
      .select('*, track:case_tracks(*)');

    if (filters?.trackId) query = query.eq('track_id', filters.trackId);
    if (filters?.institutionId) query = query.eq('institution_id', filters.institutionId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query.order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async createBatch(batch: Partial<CaseBatch>) {
    const { data, error } = await this.getClient()
      .from('case_batches')
      .insert(batch)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ---- RISK & ADMIN ----

  static async getAtRiskLearners(institutionId?: string): Promise<CaseRiskCalculation[]> {
    let query = this.getClient()
      .from('case_risk_calculator')
      .select('*')
      .in('calculated_risk_level', ['at_risk', 'critical', 'overdue']);

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query.order('calculated_risk_level');
    if (error) throw error;
    return data || [];
  }

  static async getGraduationReadiness(): Promise<CaseGraduationReadiness[]> {
    const { data, error } = await this.getClient()
      .from('case_graduation_readiness')
      .select('*')
      .order('readiness_percentage', { ascending: true });
    if (error) throw error;
    return data || [];
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/case-service.ts
git commit -m "feat(case): add CASE service layer with tracks, enrollments, risk, and batch management"
```

### Task 2.3: Create CASE hooks

**Files:**
- Create: `hooks/case/use-case.ts`

**Step 1: Write hooks**

```typescript
// hooks/case/use-case.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaseService } from '@/lib/services/case-service';

const CASE_KEYS = {
  tracks: ['case', 'tracks'] as const,
  learnerDashboard: (userId: string) => ['case', 'dashboard', userId] as const,
  enrollments: (userId: string) => ['case', 'enrollments', userId] as const,
  batches: (filters?: Record<string, string>) => ['case', 'batches', filters] as const,
  atRisk: (institutionId?: string) => ['case', 'at-risk', institutionId] as const,
  graduationReadiness: ['case', 'graduation-readiness'] as const,
};

export function useCaseTracks() {
  return useQuery({
    queryKey: CASE_KEYS.tracks,
    queryFn: () => CaseService.getTracks(),
    staleTime: 1000 * 60 * 60, // tracks rarely change
  });
}

export function useCaseLearnerDashboard(userId: string) {
  return useQuery({
    queryKey: CASE_KEYS.learnerDashboard(userId),
    queryFn: () => CaseService.getLearnerDashboard(userId),
    enabled: !!userId,
  });
}

export function useCaseEnrollments(userId: string) {
  return useQuery({
    queryKey: CASE_KEYS.enrollments(userId),
    queryFn: () => CaseService.getLearnerEnrollments(userId),
    enabled: !!userId,
  });
}

export function useCaseBatches(filters?: { trackId?: string; institutionId?: string; status?: string }) {
  return useQuery({
    queryKey: CASE_KEYS.batches(filters as Record<string, string>),
    queryFn: () => CaseService.getBatches(filters),
  });
}

export function useCaseAtRisk(institutionId?: string) {
  return useQuery({
    queryKey: CASE_KEYS.atRisk(institutionId),
    queryFn: () => CaseService.getAtRiskLearners(institutionId),
  });
}

export function useCaseGraduationReadiness() {
  return useQuery({
    queryKey: CASE_KEYS.graduationReadiness,
    queryFn: () => CaseService.getGraduationReadiness(),
  });
}

export function useEnrollInTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, trackId, courseId, batchId }: {
      userId: string; trackId: string; courseId?: string; batchId?: string;
    }) => CaseService.enrollInTrack(userId, trackId, courseId, batchId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: CASE_KEYS.learnerDashboard(variables.userId) });
      queryClient.invalidateQueries({ queryKey: CASE_KEYS.enrollments(variables.userId) });
    },
  });
}
```

**Step 2: Commit**

```bash
git add hooks/case/use-case.ts
git commit -m "feat(case): add TanStack Query hooks for CASE graduation tracker"
```

---

## Phase 3: Learner Dashboard Page (Can be parallelized with Phase 4)

### Task 3.1: Create CASE Learner Dashboard page

**Files:**
- Create: `app/(routes)/vac/case/page.tsx`
- Create: `app/(routes)/vac/case/_components/track-card.tsx`
- Create: `app/(routes)/vac/case/_components/progress-overview.tsx`
- Create: `app/(routes)/vac/case/_components/risk-banner.tsx`

**Step 1: Create the page**

This page shows the Learner their 6-track progress, risk status, and next actions. Uses the `useCaseLearnerDashboard` hook.

Key sections:
1. Risk banner (red/yellow/green based on calculated risk)
2. Progress overview (X/6 tracks, X/180 hours, semester Y of Z)
3. 6 track cards (2 rows: AI tracks + Human tracks)
4. Each card shows: status, gates (attendance/grader/project), and "Enroll" or "Continue" button

**Step 2: Create track-card component**

Shows one track: name, status badge, 3 gate indicators (attendance %, grader %, project check), and action button.

**Step 3: Create progress-overview component**

Circular progress ring showing X/6 tracks + X/180 hours. Semester indicator. Recommended pace text.

**Step 4: Create risk-banner component**

Conditional banner:
- `on_track`: green — "You're on track. Keep going!"
- `at_risk`: yellow — "You need X tracks/semester to graduate on time."
- `critical`: orange — "X tracks remaining in Y semesters. Consider intensive batches."
- `overdue`: red — "Z days until final exam. X tracks incomplete. Contact CASE coordinator."

**Step 5: Commit**

```bash
git add app/(routes)/vac/case/
git commit -m "feat(case): add Learner CASE dashboard with track cards, progress ring, and risk banner"
```

---

## Phase 4: Admin Pages (Can be parallelized with Phase 3)

### Task 4.1: Create CASE Coordinator At-Risk Dashboard

**Files:**
- Create: `app/(routes)/vac/admin/case/page.tsx`
- Create: `app/(routes)/vac/admin/case/_components/at-risk-table.tsx`
- Create: `app/(routes)/vac/admin/case/_components/stats-cards.tsx`

**Step 1: Create admin page**

Shows: 4 stat cards (total learners, on-track, at-risk, critical/overdue) + filterable at-risk table.

**Step 2: Create at-risk-table**

TanStack Table with columns: Name, Programme, Institution, Semester, Tracks Done, Tracks Left, Pace Needed, Risk Level, Days to Exam.
Sortable by risk level (overdue first). Filterable by institution.

**Step 3: Commit**

```bash
git add app/(routes)/vac/admin/case/
git commit -m "feat(case): add CASE coordinator at-risk dashboard with filterable table"
```

### Task 4.2: Create Batch Manager page

**Files:**
- Create: `app/(routes)/vac/admin/case/batches/page.tsx`
- Create: `app/(routes)/vac/admin/case/batches/_components/batch-form.tsx`
- Create: `app/(routes)/vac/admin/case/batches/_components/batch-list.tsx`

**Step 1: Create batch management page**

List of batches (filterable by track, institution, status). "Create Batch" button opens form. Form fields: track, institution, delivery format, dates, capacity, facilitator.

**Step 2: Commit**

```bash
git add app/(routes)/vac/admin/case/batches/
git commit -m "feat(case): add batch management for CASE coordinator"
```

### Task 4.3: Create Graduation Readiness Dashboard (MD View)

**Files:**
- Create: `app/(routes)/vac/admin/case/readiness/page.tsx`
- Create: `app/(routes)/vac/admin/case/readiness/_components/readiness-chart.tsx`

**Step 1: Create readiness page**

Uses `useCaseGraduationReadiness()` hook. Shows:
- Bar chart: institution-wise readiness percentage (recharts)
- Table: per-programme readiness with at-risk counts
- Summary cards: total graduating, ready, not ready

**Step 2: Commit**

```bash
git add app/(routes)/vac/admin/case/readiness/
git commit -m "feat(case): add MD graduation readiness dashboard with charts"
```

---

## Phase 5: Integration + Route Protection

### Task 5.1: Add CASE routes to protected routes config

**Files:**
- Modify: `lib/auth/protected-routes.ts`

**Step 1: Add route protection**

Add `/vac/case` as accessible to all authenticated users (Learner view).
Add `/vac/admin/case` as accessible to administrator, super_admin, hod, staff roles.

### Task 5.2: Add CASE navigation to VAC sidebar/menu

**Files:**
- Modify: Whichever navigation component renders the VAC section menu

Add:
- "My CASE Progress" link to `/vac/case` (visible to students)
- "CASE Admin" link to `/vac/admin/case` (visible to admin/staff)

### Task 5.3: Link existing 86 MATLAB courses to AI-2 track

**Step 1: Write linking script**

```sql
-- Link all matlab-track vac_courses to the AI-2 case_track
INSERT INTO case_track_courses (track_id, course_id)
SELECT
  (SELECT id FROM case_tracks WHERE track_code = 'AI-2'),
  vc.id
FROM vac_courses vc
WHERE vc.track = 'matlab';
```

### Task 5.4: Final commit

```bash
git add -A
git commit -m "feat(case): integrate CASE graduation tracker — routes, navigation, MATLAB course linking"
```

---

## Summary: 5 Phases, 14 Tasks

| Phase | Tasks | Files Created | Depends On |
|-------|-------|--------------|------------|
| **1. Database** | 1.1-1.8 | 7 migration files | Nothing |
| **2. Types + Service** | 2.1-2.3 | 3 files (types, service, hooks) | Phase 1 |
| **3. Learner Dashboard** | 3.1 | 5 files (page + 4 components) | Phase 2 |
| **4. Admin Pages** | 4.1-4.3 | 8 files (3 pages + 5 components) | Phase 2 |
| **5. Integration** | 5.1-5.4 | 2 modified files + 1 SQL | Phase 3+4 |

**Phases 3 and 4 can run in parallel** (different route paths, no file overlap).

Total new files: ~24
Total commits: ~8
