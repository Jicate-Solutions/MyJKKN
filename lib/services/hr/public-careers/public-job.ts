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
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

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
