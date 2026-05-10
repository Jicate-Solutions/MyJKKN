// ============================================================================
// HR RECRUITMENT — Jobs admin UI.
// Created: 2026-05-09 (Tier 1 decomposition T1.1).
// Spec: specs/hr-module-decomposition-2026-05-09.md
//
// Closes the 404 on /hr/recruitment/jobs by giving HR officers + super-admins
// a place to create / edit / publish / close job postings. The companion
// migration (20260509100200_create_hr_recruitment_jobs.sql) creates the table
// the existing service (lib/services/hr/recruitment-jobs-service.ts) and API
// route (app/api/hr/recruitment/jobs/route.ts) already query.
//
// Composes the policy-shell substrate (PR #757):
//   - PolicyPageShell (gate + header + explainer banner)
//   - LookupTable (Shape C — list of jobs with create/edit dialog)
//
// Permission gate: admin_or_super_admin. Specific mutations resolve through
// the existing hr.recruitment.{view,create,edit,delete} grants in
// lib/constants/permissions.ts; we don't introduce a new permission row.
// ============================================================================

'use client';

import {
  LookupTable,
  PolicyPageShell,
  type FieldSchema,
  type LookupConfig,
  type PolicyHandlers,
  type EnumOption,
} from '@/lib/admin/policy-shell';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RecruitmentJobsService } from '@/lib/services/hr/recruitment-jobs-service';
import {
  JOB_STATUS_LABELS,
  type HRRecruitmentJob,
  type JobStatus,
  type RoleCategory,
} from '@/types/hr-recruitment';

// ---------------------------------------------------------------------------
// Enum option helpers
// ---------------------------------------------------------------------------

const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  teaching_faculty: 'Teaching Faculty',
  medical: 'Medical',
  non_teaching: 'Non-Teaching',
  senior_leadership: 'Senior Leadership',
  contract: 'Contract',
};

const ROLE_CATEGORY_OPTIONS: ReadonlyArray<EnumOption> = (
  Object.keys(ROLE_CATEGORY_LABELS) as RoleCategory[]
).map((value) => ({ value, label: ROLE_CATEGORY_LABELS[value] }));

const STATUS_OPTIONS: ReadonlyArray<EnumOption> = (
  Object.keys(JOB_STATUS_LABELS) as JobStatus[]
).map((value) => ({
  value,
  label: JOB_STATUS_LABELS[value],
  hint:
    value === 'open'
      ? 'Visible to interviewers; flip "Public on /careers" on to also expose it externally.'
      : value === 'on_hold'
      ? 'Hidden from public; existing applications stay attached.'
      : value === 'closed'
      ? 'Hiring abandoned. Future applications blocked.'
      : value === 'filled'
      ? 'All positions filled. Closes the posting cleanly.'
      : 'Not visible to anyone yet — finalise details before opening.',
}));

// ---------------------------------------------------------------------------
// Form schema — same fields for create + edit. hr_organization_id is required
// at create time (HR officer pastes the org UUID — same UX as
// /hr/recruitment/submit until Sprint N auto-resolves it from the profile).
// ---------------------------------------------------------------------------
function buildFormSchema(
  editing: HRRecruitmentJob | null,
): ReadonlyArray<FieldSchema> {
  const isEdit = editing !== null;

  return [
    {
      name: 'hr_organization_id',
      kind: 'text',
      englishLabel: 'HR Organization ID',
      englishHint: isEdit
        ? 'The HR organization that owns this posting. Locked once created.'
        : 'Paste the HR organization UUID. Auto-resolution from your profile is coming soon — for now this matches the field on /hr/recruitment/submit.',
      placeholder: '00000000-0000-0000-0000-000000000000',
      required: true,
      disabled: isEdit,
    },
    {
      name: 'institution_id',
      kind: 'text',
      englishLabel: 'Institution ID (optional)',
      englishHint:
        'Scopes the posting to a specific college. Leave blank for org-wide. HR officers only see postings where this matches one of their assigned institutions.',
      placeholder: '00000000-0000-0000-0000-000000000000',
    },
    {
      name: 'title',
      kind: 'text',
      englishLabel: 'Job title',
      englishHint: 'How the role is named in the posting (e.g. "Assistant Professor — Mechanical").',
      placeholder: 'e.g. Assistant Professor — Mechanical Engineering',
      required: true,
    },
    {
      name: 'role_category',
      kind: 'enum',
      englishLabel: 'Role category',
      englishHint:
        'Drives the approval chain on candidates submitted against this job. Teaching/medical/leadership all route differently.',
      options: ROLE_CATEGORY_OPTIONS,
      required: true,
    },
    {
      name: 'department_id',
      kind: 'text',
      englishLabel: 'Department ID (optional)',
      englishHint:
        'Optional. Pin the posting to one department so the HoD sees applications in their queue. Paste the department UUID.',
      placeholder: '00000000-0000-0000-0000-000000000000',
    },
    {
      name: 'description',
      kind: 'textarea',
      englishLabel: 'Description',
      englishHint:
        'What the role does and what success looks like in the first 6 months. Shown on the public /careers page when the job is published.',
      placeholder: 'What does this role do? What does success look like?',
    },
    {
      name: 'positions_open',
      kind: 'number',
      englishLabel: 'Positions open',
      englishHint: 'How many people you intend to hire under this posting.',
      min: 1,
      step: 1,
    },
    {
      name: 'positions_filled',
      kind: 'number',
      englishLabel: 'Positions filled',
      englishHint:
        'Updated as candidates join. When this reaches positions_open, set status to "Filled" to close the posting.',
      min: 0,
      step: 1,
    },
    {
      name: 'min_monthly_salary',
      kind: 'number',
      englishLabel: 'Min monthly salary (INR)',
      englishHint:
        'Lower bound of the monthly salary range advertised. Leave blank to keep it undisclosed.',
      min: 0,
      step: 1000,
    },
    {
      name: 'max_monthly_salary',
      kind: 'number',
      englishLabel: 'Max monthly salary (INR)',
      englishHint:
        'Upper bound of the monthly salary range. Must be ≥ min if both are set.',
      min: 0,
      step: 1000,
    },
    {
      name: 'status',
      kind: 'enum-with-hint',
      englishLabel: 'Status',
      englishHint:
        'Draft = not yet visible. Open = ready for applications. On Hold = paused. Closed/Filled = no more applications.',
      options: STATUS_OPTIONS,
      required: true,
    },
    {
      name: 'is_public',
      kind: 'toggle',
      englishLabel: 'Public on /careers',
      englishHint:
        'When on, this job is visible on the public careers page (logged-out visitors). Best paired with status "Open".',
    },
  ];
}

// ---------------------------------------------------------------------------
// Lookup config — declarative description of the table.
// ---------------------------------------------------------------------------
const config: LookupConfig<HRRecruitmentJob> = {
  title: 'Recruitment — Job Postings',
  explainer: (
    <>
      <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
      <p>
        Job postings drive the recruitment pipeline. Each posting carries a role
        category, optional department / institution scope, and a salary range.
        Candidates submitted under a posting inherit its role category for the
        approval chain.
      </p>
      <p className="mt-2">
        Set status to <strong>Open</strong> and turn on{' '}
        <strong>Public on /careers</strong> to expose the role on the
        unauthenticated careers page. Setting status to{' '}
        <strong>Closed</strong> or <strong>Filled</strong> hides it again.
      </p>
    </>
  ),
  columns: [
    {
      header: 'Title',
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{row.title}</div>
          <div className="text-xs text-muted-foreground">
            {ROLE_CATEGORY_LABELS[row.role_category]}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      widthClass: 'w-32',
      cell: (row) => (
        <span className="text-sm">{JOB_STATUS_LABELS[row.status]}</span>
      ),
    },
    {
      header: 'Public',
      widthClass: 'w-24',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.is_public ? 'On /careers' : 'Hidden'}
        </span>
      ),
    },
    {
      header: 'Filled',
      widthClass: 'w-24',
      cell: (row) => (
        <span className="text-xs">
          {row.positions_filled} / {row.positions_open}
        </span>
      ),
    },
    {
      header: 'Salary range (INR / month)',
      widthClass: 'w-44',
      cell: (row) => {
        if (row.min_monthly_salary == null && row.max_monthly_salary == null) {
          return (
            <span className="text-xs italic text-muted-foreground">
              Not disclosed
            </span>
          );
        }
        const fmt = (n: number | null) =>
          n == null ? '—' : new Intl.NumberFormat('en-IN').format(n);
        return (
          <span className="text-xs">
            {fmt(row.min_monthly_salary)} – {fmt(row.max_monthly_salary)}
          </span>
        );
      },
    },
    {
      header: 'Posted',
      widthClass: 'w-28',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.posted_at
            ? new Date(row.posted_at).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '—'}
        </span>
      ),
    },
  ],
  rowHint: (row) =>
    row.status === 'draft'
      ? 'Draft — not visible to anyone yet. Switch status to "Open" when ready.'
      : row.status === 'open' && !row.is_public
      ? 'Open internally but hidden from /careers. Turn on "Public on /careers" to expose.'
      : null,
  formSchema: buildFormSchema,
  addLabel: 'Add Job Posting',
  emptyMessage:
    'No job postings yet. Click "Add Job Posting" to create one — start as a draft, then open when ready.',
  entityNoun: 'Job Posting',
  deleteConfirmText: (row) =>
    `Permanently delete "${row.title}"? Existing candidates will keep their records but lose the link back to this posting. Use "Closed" status instead if you want to soft-archive.`,
};

// ---------------------------------------------------------------------------
// Page — handlers wire the substrate into the existing service.
// ---------------------------------------------------------------------------
export default function HRRecruitmentJobsPage() {
  const supabase = createClientSupabaseClient();

  const handlers: PolicyHandlers<HRRecruitmentJob> = {
    onLoad: async () => {
      const { data } = await RecruitmentJobsService.listJobs(supabase, {
        page: 1,
        pageSize: 200,
      });
      return data;
    },
    onSave: async (values, editing) => {
      const requireUuid = (raw: unknown, label: string): string => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!v) throw new Error(`${label} is required.`);
        return v;
      };
      const optionalUuid = (raw: unknown): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length > 0 ? v : null;
      };
      const optionalText = (raw: unknown): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length > 0 ? v : null;
      };
      const toIntOrNull = (raw: unknown): number | null => {
        if (raw == null || raw === '') return null;
        const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        return Number.isFinite(n) ? n : null;
      };

      const title = String(values.title ?? '').trim();
      if (!title) throw new Error('Job title is required.');

      const role_category = String(values.role_category ?? '').trim() as RoleCategory;
      if (!role_category) throw new Error('Role category is required.');

      const status = (String(values.status ?? '').trim() || 'draft') as JobStatus;

      const minSalary = toIntOrNull(values.min_monthly_salary);
      const maxSalary = toIntOrNull(values.max_monthly_salary);
      if (
        minSalary != null &&
        maxSalary != null &&
        minSalary > maxSalary
      ) {
        throw new Error('Min monthly salary cannot exceed max monthly salary.');
      }

      const positionsOpen = toIntOrNull(values.positions_open);
      const positionsFilled = toIntOrNull(values.positions_filled);

      if (editing) {
        // Edit path — service.updateJob(); hr_organization_id is locked.
        return RecruitmentJobsService.updateJob(supabase, editing.id, {
          title,
          role_category,
          description: optionalText(values.description),
          min_monthly_salary: minSalary,
          max_monthly_salary: maxSalary,
          positions_open: positionsOpen ?? editing.positions_open,
          positions_filled: positionsFilled ?? editing.positions_filled,
          department_id: optionalUuid(values.department_id),
          status,
          is_public: Boolean(values.is_public),
        });
      }

      // Create path — service.createJob().
      return RecruitmentJobsService.createJob(supabase, {
        hr_organization_id: requireUuid(
          values.hr_organization_id,
          'HR Organization ID',
        ),
        institution_id: optionalUuid(values.institution_id),
        title,
        role_category,
        description: optionalText(values.description),
        min_monthly_salary: minSalary,
        max_monthly_salary: maxSalary,
        positions_open: positionsOpen ?? 1,
        positions_filled: positionsFilled ?? 0,
        department_id: optionalUuid(values.department_id),
        status,
        is_public: Boolean(values.is_public),
      });
    },
    onDelete: async (row) => {
      await RecruitmentJobsService.deleteJob(supabase, row.id);
    },
  };

  const newRowDefaults = {
    hr_organization_id: '',
    institution_id: '',
    title: '',
    role_category: 'teaching_faculty' as RoleCategory,
    description: '',
    department_id: '',
    positions_open: 1,
    positions_filled: 0,
    min_monthly_salary: '',
    max_monthly_salary: '',
    status: 'draft' as JobStatus,
    is_public: false,
  };

  const rowToFormValues = (row: HRRecruitmentJob) => ({
    hr_organization_id: row.hr_organization_id,
    institution_id: row.institution_id ?? '',
    title: row.title,
    role_category: row.role_category,
    description: row.description ?? '',
    department_id: row.department_id ?? '',
    positions_open: row.positions_open,
    positions_filled: row.positions_filled,
    min_monthly_salary: row.min_monthly_salary ?? '',
    max_monthly_salary: row.max_monthly_salary ?? '',
    status: row.status,
    is_public: row.is_public,
  });

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<HRRecruitmentJob>
        config={config}
        handlers={handlers}
        newRowDefaults={newRowDefaults}
        rowToFormValues={rowToFormValues}
      />
    </PolicyPageShell>
  );
}
