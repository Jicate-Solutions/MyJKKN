/**
 * All Candidates page — pure model (no React), unit-tested in
 * __tests__/hr/recruitment-all-candidates-model.test.ts.
 *
 * buildPipelineRows merges the two record types the way the per-job workspace
 * Candidates tab does (every application is a row; a promoted application takes
 * its pipeline candidate's stage; a candidate with no application still gets a
 * row), but across every job the caller can see.
 *
 * Filters are one plain object that round-trips through the URL, so a filtered
 * view can be bookmarked or shared. Facet counts (category tabs, stage chips)
 * are computed with every filter applied EXCEPT their own, so each tab/chip
 * says how many rows clicking it would show.
 */

import type {
  JobStatus,
  JobType,
  RecruitmentPipelineResponse,
  RoleCategory,
  PipelineJobSummary,
} from '@/types/hr-recruitment';
import {
  CHIP_ORDER,
  applicationStage,
  candidateStage,
  type StageKey,
} from '../../approvals/[jobId]/_components/stage-model';

export { CHIP_ORDER };

// =====================================================================================
// Rows
// =====================================================================================

/** Where the person came from. 'direct' = submitted straight into the pipeline (no application). */
export type PipelineSource = 'external_website' | 'internal' | 'direct';

export const SOURCE_LABELS: Record<PipelineSource, string> = {
  external_website: 'Careers Website',
  internal: 'Internal',
  direct: 'Direct Submission',
};

// A type alias, not an interface: the shared DataTable requires an index-signature
// compatible row type, which interfaces never are.
export type PipelineRow = {
  key: string;
  applicationId: string | null;
  candidateId: string | null;
  name: string;
  email: string;
  phone: string | null;
  qualification: string | null;
  experienceMonths: number | null;
  currentTitle: string | null;
  currentCompany: string | null;
  workedCities: string[];
  resumeUrl: string | null;
  source: PipelineSource;
  submittedAt: string;
  stage: StageKey;
  isEmergency: boolean;
  /** Job title as applied for; a direct submission falls back to its role title. */
  jobTitle: string;
  job: PipelineJobSummary | null;
  roleCategory: RoleCategory | null;
  institutionId: string | null;
  institutionName: string | null;
  /** How many rows share this email — the person applied to that many jobs. */
  applicationsByPerson: number;
};

export function buildPipelineRows(data: RecruitmentPipelineResponse): PipelineRow[] {
  const jobById = new Map(data.jobs.map((j) => [j.id, j] as const));
  const institutionName = new Map(data.institutions.map((i) => [i.id, i.name] as const));
  const candById = new Map(data.candidates.map((c) => [c.id, c] as const));
  const linked = new Set<string>();

  const rows: PipelineRow[] = data.applications.map((a) => {
    const cand = a.promoted_candidate_id ? candById.get(a.promoted_candidate_id) ?? null : null;
    if (cand) linked.add(cand.id);
    const job = jobById.get(a.job_id) ?? null;
    const institutionId = job?.institution_id ?? a.institution_id;
    return {
      key: `app-${a.id}`,
      applicationId: a.id,
      candidateId: cand?.id ?? null,
      name: `${a.first_name} ${a.last_name}`.trim(),
      email: a.email,
      phone: a.phone,
      qualification: a.qualification,
      experienceMonths: a.experience_months,
      currentTitle: a.current_job_title,
      currentCompany: a.current_company,
      workedCities: a.worked_cities ?? [],
      resumeUrl: a.resume_url,
      source: a.source === 'external_website' ? 'external_website' : 'internal',
      submittedAt: a.submitted_at,
      stage: cand ? candidateStage(cand.status) : applicationStage(a.status),
      isEmergency: cand?.is_emergency ?? false,
      jobTitle: job?.title ?? 'Unknown job',
      job,
      roleCategory: job?.role_category ?? cand?.role_category ?? null,
      institutionId,
      institutionName: (institutionId && institutionName.get(institutionId)) || job?.institution_name || null,
      applicationsByPerson: 1,
    };
  });

  for (const c of data.candidates) {
    if (linked.has(c.id)) continue;
    const job = c.job_id ? jobById.get(c.job_id) ?? null : null;
    const institutionId = job?.institution_id ?? c.institution_id;
    rows.push({
      key: `cand-${c.id}`,
      applicationId: null,
      candidateId: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      qualification: null,
      experienceMonths: null,
      currentTitle: null,
      currentCompany: null,
      workedCities: [],
      resumeUrl: c.cvviz_url,
      source: 'direct',
      submittedAt: c.submitted_at,
      stage: candidateStage(c.status),
      isEmergency: c.is_emergency,
      jobTitle: job?.title ?? c.role_title,
      job,
      roleCategory: job?.role_category ?? c.role_category,
      institutionId,
      institutionName: (institutionId && institutionName.get(institutionId)) || job?.institution_name || null,
      applicationsByPerson: 1,
    });
  }

  const perPerson = new Map<string, number>();
  for (const r of rows) {
    const k = r.email.trim().toLowerCase();
    perPerson.set(k, (perPerson.get(k) ?? 0) + 1);
  }
  for (const r of rows) r.applicationsByPerson = perPerson.get(r.email.trim().toLowerCase()) ?? 1;

  return rows.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

// =====================================================================================
// Filters
// =====================================================================================

export type ExperienceBand = 'fresher' | 'under_2' | '2_5' | '5_10' | '10_plus';

export const EXPERIENCE_BAND_LABELS: Record<ExperienceBand, string> = {
  fresher: 'Fresher',
  under_2: 'Under 2 years',
  '2_5': '2–5 years',
  '5_10': '5–10 years',
  '10_plus': '10+ years',
};

export function experienceBand(months: number | null): ExperienceBand | null {
  if (months === null || months === undefined) return null;
  if (months <= 0) return 'fresher';
  if (months < 24) return 'under_2';
  if (months < 60) return '2_5';
  if (months < 120) return '5_10';
  return '10_plus';
}

export type AppliedWithin = '7' | '30' | '90' | 'custom';

export const APPLIED_WITHIN_LABELS: Record<AppliedWithin, string> = {
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  custom: 'Custom range',
};

export interface PipelineFilters {
  q: string;
  category: RoleCategory | 'all';
  stage: StageKey | 'all';
  institution: string | null;
  department: string | null;
  job: string | null;
  jobType: JobType | null;
  jobStatus: JobStatus | null;
  source: PipelineSource | null;
  experience: ExperienceBand | null;
  applied: AppliedWithin | null;
  /** yyyy-mm-dd, only read when applied === 'custom'. */
  from: string | null;
  to: string | null;
  city: string | null;
  hasResume: boolean;
  emergency: boolean;
  multiJob: boolean;
}

/** Page sizes offered by the table; 10 is the default (DataTable's own). */
export const PAGE_SIZES = [10, 25, 50, 100];

export const EMPTY_FILTERS: PipelineFilters = {
  q: '',
  category: 'all',
  stage: 'all',
  institution: null,
  department: null,
  job: null,
  jobType: null,
  jobStatus: null,
  source: null,
  experience: null,
  applied: null,
  from: null,
  to: null,
  city: null,
  hasResume: false,
  emergency: false,
  multiJob: false,
};

/** The advanced-panel keys — what "Clear all" resets and the badge counts. */
export const ADVANCED_KEYS = [
  'institution', 'department', 'job', 'jobType', 'jobStatus', 'source', 'experience',
  'applied', 'city', 'hasResume', 'emergency', 'multiJob',
] as const satisfies readonly (keyof PipelineFilters)[];

export function countAdvancedFilters(f: PipelineFilters): number {
  return ADVANCED_KEYS.filter((k) => f[k] !== EMPTY_FILTERS[k]).length;
}

const DAY = 86_400_000;

function appliedWindow(f: PipelineFilters, now: number): [number, number] | null {
  if (!f.applied) return null;
  if (f.applied !== 'custom') return [now - Number(f.applied) * DAY, Infinity];
  const from = f.from ? Date.parse(`${f.from}T00:00:00`) : -Infinity;
  const to = f.to ? Date.parse(`${f.to}T23:59:59.999`) : Infinity;
  return [Number.isNaN(from) ? -Infinity : from, Number.isNaN(to) ? Infinity : to];
}

type FacetKey = 'category' | 'stage';

/** True when the row passes every filter except the facet(s) named in `skip`. */
export function rowMatches(
  r: PipelineRow,
  f: PipelineFilters,
  now: number = Date.now(),
  skip: FacetKey[] = [],
): boolean {
  if (!skip.includes('category') && f.category !== 'all' && r.roleCategory !== f.category) return false;
  if (!skip.includes('stage') && f.stage !== 'all' && r.stage !== f.stage) return false;

  if (f.institution && r.institutionId !== f.institution) return false;
  if (f.department && r.job?.department_id !== f.department) return false;
  if (f.job && r.job?.id !== f.job) return false;
  if (f.jobType && r.job?.job_type !== f.jobType) return false;
  if (f.jobStatus && r.job?.status !== f.jobStatus) return false;
  if (f.source && r.source !== f.source) return false;
  if (f.experience && experienceBand(r.experienceMonths) !== f.experience) return false;
  if (f.city && !r.workedCities.some((c) => c.trim().toLowerCase() === f.city!.toLowerCase())) return false;
  if (f.hasResume && !r.resumeUrl) return false;
  if (f.emergency && !r.isEmergency) return false;
  if (f.multiJob && r.applicationsByPerson < 2) return false;

  const window = appliedWindow(f, now);
  if (window) {
    const t = Date.parse(r.submittedAt);
    if (Number.isNaN(t) || t < window[0] || t > window[1]) return false;
  }

  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [
      r.name, r.email, r.phone, r.qualification, r.currentCompany, r.currentTitle,
      r.jobTitle, r.job?.job_code,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
  }
  return true;
}

/** Column ids the table can sort by (DataTable passes these as sort_by). */
export type SortColumn =
  | 'name' | 'jobTitle' | 'institutionName' | 'roleCategory' | 'qualification'
  | 'experienceMonths' | 'source' | 'stage' | 'submittedAt' | 'applicationsByPerson';

const STAGE_RANK = new Map(CHIP_ORDER.map((s, i) => [s, i] as const));

function sortValue(r: PipelineRow, by: SortColumn): string | number | null {
  switch (by) {
    case 'name': return r.name.toLowerCase();
    case 'jobTitle': return r.jobTitle.toLowerCase();
    case 'institutionName': return r.institutionName?.toLowerCase() ?? null;
    case 'roleCategory': return r.roleCategory;
    case 'qualification': return r.qualification?.toLowerCase() ?? null;
    case 'experienceMonths': return r.experienceMonths;
    case 'source': return r.source;
    case 'stage': return STAGE_RANK.get(r.stage) ?? 99;
    case 'applicationsByPerson': return r.applicationsByPerson;
    default: return Date.parse(r.submittedAt);
  }
}

/**
 * Sort by a table column. Unknown columns (DataTable's default 'created_at')
 * sort by applied date. Blank values always go last, whichever the direction.
 */
export function sortRows(rows: PipelineRow[], by: string, order: 'asc' | 'desc' = 'desc'): PipelineRow[] {
  const col = by as SortColumn;
  const dir = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, col);
    const vb = sortValue(b, col);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

export interface PipelineView {
  /** Every filter applied, newest first — what the table pages through and Export writes. */
  filtered: PipelineRow[];
  categoryCounts: Map<RoleCategory | 'all', number>;
  stageCounts: Map<StageKey | 'all', number>;
}

export function computeView(rows: PipelineRow[], f: PipelineFilters, now: number = Date.now()): PipelineView {
  const categoryCounts = new Map<RoleCategory | 'all', number>([['all', 0]]);
  const stageCounts = new Map<StageKey | 'all', number>([['all', 0]]);
  const filtered: PipelineRow[] = [];

  for (const r of rows) {
    if (rowMatches(r, f, now, ['category'])) {
      categoryCounts.set('all', (categoryCounts.get('all') ?? 0) + 1);
      if (r.roleCategory) categoryCounts.set(r.roleCategory, (categoryCounts.get(r.roleCategory) ?? 0) + 1);
    }
    if (rowMatches(r, f, now, ['stage'])) {
      stageCounts.set('all', (stageCounts.get('all') ?? 0) + 1);
      stageCounts.set(r.stage, (stageCounts.get(r.stage) ?? 0) + 1);
    }
    if (rowMatches(r, f, now)) filtered.push(r);
  }

  return { filtered, categoryCounts, stageCounts };
}

export interface PipelineSummary {
  total: number;
  newThisWeek: number;
  inApproval: number;
  joined: number;
  /** Percentage (0–100) of rows that came through the careers website. */
  websiteShare: number;
}

export function summarize(rows: PipelineRow[], now: number = Date.now()): PipelineSummary {
  const weekAgo = now - 7 * DAY;
  let newThisWeek = 0;
  let inApproval = 0;
  let joined = 0;
  let website = 0;
  for (const r of rows) {
    if (Date.parse(r.submittedAt) >= weekAgo) newThisWeek += 1;
    if (r.stage === 'in_approval') inApproval += 1;
    if (r.stage === 'joined') joined += 1;
    if (r.source === 'external_website') website += 1;
  }
  return {
    total: rows.length,
    newThisWeek,
    inApproval,
    joined,
    websiteShare: rows.length ? Math.round((website / rows.length) * 100) : 0,
  };
}

// =====================================================================================
// URL round-trip
// =====================================================================================

const CATEGORY_VALUES: RoleCategory[] = ['teaching_faculty', 'medical', 'non_teaching', 'senior_leadership', 'contract'];
const JOB_TYPE_VALUES: JobType[] = ['full_time', 'part_time', 'contract', 'internship', 'freelance'];
const JOB_STATUS_VALUES: JobStatus[] = ['draft', 'open', 'on_hold', 'closed', 'filled'];
const SOURCE_VALUES = Object.keys(SOURCE_LABELS) as PipelineSource[];
const EXPERIENCE_VALUES = Object.keys(EXPERIENCE_BAND_LABELS) as ExperienceBand[];
const APPLIED_VALUES = Object.keys(APPLIED_WITHIN_LABELS) as AppliedWithin[];
const STAGE_VALUES = CHIP_ORDER.filter((s): s is StageKey => s !== 'all');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(v: string | null, allowed: readonly T[]): T | null {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** Unknown or malformed params fall back to their defaults — a stale link never errors. */
export function filtersFromParams(p: URLSearchParams): PipelineFilters {
  return {
    q: (p.get('q') ?? '').slice(0, 100),
    category: oneOf(p.get('category'), CATEGORY_VALUES) ?? 'all',
    stage: oneOf(p.get('stage'), STAGE_VALUES) ?? 'all',
    institution: p.get('institution'),
    department: p.get('department'),
    job: p.get('job'),
    jobType: oneOf(p.get('jobType'), JOB_TYPE_VALUES),
    jobStatus: oneOf(p.get('jobStatus'), JOB_STATUS_VALUES),
    source: oneOf(p.get('source'), SOURCE_VALUES),
    experience: oneOf(p.get('experience'), EXPERIENCE_VALUES),
    applied: oneOf(p.get('applied'), APPLIED_VALUES),
    from: DATE_RE.test(p.get('from') ?? '') ? p.get('from') : null,
    to: DATE_RE.test(p.get('to') ?? '') ? p.get('to') : null,
    city: p.get('city'),
    hasResume: p.get('hasResume') === '1',
    emergency: p.get('emergency') === '1',
    multiJob: p.get('multiJob') === '1',
  };
}

/**
 * Writes the page's own filters onto `base` (the current URL params), keeping
 * the keys the DataTable owns there (page, pageSize, sortBy, sortOrder,
 * columnVisibility). Only non-default values are written.
 */
export function filtersToParams(f: PipelineFilters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const key of Object.keys(EMPTY_FILTERS)) p.delete(key);
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof PipelineFilters)[]) {
    const v = f[key];
    if (v === EMPTY_FILTERS[key] || v === null || v === '') continue;
    if (key === 'from' || key === 'to') {
      if (f.applied !== 'custom') continue;
    }
    p.set(key, typeof v === 'boolean' ? '1' : String(v));
  }
  return p;
}

// =====================================================================================
// Export
// =====================================================================================

export const EXPORT_HEADERS = [
  'Name', 'Email', 'Phone', 'Applied For', 'Job Code', 'College', 'Department', 'Category',
  'Job Type', 'Stage', 'Source', 'Qualification', 'Experience (months)', 'Current Role',
  'Current Company', 'Worked Cities', 'Applied On', 'Emergency', 'Jobs Applied (person)', 'Resume',
] as const;

export function toExportRows(
  rows: PipelineRow[],
  labels: {
    stage: (s: StageKey) => string;
    category: (c: RoleCategory) => string;
    jobType: (t: JobType) => string;
  },
): (string | number | null)[][] {
  return rows.map((r) => [
    r.name,
    r.email,
    r.phone,
    r.jobTitle,
    r.job?.job_code ?? null,
    r.institutionName,
    r.job?.department_name ?? null,
    r.roleCategory ? labels.category(r.roleCategory) : null,
    r.job?.job_type ? labels.jobType(r.job.job_type) : null,
    labels.stage(r.stage),
    SOURCE_LABELS[r.source],
    r.qualification,
    r.experienceMonths,
    r.currentTitle,
    r.currentCompany,
    r.workedCities.join(', ') || null,
    r.submittedAt.slice(0, 10),
    r.isEmergency ? 'Yes' : 'No',
    r.applicationsByPerson,
    r.resumeUrl,
  ]);
}
