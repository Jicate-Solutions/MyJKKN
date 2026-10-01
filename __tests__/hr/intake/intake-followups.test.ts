// HR intake helper — the non-blocking follow-ups listed on PR #4163.
// Same harness as intake-review-fixes: the session client is READ-ONLY, so any
// write that does not go through the service role fails with 42501.

import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupIdleBatches,
  createBatch,
  createUploadUrls,
  discardBatch,
  listBatches,
  prepareBatch,
  type IntakeActor,
  type IntakeDeps,
} from '@/lib/services/hr/intake/intake-service';
import { FakeSupabase } from './fake-supabase';
import fixture from './fixtures/open-jobs.json';

const J = fixture.jobs;
const COLLEGE_1 = J.principal.institution_id;
const COLLEGE_2 = J.admin_officer.institution_id;
const COLLEGE_3 = '0b0b0b0b-0000-4000-8000-000000000003';
const PDF = (tag: string) => new TextEncoder().encode(`%PDF-1.4\n% ${tag}\n`);
const tsv = (...lines: string[]) =>
  new TextEncoder().encode(['File Name\tFirst Name\tEmail Address\tPhone Number\tJob', ...lines].join('\n'));

const HR: IntakeActor = { id: 'u-hr-1', name: 'Kavitha Demo', institution_id: COLLEGE_1 };
const HR_2: IntakeActor = { id: 'u-hr-2', name: 'Suresh Demo', institution_id: COLLEGE_2 };

let fake: FakeSupabase;

function deps(): IntakeDeps {
  return { db: fake.asSession(), admin: fake.asClient(), upload: vi.fn() as never, deleteFile: vi.fn() as never, extractor: null };
}

async function runBatch(files: { name: string; bytes: Uint8Array }[], exportBytes: Uint8Array, actor: IntakeActor = HR) {
  const d = deps();
  const { batch } = await createBatch(d, actor, { name: 'e.tsv', bytes: exportBytes });
  let uploaded: { name: string; path: string }[] = [];
  if (files.length > 0) {
    const { uploads } = await createUploadUrls(d, batch.id, {
      files: files.map((f) => ({ name: f.name, size: f.bytes.byteLength, type: 'application/pdf' })),
    });
    uploads.forEach((u, i) => fake.objects.set(`hr-intake/${u.path}`, { bytes: files[i].bytes }));
    uploaded = uploads.map((u) => ({ name: u.name, path: u.path }));
  }
  return prepareBatch(d, actor, batch.id, { uploaded });
}

beforeEach(() => {
  fake = new FakeSupabase();
  for (const j of [J.principal, J.english]) {
    fake.table('hr_recruitment_jobs').push({
      id: j.id, title: j.title, job_code: j.job_code, institution_id: j.institution_id, status: 'open',
      closes_at: null, requirements: {}, institution: { name: j.institution_name }, department: null,
    });
  }
  fake.table('institutions').push(
    { id: COLLEGE_1, name: 'Arts Demo College' },
    { id: COLLEGE_2, name: 'Engineering Demo College' },
    { id: COLLEGE_3, name: 'Nursing Demo College' },
  );
});

describe('follow-up 1: the upload list counts exactly, past the 1,000-row read cap', () => {
  it('a batch of 1,200 decided rows (1,100 filed) shows 1,200 and 1,100', async () => {
    const big = (await runBatch([], tsv('\tAsha\tasha@example.test\t9811111111\tPrincipal'))).batch;
    const small = (await runBatch([], tsv('\tBala\tbala@example.test\t9822222222\tPrincipal'))).batch;
    const rows = fake.table('hr_intake_rows');
    rows.length = 0;
    for (let i = 0; i < 1200; i += 1) {
      rows.push({
        id: `big-${i}`, batch_id: big.id, row_index: i + 1,
        decided_at: '2026-10-01T00:00:00.000Z', application_id: i < 1100 ? `app-${i}` : null,
      });
    }
    rows.push({ id: 'small-1', batch_id: small.id, row_index: 1, decided_at: '2026-10-01T00:00:00.000Z', application_id: null });
    rows.push({ id: 'small-2', batch_id: small.id, row_index: 2, decided_at: null, application_id: null });
    fake.maxRows = 1000;

    const list = await listBatches(deps());
    expect(list.find((b) => b.id === big.id)).toMatchObject({ decided_count: 1200, applied_count: 1100 });
    expect(list.find((b) => b.id === small.id)).toMatchObject({ decided_count: 1, applied_count: 0 });
  });
});

describe('follow-up 2: a discard whose delete fails never leaves the batch stuck', () => {
  it('says so plainly, closes the batch (its copies are gone) and lets a second try go through at once', async () => {
    const { batch } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    fake.failures.set('hr_intake_batches.delete', { message: 'connection reset' });

    const err = await discardBatch(deps(), HR, batch.id).then(() => null, (e: unknown) => e as Error & { status?: number });
    expect(err?.status).toBe(500);
    expect(err?.message).toMatch(/resume copies were removed/i);
    expect(err?.message).toMatch(/connection reset/);
    expect(err?.message).toMatch(/try discarding it again/i);

    const stuck = fake.table('hr_intake_batches').find((b) => b.id === batch.id)!;
    expect(stuck).toMatchObject({ status: 'closed', prepare_claimed_at: null });
    expect(fake.table('hr_intake_rows').every((r) => r.resume_storage_path === null)).toBe(true);
    expect(fake.objects.size).toBe(0);

    expect(await discardBatch(deps(), HR, batch.id)).toEqual({ ok: true, removed_files: 0 });
    expect(fake.table('hr_intake_batches')).toHaveLength(0);
  });
});

describe('follow-up 3: a file that lands after its batch closed is swept next time', () => {
  it('the daily sweep empties folders of closed and discarded batches, and keeps open ones', async () => {
    const closed = (await runBatch([], tsv('\tAsha\tasha@example.test\t9811111111\tPrincipal'))).batch;
    const open = (await runBatch([{ name: 'cv.pdf', bytes: PDF('open') }], tsv('cv.pdf\tBala\tbala@example.test\t9822222222\tPrincipal'))).batch;
    const discarded = (await runBatch([], tsv('\tChitra\tchitra@example.test\t9833333333\tPrincipal'))).batch;
    // Closed more than an hour ago: closing can no longer be undone.
    Object.assign(fake.table('hr_intake_batches').find((b) => b.id === closed.id)!, {
      status: 'closed', updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    await discardBatch(deps(), HR, discarded.id);

    // Slow uploads through signed URLs issued before the close / discard.
    fake.objects.set(`hr-intake/${closed.id}/late.pdf`, { bytes: PDF('late') });
    fake.objects.set(`hr-intake/${discarded.id}/late.pdf`, { bytes: PDF('late2') });

    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(summary).toMatchObject({ ok: true, closed: 0, late_files_removed: 2, failed: 0 });
    const left = [...fake.objects.keys()];
    expect(left.some((k) => k.includes(closed.id))).toBe(false);
    expect(left.some((k) => k.includes(discarded.id))).toBe(false);
    expect(left.some((k) => k.includes(open.id))).toBe(true);
  });

  it('a folder that is not a batch id is never touched', async () => {
    fake.objects.set('hr-intake/not-a-batch/readme.txt', { bytes: PDF('x') });
    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(summary).toMatchObject({ late_files_removed: 0, failed: 0 });
    expect(fake.objects.has('hr-intake/not-a-batch/readme.txt')).toBe(true);
  });

  it('when the batches cannot be read, nothing is removed', async () => {
    const closed = (await runBatch([], tsv('\tAsha\tasha@example.test\t9811111111\tPrincipal'))).batch;
    fake.table('hr_intake_batches').find((b) => b.id === closed.id)!.status = 'closed';
    fake.objects.set(`hr-intake/${closed.id}/late.pdf`, { bytes: PDF('late') });
    const realFrom = fake.from.bind(fake);
    let batchReads = 0;
    fake.from = ((name: string) => {
      // The idle-batch read goes through; the second read (which folders are still open) fails.
      if (name === 'hr_intake_batches' && ++batchReads === 2) fake.failures.set('hr_intake_batches.select', { message: 'timeout' });
      return realFrom(name);
    }) as typeof fake.from;
    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(summary).toMatchObject({ late_files_removed: 0, failed: 1 });
    expect(fake.objects.has(`hr-intake/${closed.id}/late.pdf`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Second round: the blind review of 5198b4f64f, and the Director's ruling on
// which colleges an HR person may upload for.
// ---------------------------------------------------------------------------

const ASHA = () => tsv('\tAsha\tasha@example.test\t9811111111\tPrincipal');
const HOUR = 3_600_000;

/** A batch marked closed `closedAgoMs` ago, with a file that arrived after. */
async function closedWithLateFile(closedAgoMs: number) {
  const { batch } = await runBatch([], ASHA());
  const rec = fake.table('hr_intake_batches').find((b) => b.id === batch.id)!;
  rec.status = 'closed';
  rec.updated_at = new Date(Date.now() - closedAgoMs).toISOString();
  fake.objects.set(`hr-intake/${batch.id}/late.pdf`, { bytes: PDF('late') });
  return batch;
}
const hasFile = (batchId: string) => fake.objects.has(`hr-intake/${batchId}/late.pdf`);

describe('review 1 (blocking): the sweep never empties a batch that may still reopen', () => {
  it('a batch closed moments ago keeps its files (closing may still be undone)', async () => {
    const b = await closedWithLateFile(5 * 60_000);
    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(summary).toMatchObject({ late_files_removed: 0, failed: 0 });
    expect(hasFile(b.id)).toBe(true);
  });

  it('a batch closed more than an hour ago is emptied', async () => {
    const b = await closedWithLateFile(2 * HOUR);
    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(summary).toMatchObject({ late_files_removed: 1, failed: 0 });
    expect(hasFile(b.id)).toBe(false);
  });

  it('a batch reopened between the sweep’s read and its delete keeps its files', async () => {
    const b = await closedWithLateFile(2 * HOUR);
    let batchReads = 0;
    fake.afterSelect = (table) => {
      if (table !== 'hr_intake_batches' || ++batchReads !== 2) return;
      // Right after the sweep read the batches: closing is undone (reopen bumps updated_at).
      Object.assign(fake.table('hr_intake_batches').find((x) => x.id === b.id)!, { status: 'ready', updated_at: new Date().toISOString() });
    };
    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(batchReads).toBeGreaterThanOrEqual(2);
    expect(summary).toMatchObject({ late_files_removed: 0, failed: 0 });
    expect(hasFile(b.id)).toBe(true);
  });

  it('a discarded batch (no row at all) is emptied at once', async () => {
    const gone = randomUUID();
    fake.objects.set(`hr-intake/${gone}/late.pdf`, { bytes: PDF('late') });
    expect(await cleanupIdleBatches(fake.asClient(), new Date())).toMatchObject({ late_files_removed: 1 });
    expect(hasFile(gone)).toBe(false);
  });
});

describe('review 2: the folder listing pages until an empty page', () => {
  it('finds every folder when storage returns fewer entries than asked for', async () => {
    fake.listMax = 2;
    const gone = Array.from({ length: 5 }, () => randomUUID());
    for (const id of gone) fake.objects.set(`hr-intake/${id}/late.pdf`, { bytes: PDF(id) });
    const summary = await cleanupIdleBatches(fake.asClient(), new Date());
    expect(summary).toMatchObject({ late_files_removed: 5, failed: 0 });
    expect(gone.filter(hasFile)).toEqual([]);
  });
});

describe('review 3: the upload list and its counts stay inside what this person can see', () => {
  it('another college’s batch and rows are neither listed nor counted', async () => {
    const mine = (await runBatch([], ASHA())).batch;
    const theirs = (await runBatch([], tsv('\tBala\tbala@example.test\t9822222222\tPrincipal'), HR_2)).batch;
    for (const r of fake.table('hr_intake_rows')) Object.assign(r, { decided_at: '2026-10-01T00:00:00.000Z', application_id: 'app-x' });
    fake.sessionHides = (table, row) =>
      (table === 'hr_intake_batches' && row.institution_id === COLLEGE_2) ||
      (table === 'hr_intake_rows' && row.batch_id === theirs.id);
    const list = await listBatches(deps());
    expect(list.map((b) => b.id)).toEqual([mine.id]);
    expect(list[0]).toMatchObject({ decided_count: 1, applied_count: 1 });
  });
});

describe('review 4: a discard that half-fails says what is true', () => {
  it('the delete landed but its reply was lost: the discard reports success, not an error', async () => {
    const { batch } = await runBatch([{ name: 'cv.pdf', bytes: PDF('cv') }], tsv('cv.pdf\tAsha\tasha@example.test\t9811111111\tPrincipal'));
    fake.lostReplies.set('hr_intake_batches.delete', { message: 'connection reset' });
    expect(await discardBatch(deps(), HR, batch.id)).toEqual({ ok: true, removed_files: 1 });
    expect(fake.table('hr_intake_batches')).toHaveLength(0);
  });

  it('the delete, the close and the claim release all fail: it says to wait up to 10 minutes', async () => {
    const { batch } = await runBatch([], ASHA());
    fake.failures.set('hr_intake_batches.delete', { message: 'connection reset' });
    const realFrom = fake.from.bind(fake);
    fake.from = ((name: string) => {
      // Once the delete has failed, every later batch update fails too.
      if (name === 'hr_intake_batches' && !fake.failures.has('hr_intake_batches.delete')) {
        fake.failures.set('hr_intake_batches.update', { message: 'connection reset' });
      }
      return realFrom(name);
    }) as typeof fake.from;
    const err = await discardBatch(deps(), HR, batch.id).then(() => null, (e: unknown) => e as Error & { status?: number });
    expect(err?.status).toBe(500);
    expect(err?.message).toMatch(/wait up to 10 minutes/i);
    expect(err?.message).not.toMatch(/now closed/i);
  });
});
