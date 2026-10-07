// HR intake helper — one test (at least) per finding of the PR #4163 review.
// The session client is READ-ONLY here, exactly as production grants it, so any
// write that does not go through the service role fails the test with 42501.

import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeRow } from '@/types/hr-intake';
import {
  AMBIGUOUS_RESUME_NOTE,
  apply,
  cleanupIdleBatches,
  createBatch,
  createUploadUrls,
  decide,
  discardBatch,
  getBatch,
  IntakeError,
  prepareBatch,
  SHARED_RESUME_NOTE,
  type IntakeActor,
  type IntakeDeps,
} from '@/lib/services/hr/intake/intake-service';
import { normaliseJobTitle } from '@/lib/hr/intake/normalise';
import { FakeSupabase } from './fake-supabase';
import fixture from './fixtures/open-jobs.json';

const J = fixture.jobs;
// Job titles live in the JSON fixture (the terminology gate reads .ts files).
const GENERIC = fixture.titles.generic;
const COLLEGE_1 = J.principal.institution_id;
const COLLEGE_2 = J.admin_officer.institution_id;
const PDF = (tag: string) => new TextEncoder().encode(`%PDF-1.4\n% ${tag}\n`);
const tsv = (...lines: string[]) =>
  new TextEncoder().encode(['File Name\tFirst Name\tEmail Address\tPhone Number\tJob', ...lines].join('\n'));

const HR: IntakeActor = { id: 'u-hr-1', name: 'Kavitha Demo', institution_id: COLLEGE_1 };
const HR2: IntakeActor = { id: 'u-hr-2', name: 'Suresh Demo', institution_id: COLLEGE_1 };
const NO_HOME: IntakeActor = { id: 'u-hr-9', name: 'Floating Demo', institution_id: null };
const SUPER: IntakeActor = { id: 'u-super', name: 'Director Demo', institution_id: null, is_super_admin: true };

let fake: FakeSupabase;
let upload: ReturnType<typeof vi.fn>;
let deleteFile: ReturnType<typeof vi.fn>;
let n: number;

function deps(): IntakeDeps {
  return { db: fake.asSession(), admin: fake.asClient(), upload: upload as never, deleteFile: deleteFile as never, extractor: null };
}

async function runBatch(files: { name: string; bytes: Uint8Array; type?: string }[], exportBytes: Uint8Array, actor: IntakeActor = HR) {
  const d = deps();
  const { batch } = await createBatch(d, actor, { name: 'e.tsv', bytes: exportBytes });
  let uploaded: { name: string; path: string }[] = [];
  if (files.length > 0) {
    const { uploads } = await createUploadUrls(d, batch.id, {
      files: files.map((f) => ({ name: f.name, size: f.bytes.byteLength, type: f.type ?? 'application/pdf' })),
    });
    uploads.forEach((u, i) => fake.objects.set(`hr-intake/${u.path}`, { bytes: files[i].bytes }));
    uploaded = uploads.map((u) => ({ name: u.name, path: u.path }));
  }
  return prepareBatch(d, actor, batch.id, { uploaded });
}

const rowAt = (rows: IntakeRow[], i: number) => rows.find((r) => r.row_index === i)!;
const rawRow = (id: string) => fake.table('hr_intake_rows').find((r) => r.id === id)!;

beforeEach(() => {
  fake = new FakeSupabase();
  n = 0;
  upload = vi.fn(async ({ file }: { file: File }) => {
    n += 1;
    return { url: `https://drive.example/file/${n}/${file.name}`, driveFileId: `drive-${n}` };
  });
  deleteFile = vi.fn(async () => true);
  for (const j of [J.principal, J.english, J.history, J.admin_officer]) {
    fake.table('hr_recruitment_jobs').push({
      id: j.id, title: j.title, job_code: j.job_code, institution_id: j.institution_id, status: 'open',
      closes_at: null, requirements: {}, institution: { name: j.institution_name }, department: null,
    });
  }
  fake.table('institutions').push({ id: COLLEGE_1, name: 'Arts Demo College' }, { id: COLLEGE_2, name: 'Engineering Demo College' });
});

describe('B1 — every batch carries a college', () => {
  it('with no college chosen, uses the uploader’s home college and never asks the access check about NULL', async () => {
    // A chosen college is allowed when their access reaches it (Director, 1 Oct): see intake-followups.test.ts.
    const { batch } = await createBatch(deps(), HR, { name: 'e.tsv', bytes: tsv('a.pdf\tA\ta@example.test\t9811111111\tPrincipal') });
    expect(fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.institution_id).toBe(COLLEGE_1);
    expect(fake.rpcCalls.every((c) => (c.args as { check_institution_id: unknown }).check_institution_id != null)).toBe(true);
  });

  it('someone with no college must choose one: refused with the colleges they can choose from', async () => {
    fake.reachable = (id) => id === COLLEGE_2;
    const err = await createBatch(deps(), NO_HOME, { name: 'e.tsv', bytes: tsv('a.pdf\tA\ta@example.test\t9811111111\tPrincipal') })
      .then(() => null, (e: unknown) => e as IntakeError);
    expect(err).toBeInstanceOf(IntakeError);
    expect(err).toMatchObject({ status: 400 });
    expect(err?.details).toEqual({ needs_institution: true, institutions: [{ id: COLLEGE_2, name: 'Engineering Demo College' }] });
    expect(fake.table('hr_intake_batches')).toHaveLength(0);
  });

  it('a chosen college they cannot reach is refused; one they can is used', async () => {
    fake.reachable = (id) => id === COLLEGE_2;
    const bytes = tsv('a.pdf\tA\ta@example.test\t9811111111\tPrincipal');
    await expect(createBatch(deps(), NO_HOME, { name: 'e.tsv', bytes }, COLLEGE_1)).rejects.toMatchObject({ status: 403 });
    await expect(createBatch(deps(), NO_HOME, { name: 'e.tsv', bytes }, 'not-a-uuid')).rejects.toMatchObject({ status: 403 });
    const { batch } = await createBatch(deps(), NO_HOME, { name: 'e.tsv', bytes }, COLLEGE_2);
    expect(fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.institution_id).toBe(COLLEGE_2);
  });
});

describe('M1 — one resume, one person', () => {
  it('two different people naming the same file: neither gets it, both say why', async () => {
    const { rows, batch } = await runBatch(
      [{ name: 'cv.pdf', bytes: PDF('cv') }],
      tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'cv.pdf\tBala\tbala@example.test\t9822222222\tPrincipal'),
    );
    for (const i of [1, 2]) {
      expect(rowAt(rows, i).resume).toMatchObject({ matched_upload: false, storage_path: null });
      expect(rowAt(rows, i).proposal.reasons).toContain(SHARED_RESUME_NOTE);
      expect(rowAt(rows, i).proposal.confidence).toBe('low');
    }
    const got = await getBatch(deps(), batch.id);
    expect(got.skipped_files).toContainEqual({ file_name: 'cv.pdf', reason: 'Two different candidates name this file' });
  });

  it('the same person on two rows may share their one file', async () => {
    const { rows } = await runBatch(
      [{ name: 'cv.pdf', bytes: PDF('cv') }],
      tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'),
    );
    expect(rowAt(rows, 1).resume.matched_upload).toBe(true);
    expect(rowAt(rows, 2).resume.matched_upload).toBe(true);
  });

  it('two uploaded files with the same name: the row pairs with neither', async () => {
    const { rows, batch } = await runBatch(
      [{ name: 'cv.pdf', bytes: PDF('one') }, { name: 'cv.pdf', bytes: PDF('two') }],
      tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'),
    );
    expect(rows[0].resume.matched_upload).toBe(false);
    expect(rows[0].proposal.reasons).toContain(AMBIGUOUS_RESUME_NOTE);
    expect(rows[0].proposal.reasons).not.toContain('Resume file was not in the upload');
    const got = await getBatch(deps(), batch.id);
    expect(got.skipped_files.filter((s) => s.reason.startsWith('Another uploaded file has the same name'))).toHaveLength(2);
  });

  it('a zip with x/Resume.pdf and y/Resume.pdf keeps them distinct and pairs neither', async () => {
    const zip = new JSZip();
    zip.file('x/Resume.pdf', PDF('x'));
    zip.file('y/Resume.pdf', PDF('y'));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const { rows } = await runBatch([{ name: 'all.zip', bytes, type: 'application/zip' }], tsv('Resume.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    expect(rows[0].resume.matched_upload).toBe(false);
    expect(rows[0].proposal.reasons).toContain(AMBIGUOUS_RESUME_NOTE);
  });
});

async function decidedRow(email = 'asha@example.test') {
  const { batch, rows } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv(`cv.pdf\tAsha\t${email}\t9811111111\tPrincipal`));
  await decide(deps(), HR, rows[0].id, { action: 'file_under_job', job_id: J.principal.id });
  return { batch, row: rows[0] };
}

describe('M2 — the database refuses the same person twice under one job', () => {
  it('losing the race links the winner and deletes the orphan Drive copy', async () => {
    const { batch, row } = await decidedRow();
    // The other request files the same person while our Drive upload runs.
    upload.mockImplementationOnce(async () => {
      fake.table('hr_job_applications').push({ id: 'app-winner', job_id: J.principal.id, email: 'asha@example.test', source: 'cvviz_import' });
      return { url: 'https://drive.example/file/x', driveFileId: 'drive-orphan' };
    });
    const { results } = await apply(deps(), HR, batch.id);
    expect(results).toEqual([{ row_id: row.id, ok: true, application_id: 'app-winner', error: null }]);
    expect(deleteFile).toHaveBeenCalledWith('drive-orphan');
    expect(fake.table('hr_job_applications')).toHaveLength(1);
    expect(rawRow(row.id).application_id).toBe('app-winner');
  });
});

describe('M3 — a correction never touches another college’s rule', () => {
  it('writes the rule for the job’s own college and leaves the other college’s rule as it was', async () => {
    fake.table('hr_intake_match_rules').push({
      id: 'rule-other', cvviz_job_title_norm: normaliseJobTitle(GENERIC), job_id: J.admin_officer.id,
      institution_id: COLLEGE_2, created_by: 'u-other', created_by_name: 'Other College HR', times_used: 4, created_at: '2026-09-01T00:00:00Z',
    });
    const { rows } = await runBatch([], tsv(`\tAsha\tasha@example.test\t9811111111\t${GENERIC}`));
    const res = await decide(deps(), HR, rows[0].id, { action: 'file_under_job', job_id: J.history.id });
    expect(res.rule).toMatchObject({ job_id: J.history.id, created_by: HR.id });
    const rules = fake.table('hr_intake_match_rules');
    expect(rules).toHaveLength(2);
    expect(rules.find((r) => r.id === 'rule-other')).toMatchObject({ job_id: J.admin_officer.id, institution_id: COLLEGE_2, created_by: 'u-other', created_by_name: 'Other College HR' });
    expect(rules.find((r) => r.id !== 'rule-other')).toMatchObject({ institution_id: COLLEGE_1, job_id: J.history.id });
  });

  it('a later correction in the same college moves that college’s rule and its credit', async () => {
    const { rows } = await runBatch([], tsv(`\tAsha\tasha@example.test\t9811111111\t${GENERIC}`));
    await decide(deps(), HR, rows[0].id, { action: 'file_under_job', job_id: J.history.id });
    const { rows: again } = await runBatch([], tsv(`\tBala\tbala@example.test\t9822222222\t${GENERIC}`), HR2);
    const res = await decide(deps(), HR2, again[0].id, { action: 'file_under_job', job_id: J.english.id });
    expect(res.rule).toMatchObject({ job_id: J.english.id, created_by: HR2.id });
    expect(fake.table('hr_intake_match_rules')).toHaveLength(1);
  });

  it('a job with no college cannot be chosen, so it teaches no rule (no shared NULL-college rules)', async () => {
    fake.table('hr_recruitment_jobs').push({
      id: 'a0000000-0000-4000-8000-0000000000ff', title: 'Floating Post', job_code: null, institution_id: null,
      status: 'open', closes_at: null, requirements: {}, institution: null, department: null,
    });
    const { rows } = await runBatch([], tsv(`\tAsha\tasha@example.test\t9811111111\t${GENERIC}`));
    await expect(decide(deps(), HR, rows[0].id, { action: 'file_under_job', job_id: 'a0000000-0000-4000-8000-0000000000ff' }))
      .rejects.toMatchObject({ status: 400 });
    expect(rawRow(rows[0].id).decision_action ?? null).toBeNull();
    expect(fake.table('hr_intake_match_rules')).toHaveLength(0);
  });
});

describe('M4 — the server writes; filing trusts nothing it did not write', () => {
  it('a whole batch, decided and filed, never writes through the session client', async () => {
    const { batch } = await decidedRow();
    await apply(deps(), HR, batch.id);
    expect(fake.log.filter((l) => l.startsWith('REFUSED'))).toEqual([]);
    expect(fake.table('hr_job_applications')).toHaveLength(1);
  });

  it('a resume path outside the row’s batch is refused, nothing uploaded', async () => {
    const { batch, row } = await decidedRow();
    rawRow(row.id).resume_storage_path = 'some-other-batch/cv.pdf';
    const { results } = await apply(deps(), HR, batch.id);
    expect(results[0]).toMatchObject({ ok: false, error: 'The stored resume is not part of this upload' });
    rawRow(row.id).resume_storage_path = `${batch.id}/../x/cv.pdf`;
    expect((await apply(deps(), HR, batch.id)).results[0].ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('a row with no recorded decider is refused', async () => {
    const { batch, row } = await decidedRow();
    rawRow(row.id).decided_by = null;
    const { results } = await apply(deps(), HR, batch.id);
    expect(results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/no one has recorded a decision/i) });
    expect(upload).not.toHaveBeenCalled();
  });

  it('the name beside a decision is the deciding person’s, from the server', async () => {
    const { row } = await decidedRow();
    expect(rawRow(row.id)).toMatchObject({ decided_by: HR.id, decided_by_name: 'Kavitha Demo' });
  });
});

describe('M5 — nothing unfileable is high; discard and idle clean-up', () => {
  it('no resume in the upload: proposed low', async () => {
    const { batch, rows } = await runBatch([], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    expect(rows[0].proposal).toMatchObject({ action: 'file_under_job', confidence: 'low' });
    expect(rows[0].proposal.reasons[0]).toBe('No resume uploaded');
  });

  it('only the uploader or a super admin may discard; discarding removes rows and resume copies', async () => {
    const { batch } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    expect(fake.objects.size).toBe(1);
    await expect(discardBatch(deps(), HR2, batch.id)).rejects.toMatchObject({ status: 403 });
    expect(await discardBatch(deps(), HR, batch.id)).toEqual({ ok: true, removed_files: 1 });
    expect(fake.table('hr_intake_batches')).toHaveLength(0);
    expect(fake.objects.size).toBe(0);
    await expect(getBatch(deps(), batch.id)).rejects.toMatchObject({ status: 404 });

    const second = await runBatch([], tsv('\tBala\tbala@example.test\t9822222222\tPrincipal'));
    expect(await discardBatch(deps(), SUPER, second.batch.id)).toMatchObject({ ok: true });
  });

  it('closes a batch idle for 30 days and removes its copies; leaves an active one alone', async () => {
    const idle = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    const active = await runBatch([{ name: 'cv2.pdf', bytes: PDF('cv2') }], tsv('cv2.pdf\tBala\tbala@example.test\t9822222222\tPrincipal'));
    const old = '2026-08-01T00:00:00.000Z';
    for (const b of fake.table('hr_intake_batches')) b.updated_at = old;
    for (const r of fake.table('hr_intake_rows')) r.updated_at = r.batch_id === idle.batch.id ? old : new Date().toISOString();

    const summary = await cleanupIdleBatches(fake.asClient(), new Date('2026-10-01T00:00:00.000Z'));
    expect(summary).toMatchObject({ ok: true, checked: 2, closed: 1, files_removed: 1, failed: 0, count: 1 });
    const batches = fake.table('hr_intake_batches');
    expect(batches.find((b) => b.id === idle.batch.id)!.status).toBe('closed');
    expect(batches.find((b) => b.id === active.batch.id)!.status).toBe('ready');
    expect(fake.table('hr_intake_rows').find((r) => r.batch_id === idle.batch.id)!.resume_storage_path).toBeNull();
    expect([...fake.objects.keys()].some((k) => k.includes(active.batch.id))).toBe(true);
  });
});

describe('M6 — a failure after the batch is ready never deletes its rows', () => {
  it('keeps the rows and the ready status', async () => {
    const d = deps();
    const { batch } = await createBatch(d, HR, { name: 'e.tsv', bytes: tsv('\tAsha\tasha@example.test\t9811111111\tPrincipal') });
    // The first read of the rows happens only after the batch is marked ready.
    fake.failures.set('hr_intake_rows.select', { message: 'connection reset' });
    await expect(prepareBatch(d, HR, batch.id, { uploaded: [] })).rejects.toThrow(/connection reset/);
    expect(fake.table('hr_intake_rows')).toHaveLength(1);
    expect(fake.table('hr_intake_batches')[0]).toMatchObject({ status: 'ready' });
  });
});

describe('M7 — "needs a new job" keeps the batch open, with its resume', () => {
  it('does not close or drop resumes; the row can be filed once the job exists', async () => {
    const { batch, rows } = await runBatch(
      [{ name: 'a.pdf', bytes: PDF('a') }, { name: 'b.pdf', bytes: PDF('b') }],
      tsv('a.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'b.pdf\tBala\tbala@example.test\t9822222222\tPrincipal'),
    );
    await decide(deps(), HR, rowAt(rows, 1).id, { action: 'file_under_job', job_id: J.principal.id });
    await decide(deps(), HR, rowAt(rows, 2).id, { action: 'needs_new_job' });
    await apply(deps(), HR, batch.id);
    let got = await getBatch(deps(), batch.id);
    expect(got.batch.status).toBe('ready');
    expect(rowAt(got.rows, 2).resume.storage_path).not.toBeNull();
    expect([...fake.objects.keys()].some((k) => k.endsWith('b.pdf'))).toBe(true);

    // HR opens the job (here: it already exists) and changes the row.
    await decide(deps(), HR, rowAt(rows, 2).id, { action: 'file_under_job', job_id: J.history.id });
    const { results } = await apply(deps(), HR, batch.id, [rowAt(rows, 2).id]);
    expect(results[0].ok).toBe(true);
    got = await getBatch(deps(), batch.id);
    expect(got.batch.status).toBe('closed');
  });
});

describe('minors', () => {
  it('signed upload URLs never overwrite: upsert false, and a repeated name gets a fresh path', async () => {
    const { batch } = await createBatch(deps(), HR, { name: 'e.tsv', bytes: tsv('cv.pdf\tA\ta@example.test\t9811111111\tPrincipal') });
    const first = await createUploadUrls(deps(), batch.id, { files: [{ name: 'cv.pdf', size: 5, type: 'application/pdf' }] });
    fake.objects.set(`hr-intake/${first.uploads[0].path}`, { bytes: PDF('a') });
    const second = await createUploadUrls(deps(), batch.id, { files: [{ name: 'cv.pdf', size: 5, type: 'application/pdf' }] });
    expect(second.uploads[0].path).not.toBe(first.uploads[0].path);
    expect(fake.signedUploadOpts.every((o) => o.upsert === false)).toBe(true);
  });

  it('decide refuses while the row is being filed, and once it is filed', async () => {
    const { batch, row } = await decidedRow();
    rawRow(row.id).apply_claimed_at = new Date().toISOString();
    await expect(decide(deps(), HR, row.id, { action: 'skip' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/being filed/) });
    rawRow(row.id).apply_claimed_at = null;
    await apply(deps(), HR, batch.id);
    await expect(decide(deps(), HR, row.id, { action: 'skip' })).rejects.toMatchObject({ status: 409 });
  });

  it('a failed filing never clears a claim another request holds', async () => {
    const { batch, row } = await decidedRow();
    const claim = new Date().toISOString();
    rawRow(row.id).apply_claimed_at = claim;
    fake.table('hr_recruitment_jobs').find((j) => j.id === J.principal.id)!.status = 'closed';
    const { results } = await apply(deps(), HR, batch.id);
    expect(results[0].ok).toBe(false);
    expect(rawRow(row.id)).toMatchObject({ apply_claimed_at: claim, apply_error: null });
  });

  it('a resume that cannot be read is logged by batch and count, never by file name or path', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const d = { ...deps(), extractor: async () => { throw new Error('model timeout'); } };
      const { batch } = await createBatch(d, HR, { name: 'e.tsv', bytes: tsv('Ravi_9876543210.pdf\tRavi\travi@example.test\t9811111111\tPrincipal') });
      const { uploads } = await createUploadUrls(d, batch.id, { files: [{ name: 'Ravi_9876543210.pdf', size: 5, type: 'application/pdf' }] });
      fake.objects.set(`hr-intake/${uploads[0].path}`, { bytes: PDF('r') });
      await prepareBatch(d, HR, batch.id, { uploaded: uploads.map((u) => ({ name: u.name, path: u.path })) });
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('some resumes could not be read');
      expect(logged).not.toContain('9876543210');
      expect(logged).not.toContain('Ravi');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('second review (fresh blind review of d26076b5ac)', () => {
  it('blocker 1: a card changed to skip while "file all" runs is not filed', async () => {
    // Four rows, three filed at a time: the fourth is claimed only after one of
    // the first three finishes, so HR's change lands before its claim.
    const names = ['Asha', 'Bala', 'Chitra', 'Devi'];
    const batch4 = await runBatch(
      names.map((nm) => ({ name: `${nm}.pdf`, bytes: PDF(nm) })),
      tsv(...names.map((nm, i) => `${nm}.pdf\t${nm}\t${nm.toLowerCase()}@example.test\t98${i}1111111\tPrincipal`)),
    );
    for (const r of batch4.rows) await decide(deps(), HR, r.id, { action: 'file_under_job', job_id: J.principal.id });
    const fourth = rowAt(batch4.rows, 4);
    upload.mockImplementationOnce(async ({ file }: { file: File }) => {
      await decide(deps(), HR2, fourth.id, { action: 'skip' });
      return { url: `https://drive.example/file/x/${file.name}`, driveFileId: 'drive-x' };
    });
    const { results } = await apply(deps(), HR, batch4.batch.id);
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.find((r) => r.row_id === fourth.id)).toMatchObject({ ok: false, error: expect.stringMatching(/decision on this card changed/) });
    expect(rawRow(fourth.id).decision_action).toBe('skip');
    expect(rawRow(fourth.id).application_id ?? null).toBeNull();
    expect(fake.table('hr_job_applications')).toHaveLength(3);
  });

  it('blocker 3: someone with an earlier application elsewhere is never "high", so accept-all leaves them', async () => {
    fake.table('hr_job_applications').push({ id: 'app-old', email: 'asha@example.test', job_id: J.history.id });
    const { batch, rows } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    expect(rows[0].proposal).toMatchObject({ action: 'merge_existing', confidence: 'medium' });
    expect(rawRow(rows[0].id).resume_storage_path).not.toBeNull();
  });

  it('blocker 4: a job with no college is never offered, proposed or filed under', async () => {
    const FLOAT = 'a0000000-0000-4000-8000-0000000000fe';
    fake.table('hr_recruitment_jobs').push({
      id: FLOAT, title: J.principal.title, job_code: null, institution_id: null,
      status: 'open', closes_at: null, requirements: {}, institution: null, department: null,
    });
    const { batch, rows } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    expect(rows[0].proposal.job_id).not.toBe(FLOAT);
    expect((await getBatch(deps(), batch.id)).open_jobs.some((j) => j.id === FLOAT)).toBe(false);
    // Even a row already decided under it (before this fix) is refused at filing.
    Object.assign(rawRow(rows[0].id), { decision_action: 'file_under_job', decision_job_id: FLOAT, decided_by: HR.id, decided_at: new Date().toISOString() });
    const { results } = await apply(deps(), HR, batch.id);
    expect(results[0].ok).toBe(false);
    expect(fake.table('hr_job_applications')).toHaveLength(0);
    expect(upload).not.toHaveBeenCalled();
  });

  it('zip contents are stored under a name no loose upload can have', async () => {
    const zip = new JSZip();
    zip.file('cv.pdf', PDF('z'));
    const zipBytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
    await runBatch([{ name: 'all.zip', bytes: zipBytes, type: 'application/zip' }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    const stored = [...fake.objects.keys()].filter((k) => k.includes('cv.pdf'));
    expect(stored).toHaveLength(1);
    expect(stored[0].split('/').pop()!.startsWith('_zip')).toBe(true);
  });

  it('closing a batch removes every file under it, not only those on rows', async () => {
    const { batch, row } = await decidedRow();
    fake.objects.set(`hr-intake/${batch.id}/never-prepared.pdf`, { bytes: PDF('x') });
    await apply(deps(), HR, batch.id);
    expect(rawRow(row.id).application_id).not.toBeNull();
    expect(fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.status).toBe('closed');
    expect([...fake.objects.keys()].some((k) => k.includes(batch.id))).toBe(false);
  });

  it('discard refuses while the batch is being prepared, and keeps its files', async () => {
    const { batch } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.prepare_claimed_at = new Date().toISOString();
    await expect(discardBatch(deps(), HR, batch.id)).rejects.toMatchObject({ status: 409 });
    expect(fake.objects.size).toBe(1);
    expect(fake.table('hr_intake_batches')).toHaveLength(1);
  });
});

describe('third review (fresh blind review of 2177cb0c9b)', () => {
  it('blocker 1: two people sharing one phone are never auto-skipped; both are filed', async () => {
    const { batch, rows } = await runBatch(
      [{ name: 'Asha_Kumar.pdf', bytes: PDF('a') }, { name: 'Bala_Murugan.pdf', bytes: PDF('b') }],
      tsv('Asha_Kumar.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'Bala_Murugan.pdf\tBala\tbala@example.test\t9811111111\tPrincipal'),
    );
    const second = rowAt(rows, 2);
    expect(second.proposal).toMatchObject({ action: 'skip', confidence: 'medium' });
    expect(second.proposal.reasons.join(' ')).toMatch(/check this is the same person/);
    expect(rawRow(second.id).decision_action ?? null).toBeNull();
    // HR files both; the batch closes only once both are settled.
    await decide(deps(), HR, rowAt(rows, 1).id, { action: 'file_under_job', job_id: J.principal.id });
    await decide(deps(), HR, second.id, { action: 'file_under_job', job_id: J.principal.id });
    await apply(deps(), HR, batch.id);
    expect(fake.table('hr_job_applications').map((a) => a.email).sort()).toEqual(['asha@example.test', 'bala@example.test']);
  });

  it('blocker 1: the same email twice is high only when the earlier row can be filed', async () => {
    const ok = await runBatch([{ name: 'a.pdf', bytes: PDF('a') }], tsv('a.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', '\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    expect(rowAt(ok.rows, 2).proposal).toMatchObject({ action: 'skip', confidence: 'high' });
    // Earlier row has no resume; the later one does: never auto-skip the later one.
    const bad = await runBatch([{ name: 'b.pdf', bytes: PDF('b') }], tsv('\tAsha\tasha2@example.test\t9811111112\tPrincipal', 'b.pdf\tAsha\tasha2@example.test\t9811111112\tPrincipal'));
    expect(rowAt(bad.rows, 2).proposal).toMatchObject({ action: 'skip', confidence: 'medium' });
    expect(rowAt(bad.rows, 2).proposal.reasons.join(' ')).toMatch(/earlier row cannot be filed/);
  });

  it('blocker 2: a card changed to "file under job" while the batch closes reopens it, resume kept', async () => {
    const { batch, rows } = await runBatch(
      [{ name: 'a.pdf', bytes: PDF('a') }, { name: 'b.pdf', bytes: PDF('b') }],
      tsv('a.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'b.pdf\tBala\tbala@example.test\t9822222222\tPrincipal'),
    );
    const [first, second] = [rowAt(rows, 1), rowAt(rows, 2)];
    await decide(deps(), HR, first.id, { action: 'file_under_job', job_id: J.principal.id });
    await decide(deps(), HR, second.id, { action: 'skip' });
    // Right after the close is written, HR2 changes the skip to "file under job".
    let flipped = false;
    fake.afterUpdate = (table, patch) => {
      if (!flipped && table === 'hr_intake_batches' && (patch as { status?: string }).status === 'closed') {
        flipped = true;
        Object.assign(rawRow(second.id), { decision_action: 'file_under_job', decision_job_id: J.principal.id, decided_at: new Date().toISOString() });
      }
    };
    await apply(deps(), HR, batch.id);
    expect(fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.status).toBe('ready');
    expect(rawRow(second.id).resume_storage_path).not.toBeNull();
    // Filing it later works and then closes the batch.
    const { results } = await apply(deps(), HR, batch.id, [second.id]);
    expect(results[0].ok).toBe(true);
    expect(fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.status).toBe('closed');
  });

  it('blocker 2: a decision that lands after the batch closed is undone and refused', async () => {
    const { row } = await decidedRow();
    const raw = rawRow(row.id);
    const before = { decision_action: raw.decision_action, decision_job_id: raw.decision_job_id, decided_at: raw.decided_at };
    let closedOnce = false;
    fake.afterUpdate = (table) => {
      if (!closedOnce && table === 'hr_intake_rows') {
        closedOnce = true;
        fake.table('hr_intake_batches').find((b) => b.id === row.batch_id)!.status = 'closed';
      }
    };
    await expect(decide(deps(), HR2, row.id, { action: 'skip' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/closed a moment ago/) });
    expect(rawRow(row.id)).toMatchObject(before);
  });
});

describe('fourth review (fresh blind review of 67aa3e9cf5)', () => {
  it('blocker: two people sharing a phone and naming one file get neither; nothing is auto-decided', async () => {
    const { batch, rows } = await runBatch(
      [{ name: 'cv.pdf', bytes: PDF('cv') }],
      tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'cv.pdf\tBala\tbala@example.test\t9811111111\tPrincipal'),
    );
    for (const r of rows) {
      expect(r.resume.storage_path).toBeNull();
      expect(r.proposal.confidence).not.toBe('high');
      expect(r.proposal.reasons).toContain(SHARED_RESUME_NOTE);
    }
  });

  it('the same email on two rows may still share one file', async () => {
    const { rows } = await runBatch(
      [{ name: 'cv.pdf', bytes: PDF('cv') }],
      tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal', 'cv.pdf\tAsha\tASHA@example.test\t9811111112\tPrincipal'),
    );
    expect(rowAt(rows, 1).resume.storage_path).not.toBeNull();
    expect(rowAt(rows, 2).resume.storage_path).toBe(rowAt(rows, 1).resume.storage_path);
  });

  it('a failed prepare never deletes the rows of a batch that did become ready', async () => {
    const d = deps();
    const { batch } = await createBatch(d, HR, { name: 'e.tsv', bytes: tsv('\tAsha\tasha@example.test\t9811111111\tPrincipal') });
    // The "ready" write lands, but its reply is lost (the hook runs after the
    // write and before the reply, so arming here hits exactly this write).
    fake.afterUpdate = (table, patch) => {
      if (table === 'hr_intake_batches' && (patch as { status?: string }).status === 'ready') {
        fake.lostReplies.set('hr_intake_batches.update', { message: 'connection reset' });
        fake.afterUpdate = null;
      }
    };
    await expect(prepareBatch(d, HR, batch.id, { uploaded: [] })).rejects.toBeTruthy();
    expect(fake.table('hr_intake_batches').find((x) => x.id === batch.id)!.status).toBe('ready');
    expect(fake.table('hr_intake_rows')).toHaveLength(1);
  });

  it('cards cannot be decided, accepted or filed while the batch is still being prepared', async () => {
    const { batch, row } = await decidedRow();
    fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.status = 'preparing';
    await expect(decide(deps(), HR, row.id, { action: 'skip' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/being prepared/) });
    await expect(apply(deps(), HR, batch.id)).rejects.toMatchObject({ status: 409 });
  });

  it('a person filed once, whose application was later removed, is never filed again', async () => {
    const { batch, row } = await decidedRow();
    await apply(deps(), HR, batch.id);
    // The batch closed; reopen it to model another card still open, then purge the application.
    fake.table('hr_intake_batches').find((b) => b.id === batch.id)!.status = 'ready';
    rawRow(row.id).application_id = null;
    fake.tables['hr_job_applications'] = [];
    const { results } = await apply(deps(), HR, batch.id);
    expect(results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/Filed once already/) });
    expect(fake.table('hr_job_applications')).toHaveLength(0);
    await expect(decide(deps(), HR, row.id, { action: 'file_under_job', job_id: J.principal.id })).rejects.toMatchObject({ status: 409 });
  });
});

describe('fifth review (fresh blind review of 885be087ac)', () => {
  it('blocker: another college\u2019s rule never makes accept-all file a person at that college', async () => {
    // HR here reaches both colleges; the upload belongs to college 1.
    const title = J.english.title;
    expect(J.english_eng.title).toBe(title);
    expect(J.english_eng.institution_id).not.toBe(COLLEGE_1);
    fake.table('hr_recruitment_jobs').push({
      id: J.english_eng.id, title, job_code: J.english_eng.job_code, institution_id: J.english_eng.institution_id,
      status: 'open', closes_at: null, requirements: {}, institution: { name: J.english_eng.institution_name }, department: null,
    });
    fake.table('hr_intake_match_rules').push({
      id: 'b0000000-0000-4000-8000-0000000000c2', cvviz_job_title_norm: normaliseJobTitle(title), job_id: J.english_eng.id,
      institution_id: J.english_eng.institution_id, created_by: 'u-hr-other', created_by_name: 'Other College HR',
      created_at: '2026-09-01T00:00:00.000Z', times_used: 3,
    });
    const { batch, rows } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv(`cv.pdf\tAsha\tasha@example.test\t9811111111\t${title}`));
    expect(rows[0].proposal.job_id).toBe(J.english_eng.id);
    expect(rows[0].proposal.confidence).toBe('medium');
    expect(rows[0].proposal.reasons[0]).toMatch(/not the college this upload belongs to/);
    expect(fake.table('hr_job_applications')).toHaveLength(0);
  });
});

describe('sixth review (fresh blind review of 7d6f297069)', () => {
  const addEnglishEng = () =>
    fake.table('hr_recruitment_jobs').push({
      id: J.english_eng.id, title: J.english_eng.title, job_code: J.english_eng.job_code, institution_id: J.english_eng.institution_id,
      status: 'open', closes_at: null, requirements: {}, institution: { name: J.english_eng.institution_name }, department: null,
    });

  it('blocker 1: one person applying to two posts with the same title is never auto-skipped', async () => {
    addEnglishEng();
    const title = J.english.title;
    const { batch, rows } = await runBatch(
      [{ name: 'a.pdf', bytes: PDF('a') }, { name: 'b.pdf', bytes: PDF('b') }],
      tsv(`a.pdf\tAsha\tasha@example.test\t9811111111\t${title}`, `b.pdf\tAsha\tasha@example.test\t9811111111\t${title}`),
    );
    const second = rowAt(rows, 2);
    expect(second.proposal).toMatchObject({ action: 'skip', confidence: 'medium' });
    expect(second.proposal.reasons.join(' ')).toMatch(/open at more than one post/);
    expect(rawRow(second.id).decision_action ?? null).toBeNull();
    expect(rawRow(second.id).resume_storage_path).not.toBeNull();
  });

  it('blocker 2: a rule taught on a generic title does not auto-file the next person under it', async () => {
    const generic = await runBatch([], tsv(`\tAsha\tasha@example.test\t9811111111\t${GENERIC}`));
    await decide(deps(), HR, generic.rows[0].id, { action: 'file_under_job', job_id: J.history.id });
    expect(fake.table('hr_intake_match_rules')).toHaveLength(1);
    const next = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv(`cv.pdf\tBala\tbala@example.test\t9822222222\t${GENERIC}`), HR2);
    expect(next.rows[0].proposal).toMatchObject({ job_id: J.history.id, confidence: 'medium' });
  });

});

describe('ninth review (prepare judges certainty against every college)', () => {
  it('the same title open at another college keeps the card off high', async () => {
    fake.table('hr_recruitment_jobs').push({
      id: J.english_eng.id, title: J.english_eng.title, job_code: J.english_eng.job_code, institution_id: J.english_eng.institution_id,
      status: 'open', closes_at: null, requirements: {}, institution: { name: J.english_eng.institution_name }, department: null,
    });
    // This HR person's access shows only their own college's posts.
    fake.sessionHides = (table, row) => table === 'hr_recruitment_jobs' && row.institution_id !== COLLEGE_1;
    const { rows } = await runBatch([{ name: 'Asha_Kumar.pdf', bytes: PDF('a') }], tsv(`Asha_Kumar.pdf\tAsha\tasha@example.test\t9811111111\t${J.english.title}`));
    expect(rows[0].proposal.job_id).toBe(J.english.id);
    expect(rows[0].proposal.confidence).toBe('medium');
    // ...and the card never names that college: this person cannot see it.
    expect(rows[0].proposal.reasons[0]).toContain('also open at another college');
    expect(rows[0].proposal.reasons.join(' ')).not.toContain(J.english_eng.institution_name as string);
    expect((rawRow(rows[0].id).proposal_reasons as string[]).join(' ')).not.toContain(J.english_eng.institution_name as string);
  });
});

