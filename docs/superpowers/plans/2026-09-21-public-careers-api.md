# Public Careers API Implementation Plan

> **For agentic team members:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let external candidates on jkkn.ac.in (and its subdomains) list public MyJKKN jobs and apply without a login, landing in HR's existing application-screening pipeline.

**Architecture:** Three unauthenticated, service-role route handlers under `/api/public/careers/` backed by small pure units (whitelist mapper, form validator, CORS, rate limiter) and one service. Applications are written to the existing `hr_job_applications` table with `source='external_website'`; after the response, HR screeners of that college get an in-app notification and the applicant gets a Resend email.

**Tech Stack:** Next.js App Router route handlers (`runtime='nodejs'`), Supabase (service role), Google Drive (existing `uploadResumeToJobFolder`), Resend (`@/lib/resend`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-public-careers-api-design.md`

## Global Constraints

- Visible job = `is_public = true AND status = 'open' AND (closes_at IS NULL OR closes_at > now())`.
- Allowed origins: `https://jkkn.ac.in`, `https://<one-label>.jkkn.ac.in`, plus comma-separated `PUBLIC_CAREERS_EXTRA_ORIGINS`.
- Resume: ≤ 2 MB (2 * 1024 * 1024), PDF / DOC / DOCX verified by magic bytes AND matching extension.
- Rate limit: 5 applications per IP per hour (in-memory).
- Honeypot field name: `website`. Consent field: `consent` must equal `"true"`.
- Public responses never include `hr_organization_id`, `created_by`, `positions_filled`, raw `requirements`, `status`, `is_public`, or salary when `display_salary = false`.
- Notification recipients come ONLY from RPC `hr_recruitment_application_recipient_ids` (never ad-hoc `profiles.role` queries).
- Work on branch `feat/public-careers-api` in a worktree — never commit on `main` (it auto-pushes).
- Tests: `npx vitest run <path>` (never pipe vitest output; the suite baseline on main is already red — judge only the files you touched).
- Typecheck: scoped tsconfig (full-project `tsc` OOMs). See Task 9.

## File Map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260922000646_hr_job_applications_public_careers.sql` | create | columns, partial unique index, recipient RPC |
| `lib/services/hr/public-careers/public-job.ts` | create | `PublicJob`, `PUBLIC_JOB_SELECT`, `isJobVisible`, `toPublicJob` |
| `lib/services/hr/public-careers/apply-validation.ts` | create | `sniffResumeType`, `parseApplyForm` |
| `lib/services/hr/public-careers/cors.ts` | create | `resolveAllowedOrigin`, `corsHeaders`, `withCors`, `preflight` |
| `lib/services/hr/public-careers/rate-limit.ts` | create | `createRateLimiter`, `clientIp` |
| `lib/services/hr/public-careers/public-careers-service.ts` | create | `listPublicJobs`, `getPublicJob`, `submitExternalApplication` |
| `lib/hr/recruitment/application-confirmation-email.ts` | create | pure email template |
| `lib/services/hr/public-careers/after-apply.ts` | create | `notifyHrOfApplication`, `sendApplicantConfirmation` |
| `app/api/public/careers/jobs/route.ts` | create | GET list + OPTIONS |
| `app/api/public/careers/jobs/[id]/route.ts` | create | GET one + OPTIONS |
| `app/api/public/careers/jobs/[id]/apply/route.ts` | create | POST apply + OPTIONS |
| `proxy.ts` | modify | add `/api/public/careers/` public prefix |
| `types/hr-recruitment.ts` | modify | new application fields, `source_split` rename |
| `lib/services/hr/recruitment-service.ts` | modify | promote source mapping, analytics split by `source` |
| `app/(routes)/hr/recruitment/jobs/[id]/_components/applications-section.tsx` | modify | "Website" badge |
| `app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-candidates-tab.tsx` | modify | "Website" badge |
| `app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-analytics-tab.tsx` | modify | split labels |
| job create/edit forms + `jobs/page.tsx` | modify | relabel toggle "Show on website (jkkn.ac.in)" |
| `docs/public-careers-api.md` | create | contract for the website team |
| `__tests__/hr/public-careers/*.test.ts` | create | unit + route tests |

---

### Task 0: Worktree

- [ ] **Step 1:** Use superpowers:using-git-worktrees to create worktree `.claude/worktrees/public-careers` on new branch `feat/public-careers-api` from `origin/main` (`git fetch origin` first).
- [ ] **Step 2:** Copy the spec and this plan into the worktree (they are uncommitted on main): `docs/superpowers/specs/2026-09-21-public-careers-api-design.md`, `docs/superpowers/plans/2026-09-21-public-careers-api.md`. Commit them: `git commit -m "docs(hr/careers): public careers API spec + plan"`.
- [ ] **Step 3:** Baseline: `npx vitest run __tests__/hr/recruitment-application-notes.test.ts` → PASS.

---

### Task 1: Migration — columns, partial unique index, recipient RPC

**Files:** Create `supabase/migrations/20260922000646_hr_job_applications_public_careers.sql`

**Interfaces — Produces:** columns `source`, `consent_at`, `utm_source`, `confirmation_email_sent_at`, `confirmation_email_error` on `hr_job_applications`; RPC `hr_recruitment_application_recipient_ids(p_institution_id uuid) RETURNS SETOF uuid` (service_role only).

- [ ] **Step 1: Write the migration**

```sql
-- Public careers API (2026-09-21) — external candidates apply from jkkn.ac.in.
-- Spec: docs/superpowers/specs/2026-09-21-public-careers-api-design.md
--
-- 1) Where an application came from. Default 'internal' back-fills the 57
--    existing rows (all keyed in through the logged-in /hr/recruitment/submit).
ALTER TABLE public.hr_job_applications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal'
    CHECK (source IN ('internal', 'external_website')),
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_email_error text;

-- 2) One website application per (job, email). PARTIAL: prod already holds an
--    internal duplicate (job 91f6a2b9…, same email twice) and HR must stay able
--    to re-key internally. The route pre-checks across ALL sources; this index
--    only closes the concurrent-submit race between website rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_job_applications_external_job_email
  ON public.hr_job_applications (job_id, lower(email))
  WHERE source = 'external_website';

-- 3) Who is told about a new website application. Recipients must be a SUBSET of
--    the users who can read the row (hr_job_applications SELECT policy:
--    hr.recruitment.view AND role_has_institution_access). We narrow to
--    hr.recruitment.EDIT — the people who actually screen (1-2 per college) —
--    and exclude super admins (they would get every college's applicants).
--    Role membership from user_roles AND the legacy profiles.role path, exactly
--    as user_has_permission(uuid,text) resolves it.
--    Institution access mirrors role_has_institution_access(): home institution,
--    CAS sibling (non-blank counselling_code), active user_institution_access.
--    Empty set (e.g. Main Office has no scoped screener) → fall back to holders
--    whose role has institution_scope = 'all'.
CREATE OR REPLACE FUNCTION public.hr_recruitment_application_recipient_ids(p_institution_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH editor_roles AS (
    SELECT p.id AS user_id, p.institution_id, cr.institution_scope
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE (cr.permissions->>'hr.recruitment.edit')::boolean = true
    UNION
    SELECT p.id, p.institution_id, cr.institution_scope
    FROM profiles p
    JOIN custom_roles cr ON cr.role_key = p.role
    WHERE (cr.permissions->>'hr.recruitment.edit')::boolean = true
  ),
  eligible AS (
    SELECT e.*
    FROM editor_roles e
    JOIN profiles p ON p.id = e.user_id
    WHERE p.is_active = true
      AND COALESCE(p.is_login_disabled, false) = false
      AND COALESCE(p.is_super_admin, false) = false
      AND COALESCE(p.role, '') <> 'super_admin'
  ),
  scoped AS (
    SELECT DISTINCT e.user_id
    FROM eligible e
    WHERE COALESCE(e.institution_scope, '') <> 'all'
      AND (
        e.institution_id = p_institution_id
        OR EXISTS (
          SELECT 1 FROM institutions i_self
          JOIN institutions i_sib ON i_sib.counselling_code = i_self.counselling_code
          WHERE i_self.id = e.institution_id
            AND i_sib.id = p_institution_id
            AND i_self.counselling_code IS NOT NULL
            AND btrim(i_self.counselling_code) <> ''
        )
        OR EXISTS (
          SELECT 1 FROM user_institution_access uia
          WHERE uia.user_id = e.user_id
            AND uia.institution_id = p_institution_id
            AND uia.is_active = true
        )
      )
  )
  SELECT s.user_id FROM scoped s
  UNION ALL
  SELECT DISTINCT e.user_id FROM eligible e
  WHERE e.institution_scope = 'all'
    AND NOT EXISTS (SELECT 1 FROM scoped);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_recruitment_application_recipient_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_recruitment_application_recipient_ids(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_recruitment_application_recipient_ids(uuid) IS
  'Screeners (hr.recruitment.edit) with access to the institution; falls back to all-scope editors. Subset of the hr_job_applications SELECT set. Public careers API notifications only.';
```

- [ ] **Step 2: Show the SQL to the user and get explicit approval** (prod-only DB). Do not apply before a "yes".

- [ ] **Step 3: Apply** with `mcp__supabase__apply_migration` (name `hr_job_applications_public_careers`).

- [ ] **Step 4: Verify** with `mcp__supabase__execute_sql`:

```sql
-- a) back-fill
select source, count(*) from hr_job_applications group by 1;                -- expect internal = 57 (or current total)
-- b) ACL
select proacl from pg_proc where proname = 'hr_recruitment_application_recipient_ids'; -- service_role only
-- c) coverage: every institution with jobs gets >= 1 recipient
select i.name, (select count(*) from hr_recruitment_application_recipient_ids(i.id)) n
from institutions i where i.id in (select distinct institution_id from hr_recruitment_jobs) order by 2;
-- d) no leak: every scoped recipient can actually read that institution's applications
select i.name, r as user_id
from institutions i, hr_recruitment_application_recipient_ids(i.id) r
join profiles p on p.id = r
where i.id in (select distinct institution_id from hr_recruitment_jobs)
  and not public.user_has_permission(r, 'hr.recruitment.view');             -- expect 0 rows
```
Expected: (c) every row n ≥ 1 (Main Office via fallback = 5), (d) zero rows.

- [ ] **Step 5: Commit** `git add supabase/migrations/20260922000646_hr_job_applications_public_careers.sql && git commit -m "feat(hr/careers): application source columns + screener recipient RPC"`

---

### Task 2: Public job whitelist mapper

**Files:** Create `lib/services/hr/public-careers/public-job.ts`; Test `__tests__/hr/public-careers/public-job.test.ts`

**Interfaces — Produces:**
```ts
export const PUBLIC_JOB_SELECT: string;
export interface PublicJob { id; job_code; title; role_category; job_type; description;
  institution: { id: string; name: string } | null; department: { id: string; name: string } | null;
  city; state; country; education_level; min_experience_years; max_experience_years;
  qualifications: string[]; skills: string[]; positions_open: number; posted_at; closes_at;
  salary: { min: number | null; max: number | null; currency: string; duration: string } | null }
export type PublicJobRow = Record<string, unknown>;          // raw row from PUBLIC_JOB_SELECT
export function isJobVisible(row: PublicJobRow, now: Date): boolean;
export function toPublicJob(row: PublicJobRow): PublicJob;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { isJobVisible, toPublicJob } from '@/lib/services/hr/public-careers/public-job';

const NOW = new Date('2026-09-21T10:00:00Z');
const ROW = {
  id: 'j1', job_code: 'JOB-001', title: 'Senior Learner - Pharmacology', role_category: 'teaching_faculty',
  job_type: 'full_time', description: 'Teach', institution_id: 'i1',
  city: 'Komarapalayam', state: 'Tamil Nadu', country: 'India', education_level: 'masters',
  min_experience_years: 1, max_experience_years: 5,
  requirements: { qualifications: ['M.E'], skills: ['Python'], internal_note: 'x' },
  positions_open: 2, posted_at: '2026-09-01T00:00:00Z', closes_at: null,
  status: 'open', is_public: true, display_salary: false,
  min_monthly_salary: 30000, max_monthly_salary: 50000, salary_currency: 'INR', salary_duration: 'per_month',
  hr_organization_id: 'secret-org', created_by: 'secret-user', positions_filled: 1,
  institution: { id: 'i1', name: 'JKKN College of Pharmacy' },
  department: { id: 'd1', department_name: 'Pharmaceutics' },
};

describe('isJobVisible', () => {
  it('is visible when public, open and not expired', () => {
    expect(isJobVisible(ROW, NOW)).toBe(true);
  });
  it.each([
    ['not public', { is_public: false }],
    ['draft', { status: 'draft' }],
    ['closed', { status: 'closed' }],
    ['expired', { closes_at: '2026-09-20T00:00:00Z' }],
  ])('is hidden when %s', (_l, patch) => {
    expect(isJobVisible({ ...ROW, ...patch }, NOW)).toBe(false);
  });
  it('is visible when closes_at is in the future', () => {
    expect(isJobVisible({ ...ROW, closes_at: '2026-10-01T00:00:00Z' }, NOW)).toBe(true);
  });
});

describe('toPublicJob', () => {
  it('returns exactly the whitelisted keys', () => {
    expect(Object.keys(toPublicJob(ROW)).sort()).toEqual([
      'city', 'closes_at', 'country', 'department', 'description', 'education_level',
      'id', 'institution', 'job_code', 'job_type', 'max_experience_years', 'min_experience_years',
      'positions_open', 'posted_at', 'qualifications', 'role_category', 'salary', 'skills',
      'state', 'title',
    ]);
  });
  it('never leaks internal fields', () => {
    const json = JSON.stringify(toPublicJob(ROW));
    for (const s of ['secret-org', 'secret-user', 'internal_note', 'is_public']) expect(json).not.toContain(s);
  });
  it('hides salary unless display_salary', () => {
    expect(toPublicJob(ROW).salary).toBeNull();
    expect(toPublicJob({ ...ROW, display_salary: true }).salary).toEqual({
      min: 30000, max: 50000, currency: 'INR', duration: 'per_month',
    });
  });
  it('flattens requirements and department', () => {
    const j = toPublicJob(ROW);
    expect(j.qualifications).toEqual(['M.E']);
    expect(j.skills).toEqual(['Python']);
    expect(j.department).toEqual({ id: 'd1', name: 'Pharmaceutics' });
  });
  it('tolerates missing requirements and relations', () => {
    const j = toPublicJob({ ...ROW, requirements: null, department: null, institution: null });
    expect(j.qualifications).toEqual([]);
    expect(j.department).toBeNull();
    expect(j.institution).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run __tests__/hr/public-careers/public-job.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * The ONLY shape a job leaves MyJKKN in through the public careers API.
 * Rows are read with the service-role client (anon has no RLS path), so this
 * mapper is the whole privacy boundary: add a field here deliberately or not at all.
 */

export const PUBLIC_JOB_SELECT = [
  'id', 'job_code', 'title', 'role_category', 'job_type', 'description', 'institution_id',
  'city', 'state', 'country', 'education_level', 'min_experience_years', 'max_experience_years',
  'requirements', 'positions_open', 'posted_at', 'closes_at', 'status', 'is_public',
  'display_salary', 'min_monthly_salary', 'max_monthly_salary', 'salary_currency', 'salary_duration',
  'institution:institutions(id, name)', 'department:departments(id, department_name)',
].join(', ');

export interface PublicJob {
  id: string;
  job_code: string | null;
  title: string;
  role_category: string;
  job_type: string | null;
  description: string | null;
  institution: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  city: string | null;
  state: string | null;
  country: string | null;
  education_level: string | null;
  min_experience_years: number | null;
  max_experience_years: number | null;
  qualifications: string[];
  skills: string[];
  positions_open: number;
  posted_at: string | null;
  closes_at: string | null;
  salary: { min: number | null; max: number | null; currency: string; duration: string } | null;
}

export type PublicJobRow = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

export function isJobVisible(row: PublicJobRow, now: Date): boolean {
  if (row.is_public !== true || row.status !== 'open') return false;
  const closes = str(row.closes_at);
  return !closes || new Date(closes).getTime() > now.getTime();
}

export function toPublicJob(row: PublicJobRow): PublicJob {
  const req = (row.requirements && typeof row.requirements === 'object' ? row.requirements : {}) as Record<string, unknown>;
  const inst = row.institution as { id?: string; name?: string } | null;
  const dept = row.department as { id?: string; department_name?: string } | null;
  return {
    id: String(row.id),
    job_code: str(row.job_code),
    title: String(row.title ?? ''),
    role_category: String(row.role_category ?? ''),
    job_type: str(row.job_type),
    description: str(row.description),
    institution: inst?.id ? { id: inst.id, name: inst.name ?? '' } : null,
    department: dept?.id ? { id: dept.id, name: dept.department_name ?? '' } : null,
    city: str(row.city),
    state: str(row.state),
    country: str(row.country),
    education_level: str(row.education_level),
    min_experience_years: num(row.min_experience_years),
    max_experience_years: num(row.max_experience_years),
    qualifications: strArr(req.qualifications),
    skills: strArr(req.skills),
    positions_open: num(row.positions_open) ?? 0,
    posted_at: str(row.posted_at),
    closes_at: str(row.closes_at),
    salary: row.display_salary === true
      ? {
          min: num(row.min_monthly_salary),
          max: num(row.max_monthly_salary),
          currency: str(row.salary_currency) ?? 'INR',
          duration: str(row.salary_duration) ?? 'per_month',
        }
      : null,
  };
}
```

- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `git add lib/services/hr/public-careers/public-job.ts __tests__/hr/public-careers/public-job.test.ts && git commit -m "feat(hr/careers): public job whitelist mapper"`

---

### Task 3: Apply-form validation + resume sniffing

**Files:** Create `lib/services/hr/public-careers/apply-validation.ts`; Test `__tests__/hr/public-careers/apply-validation.test.ts`

**Interfaces — Produces:**
```ts
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export type ResumeMime = 'application/pdf' | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export function sniffResumeType(bytes: Uint8Array, filename: string): ResumeMime | null;
export interface ApplyInput {
  first_name: string; last_name: string; email: string; phone: string; qualification: string;
  experience_months: number; current_job_title: string | null; current_company: string | null;
  current_job_duration_months: number | null; worked_cities: string[]; utm_source: string | null;
  resume: File;            // re-wrapped with the sniffed MIME type
}
export type ParseResult = { ok: true; value: ApplyInput } | { ok: false; fields: Record<string, string> };
export async function parseApplyForm(form: FormData): Promise<ParseResult>;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseApplyForm, sniffResumeType, MAX_RESUME_BYTES } from '@/lib/services/hr/public-careers/apply-validation';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);           // %PDF-1
const DOC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

function form(overrides: Record<string, string | File | null> = {}) {
  const base: Record<string, string | File> = {
    first_name: ' Priya ', last_name: 'R', email: ' Priya@Example.COM ', phone: '+91 98765-43210',
    qualification: 'M.Pharm', experience_months: '24', consent: 'true',
    resume: new File([PDF], 'cv.pdf', { type: 'application/pdf' }),
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v !== null) fd.append(k, v as string | Blob);
  return fd;
}

describe('sniffResumeType', () => {
  it('accepts matching magic bytes + extension', () => {
    expect(sniffResumeType(PDF, 'a.pdf')).toBe('application/pdf');
    expect(sniffResumeType(DOC, 'a.DOC')).toBe('application/msword');
    expect(sniffResumeType(ZIP, 'a.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
  it('rejects mismatches and other files', () => {
    expect(sniffResumeType(EXE, 'a.pdf')).toBeNull();
    expect(sniffResumeType(PDF, 'a.docx')).toBeNull();
    expect(sniffResumeType(ZIP, 'a.zip')).toBeNull();
    expect(sniffResumeType(new Uint8Array([]), 'a.pdf')).toBeNull();
  });
});

describe('parseApplyForm', () => {
  it('normalises a valid submission', async () => {
    const r = await parseApplyForm(form({ worked_cities: 'Salem, Erode ,', utm_source: 'jkkn.ac.in' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.first_name).toBe('Priya');
    expect(r.value.email).toBe('priya@example.com');
    expect(r.value.phone).toBe('+91 98765-43210');
    expect(r.value.experience_months).toBe(24);
    expect(r.value.worked_cities).toEqual(['Salem', 'Erode']);
    expect(r.value.resume.type).toBe('application/pdf');
  });

  it.each([
    ['first_name', { first_name: '' }],
    ['email', { email: 'not-an-email' }],
    ['phone', { phone: '123' }],
    ['qualification', { qualification: ' ' }],
    ['experience_months', { experience_months: '-1' }],
    ['experience_months', { experience_months: '12.5' }],
    ['consent', { consent: null }],
    ['resume', { resume: null }],
    ['resume', { resume: new File([EXE], 'cv.pdf', { type: 'application/pdf' }) }],
  ])('flags %s', async (field, patch) => {
    const r = await parseApplyForm(form(patch as Record<string, string | File | null>));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields).toHaveProperty(field);
  });

  it('rejects an oversize resume', async () => {
    const big = new Uint8Array(MAX_RESUME_BYTES + 1); big.set(PDF);
    const r = await parseApplyForm(form({ resume: new File([big], 'cv.pdf') }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields.resume).toMatch(/2 MB/);
  });
});
```

- [ ] **Step 2:** Run → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Validation for the unauthenticated apply endpoint. Everything arriving here is
 * attacker-controlled: trim, cap lengths, and trust the resume's BYTES, not its
 * name or the browser-supplied MIME type.
 */

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export type ResumeMime =
  | 'application/pdf'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);

export function sniffResumeType(bytes: Uint8Array, filename: string): ResumeMime | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' && startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (ext === 'doc' && startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'application/msword';
  if (ext === 'docx' && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

export interface ApplyInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  qualification: string;
  experience_months: number;
  current_job_title: string | null;
  current_company: string | null;
  current_job_duration_months: number | null;
  worked_cities: string[];
  utm_source: string | null;
  resume: File;
}

export type ParseResult =
  | { ok: true; value: ApplyInput }
  | { ok: false; fields: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(form: FormData, key: string, max: number): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function months(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 720 ? n : null;
}

export async function parseApplyForm(form: FormData): Promise<ParseResult> {
  const fields: Record<string, string> = {};

  const first_name = text(form, 'first_name', 100);
  const last_name = text(form, 'last_name', 100);
  const email = text(form, 'email', 200).toLowerCase();
  const phone = text(form, 'phone', 30);
  const qualification = text(form, 'qualification', 200);
  const expRaw = text(form, 'experience_months', 10);
  const durRaw = text(form, 'current_job_duration_months', 10);

  if (!first_name) fields.first_name = 'First name is required.';
  if (!last_name) fields.last_name = 'Last name is required.';
  if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';
  const digits = phone.replace(/[\s+\-()]/g, '');
  if (!/^\d{10,15}$/.test(digits)) fields.phone = 'Enter a valid phone number (10-15 digits).';
  if (!qualification) fields.qualification = 'Qualification is required.';
  const experience_months = months(expRaw);
  if (experience_months === null) fields.experience_months = 'Experience must be a whole number of months (0-720).';
  const current_job_duration_months = durRaw ? months(durRaw) : null;
  if (durRaw && current_job_duration_months === null) {
    fields.current_job_duration_months = 'Duration must be a whole number of months (0-720).';
  }
  if (form.get('consent') !== 'true') fields.consent = 'Please accept the privacy consent to apply.';

  let resume: File | null = null;
  const raw = form.get('resume');
  if (!raw || typeof raw === 'string') {
    fields.resume = 'Please attach your resume.';
  } else if (raw.size > MAX_RESUME_BYTES) {
    fields.resume = 'Resume must be under 2 MB.';
  } else {
    const bytes = new Uint8Array(await raw.arrayBuffer());
    const mime = sniffResumeType(bytes, raw.name);
    if (!mime) fields.resume = 'Resume must be a PDF, DOC or DOCX file.';
    else resume = new File([bytes], raw.name.slice(0, 200), { type: mime });
  }

  if (Object.keys(fields).length > 0 || !resume) return { ok: false, fields };

  const worked_cities = text(form, 'worked_cities', 1000)
    .split(',').map((c) => c.trim().slice(0, 60)).filter(Boolean).slice(0, 10);

  return {
    ok: true,
    value: {
      first_name, last_name, email, phone, qualification,
      experience_months: experience_months!,
      current_job_title: text(form, 'current_job_title', 150) || null,
      current_company: text(form, 'current_company', 150) || null,
      current_job_duration_months,
      worked_cities,
      utm_source: text(form, 'utm_source', 100) || null,
      resume,
    },
  };
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `git add lib/services/hr/public-careers/apply-validation.ts __tests__/hr/public-careers/apply-validation.test.ts && git commit -m "feat(hr/careers): apply form validation + resume magic-byte sniffing"`

---

### Task 4: CORS + rate limiter

**Files:** Create `lib/services/hr/public-careers/cors.ts`, `lib/services/hr/public-careers/rate-limit.ts`; Test `__tests__/hr/public-careers/cors-rate-limit.test.ts`

**Interfaces — Produces:**
```ts
// cors.ts
export function extraOrigins(): string[];                                   // from PUBLIC_CAREERS_EXTRA_ORIGINS
export function resolveAllowedOrigin(origin: string | null, extra?: string[]): string | null;
export function corsHeaders(allowed: string | null): Record<string, string>;
export function withCors<T extends Response>(res: T, request: Request): T;
export function preflight(request: Request): Response;                      // 204
// rate-limit.ts
export function createRateLimiter(opts: { limit: number; windowMs: number }): (key: string, now?: number) => boolean;
export function clientIp(request: Request): string;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { corsHeaders, preflight, resolveAllowedOrigin } from '@/lib/services/hr/public-careers/cors';
import { clientIp, createRateLimiter } from '@/lib/services/hr/public-careers/rate-limit';

describe('resolveAllowedOrigin', () => {
  it.each(['https://jkkn.ac.in', 'https://www.jkkn.ac.in', 'https://pharmacy.jkkn.ac.in', 'https://JKKN.AC.IN'])(
    'allows %s', (o) => expect(resolveAllowedOrigin(o, [])).toBe(o),
  );
  it.each([
    'http://jkkn.ac.in', 'https://evil-jkkn.ac.in', 'https://jkkn.ac.in.evil.com',
    'https://a.b.jkkn.ac.in', 'https://jkkn.ac.in:8443', 'null', '',
  ])('rejects %s', (o) => expect(resolveAllowedOrigin(o, [])).toBeNull());
  it('rejects a missing origin', () => expect(resolveAllowedOrigin(null, [])).toBeNull());
  it('allows configured extra origins exactly', () => {
    expect(resolveAllowedOrigin('http://localhost:3000', ['http://localhost:3000'])).toBe('http://localhost:3000');
    expect(resolveAllowedOrigin('http://localhost:3001', ['http://localhost:3000'])).toBeNull();
  });
});

describe('corsHeaders / preflight', () => {
  it('reflects an allowed origin and varies on Origin', () => {
    const h = corsHeaders('https://jkkn.ac.in');
    expect(h['Access-Control-Allow-Origin']).toBe('https://jkkn.ac.in');
    expect(h.Vary).toBe('Origin');
    expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
  });
  it('emits no allow-origin for a disallowed origin', () => {
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined();
  });
  it('answers preflight with 204', () => {
    const res = preflight(new Request('https://x/api', { method: 'OPTIONS', headers: { Origin: 'https://jkkn.ac.in' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  });
});

describe('rate limiter', () => {
  it('allows `limit` hits per window, then blocks, then resets', () => {
    const hit = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(hit('ip', 0)).toBe(true);
    expect(hit('ip', 10)).toBe(true);
    expect(hit('ip', 20)).toBe(false);
    expect(hit('other', 20)).toBe(true);
    expect(hit('ip', 1001)).toBe(true);
  });
  it('reads the first x-forwarded-for hop', () => {
    expect(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }))).toBe('1.2.3.4');
    expect(clientIp(new Request('https://x'))).toBe('unknown');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement `cors.ts`**

```ts
/**
 * CORS for /api/public/careers/*. The consumer is jkkn.ac.in and its one-label
 * subdomains (all https). Origins are reflected, never '*', and credentials are
 * never allowed — these routes are anonymous by design.
 */

const JKKN_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?jkkn\.ac\.in$/i;

export function extraOrigins(): string[] {
  return (process.env.PUBLIC_CAREERS_EXTRA_ORIGINS ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

export function resolveAllowedOrigin(origin: string | null, extra: string[] = extraOrigins()): string | null {
  if (!origin) return null;
  if (JKKN_ORIGIN.test(origin)) return origin;
  return extra.includes(origin) ? origin : null;
}

export function corsHeaders(allowed: string | null): Record<string, string> {
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed) base['Access-Control-Allow-Origin'] = allowed;
  return base;
}

export function withCors<T extends Response>(res: T, request: Request): T {
  const headers = corsHeaders(resolveAllowedOrigin(request.headers.get('origin')));
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export function preflight(request: Request): Response {
  return withCors(new Response(null, { status: 204 }), request);
}
```

- [ ] **Step 4: Implement `rate-limit.ts`**

```ts
/**
 * Per-key sliding counter, in memory. Resets on redeploy and is per-instance —
 * a speed bump against casual abuse (same trade-off as the public course apply
 * route), not a security control.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now: number = Date.now()): boolean => {
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    if (entry.count >= opts.limit) return false;
    entry.count += 1;
    return true;
  };
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
```

- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Commit** `git add lib/services/hr/public-careers/cors.ts lib/services/hr/public-careers/rate-limit.ts __tests__/hr/public-careers/cors-rate-limit.test.ts && git commit -m "feat(hr/careers): origin allowlist CORS + per-IP limiter"`

---

### Task 5: Public careers service

**Files:** Create `lib/services/hr/public-careers/public-careers-service.ts`; Test `__tests__/hr/public-careers/public-careers-service.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_JOB_SELECT`, `isJobVisible`, `toPublicJob`, `PublicJob` (Task 2); `ApplyInput` (Task 3); `uploadResumeToJobFolder(opts: ResumeUploadOptions): Promise<{url, driveFileId}>` and `deleteDriveFile(id): Promise<boolean>` from `@/lib/google/drive-upload`.
- Produces:
```ts
export const JOB_TYPES: readonly string[];
export interface ListFilters { institution_id?: string | null; q?: string | null; job_type?: string | null }
export interface InstitutionFacet { id: string; name: string; open_jobs: number }
export async function listPublicJobs(db: SupabaseClient, filters: ListFilters, now?: Date): Promise<{ data: PublicJob[]; institutions: InstitutionFacet[] }>;
export async function getPublicJob(db: SupabaseClient, id: string, now?: Date): Promise<PublicJob | null>;
export interface SubmitDeps { db: SupabaseClient; upload: typeof uploadResumeToJobFolder; deleteFile: typeof deleteDriveFile; now?: Date }
export interface CreatedApplication { applicationId: string; reference: string; jobTitle: string; institutionId: string | null; institutionName: string | null }
export type SubmitResult = { kind: 'created'; application: CreatedApplication } | { kind: 'not_found' } | { kind: 'duplicate' };
export async function submitExternalApplication(deps: SubmitDeps, jobId: string, input: ApplyInput): Promise<SubmitResult>;
export function isUuid(v: string): boolean;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { getPublicJob, isUuid, submitExternalApplication } from '@/lib/services/hr/public-careers/public-careers-service';
import type { ApplyInput } from '@/lib/services/hr/public-careers/apply-validation';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-21T10:00:00Z');
const JOB = {
  id: JOB_ID, job_code: 'JOB-007', title: 'Store Keeper', role_category: 'non_teaching', status: 'open',
  is_public: true, closes_at: null, display_salary: false, institution_id: 'inst-1',
  institution: { id: 'inst-1', name: 'JKKN College of Pharmacy' }, department: null, requirements: {},
};

/** PostgREST stand-in: every chain resolves to the configured result per table/op. */
function fakeDb(opts: { job?: unknown; existing?: unknown[]; insertError?: { code: string } | null }) {
  const inserted: Record<string, unknown>[] = [];
  const chain = (result: { data: unknown; error: unknown }) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'ilike', 'or', 'order', 'limit', 'neq']) c[m] = () => c;
    c.maybeSingle = async () => result;
    c.single = async () => result;
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return c;
  };
  const db = {
    from(table: string) {
      return {
        select: () => (table === 'hr_recruitment_jobs'
          ? chain({ data: opts.job ?? null, error: null })
          : chain({ data: opts.existing ?? [], error: null })),
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return chain(opts.insertError
            ? { data: null, error: opts.insertError }
            : { data: { id: 'aaaaaaaa-0000-4000-8000-000000000000' }, error: null });
        },
      };
    },
  };
  return { db: db as never, inserted };
}

const INPUT: ApplyInput = {
  first_name: 'Priya', last_name: 'R', email: 'priya@example.com', phone: '9876543210',
  qualification: 'M.Pharm', experience_months: 24, current_job_title: null, current_company: null,
  current_job_duration_months: null, worked_cities: [], utm_source: 'jkkn.ac.in',
  resume: new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cv.pdf', { type: 'application/pdf' }),
};

const deps = (db: never) => ({
  db,
  upload: vi.fn(async () => ({ url: 'https://drive/x', driveFileId: 'drive-1' })),
  deleteFile: vi.fn(async () => true),
  now: NOW,
});

describe('isUuid', () => {
  it('validates', () => {
    expect(isUuid(JOB_ID)).toBe(true);
    expect(isUuid("1' or 1=1")).toBe(false);
  });
});

describe('getPublicJob', () => {
  it('returns null for a malformed id without querying', async () => {
    expect(await getPublicJob({} as never, 'nope', NOW)).toBeNull();
  });
  it('returns null for a non-public job even if the row exists', async () => {
    const { db } = fakeDb({ job: { ...JOB, is_public: false } });
    expect(await getPublicJob(db, JOB_ID, NOW)).toBeNull();
  });
});

describe('submitExternalApplication', () => {
  it('uploads then inserts an external_website row', async () => {
    const { db, inserted } = fakeDb({ job: JOB });
    const d = deps(db);
    const r = await submitExternalApplication(d, JOB_ID, INPUT);
    expect(r.kind).toBe('created');
    if (r.kind === 'created') expect(r.application.reference).toBe('JOB-007-AAAAAAAA');
    expect(d.upload).toHaveBeenCalledOnce();
    expect(inserted[0]).toMatchObject({
      job_id: JOB_ID, institution_id: 'inst-1', source: 'external_website', applicant_user_id: null,
      email: 'priya@example.com', resume_url: 'https://drive/x', drive_file_id: 'drive-1', status: 'pending',
    });
    expect(inserted[0].consent_at).toBe(NOW.toISOString());
  });

  it('returns not_found for an invisible job and never uploads', async () => {
    const { db } = fakeDb({ job: { ...JOB, status: 'closed' } });
    const d = deps(db);
    expect((await submitExternalApplication(d, JOB_ID, INPUT)).kind).toBe('not_found');
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('returns duplicate when the email already applied (any source) and never uploads', async () => {
    const { db } = fakeDb({ job: JOB, existing: [{ id: 'old' }] });
    const d = deps(db);
    expect((await submitExternalApplication(d, JOB_ID, INPUT)).kind).toBe('duplicate');
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('cleans up the Drive file when the insert races into the unique index', async () => {
    const { db } = fakeDb({ job: JOB, insertError: { code: '23505' } });
    const d = deps(db);
    expect((await submitExternalApplication(d, JOB_ID, INPUT)).kind).toBe('duplicate');
    expect(d.deleteFile).toHaveBeenCalledWith('drive-1');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```ts
/**
 * Reads and writes behind /api/public/careers/*. SERVER ONLY — every caller
 * passes the service-role client, because anon has no RLS path to these tables.
 * Visibility is re-checked in code (isJobVisible) on top of the query filter so
 * a filter typo can never publish a draft.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { deleteDriveFile, uploadResumeToJobFolder } from '@/lib/google/drive-upload';
import type { ApplyInput } from './apply-validation';
import { PUBLIC_JOB_SELECT, isJobVisible, toPublicJob, type PublicJob, type PublicJobRow } from './public-job';

export const JOB_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v);

export interface ListFilters { institution_id?: string | null; q?: string | null; job_type?: string | null }
export interface InstitutionFacet { id: string; name: string; open_jobs: number }

export async function listPublicJobs(
  db: SupabaseClient, filters: ListFilters, now: Date = new Date(),
): Promise<{ data: PublicJob[]; institutions: InstitutionFacet[] }> {
  let query = db
    .from('hr_recruitment_jobs')
    .select(PUBLIC_JOB_SELECT)
    .eq('is_public', true)
    .eq('status', 'open')
    .or(`closes_at.is.null,closes_at.gt.${now.toISOString()}`)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (filters.institution_id && isUuid(filters.institution_id)) query = query.eq('institution_id', filters.institution_id);
  if (filters.job_type && (JOB_TYPES as readonly string[]).includes(filters.job_type)) query = query.eq('job_type', filters.job_type);
  const q = (filters.q ?? '').replace(/[%_,()\\]/g, ' ').trim().slice(0, 100);
  if (q) query = query.ilike('title', `%${q}%`);

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown as PublicJobRow[]).filter((r) => isJobVisible(r, now));
  const jobs = rows.map(toPublicJob);

  const facets = new Map<string, InstitutionFacet>();
  for (const j of jobs) {
    if (!j.institution) continue;
    const f = facets.get(j.institution.id) ?? { ...j.institution, open_jobs: 0 };
    f.open_jobs += 1;
    facets.set(j.institution.id, f);
  }
  return { data: jobs, institutions: [...facets.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

async function loadVisibleJobRow(db: SupabaseClient, id: string, now: Date): Promise<PublicJobRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from('hr_recruitment_jobs').select(PUBLIC_JOB_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  const row = data as unknown as PublicJobRow | null;
  return row && isJobVisible(row, now) ? row : null;
}

export async function getPublicJob(db: SupabaseClient, id: string, now: Date = new Date()): Promise<PublicJob | null> {
  const row = await loadVisibleJobRow(db, id, now);
  return row ? toPublicJob(row) : null;
}

export interface SubmitDeps {
  db: SupabaseClient;
  upload: typeof uploadResumeToJobFolder;
  deleteFile: typeof deleteDriveFile;
  now?: Date;
}

export interface CreatedApplication {
  applicationId: string;
  reference: string;
  jobTitle: string;
  institutionId: string | null;
  institutionName: string | null;
}

export type SubmitResult =
  | { kind: 'created'; application: CreatedApplication }
  | { kind: 'not_found' }
  | { kind: 'duplicate' };

export async function submitExternalApplication(
  deps: SubmitDeps, jobId: string, input: ApplyInput,
): Promise<SubmitResult> {
  const now = deps.now ?? new Date();
  const job = await loadVisibleJobRow(deps.db, jobId, now);
  if (!job) return { kind: 'not_found' };

  // Pre-check across ALL sources: someone HR already keyed in gets "already applied".
  const { data: existing, error: dupErr } = await deps.db
    .from('hr_job_applications')
    .select('id')
    .eq('job_id', jobId)
    // ilike = case-insensitive equality here; escape its wildcards so an email
    // containing % or _ can't match someone else's row.
    .ilike('email', input.email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .limit(1);
  if (dupErr) throw dupErr;
  if ((existing ?? []).length > 0) return { kind: 'duplicate' };

  const uploaded = await deps.upload({
    jobTitle: String(job.title),
    jobCode: (job.job_code as string | null) ?? null,
    jobId,
    file: input.resume,
  });

  const { data: row, error } = await deps.db
    .from('hr_job_applications')
    .insert({
      job_id: jobId,
      institution_id: (job.institution_id as string | null) ?? null,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
      current_job_title: input.current_job_title,
      current_company: input.current_company,
      current_job_duration_months: input.current_job_duration_months,
      experience_months: input.experience_months,
      qualification: input.qualification,
      worked_cities: input.worked_cities,
      resume_url: uploaded.url,
      resume_filename: input.resume.name,
      resume_size_bytes: input.resume.size,
      drive_file_id: uploaded.driveFileId,
      status: 'pending',
      applicant_user_id: null,
      source: 'external_website',
      consent_at: now.toISOString(),
      utm_source: input.utm_source,
    })
    .select('id')
    .single();

  if (error) {
    // The file is orphaned either way; don't leave a stranger's resume in Drive.
    await deps.deleteFile(uploaded.driveFileId).catch(() => false);
    if ((error as { code?: string }).code === '23505') return { kind: 'duplicate' };
    throw error;
  }

  const id = String((row as { id: string }).id);
  const code = (job.job_code as string | null) ?? 'JOB';
  const inst = job.institution as { id?: string; name?: string } | null;
  return {
    kind: 'created',
    application: {
      applicationId: id,
      reference: `${code}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      jobTitle: String(job.title),
      institutionId: (job.institution_id as string | null) ?? null,
      institutionName: inst?.name ?? null,
    },
  };
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `git add lib/services/hr/public-careers/public-careers-service.ts __tests__/hr/public-careers/public-careers-service.test.ts && git commit -m "feat(hr/careers): public jobs read + external application submit"`

---

### Task 6: After-apply — HR notification + applicant email

**Files:** Create `lib/hr/recruitment/application-confirmation-email.ts`, `lib/services/hr/public-careers/after-apply.ts`; Test `__tests__/hr/public-careers/after-apply.test.ts`

**Interfaces:**
- Consumes: `CreatedApplication` (Task 5); RPC `hr_recruitment_application_recipient_ids` (Task 1); `resend` from `@/lib/resend`.
- Produces:
```ts
// template
export function buildApplicationConfirmationEmail(d: { firstName: string; jobTitle: string; institutionName: string | null; reference: string }): { subject: string; html: string; text: string };
// after-apply
export async function notifyHrOfApplication(db: SupabaseClient, app: CreatedApplication, applicantName: string): Promise<number>; // recipients notified
export async function sendApplicantConfirmation(db: SupabaseClient, app: CreatedApplication, to: string, firstName: string, send?: (msg: { from: string; to: string; subject: string; html: string; text: string }) => Promise<{ error: unknown }>): Promise<void>;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildApplicationConfirmationEmail } from '@/lib/hr/recruitment/application-confirmation-email';
import { notifyHrOfApplication, sendApplicantConfirmation } from '@/lib/services/hr/public-careers/after-apply';

const APP = { applicationId: 'app-1', reference: 'JOB-007-AAAAAAAA', jobTitle: 'Store <Keeper>', institutionId: 'inst-1', institutionName: 'JKKN College of Pharmacy' };

function fakeDb(recipients: string[]) {
  const writes: { table: string; payload: unknown }[] = [];
  const db = {
    rpc: vi.fn(async () => ({ data: recipients, error: null })),
    from(table: string) {
      return {
        insert(payload: unknown) {
          writes.push({ table, payload });
          const r = { data: { id: 'n-1' }, error: null };
          return { select: () => ({ single: async () => r }), then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f) };
        },
        update(payload: unknown) {
          writes.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { db: db as never, writes, rpc: db.rpc };
}

describe('buildApplicationConfirmationEmail', () => {
  it('escapes HTML and includes the reference', () => {
    const m = buildApplicationConfirmationEmail({ firstName: 'Priya', jobTitle: 'Store <Keeper>', institutionName: 'X', reference: 'R-1' });
    expect(m.html).toContain('Store &lt;Keeper&gt;');
    expect(m.html).not.toContain('<Keeper>');
    expect(m.text).toContain('R-1');
    expect(m.subject).toContain('Store <Keeper>');
  });
});

describe('notifyHrOfApplication', () => {
  it('writes one notification targeted at the RPC recipients plus a user_notifications row each', async () => {
    const { db, writes, rpc } = fakeDb(['u1', 'u2']);
    expect(await notifyHrOfApplication(db, APP, 'Priya R')).toBe(2);
    expect(rpc).toHaveBeenCalledWith('hr_recruitment_application_recipient_ids', { p_institution_id: 'inst-1' });
    const n = writes.find((w) => w.table === 'notifications')!.payload as Record<string, unknown>;
    expect(n.targeting).toEqual({ type: 'user', user_ids: ['u1', 'u2'] });
    expect(n.url).toBe('/hr/recruitment/applications/app-1');
    expect(writes.find((w) => w.table === 'user_notifications')!.payload).toEqual([
      { user_id: 'u1', notification_id: 'n-1' }, { user_id: 'u2', notification_id: 'n-1' },
    ]);
  });
  it('writes nothing when there are no recipients', async () => {
    const { db, writes } = fakeDb([]);
    expect(await notifyHrOfApplication(db, APP, 'Priya R')).toBe(0);
    expect(writes).toHaveLength(0);
  });
});

describe('sendApplicantConfirmation', () => {
  it('records sent_at on success', async () => {
    const { db, writes } = fakeDb([]);
    const send = vi.fn(async () => ({ error: null }));
    await sendApplicantConfirmation(db, APP, 'priya@example.com', 'Priya', send);
    expect(send).toHaveBeenCalledOnce();
    expect(writes[0].payload).toHaveProperty('confirmation_email_sent_at');
  });
  it('records the error and does not throw on failure', async () => {
    const { db, writes } = fakeDb([]);
    const send = vi.fn(async () => ({ error: { message: 'bad domain' } }));
    await expect(sendApplicantConfirmation(db, APP, 'priya@example.com', 'Priya', send)).resolves.toBeUndefined();
    expect((writes[0].payload as Record<string, unknown>).confirmation_email_error).toContain('bad domain');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement the template**

```ts
/** Confirmation sent to an external candidate after a website application. Pure. */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildApplicationConfirmationEmail(d: {
  firstName: string; jobTitle: string; institutionName: string | null; reference: string;
}): { subject: string; html: string; text: string } {
  const where = d.institutionName ? ` at ${d.institutionName}` : '';
  const subject = `Application received: ${d.jobTitle}${where}`;
  const text = [
    `Dear ${d.firstName},`,
    '',
    `Thank you for applying for ${d.jobTitle}${where}.`,
    `Your application reference is ${d.reference}.`,
    '',
    'Our HR team will review your application and contact you if you are shortlisted.',
    '',
    'JKKN Institutions — HR',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
<p>Dear ${esc(d.firstName)},</p>
<p>Thank you for applying for <strong>${esc(d.jobTitle)}</strong>${esc(where)}.</p>
<p>Your application reference is <strong>${esc(d.reference)}</strong>.</p>
<p>Our HR team will review your application and contact you if you are shortlisted.</p>
<p>JKKN Institutions — HR</p>
</body></html>`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Implement `after-apply.ts`**

```ts
/**
 * Side effects after a website application is saved. Runs inside next/server
 * `after()`; neither function may throw — the applicant already has their 201.
 *
 * Recipients come ONLY from hr_recruitment_application_recipient_ids, which is
 * a subset of who can read the row under RLS — a service-role fan-out with an
 * ad-hoc profiles query is how leave notifications went cross-college (BUG-005884).
 * Written directly (one notifications row + user_notifications junction rows)
 * rather than via notification-service, which imports the browser client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resend } from '@/lib/resend';
import { buildApplicationConfirmationEmail } from '@/lib/hr/recruitment/application-confirmation-email';
import type { CreatedApplication } from './public-careers-service';

export async function notifyHrOfApplication(
  db: SupabaseClient, app: CreatedApplication, applicantName: string,
): Promise<number> {
  try {
    const { data, error } = await db.rpc('hr_recruitment_application_recipient_ids', {
      p_institution_id: app.institutionId,
    });
    if (error) throw error;
    const ids = [...new Set((data ?? []) as string[])];
    if (ids.length === 0) {
      console.warn('[public/careers] no HR recipients for institution', app.institutionId);
      return 0;
    }

    const { data: n, error: nErr } = await db
      .from('notifications')
      .insert({
        title: 'New application from the website',
        body: `${applicantName} applied for ${app.jobTitle}${app.institutionName ? ` (${app.institutionName})` : ''}.`,
        category: 'hr_recruitment',
        priority: 'normal',
        created_by: ids[0],
        targeting: { type: 'user', user_ids: ids },
        url: `/hr/recruitment/applications/${app.applicationId}`,
        metadata: { type: 'info', action_label: 'Review application', application_id: app.applicationId, source: 'external_website' },
      })
      .select('id')
      .single();
    if (nErr) throw nErr;

    const notificationId = (n as { id: string }).id;
    const { error: ujErr } = await db
      .from('user_notifications')
      .insert(ids.map((user_id) => ({ user_id, notification_id: notificationId })));
    if (ujErr) throw ujErr;
    return ids.length;
  } catch (err) {
    console.error('[public/careers] HR notification failed', err);
    return 0;
  }
}

type Send = (msg: { from: string; to: string; subject: string; html: string; text: string }) => Promise<{ error: unknown }>;

function fromAddress(): string {
  const from = (process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev').trim();
  return from.includes('<') ? from : `JKKN HR <${from}>`;
}

export async function sendApplicantConfirmation(
  db: SupabaseClient, app: CreatedApplication, to: string, firstName: string,
  send: Send = (msg) => resend.emails.send(msg) as Promise<{ error: unknown }>,
): Promise<void> {
  let patch: Record<string, unknown>;
  try {
    const mail = buildApplicationConfirmationEmail({
      firstName, jobTitle: app.jobTitle, institutionName: app.institutionName, reference: app.reference,
    });
    const { error } = await send({ from: fromAddress(), to, ...mail });
    patch = error
      ? { confirmation_email_error: String((error as { message?: string }).message ?? error).slice(0, 500) }
      : { confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null };
  } catch (err) {
    patch = { confirmation_email_error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
  try {
    await db.from('hr_job_applications').update(patch).eq('id', app.applicationId);
  } catch (err) {
    console.error('[public/careers] could not record email outcome', err);
  }
}
```

- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Commit** `git add lib/hr/recruitment/application-confirmation-email.ts lib/services/hr/public-careers/after-apply.ts __tests__/hr/public-careers/after-apply.test.ts && git commit -m "feat(hr/careers): HR bell + applicant confirmation email after apply"`

---

### Task 7: Route handlers + proxy allowlist

**Files:**
- Create `app/api/public/careers/jobs/route.ts`, `app/api/public/careers/jobs/[id]/route.ts`, `app/api/public/careers/jobs/[id]/apply/route.ts`
- Modify `proxy.ts` (`PUBLIC_PATH_PREFIXES`, after the `'/api/public/courses/'` entry)
- Test `__tests__/hr/public-careers/apply-route.test.ts`

**Interfaces — Consumes:** everything from Tasks 2–6; `createServiceRoleClient` from `@/lib/supabase/server`; `isDriveConfigured` from `@/lib/google/drive-client`.

- [ ] **Step 1: Write the failing route test** (mocks the service layer; exercises the route's own gates)

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
vi.mock('@/lib/google/drive-client', () => ({ isDriveConfigured: () => true }));
vi.mock('@/lib/google/drive-upload', () => ({ uploadResumeToJobFolder: vi.fn(), deleteDriveFile: vi.fn() }));
const submit = vi.fn();
vi.mock('@/lib/services/hr/public-careers/public-careers-service', () => ({ submitExternalApplication: (...a: unknown[]) => submit(...a) }));
vi.mock('@/lib/services/hr/public-careers/after-apply', () => ({ notifyHrOfApplication: vi.fn(), sendApplicantConfirmation: vi.fn() }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => void fn() }));

import { POST, OPTIONS } from '@/app/api/public/careers/jobs/[id]/apply/route';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ id: JOB_ID }) };
let ipSeq = 0;

function req(fields: Record<string, string | File>, origin = 'https://jkkn.ac.in') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request(`https://my.jkkn.ac.in/api/public/careers/jobs/${JOB_ID}/apply`, {
    method: 'POST', body: fd, headers: { origin, 'x-forwarded-for': `10.0.0.${++ipSeq}` },
  }) as never;
}

const VALID = {
  first_name: 'Priya', last_name: 'R', email: 'priya@example.com', phone: '9876543210',
  qualification: 'M.Pharm', experience_months: '24', consent: 'true',
  resume: new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cv.pdf'),
};

beforeEach(() => submit.mockReset());

describe('POST /api/public/careers/jobs/[id]/apply', () => {
  it('rejects a disallowed origin with 403', async () => {
    const res = await POST(req(VALID, 'https://evil.example'), params);
    expect(res.status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
  });
  it('silently accepts honeypot submissions without saving', async () => {
    const res = await POST(req({ ...VALID, website: 'http://spam' }), params);
    expect(res.status).toBe(201);
    expect(submit).not.toHaveBeenCalled();
  });
  it('returns 400 with field errors', async () => {
    const res = await POST(req({ ...VALID, email: 'bad' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).fields.email).toBeTruthy();
  });
  it('maps service outcomes to status codes', async () => {
    submit.mockResolvedValueOnce({ kind: 'not_found' });
    expect((await POST(req(VALID), params)).status).toBe(404);
    submit.mockResolvedValueOnce({ kind: 'duplicate' });
    expect((await POST(req(VALID), params)).status).toBe(409);
    submit.mockResolvedValueOnce({ kind: 'created', application: { applicationId: 'a', reference: 'JOB-1-ABC', jobTitle: 't', institutionId: 'i', institutionName: 'n' } });
    const ok = await POST(req(VALID), params);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ reference: 'JOB-1-ABC' });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://jkkn.ac.in');
  });
  it('rate-limits the 6th request from one IP in an hour', async () => {
    submit.mockResolvedValue({ kind: 'duplicate' });
    const fixed = () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(VALID)) fd.append(k, v);
      return new Request('https://x', { method: 'POST', body: fd, headers: { origin: 'https://jkkn.ac.in', 'x-forwarded-for': '9.9.9.9' } }) as never;
    };
    for (let i = 0; i < 5; i++) expect((await POST(fixed(), params)).status).toBe(409);
    expect((await POST(fixed(), params)).status).toBe(429);
  });
  it('answers OPTIONS', async () => {
    const res = await OPTIONS(new Request('https://x', { method: 'OPTIONS', headers: { origin: 'https://jkkn.ac.in' } }) as never);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run __tests__/hr/public-careers/apply-route.test.ts` → FAIL.

- [ ] **Step 3: Implement the apply route** `app/api/public/careers/jobs/[id]/apply/route.ts`

```ts
// PUBLIC (no auth) — an external candidate applies for a public job from jkkn.ac.in.
// Service role: anon has no RLS path to hr_job_applications. Order is cheap and
// reversible first, the Drive upload last (inside submitExternalApplication).
// Spec: docs/superpowers/specs/2026-09-21-public-careers-api-design.md

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { deleteDriveFile, uploadResumeToJobFolder } from '@/lib/google/drive-upload';
import { parseApplyForm } from '@/lib/services/hr/public-careers/apply-validation';
import { preflight, resolveAllowedOrigin, withCors } from '@/lib/services/hr/public-careers/cors';
import { clientIp, createRateLimiter } from '@/lib/services/hr/public-careers/rate-limit';
import { submitExternalApplication } from '@/lib/services/hr/public-careers/public-careers-service';
import { notifyHrOfApplication, sendApplicantConfirmation } from '@/lib/services/hr/public-careers/after-apply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const allow = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }), request);

  if (!resolveAllowedOrigin(request.headers.get('origin'))) {
    return reply({ error: 'Origin not allowed.' }, 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'Send the application as multipart/form-data.' }, 400);
  }

  // Honeypot: real users never see `website`. Look successful, persist nothing.
  const trap = form.get('website');
  if (typeof trap === 'string' && trap.trim() !== '') return reply({ reference: 'RECEIVED' }, 201);

  if (!allow(clientIp(request))) {
    return reply({ error: 'Too many applications from this connection. Please try again later.' }, 429);
  }

  if (!isDriveConfigured()) return reply({ error: 'Applications are temporarily unavailable.' }, 503);

  const parsed = await parseApplyForm(form);
  if (!parsed.ok) return reply({ error: 'Please correct the highlighted fields.', fields: parsed.fields }, 400);

  const { id } = await params;
  const db = createServiceRoleClient();

  try {
    const result = await submitExternalApplication(
      { db, upload: uploadResumeToJobFolder, deleteFile: deleteDriveFile },
      id,
      parsed.value,
    );
    if (result.kind === 'not_found') return reply({ error: 'This job is no longer accepting applications.' }, 404);
    if (result.kind === 'duplicate') return reply({ error: 'You have already applied for this job.' }, 409);

    const { application } = result;
    const v = parsed.value;
    after(async () => {
      await notifyHrOfApplication(db, application, `${v.first_name} ${v.last_name}`.trim());
      await sendApplicantConfirmation(db, application, v.email, v.first_name);
    });
    return reply({ reference: application.reference }, 201);
  } catch (err) {
    console.error('[public/careers] apply failed', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
```

- [ ] **Step 4: Implement the list route** `app/api/public/careers/jobs/route.ts`

```ts
// PUBLIC (no auth) — open, public job postings for jkkn.ac.in. Service-role read,
// whitelisted columns only (toPublicJob). Safe to call from a server (ISR) or browser.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { preflight, withCors } from '@/lib/services/hr/public-careers/cors';
import { listPublicJobs } from '@/lib/services/hr/public-careers/public-careers-service';

export const dynamic = 'force-dynamic';

const CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    const body = await listPublicJobs(createServiceRoleClient(), {
      institution_id: sp.get('institution_id'),
      q: sp.get('q'),
      job_type: sp.get('job_type'),
    });
    return withCors(NextResponse.json(body, { headers: { 'Cache-Control': CACHE } }), request);
  } catch (err) {
    console.error('[public/careers] list failed', err);
    return withCors(NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }), request);
  }
}
```

- [ ] **Step 5: Implement the detail route** `app/api/public/careers/jobs/[id]/route.ts`

```ts
// PUBLIC (no auth) — one open, public job posting. 404 for anything not visible.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { preflight, withCors } from '@/lib/services/hr/public-careers/cors';
import { getPublicJob } from '@/lib/services/hr/public-careers/public-careers-service';

export const dynamic = 'force-dynamic';

const CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const job = await getPublicJob(createServiceRoleClient(), id);
    if (!job) return withCors(NextResponse.json({ error: 'Job not found.' }, { status: 404 }), request);
    return withCors(NextResponse.json({ data: job }, { headers: { 'Cache-Control': CACHE } }), request);
  } catch (err) {
    console.error('[public/careers] detail failed', err);
    return withCors(NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }), request);
  }
}
```

- [ ] **Step 6: Allowlist in `proxy.ts`** — in `PUBLIC_PATH_PREFIXES`, directly after the `'/api/public/courses/'` entry and its comment block, add:

```ts
  '/api/public/careers/', // Public job listings + external apply for jkkn.ac.in
  //        (spec 2026-09-21-public-careers-api-design). Service-role routes with a
  //        column whitelist, an origin allowlist and a per-IP limit; the HR tables
  //        themselves stay closed to anon.
```

- [ ] **Step 7:** Run `npx vitest run __tests__/hr/public-careers` → all PASS.
- [ ] **Step 8: Commit** `git add app/api/public/careers proxy.ts __tests__/hr/public-careers/apply-route.test.ts && git commit -m "feat(hr/careers): public careers list/detail/apply routes"`

---

### Task 8: HR-side — types, promote source, analytics split, badges, relabel

**Files:**
- Modify `types/hr-recruitment.ts` (interface `HRJobApplication` ~L676; `source_split` ~L869)
- Modify `lib/services/hr/recruitment-service.ts` (~L1031 promote; ~L1291–1339 analytics)
- Modify `app/(routes)/hr/recruitment/jobs/[id]/_components/applications-section.tsx` (~L216)
- Modify `app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-candidates-tab.tsx` (~L335)
- Modify `app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-analytics-tab.tsx` (~L38, L120, L193–L218)
- Modify `app/(routes)/hr/recruitment/jobs/new/_components/create-job-form.tsx`, `app/(routes)/hr/recruitment/jobs/[id]/edit/_components/edit-job-form.tsx`, `app/(routes)/hr/recruitment/jobs/page.tsx`
- Test `__tests__/hr/public-careers/promote-source.test.ts`

- [ ] **Step 1: Types.** In `HRJobApplication`, after `promoted_candidate_id`, add:

```ts
  /** 'external_website' = applied anonymously through /api/public/careers (jkkn.ac.in). */
  source: JobApplicationSource;
  consent_at: string | null;
  utm_source: string | null;
  confirmation_email_sent_at: string | null;
  confirmation_email_error: string | null;
```
and above the interface:
```ts
export type JobApplicationSource = 'internal' | 'external_website';
```
Change `source_split: { with_account: number; anonymous: number };` to `source_split: { internal: number; website: number };`.

- [ ] **Step 2: Write the failing promote-source test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

function fakeDb(application: Record<string, unknown>) {
  const terminal = (data: unknown) => ({
    eq: () => terminal(data), select: () => terminal(data),
    single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }),
  });
  return {
    from: () => ({
      select: () => terminal(application),
      update: (p: Record<string, unknown>) => terminal({ ...application, ...p }),
    }),
  } as never;
}

const BASE = {
  id: 'app-1', status: 'shortlisted', promoted_candidate_id: null, institution_id: 'i1',
  first_name: 'Priya', last_name: 'R', email: 'p@x.com', phone: '9876543210', resume_url: 'u',
  qualification: 'M.Pharm', experience_months: 24,
  job: { id: 'j1', title: 'Store Keeper', role_category: 'non_teaching', institution_id: 'i1', hr_organization_id: 'o1' },
};

describe('promoteJobApplication — candidate source', () => {
  it.each([
    [{ source: 'external_website', applicant_user_id: null }, 'public_careers_page'],
    [{ source: 'internal', applicant_user_id: 'u1' }, 'public_careers_page'],
    [{ source: 'internal', applicant_user_id: null }, 'hr_submission'],
  ])('%o → %s', async (patch, expected) => {
    const spy = vi.spyOn(RecruitmentService, 'submitCandidate').mockResolvedValue({ id: 'c1' } as never);
    await RecruitmentService.promoteJobApplication(fakeDb({ ...BASE, ...patch }), 'app-1', 'hr-1');
    expect((spy.mock.calls[0][1] as { source: string }).source).toBe(expected);
    spy.mockRestore();
  });
});
```

- [ ] **Step 3:** Run → the `external_website` case FAILS (`hr_submission`).

- [ ] **Step 4: Fix promote** — in `promoteJobApplication`, replace
```ts
      source: application.applicant_user_id ? 'public_careers_page' : 'hr_submission',
```
with
```ts
      // Website applicants have no account (applicant_user_id NULL) but ARE careers-page
      // candidates; keying on the user id alone mislabelled every one as an HR submission.
      source:
        application.source === 'external_website' || application.applicant_user_id
          ? 'public_careers_page'
          : 'hr_submission',
```

- [ ] **Step 5: Analytics split** — in `getJobAnalytics`: select `'id, status, submitted_at, reviewed_at, source'` instead of `applicant_user_id`; in `AppRow` replace `applicant_user_id: string | null;` with `source: 'internal' | 'external_website';`; rename `withAccount` → `website` and count `if (a.source === 'external_website') website += 1;`; return `source_split: { internal: apps.length - website, website }`.

- [ ] **Step 6: Analytics tab** — in `workspace-analytics-tab.tsx`: rename `SOURCE_COLORS` keys `with_account` → `website`, `anonymous` → `internal` (keep the colour values); `sourceTotal = data.source_split.internal + data.source_split.website`; replace every `data.source_split.with_account` with `data.source_split.website` and `data.source_split.anonymous` with `data.source_split.internal`; label strings: `Signed-in applicants` → `Website (jkkn.ac.in)`, `Careers page (guest)` → `Entered in MyJKKN`.

- [ ] **Step 7: Website badges.**
In `applications-section.tsx`, right after the status `</Badge>` (inside the same flex row):
```tsx
                      {app.source === 'external_website' && (
                        <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[11px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                          Website
                        </Badge>
                      )}
```
In `workspace-candidates-tab.tsx`, right after the stage `</Badge>` (`{meta.label}`):
```tsx
            {app?.source === 'external_website' && (
              <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] px-1.5 py-0 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                Website
              </Badge>
            )}
```
(Confirm the local variable holding the application in that row is named `app` — it is used as `app!.id` a few lines above; if it is scoped differently, use the same expression the `Link` uses.)

- [ ] **Step 8: Relabel the toggle.** In `create-job-form.tsx` and `edit-job-form.tsx` replace every `Public on /careers` with `Show on website (jkkn.ac.in)` and `aria-label="Public on careers page"` with `aria-label="Show on website"`. In `jobs/page.tsx` replace the sentence
`Set status to <strong>Open</strong> and turn on{' '}<strong>Public on /careers</strong> to expose the role on the unauthenticated careers page.`
with
`Set status to <strong>Open</strong> and turn on{' '}<strong>Show on website (jkkn.ac.in)</strong> to list the role on the JKKN website, where anyone can apply without a login. Only jobs with this switch on appear there.`
(Keep the existing JSX line breaks; only the text changes.) Also `grep -rn "Public on /careers" app/` afterwards → expect 0 hits.

- [ ] **Step 9:** Run `npx vitest run __tests__/hr/public-careers __tests__/hr/recruitment-application-notes.test.ts __tests__/hr/recruitment-stage-model.test.ts` → PASS.
- [ ] **Step 10: Commit** `git add -A types/hr-recruitment.ts lib/services/hr/recruitment-service.ts "app/(routes)/hr/recruitment" __tests__/hr/public-careers/promote-source.test.ts && git commit -m "feat(hr/careers): website source badge, analytics split, promote source fix, toggle relabel"`

---

### Task 9: Website-team docs + verification

**Files:** Create `docs/public-careers-api.md`

- [ ] **Step 1: Write the docs** — contents: base URL (production MyJKKN host), the three endpoints with the exact query params, field table, status codes (`201/400/403/404/409/429/500/503`) and response shapes from the spec; the rule "call `/apply` from the browser, not your server"; the `PublicJob` shape; and this example:

```tsx
// Listing (server component / ISR on jkkn.ac.in)
const res = await fetch(`${MYJKKN}/api/public/careers/jobs?institution_id=${collegeId}`, { next: { revalidate: 300 } });
const { data: jobs, institutions } = await res.json();

// Apply (client component — must run in the browser)
async function apply(jobId: string, form: HTMLFormElement) {
  const fd = new FormData(form);          // inputs named exactly as the field table; <input type="file" name="resume">
  fd.set('consent', (form.elements.namedItem('consent') as HTMLInputElement).checked ? 'true' : 'false');
  fd.set('utm_source', window.location.hostname);
  const res = await fetch(`${MYJKKN}/api/public/careers/jobs/${jobId}/apply`, { method: 'POST', body: fd });
  const body = await res.json();
  if (res.status === 201) return { ok: true, reference: body.reference };
  return { ok: false, status: res.status, error: body.error, fields: body.fields ?? {} };
}
// Honeypot: render <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
// Do NOT set Content-Type yourself — the browser adds the multipart boundary.
```

- [ ] **Step 2: Scoped typecheck** — create `tsconfig.careers.json`:
```json
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true, "incremental": false },
  "include": ["next-env.d.ts", "types/**/*.d.ts", "lib/services/hr/public-careers/**/*.ts", "lib/hr/recruitment/**/*.ts",
    "app/api/public/careers/**/*.ts", "lib/services/hr/recruitment-service.ts", "types/hr-recruitment.ts",
    "app/(routes)/hr/recruitment/**/*.tsx"] }
```
Run `node node_modules/typescript/bin/tsc -p tsconfig.careers.json` → 0 errors in touched files (pre-existing errors elsewhere in included HR pages: compare against the same command on `origin/main` before claiming a regression). Delete `tsconfig.careers.json` afterwards (do not commit it).

- [ ] **Step 3: Full new-suite run** `npx vitest run __tests__/hr` → report pass/fail counts verbatim; compare failing files against a baseline run on `origin/main`.

- [ ] **Step 4: Live test (needs user OK — writes to prod).** With `PUBLIC_CAREERS_EXTRA_ORIGINS=http://localhost:3000` in `.env.local`, `npm run dev`, then:
  1. Ask the user to mark ONE JKKN Testing Institution job Public (or do it with their OK).
  2. From a page on `http://localhost:3000` (browser devtools console on any local page): `fetch('/api/public/careers/jobs').then(r=>r.json())` → the test job appears; its JSON has no `hr_organization_id`.
  3. POST a FormData with a real small PDF → `201 {reference}`; repeat → `409`.
  4. As an HR user of JKKN Testing Institution: the application shows with the **Website** badge; bell notification exists; `select source, consent_at, confirmation_email_sent_at, confirmation_email_error from hr_job_applications order by created_at desc limit 1`.
  5. Clean up: reject then purge the test applicant via the existing super-admin purge (removes the Drive file too); un-publish the test job if it wasn't public before.

- [ ] **Step 5: Commit docs** `git add docs/public-careers-api.md && git commit -m "docs(hr/careers): public careers API guide for the website team"`

- [ ] **Step 6:** Use superpowers:finishing-a-development-branch (push branch, open PR against `main` with the attribution line). Remind the user: set `PUBLIC_CAREERS_EXTRA_ORIGINS` only where needed (not in production), and HR must switch on "Show on website" for jobs to appear (1 of 33 today).
