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
  // One unfiltered read of everything visible (a few dozen rows in practice;
  // the cap is a safety net, not pagination), then filter in memory so the
  // institution facets describe the whole board, not the filtered page.
  const { data, error } = await db
    .from('hr_recruitment_jobs')
    .select(PUBLIC_JOB_SELECT)
    .eq('is_public', true)
    .eq('status', 'open')
    .or(`closes_at.is.null,closes_at.gt.${now.toISOString()}`)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;

  const all = ((data ?? []) as unknown as PublicJobRow[]).filter((r) => isJobVisible(r, now)).map(toPublicJob);

  const facets = new Map<string, InstitutionFacet>();
  for (const j of all) {
    if (!j.institution) continue;
    const f = facets.get(j.institution.id) ?? { ...j.institution, open_jobs: 0 };
    f.open_jobs += 1;
    facets.set(j.institution.id, f);
  }

  const q = (filters.q ?? '').trim().slice(0, 100).toLowerCase();
  const jobType = filters.job_type && (JOB_TYPES as readonly string[]).includes(filters.job_type) ? filters.job_type : null;
  const inst = filters.institution_id && isUuid(filters.institution_id) ? filters.institution_id : null;
  const jobs = all.filter((j) =>
    (!inst || j.institution?.id === inst)
    && (!jobType || j.job_type === jobType)
    && (!q || j.title.toLowerCase().includes(q)));

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
  /** Already applied (any source). Carries a reference of the SAME shape as a
   *  fresh one so the response can't be used to probe who has applied. */
  | { kind: 'duplicate'; reference: string };

const referenceFor = (jobCode: string | null, id: string) =>
  `${jobCode ?? 'JOB'}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

async function existingApplicationId(db: SupabaseClient, jobId: string, email: string): Promise<string | null> {
  // Both write paths lower-case the email, so equality on the lower-cased input is exact.
  const { data, error } = await db
    .from('hr_job_applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('email', email)
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as { id: string } | undefined;
  return row?.id ?? null;
}

export async function submitExternalApplication(
  deps: SubmitDeps, jobId: string, input: ApplyInput,
): Promise<SubmitResult> {
  const now = deps.now ?? new Date();
  const job = await loadVisibleJobRow(deps.db, jobId, now);
  if (!job) return { kind: 'not_found' };

  const jobCode = (job.job_code as string | null) ?? null;

  // Pre-check across ALL sources: someone HR already keyed in is "already applied" too.
  const existing = await existingApplicationId(deps.db, jobId, input.email);
  if (existing) return { kind: 'duplicate', reference: referenceFor(jobCode, existing) };

  const uploaded = await deps.upload({
    jobTitle: String(job.title),
    jobCode,
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
    if ((error as { code?: string }).code === '23505') {
      // Lost a concurrent-submit race: the other row is committed, ours never
      // was, so the upload is a definite orphan. Any OTHER error (timeout,
      // network) may have committed — keep the file; a dangling resume beats
      // an application whose resume_url points at nothing.
      await deps.deleteFile(uploaded.driveFileId).catch(() => false);
      const winner = await existingApplicationId(deps.db, jobId, input.email).catch(() => null);
      return { kind: 'duplicate', reference: referenceFor(jobCode, winner ?? 'RECEIVED0') };
    }
    console.error('[public/careers] insert failed after upload; Drive file kept for reconciliation', {
      driveFileId: uploaded.driveFileId, jobId, code: (error as { code?: string }).code,
    });
    throw error;
  }

  const id = String((row as { id: string }).id);
  const inst = job.institution as { id?: string; name?: string } | null;
  return {
    kind: 'created',
    application: {
      applicationId: id,
      reference: referenceFor(jobCode, id),
      jobTitle: String(job.title),
      institutionId: (job.institution_id as string | null) ?? null,
      institutionName: inst?.name ?? null,
    },
  };
}
