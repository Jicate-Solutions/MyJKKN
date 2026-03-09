# CASE Module Spec — Centre for Advanced Skills & Employability

> **Status:** Spec Final (Post-Interview)
> **Date:** 2026-03-09
> **Approach:** Full rebrand VAC → CASE + extend with new capabilities
> **Effort:** ~5-7 days
> **NAAC Impact:** Unlocks Metrics 1.5, 5.5, 6.4, 7.6 (~55-70 points)

---

## Interview Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module identity | **Full rebrand** — routes `/case`, tables `case_*`, types `CASE*` | CASE is a centralized institutional initiative, not just "value added courses" |
| Course creation | **College admins can create too** | Domain-specific courses (Dental AI, Pharmacy Data) need local expertise |
| Approval workflow | **Central approval required** | Quality control + NSQF certification has legal weight |
| Review mechanism | **10-point structured checklist** | Better NAAC evidence, consistent quality across colleges |
| Reviewer role | **New `case_reviewer` role** | Only designated users (Robert, Narayan Rao) can approve, not all super_admins |
| Outcomes tracking | **Track in CASE module** | Gigs, earnings, placements — NAAC Metric 7.6 evidence |
| Certificates | **HTML preview + PDF download** | QR verification, JKKN branding, NSQF badge |
| Migration strategy | **3 sequential migrations in one PR** | Safety for staging — each step debuggable independently |

---

## 1. Context

### What Is CASE?

JKKN Centre for Advanced Skills and Employability (CASE) is a centralized unit that oversees two course tracks across all 6 JKKN institutions:

| Track | Type | Semesters | Focus |
|-------|------|-----------|-------|
| **AI Mastery** | Add-On | 4 | Prompt engineering → Domain AI → Cross-functional → Capstone |
| **Human Excellence** | Value-Add | 2 | Personal branding & communication → Leadership & negotiation |

**Team:** Robert Maria Vincent (lead), N Narayan Rao (guide), Subash, Krishnaveni, Vaishnavi, Nazar, Bala (Voice Culture)

**Framework Alignment:** NSQF + NHEQF + NCrF (national-level credit and skill certification)

### Why Rebrand VAC → CASE?

The existing VAC module has **32 files, 4 tables, 30 hooks, 34 service methods** with the core infrastructure already built. A full rebrand (not just UI label) ensures:

1. Codebase reflects institutional reality — CASE is the initiative name across JKKN
2. No confusion between legacy "value added courses" and the CASE framework
3. Clean permission namespace (`case.*` instead of `vac.*`)
4. Tables, routes, types all use consistent `case` naming

---

## 2. What Exists Today (Being Rebranded)

### Database Tables (vac_* → case_*)

| Current Table | New Table | Columns | Purpose |
|---|---|---|---|
| `vac_courses` | `case_courses` | id, code, name, description, institution (text), track, duration_hours, weeks, fee, is_active, created_at, updated_at | Course definitions |
| `vac_lessons` | `case_lessons` | id, course_id, week, hour, title, duration_minutes, prerequisites, toolboxes, 9 JSONB content fields, is_published, created_at, updated_at | Lesson content |
| `vac_learner_progress` | `case_learner_progress` | id, user_id, course_id, lesson_id, status, completed_at, score, created_at, updated_at | Per-lesson progress |
| `vac_enrollments` | `case_enrollments` | id, user_id, course_id, enrolled_at, status, payment_status, payment_amount, payment_date, payment_reference, completed_at, expires_at, notes, created_at, updated_at | Enrollment + payment |

### Views & Functions (being renamed)

| Current Name | New Name | Purpose |
|---|---|---|
| `vac_enrollments_with_details` | `case_enrollments_with_details` | Joins enrollments with courses + profiles |
| `is_enrolled_in_vac_course()` | `is_enrolled_in_case_course()` | Fast enrollment check |
| `get_vac_course_enrollment_stats()` | `get_case_course_enrollment_stats()` | Per-course stats |

### Frontend (16 route pages + 8 component files → move from /vac to /case)

**Student:** Browse courses, course detail, lesson viewer, my courses, progress, certificate
**Admin:** Dashboard, manage courses (CRUD), lessons (CRUD), enrollments, analytics, settings

### Source Files (being renamed)

| Current | New |
|---|---|
| `lib/services/vac-service.ts` | `lib/services/case-service.ts` |
| `hooks/vac/use-vac.ts` | `hooks/case/use-case.ts` |
| `types/vac.ts` | `types/case.ts` |
| `app/(routes)/vac/**` | `app/(routes)/case/**` |
| `app/api/vac/lessons/route.ts` | `app/api/case/lessons/route.ts` |

### Current Issues Being Fixed

| Issue | Fix |
|---|---|
| `institution` is text field, no RLS scoping | Proper `institution_id` UUID FK + `auth_institution_id()` RLS |
| No super_admin bypass in RLS | Standard MyJKKN super_admin pattern |
| Any authenticated user has full access | Institution-scoped policies |
| No approval workflow | Course status lifecycle with review |
| No NSQF/NHEQF/NCrF tracking | New columns on courses |
| No outcomes tracking | New outcomes table |
| No certification metadata | New certifications table |

---

## 3. New Capabilities

### 3.1 Course Approval Workflow

**Status lifecycle:**

```
  College Admin creates course
            │
            ▼
      ┌──────────┐
      │  DRAFT   │  ← Admin can edit freely
      └────┬─────┘
           │ Submit for Review
           ▼
      ┌──────────────┐
      │ PENDING      │  ← Visible to case_reviewers
      │ _REVIEW      │
      └────┬────┬────┘
           │    │
    Approve │    │ Reject (with notes)
           │    │
           ▼    ▼
      ┌────────┐  ┌──────────┐
      │APPROVED│  │ REJECTED │ → Admin sees feedback
      └────┬───┘  └────┬─────┘   → Edits & resubmits
           │           │            (returns to DRAFT)
           │           └─────────────────┐
           │ Admin publishes             │
           ▼                             │
      ┌──────────┐                       │
      │ PUBLISHED│  ← Students can see   │
      └────┬─────┘                       │
           │ Admin unpublishes (blocked   │
           │ if active enrollments exist) │
           ▼                             │
      ┌──────────┐                       │
      │ ARCHIVED │                       │
      └────┬─────┘                       │
           │ super_admin only            │
           ▼                             │
      (returns to DRAFT)                 │
```

**Archive rule:** Archiving is blocked if active enrollments exist (`status = 'active'`). All students must complete or be unenrolled first.

**Bulk Unenroll Action:** When archiving is blocked due to active enrollments, the UI shows:
- Error message: 'Cannot archive: X active enrollment(s) remain'
- Link: 'View Active Enrollments' → opens dialog/page listing enrolled students
- Action: 'Bulk Unenroll' button to unenroll selected/all ghost students
- After unenrolling, admin can proceed with archiving
Add service method: `bulkUnenrollStudents(courseId, studentIds[])`
Add hook: `useBulkUnenroll()`

**Unarchive:** Only `super_admin` can restore ARCHIVED → DRAFT.

**Force Approve (super_admin only):** When the normal review workflow is blocked (e.g., only 2 reviewers and one is the course creator), a `super_admin` can force-approve a course. This bypasses the `case_course_reviews` table and sets `review_status` directly to `approved` with audit fields (`force_approved_by`, `force_approved_at`, `force_approval_reason`). The force-approve action is logged and visible in the course history. It does NOT change the normal 2-reviewer workflow — it is an escape hatch only.

**New column on `case_courses`:**
```sql
review_status VARCHAR(20) DEFAULT 'draft'
  CHECK (review_status IN ('draft', 'pending_review', 'approved', 'rejected', 'published', 'archived'))
```

### 3.2 Structured 10-Point Review Checklist

New table `case_course_reviews` stores each review with per-criterion pass/fail:

| # | Criterion | Field Name | Check Logic |
|---|-----------|------------|-------------|
| 1 | NSQF Level (1-10) assigned | `nsqf_assigned` | `course.nsqf_level IS NOT NULL` |
| 2 | Learning Outcomes defined (min 3) | `outcomes_defined` | At least 1 lesson has ≥3 `learning_outcomes` entries |
| 3 | Faculty/Trainer assigned | `faculty_assigned` | `course.faculty_id IS NOT NULL` |
| 4 | Course Type tagged (Add-On/Value-Add) | `type_tagged` | `course.course_type IS NOT NULL` |
| 5 | Track aligned (AI Mastery/Human Excellence) | `track_aligned` | `course.track IN ('ai_mastery', 'human_excellence', 'domain_specific', 'matlab')` |
| 6 | Min 1 lesson with content | `has_content` | At least 1 published lesson exists |
| 7 | Assessment method defined | `assessment_defined` | At least 1 lesson has exercises or self_check |
| 8 | NCrF Credits assigned | `credits_assigned` | `course.ncrf_credits > 0` |
| 9 | Industry relevance justified | `industry_relevant` | Reviewer manually confirms (boolean) |
| 10 | Cross-institution applicability assessed | `cross_institution` | Reviewer manually confirms (boolean) |

**Auto-checkable (1-8):** System pre-fills these based on course data before reviewer opens the form.
**Manual (9-10):** Reviewer assesses and checks these themselves.

**Verdict:** All 10 must be green for approval. Reviewer can override and approve with notes if 8/10 pass (edge cases), but override is logged.

### 3.3 `case_reviewer` Role

New permission: `case.review` — grants ability to:
- See courses in `pending_review` status across ALL institutions
- Submit review with checklist verdict
- Approve or reject courses
- Override checklist (logged)

Assigned to specific users (Robert Maria Vincent, N Narayan Rao) via a new `custom_roles` row.

**Implementation:** Create a new row in `custom_roles` with `role_key = 'case_reviewer'` and the permissions listed in Section 7. Robert and Narayan Rao get assigned this role. The `case.review` permission is checked in both RLS policies and the application layer.

**Reviewer assignment** uses existing MyJKKN user management. Super_admin assigns the `case_reviewer` role via the Roles page. Technically: INSERT into `user_roles` with the reviewer's `user_id` and the `case_reviewer` `role_id`.

**Seed data example:**
```sql
-- Assign case_reviewer role to Robert and Narayan Rao
-- 1. Create the custom role
INSERT INTO custom_roles (role_key, name, permissions)
VALUES ('case_reviewer', 'CASE Reviewer', '["case.review", "case.courses.read"]');
-- 2. Assign to users via user_roles junction table
INSERT INTO user_roles (user_id, role_id) VALUES
  ((SELECT id FROM profiles WHERE email = 'robert@jkkn.ac.in'), (SELECT id FROM custom_roles WHERE role_key = 'case_reviewer')),
  ((SELECT id FROM profiles WHERE email = 'narayan.rao@jkkn.ac.in'), (SELECT id FROM custom_roles WHERE role_key = 'case_reviewer'));
```

### 3.4 Student Outcomes Tracking

New table `case_student_outcomes` tracks post-completion results:

| Field | Type | Purpose |
|---|---|---|
| `outcome_type` | `'freelance_gig' \| 'part_time_job' \| 'full_time_placement' \| 'project_delivered' \| 'certification_earned' \| 'competition_win' \| 'other'` | What the student achieved |
| `title` | varchar | Brief description (e.g., "Freelance AI data analysis for XYZ Corp") |
| `description` | text | Details |
| `earning_amount` | decimal | Revenue/salary (nullable — not all outcomes have earnings) |
| `earning_currency` | varchar | Default 'INR' |
| `employer_or_client` | varchar | Company/client name |
| `start_date` / `end_date` | timestamptz | When the gig/job ran |
| `evidence_url` | text | Proof (contract, payment screenshot, offer letter) |
| `evidence_type` | varchar(10) | `'url'` (default) or `'file'` — distinguishes external links from uploads |
| `verified_by` | UUID | Faculty/admin who verified the outcome |
| `verified_at` | timestamptz | When verified |

**Evidence:** Students can provide evidence via:
1. **Text URL** — Paste a link (LinkedIn, portfolio, Upwork, offer letter URL). Validated as HTTPS-only at application layer.
2. **File Upload** — Upload screenshots/PDFs to Supabase Storage (`case-outcomes/{institution_id}/{student_id}/{filename}`). Max 10MB per file.
The `evidence_url` column stores either the external URL or the Supabase Storage URL. A separate `evidence_type` column distinguishes them.
Add to `case_student_outcomes`: `evidence_type VARCHAR(10) DEFAULT 'url' CHECK (evidence_type IN ('url', 'file'))`

### 3.5 PDF Certificate with QR Verification

**Existing:** HTML certificate page (browser-printable)
**New:** "Download Certificate" button that generates branded PDF:

- JKKN institutional logo + CASE branding
- Student name, course title, completion date
- NSQF level badge (if applicable)
- NCrF credits earned
- QR code → links to `https://myjkkn.com/verify/JKKN-CASE-2026-A7K3B9F2-0042` (8-char random segment, ~4B combinations to prevent enumeration)
- Digital signature placeholder (CASE lead + institution head)

**Implementation:** Server-side PDF generation via `@react-pdf/renderer` (pure JS, no native dependencies, serverless-compatible). The HTML page remains for preview; PDF is generated on-demand via a React component template.

**Public verification route:** `/verify/[certNumber]` — unauthenticated page showing cert validity, student name (masked), course, NSQF level, issue date. **Rate limit:** 10 requests/min per IP via Next.js Edge Middleware with a sliding window counter (e.g., `@upstash/ratelimit` or in-memory Map). Returns HTTP 429 with `Retry-After` header when exceeded. Note: `next.config` headers alone cannot implement rate limiting.

---

## 4. Complete Database Schema

### 4.1 Renamed Tables (ALTER TABLE ... RENAME)

```sql
ALTER TABLE vac_courses RENAME TO case_courses;
ALTER TABLE vac_lessons RENAME TO case_lessons;
ALTER TABLE vac_learner_progress RENAME TO case_learner_progress;
ALTER TABLE vac_enrollments RENAME TO case_enrollments;
```

### 4.2 New/Modified Columns on `case_courses`

```sql
ALTER TABLE case_courses
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id),
  ADD COLUMN IF NOT EXISTS nsqf_level INTEGER CHECK (nsqf_level BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS nheqf_credits DECIMAL(4, 1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ncrf_credits DECIMAL(4, 1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semester INTEGER CHECK (semester BETWEEN 1 AND 8),
  ADD COLUMN IF NOT EXISTS course_type VARCHAR(20) DEFAULT 'add_on'
    CHECK (course_type IN ('add_on', 'value_add')),
  ADD COLUMN IF NOT EXISTS solution_id UUID REFERENCES sh_solutions(id),
  ADD COLUMN IF NOT EXISTS faculty_id UUID,
  ADD COLUMN IF NOT EXISTS max_students INTEGER,
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'rejected', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  -- Force-approve: super_admin bypasses review workflow (deadlock prevention)
  ADD COLUMN IF NOT EXISTS force_approved_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS force_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS force_approval_reason TEXT;
```

### 4.2b Add `institution_id` to Renamed Tables

`case_enrollments`, `case_learner_progress`, and `case_lessons` lack `institution_id`. The standard MyJKKN RLS pattern requires it on every table. Add the column and backfill from the parent course:

```sql
-- Add institution_id to tables that lack it
ALTER TABLE case_enrollments ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id);
ALTER TABLE case_learner_progress ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id);
ALTER TABLE case_lessons ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id);

-- Backfill from parent course
UPDATE case_enrollments e SET institution_id = c.institution_id FROM case_courses c WHERE e.course_id = c.id;
UPDATE case_learner_progress lp SET institution_id = c.institution_id FROM case_courses c WHERE lp.course_id = c.id;
UPDATE case_lessons l SET institution_id = c.institution_id FROM case_courses c WHERE l.course_id = c.id;
```

**Note:** After backfill is verified, add NOT NULL constraints:
```sql
ALTER TABLE case_enrollments ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE case_learner_progress ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE case_lessons ALTER COLUMN institution_id SET NOT NULL;
```

### 4.3 New Table: `case_course_reviews`

```sql
CREATE TABLE case_course_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES case_courses(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id),

  -- 10-point checklist (auto-filled where possible, reviewer confirms)
  nsqf_assigned BOOLEAN NOT NULL DEFAULT false,
  outcomes_defined BOOLEAN NOT NULL DEFAULT false,
  faculty_assigned BOOLEAN NOT NULL DEFAULT false,
  type_tagged BOOLEAN NOT NULL DEFAULT false,
  track_aligned BOOLEAN NOT NULL DEFAULT false,
  has_content BOOLEAN NOT NULL DEFAULT false,
  assessment_defined BOOLEAN NOT NULL DEFAULT false,
  credits_assigned BOOLEAN NOT NULL DEFAULT false,
  industry_relevant BOOLEAN NOT NULL DEFAULT false,      -- Manual
  cross_institution BOOLEAN NOT NULL DEFAULT false,      -- Manual

  -- Verdict
  verdict VARCHAR(20) NOT NULL CHECK (verdict IN ('approved', 'rejected', 'override_approved')),
  override_reason TEXT,                                  -- Required if override_approved
  reviewer_notes TEXT,
  rejection_reasons TEXT,                                -- Required if rejected

  -- Enforce required fields per verdict
  CONSTRAINT override_needs_reason CHECK (verdict != 'override_approved' OR override_reason IS NOT NULL),
  CONSTRAINT rejection_needs_reasons CHECK (verdict != 'rejected' OR rejection_reasons IS NOT NULL),
  -- NOTE: override_min_score (checklist_score >= 8 for override) CANNOT be a CHECK constraint
  -- because PostgreSQL does not allow CHECK constraints on GENERATED columns.
  -- Enforce at application layer: service method must validate checklist_score >= 8 before allowing override_approved.

  -- Score (out of 10)
  checklist_score INTEGER GENERATED ALWAYS AS (
    (nsqf_assigned::int + outcomes_defined::int + faculty_assigned::int +
     type_tagged::int + track_aligned::int + has_content::int +
     assessment_defined::int + credits_assigned::int +
     industry_relevant::int + cross_institution::int)
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_reviews_course ON case_course_reviews(course_id);
CREATE INDEX idx_case_reviews_reviewer ON case_course_reviews(reviewer_id);

ALTER TABLE case_course_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_reviews_select" ON case_course_reviews FOR SELECT
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR user_has_permission('case.review')
  );

CREATE POLICY "case_reviews_insert" ON case_course_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      OR user_has_permission('case.review')
    )
    -- Self-review guard: reviewer cannot review their own course
    AND NOT EXISTS (SELECT 1 FROM case_courses cc WHERE cc.id = course_id AND cc.created_by = auth.uid())
  );

COMMENT ON TABLE case_course_reviews IS 'Structured 10-point review checklist for CASE course approval';

-- NOTE: institution_id on reviews is the COURSE's institution_id (not the reviewer's).
-- The application layer must copy institution_id from case_courses when creating a review.
-- Consider adding a BEFORE INSERT trigger to enforce this:
-- NEW.institution_id := (SELECT institution_id FROM case_courses WHERE id = NEW.course_id);
```

### 4.4 New Table: `case_certifications`

```sql
CREATE SEQUENCE case_cert_seq START WITH 1;

CREATE TABLE case_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES case_enrollments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  course_id UUID NOT NULL REFERENCES case_courses(id),

  cert_type VARCHAR(20) NOT NULL CHECK (cert_type IN ('nsqf', 'industry', 'internal')),
  cert_number VARCHAR(100) UNIQUE,
  nsqf_level INTEGER CHECK (nsqf_level BETWEEN 1 AND 10),
  issuing_body VARCHAR(255),
  title VARCHAR(500) NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked')),

  -- Revocation audit trail (permanent — no un-revoke)
  revoked_by UUID REFERENCES profiles(id),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  CONSTRAINT revocation_needs_fields CHECK (
    status != 'revoked' OR (revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
  ),

  issued_at TIMESTAMPTZ DEFAULT NOW(),

  certificate_url TEXT,        -- Generated PDF in Supabase Storage
  verification_url TEXT,       -- Public verification link

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(enrollment_id, cert_type)
);

-- Auto-generate cert number using SEQUENCE (race-condition-free) + random segment (anti-enumeration)
CREATE OR REPLACE FUNCTION generate_case_cert_number()
RETURNS TRIGGER AS $$
DECLARE
  rand_seg TEXT;
BEGIN
  IF NEW.cert_number IS NULL THEN
    -- Generate 8-char random alphanumeric segment (~4 billion combinations) to prevent enumeration
    rand_seg := upper(substr(md5(random()::text), 1, 8));
    NEW.cert_number := 'JKKN-CASE-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
      rand_seg || '-' ||
      LPAD(nextval('case_cert_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_cert_auto_number
  BEFORE INSERT ON case_certifications
  FOR EACH ROW EXECUTE FUNCTION generate_case_cert_number();

ALTER TABLE case_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_certs_select" ON case_certifications FOR SELECT
  USING (
    student_id = auth.uid()
    OR institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_certs_insert" ON case_certifications FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_certs_update" ON case_certifications FOR UPDATE
  TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- NOTE: No DELETE policy — intentional. Certifications are revoked (status = 'revoked'), never deleted.
-- This provides a permanent audit trail. For error correction, use service-role client or direct DB access.

-- Public verification endpoint bypasses RLS via service-role client.
-- MUST use explicit column selection: .select('cert_number, title, status, nsqf_level, issued_at, revoked_at, revocation_reason, course_id')
-- MUST check status column and display accordingly:
--   active  → green "Valid Certificate"
--   revoked → red "This certificate has been revoked" + revocation date + reason
-- Student name (masked, e.g., "Rahul S.") joined from profiles via student_id — never expose full name.
```

### 4.5 New Table: `case_capstone_projects`

```sql
CREATE TABLE case_capstone_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES case_courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  title VARCHAR(500) NOT NULL,
  description TEXT,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),  -- DB allows 1-8; capstones are primarily Sem 3-4 but earlier semesters may have simplified projects

  solution_id UUID REFERENCES sh_solutions(id) ON DELETE SET NULL,
  industry_partner VARCHAR(255),
  mentor_id UUID REFERENCES profiles(id),

  status VARCHAR(20) DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'in_progress', 'submitted', 'evaluated', 'completed')),
  grade VARCHAR(10),
  evaluation_notes TEXT,
  presentation_url TEXT,
  report_url TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE case_capstone_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_capstones_select" ON case_capstone_projects FOR SELECT
  USING (
    student_id = auth.uid()
    OR institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_capstones_insert" ON case_capstone_projects FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_capstones_update" ON case_capstone_projects FOR UPDATE
  TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_capstones_delete" ON case_capstone_projects FOR DELETE
  TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### 4.6 New Table: `case_faculty`

```sql
CREATE TABLE case_faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  designation VARCHAR(100),
  specialization VARCHAR(255),

  role VARCHAR(50) DEFAULT 'trainer'
    CHECK (role IN ('lead', 'guide', 'trainer', 'ai_champion', 'coach', 'industry_expert')),
  track VARCHAR(50),
  is_active BOOLEAN DEFAULT true,

  bio TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE case_faculty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_faculty_select" ON case_faculty FOR SELECT
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_faculty_insert" ON case_faculty FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_faculty_update" ON case_faculty FOR UPDATE
  TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_faculty_delete" ON case_faculty FOR DELETE
  TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### 4.7 New Table: `case_student_outcomes`

```sql
CREATE TABLE case_student_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id),
  enrollment_id UUID REFERENCES case_enrollments(id),
  course_id UUID NOT NULL REFERENCES case_courses(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),

  outcome_type VARCHAR(30) NOT NULL
    CHECK (outcome_type IN (
      'freelance_gig', 'part_time_job', 'full_time_placement',
      'project_delivered', 'certification_earned', 'competition_win', 'other'
    )),
  title VARCHAR(500) NOT NULL,
  description TEXT,

  earning_amount DECIMAL(12, 2),
  earning_currency VARCHAR(3) DEFAULT 'INR',
  employer_or_client VARCHAR(255),

  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),

  evidence_url TEXT,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  is_verified BOOLEAN DEFAULT false,
  CONSTRAINT no_self_verification CHECK (verified_by IS NULL OR verified_by != student_id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_outcomes_student ON case_student_outcomes(student_id);
CREATE INDEX idx_case_outcomes_institution ON case_student_outcomes(institution_id);
CREATE INDEX idx_case_outcomes_type ON case_student_outcomes(outcome_type);
CREATE INDEX idx_case_outcomes_verified ON case_student_outcomes(is_verified);

-- Fraud prevention: students cannot set verification fields; editing resets verification
CREATE OR REPLACE FUNCTION enforce_outcome_verification()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: students cannot self-verify
  IF TG_OP = 'INSERT' AND NEW.student_id = auth.uid() THEN
    NEW.is_verified := false;
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  END IF;

  -- On UPDATE: if student modifies substantive fields, reset verification
  IF TG_OP = 'UPDATE' AND OLD.student_id = auth.uid() THEN
    IF NEW.outcome_type != OLD.outcome_type
       OR NEW.title != OLD.title
       OR NEW.earning_amount IS DISTINCT FROM OLD.earning_amount
       OR NEW.evidence_url IS DISTINCT FROM OLD.evidence_url THEN
      NEW.is_verified := false;
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_outcome_verification_guard
  BEFORE INSERT OR UPDATE ON case_student_outcomes
  FOR EACH ROW EXECUTE FUNCTION enforce_outcome_verification();

ALTER TABLE case_student_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_outcomes_select" ON case_student_outcomes FOR SELECT
  USING (
    student_id = auth.uid()
    OR institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Students can only INSERT their OWN outcomes (trigger enforces is_verified = false)
-- Staff/admin at same institution can insert on behalf of students
CREATE POLICY "case_outcomes_insert" ON case_student_outcomes FOR INSERT
  TO authenticated
  WITH CHECK (
    (student_id = auth.uid() AND institution_id = auth_institution_id())
    OR (institution_id = auth_institution_id()
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                    AND role IN ('admin', 'super_admin', 'administrator', 'staff', 'faculty')))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Students can only UPDATE their own unverified outcomes; staff/admin can update any
CREATE POLICY "case_outcomes_student_update" ON case_student_outcomes FOR UPDATE
  TO authenticated
  USING (
    (student_id = auth.uid() AND is_verified = false)
    OR institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "case_outcomes_delete" ON case_student_outcomes FOR DELETE
  TO authenticated
  USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

COMMENT ON TABLE case_student_outcomes IS 'Student outcomes from CASE courses — gigs, placements, earnings for NAAC Metric 7.6';
```

**URL Validation:** All URL fields (evidence_url, presentation_url, report_url) must be validated as HTTPS-only at the application layer. The service methods should reject non-HTTPS URLs.

### 4.8 `updated_at` Triggers for New Tables

All new tables with `updated_at` columns need auto-update triggers (uses existing `public.update_updated_at_column()` function):

```sql
CREATE TRIGGER update_case_certifications_updated_at
  BEFORE UPDATE ON case_certifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_case_capstone_projects_updated_at
  BEFORE UPDATE ON case_capstone_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_case_faculty_updated_at
  BEFORE UPDATE ON case_faculty
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_case_student_outcomes_updated_at
  BEFORE UPDATE ON case_student_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**Note:** `case_course_reviews` intentionally has no `updated_at` — reviews are append-only (immutable audit trail).

**Note:** The renamed tables (`case_courses`, `case_lessons`, `case_enrollments`, `case_learner_progress`) retain their existing `updated_at` triggers automatically after `ALTER TABLE ... RENAME` — PostgreSQL updates trigger target references. No new triggers needed for renamed tables.

### 4.9 Status Transition Enforcement Trigger

Enforces the state machine at the DB level — rejects any UPDATE that attempts an illegal status transition on `case_courses`.

```sql
CREATE OR REPLACE FUNCTION enforce_case_course_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed TEXT[];
BEGIN
  IF OLD.review_status = NEW.review_status THEN
    RETURN NEW;  -- no transition, allow
  END IF;

  CASE OLD.review_status
    WHEN 'draft'          THEN allowed := ARRAY['pending_review'];
    WHEN 'pending_review'  THEN allowed := ARRAY['approved', 'rejected'];
    WHEN 'rejected'       THEN allowed := ARRAY['draft'];                      -- admin edits & resubmits (returns to draft first)
    WHEN 'approved'       THEN allowed := ARRAY['published'];
    WHEN 'published'      THEN allowed := ARRAY['archived'];
    WHEN 'archived'       THEN allowed := ARRAY['draft'];                      -- unarchive (super_admin only — see note below)
    ELSE allowed := ARRAY[]::TEXT[];
  END CASE;

  IF NEW.review_status != ALL(allowed) THEN
    RAISE EXCEPTION 'Invalid review_status transition: % → %', OLD.review_status, NEW.review_status;
  END IF;

  -- Defense in depth: archived → draft requires super_admin
  IF OLD.review_status = 'archived' AND NEW.review_status = 'draft' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin') THEN
      RAISE EXCEPTION 'Only super_admin can unarchive courses';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_case_course_status
  BEFORE UPDATE OF review_status ON case_courses
  FOR EACH ROW EXECUTE FUNCTION enforce_case_course_status_transition();
```

**Note:** The trigger uses the 6-state model matching Section 3.1 diagram and the CHECK constraint: `draft → pending_review → approved/rejected → published → archived`. The `archived → draft` transition (unarchive) is additionally enforced at the DB level to require `super_admin` role (defense in depth — application layer also checks).

**Deploy in M3** alongside RLS policies (referenced in migration table below).

---

## 5. Migration Strategy (3 Sequential Migrations, 1 PR)

### Why 3 migrations, not 1:

- **Migration 1 fails** → only table renames rolled back, new tables untouched
- **Migration 2 fails** → table renames are safe, only new table creation affected
- **Migration 3 fails** → data/code changes isolated from schema changes

| Migration | Contents | Risk Level |
|-----------|----------|------------|
| **M1: Rename + Extend + RLS** | Rename 4 tables, rename 2 functions, rename 1 view, add new columns to case_courses, add institution_id to enrollments/lessons/progress, **migrate track values** (`UPDATE case_courses SET track = 'ai_mastery' WHERE track = 'ai';` — `'matlab'` stays unchanged, no other values exist), backfill institution_id, fix regulatory seed data (`20260223000005`) to reference `case_courses` with correct column names, **drop old VAC RLS policies and create new institution-scoped policies with super_admin bypass** (closes the permissive window). **Execution order within M1:** (1) Rename tables, (2) Drop old RLS policies, (3) Add new columns, (4) Backfill data, (5) Create new RLS policies, (6) Update seed data references. | Medium — table rename is atomic in PG |
| **M2: New Tables** | Create case_course_reviews, case_certifications, case_capstone_projects, case_faculty, case_student_outcomes. All indexes, triggers, RLS. Also: `ALTER TABLE case_courses ADD CONSTRAINT fk_case_courses_faculty FOREIGN KEY (faculty_id) REFERENCES case_faculty(id) ON DELETE SET NULL` (FK added here since case_faculty is created in M2) | Low — all new, no existing data affected |
| **M3: Permissions + Triggers** | Add `case_reviewer` custom_role row + case.* permissions, add status transition enforcement trigger. **Note:** Old VAC RLS policies are dropped and replaced in M1 (immediately after rename) to close the permissive window. | Low — permissions only |

**IMPORTANT:** M1 now includes the RLS drop+recreate (was previously in M3), so deploying M1 alone is safe — tables never have old permissive policies. The 3-migration split is for local debugging; deploy together in production as a single transaction for atomicity.

---

## 6. RLS Policies (All New Tables + Renamed Tables)

Every table follows the standard MyJKKN pattern:

```sql
-- SELECT: institution-scoped + super_admin bypass
USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
)

-- INSERT/UPDATE: same pattern with WITH CHECK
```

**Special cases:**
- `case_courses` SELECT also checks `review_status = 'published'` for non-admin users (students only see published courses)
- `case_enrollments` SELECT also allows `auth.uid() = user_id` (students see own enrollments regardless of institution)
- `case_learner_progress` INSERT/UPDATE requires `auth.uid() = user_id` (students can only manage own progress)
- `case_course_reviews` INSERT restricted to users with `case.review` permission (application-layer check)

---

## 7. Permissions

### New Permissions

```
case.view                    — Browse published courses
case.progress.view           — View own progress
case.admin.view              — Access admin dashboard
case.admin.create            — Create courses (goes to draft)
case.admin.edit              — Edit own institution's courses
case.admin.analytics         — View analytics
case.review                  — Review & approve/reject courses across ALL institutions
case.certifications.view     — View certifications
case.certifications.manage   — Issue/manage certifications
case.capstone.view           — View capstone projects
case.capstone.manage         — Manage capstone projects
case.faculty.view            — View faculty list
case.faculty.manage          — CRUD faculty
case.outcomes.view           — View student outcomes
case.outcomes.manage         — Verify student outcomes
```

### Role Mapping

| Role | Permissions |
|------|-------------|
| `super_admin` | All `case.*` |
| `case_reviewer` (new) | `case.review` + `case.admin.view` + `case.certifications.view` + `case.outcomes.view` |
| `administrator` / `institution_admin` | `case.admin.*` + `case.certifications.*` + `case.capstone.*` + `case.faculty.*` + `case.outcomes.*` |
| `faculty` | `case.view` + `case.progress.view` + `case.faculty.view` + `case.outcomes.view` |
| `student` | `case.view` + `case.progress.view` + `case.outcomes.manage` (own outcomes only) |

---

## 8. Frontend Changes

### 8.1 Route Rename: /vac → /case

All 16 existing route pages (+ 8 component files) move:

| Old Route | New Route |
|---|---|
| `app/(routes)/vac/page.tsx` | `app/(routes)/case/page.tsx` |
| `app/(routes)/vac/[courseId]/page.tsx` | `app/(routes)/case/[courseId]/page.tsx` |
| `app/(routes)/vac/[courseId]/[lessonId]/page.tsx` | `app/(routes)/case/[courseId]/[lessonId]/page.tsx` |
| `app/(routes)/vac/my-courses/page.tsx` | `app/(routes)/case/my-courses/page.tsx` |
| `app/(routes)/vac/progress/page.tsx` | `app/(routes)/case/progress/page.tsx` |
| `app/(routes)/vac/certificate/[enrollmentId]/page.tsx` | `app/(routes)/case/certificate/[enrollmentId]/page.tsx` |
| `app/(routes)/vac/admin/**` | `app/(routes)/case/admin/**` |
| `app/api/vac/lessons/route.ts` | `app/api/case/lessons/route.ts` |

### 8.2 New Admin Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Review Queue** | `/case/admin/reviews` | Courses pending review (case_reviewer only) |
| **Faculty Management** | `/case/admin/faculty` | CRUD for CASE faculty & AI Champions |
| **Certification Dashboard** | `/case/admin/certifications` | Issue certs, track NSQF levels |
| **Capstone Projects** | `/case/admin/capstones` | Link projects to Solutions Hub |
| **Student Outcomes** | `/case/admin/outcomes` | View & verify student outcomes |
| **NAAC Evidence Export** | `/case/admin/naac-export` | Generate NAAC metric reports |

### 8.3 New Student Pages

| Page | Route | Purpose |
|------|-------|---------|
| **My Outcomes** | `/case/my-outcomes` | Student logs gigs, earnings, placements |
| **Certificate Download** | `/case/certificate/[enrollmentId]` | HTML preview + PDF download button |

### 8.4 Public Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Certificate Verification** | `/verify/[certNumber]` | Public verification of certificate authenticity |

### 8.5 Sidebar Structure

```
CASE
├── All Courses          /case
├── My Courses           /case/my-courses
├── My Progress          /case/progress
├── My Outcomes          /case/my-outcomes          (NEW)
├── Course Admin         (expandable)
│   ├── Manage Courses   /case/admin/courses
│   ├── Create Course    /case/admin/courses/new
│   ├── Enrollments      /case/admin/enrollments
│   ├── Analytics        /case/admin/analytics
│   └── Settings         /case/admin/settings
├── Review Queue         /case/admin/reviews         (NEW - case_reviewer only)
├── Faculty              /case/admin/faculty          (NEW)
├── Certifications       /case/admin/certifications   (NEW)
├── Capstone Projects    /case/admin/capstones        (NEW)
├── Student Outcomes     /case/admin/outcomes          (NEW)
└── NAAC Export          /case/admin/naac-export       (NEW)
```

### 8.6 Course Form Updates

New fields added to `case-course-form.tsx`:

| Field | Component | Required | Notes |
|-------|-----------|----------|-------|
| Institution | `<InstitutionSelect>` (NEW — must be created; queries `institutions` table, auto-set for institution_admin, shows all for super_admin) | Yes | Replaces text input. Auto-set for institution_admin. |
| Course Type | `<Select>` Add-On / Value-Add | Yes | |
| Track | `<Select>` AI Mastery / Human Excellence / Domain Specific / MATLAB | Yes | |
| Semester | `<Select>` 1-8 | No | |
| NSQF Level | `<Select>` 1-10 with descriptors | No (checked at review) | |
| NHEQF Credits | `<Input type="number">` | No | |
| NCrF Credits | `<Input type="number">` | No (checked at review) | |
| Faculty | `<Select>` from case_faculty | No (checked at review) | |
| Max Students | `<Input type="number">` | No | |

**New action buttons on course detail (admin view):**
- **Submit for Review** (when draft) → changes to `pending_review`
- **Publish** (when approved) → changes to `published`
- **Archive** (when published) → changes to `archived`
- **Resubmit** (when rejected) → returns to `draft` for editing

### 8.7 Review UI (case_reviewer only)

**Review Queue page** (`/case/admin/reviews`):
- Table of courses in `pending_review` status across all institutions
- Click to open **Review Form** with:
  - 10-checkbox checklist (8 auto-filled from course data, 2 manual)
  - Reviewer notes (text area)
  - Reject reasons (text area, required if rejecting)
  - Verdict: Approve / Reject / Override Approve (requires reason)
- On submit: creates `case_course_reviews` record, updates `case_courses.review_status`

### 8.8 Sidebar Badge Counts (v1 Notification Strategy)

For v1, use sidebar badge counts only — no email/push/WebSocket:
- **Reviews (N)** — count of courses in `pending_review` status (visible to case_reviewers)
- **Pending Verification (N)** — count of unverified student outcomes (visible to faculty/admin)
- **My Certificates (N)** — count of new/unclaimed certificates (visible to students)

Badge counts refresh on page navigation via React Query `staleTime: 30_000` (30s).
Implementation: Add `useCASEBadgeCounts()` hook that returns `{ pendingReviews, pendingVerifications, newCertificates }`.

---

## 9. Service Layer

### 9.1 Renamed File

`lib/services/vac-service.ts` → `lib/services/case-service.ts`
Class: `VACService` → `CASEService`

### 9.2 Updated Methods (institution scoping + super_admin bypass)

All existing methods updated with `institutionId?: string` parameter (resolved in hook layer, not in service):
```typescript
// institutionId is passed from the hook layer (undefined for super_admin, UUID for others)
// usePermissions() is a React hook — it CANNOT be called inside static class methods
static async getCourses(institutionId?: string, filters?: CASECourseFilters) {
  let query = supabase.from('case_courses').select('*');
  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }
  // ...
}
```
**Note:** The hook layer resolves `institutionId` via `usePermissions()` before calling the service.

### 9.3 New Methods

```typescript
// Course Review
static async submitForReview(courseId: string): Promise<CASECourse>
static async submitReview(courseId: string, review: CASEReviewData): Promise<CASECourseReview>
static async getReviewQueue(reviewerId?: string): Promise<CASECourse[]>
static async getCourseReviews(courseId: string): Promise<CASECourseReview[]>
static async publishCourse(courseId: string): Promise<CASECourse>
static async archiveCourse(courseId: string): Promise<CASECourse>
static async resubmitCourse(courseId: string): Promise<CASECourse>       // When rejected: review_status → draft (admin edits, then submits for review again)
static async unarchiveCourse(courseId: string): Promise<CASECourse>      // Super-admin only; status → draft
static async forceApproveCourse(courseId: string, reason: string): Promise<CASECourse>  // Super-admin only; bypasses review, sets force_approved_* fields

// Auto-check review criteria
static async autoCheckCriteria(courseId: string): Promise<Partial<CASEReviewChecklist>>

// Certifications
static async issueCertification(enrollmentId: string, data: CASECertData): Promise<CASECertification>
static async getCertifications(filters?: CASECertFilters): Promise<CASECertification[]>
static async getCertificationByNumber(certNumber: string): Promise<CASECertification | null>
static async getStudentCertifications(studentId: string): Promise<CASECertification[]>
static async generateCertificatePDF(certId: string): Promise<Buffer>

// Capstone Projects
static async createCapstoneProject(data: CASECapstoneData): Promise<CASECapstoneProject>
static async getCapstoneProjects(filters?: CASECapstoneFilters): Promise<CASECapstoneProject[]>
static async linkToSolutionsHub(capstoneId: string, solutionId: string): Promise<void>

// Faculty
static async getFaculty(institutionId?: string): Promise<CASEFaculty[]>
static async createFaculty(data: CASEFacultyData): Promise<CASEFaculty>
static async updateFaculty(id: string, data: Partial<CASEFacultyData>): Promise<CASEFaculty>
static async getAIChampions(): Promise<CASEFaculty[]>

// Student Outcomes
static async logOutcome(data: CASEOutcomeData): Promise<CASEStudentOutcome>
static async getStudentOutcomes(studentId: string): Promise<CASEStudentOutcome[]>
static async getOutcomesByInstitution(institutionId: string): Promise<CASEStudentOutcome[]>
static async verifyOutcome(outcomeId: string, verifierId: string): Promise<CASEStudentOutcome>
static async getOutcomeStats(institutionId?: string): Promise<CASEOutcomeStats>

// NAAC Reporting
static async getNAACMetric1_5(institutionId: string): Promise<NAACMetricData>
static async getNAACMetric5_5(institutionId: string): Promise<NAACMetricData>
static async getNAACMetric6_4(institutionId: string): Promise<NAACMetricData>
static async getNAACMetric7_6(institutionId: string): Promise<NAACMetricData>

// Analytics (extended)
static async getReviewStats(): Promise<ReviewStats>
static async getNSQFDistribution(institutionId?: string): Promise<NSQFDistribution>
static async getOutcomesSummary(institutionId?: string): Promise<OutcomesSummary>
```

**Note:** The following parameter/return types are referenced above but not yet defined in Section 11.2. Define at implementation time based on the actual query shapes: `CASEReviewData`, `CASECertData`, `CASECertFilters`, `CASECapstoneData`, `CASECapstoneFilters`, `CASEFacultyData`, `CASEOutcomeData`, `CASEOutcomeStats`, `NAACMetricData`, `ReviewStats`, `NSQFDistribution`, `OutcomesSummary`, `CASECourseFilters`.

---

## 10. Hooks

### 10.1 Renamed File

`hooks/vac/use-vac.ts` → `hooks/case/use-case.ts`

**ALL 30 existing hooks** must be updated with the standard MyJKKN institution scoping pattern:
```typescript
const { isSuperAdmin } = usePermissions();
const institutionId = isSuperAdmin ? undefined : profile?.institution_id;
// ... in useQuery:
enabled: isSuperAdmin || !!institutionId,
```

### 10.2 New Hooks

```typescript
// Review workflow
useCASEReviewQueue()
useCASECourseReviews(courseId)
useSubmitForReview()
useSubmitReview()
usePublishCourse()
useArchiveCourse()
useUnarchiveCourse()
useForceApproveCourse()                // super_admin only — bypasses review
useAutoCheckCriteria(courseId)

// Certifications
useCASECertifications(filters?)
useStudentCertifications(studentId)
useIssueCertification()
useGenerateCertPDF(certId)

// Capstones
useCASECapstoneProjects(filters?)
useCreateCapstoneProject()
useLinkCapstoneToSolution()

// Faculty
useCASEFaculty(institutionId?)
useCreateCASEFaculty()
useUpdateCASEFaculty()

// Student Outcomes
useCASEStudentOutcomes(studentId?)
useLogOutcome()
useVerifyOutcome()
useOutcomeStats(institutionId?)

// NAAC
useNAACEvidence(metric, institutionId)
```

---

## 11. Types

### 11.1 Renamed File

`types/vac.ts` → `types/case.ts`

All type names change: `VAC*` → `CASE*` (e.g., `VACCourse` → `CASECourse`)

### 11.2 New Types

```typescript
// Review Status
export type CASEReviewStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';

// Course (updated)
export interface CASECourse {
  // ... all existing fields renamed ...
  institution_id: string | null;
  nsqf_level: number | null;
  nheqf_credits: number;
  ncrf_credits: number;
  semester: number | null;
  course_type: 'add_on' | 'value_add';
  solution_id: string | null;
  faculty_id: string | null;
  max_students: number | null;
  review_status: CASEReviewStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_by: string | null;
  force_approved_by: string | null;
  force_approved_at: string | null;
  force_approval_reason: string | null;
}

// Review Checklist
export interface CASEReviewChecklist {
  nsqf_assigned: boolean;
  outcomes_defined: boolean;
  faculty_assigned: boolean;
  type_tagged: boolean;
  track_aligned: boolean;
  has_content: boolean;
  assessment_defined: boolean;
  credits_assigned: boolean;
  industry_relevant: boolean;
  cross_institution: boolean;
}

export interface CASECourseReview extends CASEReviewChecklist {
  id: string;
  course_id: string;
  reviewer_id: string;
  institution_id: string;
  verdict: 'approved' | 'rejected' | 'override_approved';
  override_reason: string | null;
  reviewer_notes: string | null;
  rejection_reasons: string | null;
  checklist_score: number;
  created_at: string;
}

// Student Outcome
export type CASEOutcomeType = 'freelance_gig' | 'part_time_job' | 'full_time_placement' |
  'project_delivered' | 'certification_earned' | 'competition_win' | 'other';

export interface CASEStudentOutcome {
  id: string;
  student_id: string;
  enrollment_id: string | null;
  course_id: string;
  institution_id: string;
  outcome_type: CASEOutcomeType;
  title: string;
  description: string | null;
  earning_amount: number | null;
  earning_currency: string;
  employer_or_client: string | null;
  start_date: string | null;
  end_date: string | null;
  evidence_url: string | null;
  verified_by: string | null;
  verified_at: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Certification
export interface CASECertification {
  id: string;
  enrollment_id: string;
  student_id: string;
  institution_id: string;
  course_id: string;
  cert_type: 'nsqf' | 'industry' | 'internal';
  cert_number: string | null;
  nsqf_level: number | null;
  issuing_body: string | null;
  title: string;
  status: 'active' | 'revoked';
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  issued_at: string;
  certificate_url: string | null;
  verification_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Capstone Project
export interface CASECapstoneProject {
  id: string;
  course_id: string;
  student_id: string;
  institution_id: string;
  title: string;
  description: string | null;
  semester: number;
  solution_id: string | null;
  industry_partner: string | null;
  mentor_id: string | null;
  status: 'proposed' | 'approved' | 'in_progress' | 'submitted' | 'evaluated' | 'completed';
  grade: string | null;
  evaluation_notes: string | null;
  presentation_url: string | null;
  report_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Faculty
export interface CASEFaculty {
  id: string;
  user_id: string | null;
  institution_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  specialization: string | null;
  role: 'lead' | 'guide' | 'trainer' | 'ai_champion' | 'coach' | 'industry_expert';
  track: string | null;
  is_active: boolean;
  bio: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## 12. NAAC Evidence Mapping

| NAAC Metric | Points | CASE Data Source | Evidence Generated |
|---|---|---|---|
| **1.5 Skill Orientation (NCrF)** | 10 (Auto) | `case_courses.nsqf_level`, `.ncrf_credits` | List of NSQF-mapped courses with credit hours |
| **5.5 Catering to Diversity** | 15-25 | `case_courses WHERE course_type = 'add_on'` | Enrichment program count, enrollment numbers |
| **6.4 Value Education** | 15 | `case_courses WHERE track = 'human_excellence'` | Value-add courses, completion rates |
| **7.6 Employability Efforts** | 15-20 | `case_student_outcomes`, `case_certifications` | Gigs secured, earnings generated, certs issued |

**Total addressable:** ~55-70 NAAC points across all colleges.

---

## 13. Data Flow Diagram

```
  College Admin                    CASE Reviewer
       │                          (Robert/Narayan Rao)
       │ creates course                │
       ▼                               │ reviews
  ┌──────────┐   submit    ┌──────────────────┐
  │  DRAFT   │────────────▶│ PENDING REVIEW   │
  └──────────┘             └────────┬────┬────┘
       ▲                          │    │
       │                   approve│    │reject
       │                          ▼    ▼
       │                   ┌────────┐  ┌──────────┐
       │                   │APPROVED│  │ REJECTED │
       │                   └───┬────┘  └────┬─────┘
       │                       │            │
       └────── edit & resubmit ─────────────┘
                               │ publish
                               ▼
                          ┌──────────┐
                          │PUBLISHED │
                          └────┬─────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                    ▼          ▼          ▼
              ┌─────────┐ ┌────────┐ ┌──────────┐
              │ ENROLL  │ │PROGRESS│ │ OUTCOMES │
              │(payment)│ │(lesson)│ │(gigs/jobs│
              └────┬────┘ └────────┘ │ earnings)│
                   │                 └──────────┘
                   │ on completion
                   ▼
              ┌──────────────┐
              │CERTIFICATION │
              │ (NSQF/NCrF)  │──── PDF + QR
              └──────┬───────┘     Verification
                     │
                Sem 3-4 only
                     ▼
              ┌──────────────┐       ┌──────────────┐
              │  CAPSTONE    │──FK──▶│ SOLUTIONS    │
              │  PROJECTS    │       │ HUB          │
              └──────────────┘       └──────────────┘
                     │
                     │ all feeds
                     ▼
              ┌──────────────┐
              │ NAAC EVIDENCE│
              │ Metrics 1.5, │
              │ 5.5, 6.4, 7.6│
              └──────────────┘
```

---

## 14. Implementation Order

| Step | What | Effort |
|------|------|--------|
| 1 | **Migration M1:** Rename tables + add columns + backfill + track rename | 2 hours |
| 2 | **Migration M2:** Create 5 new tables with indexes, triggers, RLS | 2 hours |
| 3 | **Migration M3:** Drop old RLS, create new policies, add permissions | 1.5 hours |
| 4 | **File rename:** Move all /vac → /case routes, rename service/hooks/types | 2 hours |
| 5 | **Types:** Update all CASE types + add new types | 1.5 hours |
| 6 | **Service:** Update CASEService with institution scoping + new methods | 4 hours |
| 7 | **Hooks:** Update hooks with super_admin bypass + add new hooks | 3 hours |
| 8 | **Course form:** Add CASE fields + review status actions | 3 hours |
| 9 | **Review Queue page** | 4 hours |
| 10 | **Faculty management page** | 3 hours |
| 11 | **Certification dashboard + PDF generation** | 5 hours |
| 12 | **Student outcomes page** (admin + student views) | 4 hours |
| 13 | **Capstone projects page** | 3 hours |
| 14 | **Certificate verification public page** | 2 hours |
| 15 | **Analytics enhancements** | 3 hours |
| 16 | **NAAC export page** | 3 hours |
| 17 | **Sidebar + permissions update** | 1 hour |

**Total: ~47 hours (~6 days)**

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Table rename breaks FK references | Migration fails | PostgreSQL `ALTER TABLE RENAME` automatically updates FKs, indexes, triggers |
| Route rename breaks bookmarks/links | 404 for existing users | Add redirect middleware: `/vac/*` → `/case/*` |
| `institution_id` backfill has no mapping | Existing course(s) lose institution | Query institutions table first; map "Engineering" → UUID manually in migration |
| RLS policy swap causes brief lockout | 1-2 seconds of no access during migration | Use single transaction — old policies dropped and new created atomically |
| Review workflow slows course creation | College admins frustrated | Auto-check 8/10 criteria — manual review only on 2 items reduces reviewer burden |
| PDF generation adds server dependency | Build complexity | Use `@react-pdf/renderer` (pure JS, no native deps, serverless-compatible) — no Puppeteer needed |

---

## 16. What This Spec Does NOT Cover

- **Curriculum content** — Authored by CASE team, not built into platform
- **Scheduling/timetable** — Cross-institution scheduling is a separate module
- **NSQF formal registration** — Government NSQF registration is institutional process
- **GPU/cloud infrastructure** — Semester 1-2 uses browser-based AI tools
- **Email notifications** — Review status change notifications (can add later)
- **Mobile app** — CASE is web-only for now
- **Credit transfer workflow** — NCrF credit transfer between institutions

---

## 17. Database Table Summary

| Table | Status | Columns (approx) | Purpose |
|---|---|---|---|
| `case_courses` | Renamed + extended | ~25 | Course definitions with NSQF/review fields |
| `case_lessons` | Renamed | ~18 | Lesson content (JSONB) |
| `case_learner_progress` | Renamed | ~8 | Per-lesson student progress |
| `case_enrollments` | Renamed | ~14 | Enrollment + payment tracking |
| `case_course_reviews` | **NEW** | ~16 | 10-point review checklist |
| `case_certifications` | **NEW** | ~14 | NSQF/industry/internal certificates |
| `case_capstone_projects` | **NEW** | ~16 | Sem 3-4 projects linked to Solutions Hub |
| `case_faculty` | **NEW** | ~14 | Faculty, AI Champions, coaches |
| `case_student_outcomes` | **NEW** | ~16 | Gigs, earnings, placements |
| **Total** | 4 renamed + 5 new = **9 tables** | | |

---

## 18. UI Patterns (Standard MyJKKN Conventions)

All CASE module pages must follow existing MyJKKN patterns:

| Pattern | Implementation |
|---------|---------------|
| **Loading states** | shadcn `Skeleton` components matching the layout shape (not spinners). Every `useQuery`-powered page needs a loading skeleton. |
| **Error states** | `react-hot-toast` for transient errors (network, validation). Full-page error boundary for fatal errors (e.g. course not found → "Course not found" card with back link). |
| **Empty states** | Illustrated empty state with action CTA (e.g. "No courses yet — Create your first course"). Never show a blank table. |
| **Confirmation dialogs** | shadcn `AlertDialog` for destructive actions (archive, delete, submit for review). Include consequence text ("This will notify all enrolled students"). |
| **Pagination** | Server-side via `.range()` — 20 items/page default. Use existing `Pagination` component from `components/ui/pagination`. |
| **Search & filter** | Debounced search (300ms) + filter dropdowns. Filters reflected in URL search params for shareability. |
| **Mobile responsiveness** | All tables → card layout below `md` breakpoint. Bottom sheet for actions on mobile. Test at 375px width minimum. |
| **Toast messages** | Success: `toast.success('Course published')`. Error: `toast.error('Failed to save — please try again')`. Never use `alert()`. |
| **Optimistic updates** | Use `useMutation` `onMutate` for instant feedback on status changes (e.g. publish). Roll back via `onError` context. |

---

## 19. Page Wireframes

### 19.1 Reviewer Dashboard (`/case/reviews`)
**Layout:** Full-width page with stats bar + tabbed content area
**Stats Bar (top):**
- Total Reviews Completed (all time)
- Pending Reviews (action needed)
- Average Checklist Score (across all reviews)
- Approval Rate (%)

**Tabs:**
1. **Pending Queue** (default) — Table of courses awaiting review:
   | Course Name | Institution | Track | Submitted | Submitted By | Actions |
   Each row has 'Review' button → opens review form with 10-point checklist
2. **Review History** — Table of past reviews with verdict, score, date, course link
3. **My Workload** — Monthly chart of reviews completed, avg review time

**Empty State:** 'No courses pending review. Check back later.'
**Mobile:** Stats stack vertically, table becomes card list.

### 19.2 Unarchive Flow (`/case/courses` → archived tab)
**Access:** Super_admin only (button hidden for other roles)
**Location:** Courses list page has filter tabs: All | Published | Draft | Archived
**Archived Tab:**
- Shows archived courses in a table with Name, Institution, Archived Date, Archived By
- Each row has 'Restore to Draft' button (super_admin only)
- Clicking opens confirmation dialog:
  Title: 'Restore Course?'
  Body: 'This will move [Course Name] back to Draft status. It will need to go through the review process again before publishing.'
  Actions: [Cancel] [Restore to Draft]
- On confirm: sets review_status='draft', clears approved_at/approved_by, shows success toast

### 19.3 Capstone Student Flow (`/case/courses/[id]/capstone`)
**Student View:**
1. **Proposal Form:**
   - Title (required)
   - Description (textarea, required)
   - Industry Partner (optional text)
   - Link to Solutions Hub project (optional — searchable dropdown of sh_solutions)
   - Presentation URL (optional)
   - Report URL (optional)
   - Submit button → sets status='proposed'
2. **Progress Tracker (after approval):**
   - Status badge showing current stage (proposed → approved → in_progress → submitted → evaluated → completed)
   - Mentor info card (name, email, designation)
   - Timeline of status changes
   - Upload areas for presentation and report
3. **Evaluation View (read-only for student):**
   - Grade display
   - Evaluator notes
   - Completion certificate link (if completed)

**Admin/Faculty View:**
- List of all capstone proposals with filters (status, semester, institution)
- Approve/reject proposals
- Assign mentors (searchable dropdown of case_faculty)
- Evaluate: grade input + notes textarea + mark as completed

### 19.4 NAAC Export Page (`/case/admin/naac-export`)
**Layout:** Form-based page with preview and download
**Filters:**
- Academic Year (dropdown)
- Institution (dropdown — super_admin sees all, others see own)
- Metric (multi-select: 1.5, 5.5, 6.4, 7.6)
- Date Range (start/end date pickers)

**Preview Section:**
For each selected metric, show a card with:
- Metric number and name
- Key data points (e.g., Metric 1.5: X courses with NSQF levels, Y students enrolled)
- Supporting evidence list (course names, cert counts, outcome stats)

**Export Buttons:**
- 'Download PDF' — formatted report suitable for NAAC submission
- 'Download Excel' — raw data tables for further analysis
Both generated via @react-pdf/renderer (PDF) and xlsx library (Excel).

### 19.5 Faculty Management (`/case/admin/faculty`)
**Layout:** Table with action buttons
**Table Columns:**
| Name | Email | Designation | Specialization | Track | Role | Status | Actions |

**Actions per row:**
- Edit (pencil icon) → opens edit dialog
- Deactivate/Activate toggle
- View Courses (link to filtered course list)

**Add Faculty Button (top right):**
Opens form dialog:
- Search existing users (typeahead on profiles table by name/email)
- If user found: auto-fill name, email from profile, link user_id
- If not found: manual entry (name, email, phone — no user_id link)
- Designation, Specialization, Track (dropdown), Role (dropdown), Bio, Photo URL
- Save → INSERT into case_faculty

**Empty State:** 'No faculty members added yet. Click + Add Faculty to get started.'

### 19.6 Certificate Download Page (`/case/my-certificates`)
**Student View:**
**Layout:** Grid of certificate cards (2 per row on desktop, 1 on mobile)
**Each Card:**
- Course name (title)
- Certificate type badge (NSQF / Industry / Internal)
- NSQF Level badge (if applicable)
- Issue date
- Status indicator (green 'Active' or red 'Revoked')
- Actions: [Preview] [Download PDF]

**Preview:** Opens modal with HTML certificate rendering (full-width, printable)
**Download:** Triggers PDF generation via API route, downloads file

**Multi-cert:** If student has multiple certs for same course (e.g., NSQF + Industry), they appear as separate cards grouped under the course name.

**Empty State:** 'No certificates earned yet. Complete a CASE course to receive your certificate.'
**Revoked State:** Card shows red banner 'This certificate has been revoked' with revocation date. Preview still available (with watermark 'REVOKED'). Download disabled.

---

*Spec finalized 2026-03-09 · Based on FST analysis + structured interview (6 questions, all answered)*
*Prior analysis: [JKKN CASE Relevance in AI World](obsidian://open?vault=Claude%20Setup&file=Capture%2FJKKNKB%2F26-03-08-8.43pm-JKKN-CASE-Relevance-AI-World.md)*
