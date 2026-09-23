import { describe, expect, it, vi } from 'vitest';
import { getPublicJob, isUuid, listPublicJobs, submitExternalApplication } from '@/lib/services/hr/public-careers/public-careers-service';
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
  it('returns null for a closed job even if the row exists', async () => {
    const { db } = fakeDb({ job: { ...JOB, status: 'closed' } });
    expect(await getPublicJob(db, JOB_ID, NOW)).toBeNull();
  });
});

describe('listPublicJobs', () => {
  const INST2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const JOB2 = { ...JOB, id: '22222222-2222-4222-8222-222222222222', title: 'Store Keeper', institution_id: INST2,
    institution: { id: INST2, name: 'JKKN Dental College and Hospital' } };

  it('computes the institution facets from ALL visible jobs, not the filtered page', async () => {
    const { db } = fakeDb({ job: [JOB, JOB2] });
    const r = await listPublicJobs(db, { institution_id: INST2 }, NOW);
    expect(r.data.map((j) => j.id)).toEqual([JOB2.id]);
    expect(r.institutions.map((i) => i.id).sort()).toEqual([INST2, 'inst-1']);
  });

  it('drops rows that fail the visibility re-check even if the query returned them', async () => {
    const { db } = fakeDb({ job: [JOB, { ...JOB2, status: 'filled' }] });
    const r = await listPublicJobs(db, {}, NOW);
    expect(r.data).toHaveLength(1);
    expect(r.institutions).toHaveLength(1);
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

  it('returns duplicate with the EXISTING reference when the email already applied (any source) and never uploads', async () => {
    const { db, inserted } = fakeDb({ job: JOB, existing: [{ id: 'bbbbbbbb-0000-4000-8000-000000000000' }] });
    const d = deps(db);
    const r = await submitExternalApplication(d, JOB_ID, INPUT);
    expect(r.kind).toBe('duplicate');
    // Same shape as a fresh reference so an anonymous caller can't tell "new" from "already applied".
    if (r.kind === 'duplicate') expect(r.reference).toBe('JOB-007-BBBBBBBB');
    expect(d.upload).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('cleans up the Drive file when the insert races into the unique index', async () => {
    const { db } = fakeDb({ job: JOB, insertError: { code: '23505' }, existing: [] });
    const d = deps(db);
    const r = await submitExternalApplication(d, JOB_ID, INPUT);
    expect(r.kind).toBe('duplicate');
    expect(d.deleteFile).toHaveBeenCalledWith('drive-1');
  });

  it('keeps the Drive file on an insert error that may have committed', async () => {
    const { db } = fakeDb({ job: JOB, insertError: { code: '57014' } });
    const d = deps(db);
    await expect(submitExternalApplication(d, JOB_ID, INPUT)).rejects.toBeTruthy();
    expect(d.deleteFile).not.toHaveBeenCalled();
  });
});
