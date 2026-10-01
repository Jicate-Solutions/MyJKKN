// The intake service end to end against an in-memory database and storage:
// export -> upload URLs -> prepare -> decide (rules learned and credited) ->
// accept-high -> apply (per row, idempotent). RLS itself is proven against real
// PostgreSQL in intake-schema.pg.test.ts.

import { readFileSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeRow, ResumeExtract, ResumeExtractor } from '@/types/hr-intake';
import {
  acceptHigh,
  apply,
  createBatch,
  createUploadUrls,
  decide,
  deleteRule,
  getBatch,
  IntakeError,
  listBatches,
  listRules,
  prepareBatch,
  type IntakeActor,
  type IntakeDeps,
} from '@/lib/services/hr/intake/intake-service';
import { MAX_EXTRACTIONS_PER_BATCH } from '@/lib/hr/intake/limits';
import { normaliseJobTitle } from '@/lib/hr/intake/normalise';
import { FakeSupabase } from './fake-supabase';
import fixture from './fixtures/open-jobs.json';

const TSV = readFileSync(path.join(__dirname, 'fixtures/cvviz-export-quirks.tsv'));
const J = fixture.jobs;
const PDF = (tag: string) => new TextEncoder().encode(`%PDF-1.4\n% ${tag}\n`);

const HR: IntakeActor = { id: 'u-hr-1', name: 'Kavitha Demo', institution_id: J.principal.institution_id };
const HR2: IntakeActor = { id: 'u-hr-2', name: 'Suresh Demo', institution_id: J.principal.institution_id };

let fake: FakeSupabase;
let upload: ReturnType<typeof vi.fn>;
let n: number;

function seedJobs(keys: (keyof typeof J)[] = ['principal', 'english', 'history', 'admin_officer', 'lab_tech', 'store_keeper']) {
  for (const k of keys) {
    const j = J[k];
    fake.table('hr_recruitment_jobs').push({
      id: j.id,
      title: j.title,
      job_code: j.job_code,
      institution_id: j.institution_id,
      status: 'open',
      closes_at: null,
      requirements: {},
      institution: { name: j.institution_name },
      department: j.department_name ? { department_name: j.department_name } : null,
    });
  }
}

// The session client is READ-ONLY, as production grants it: every write in these
// tests must go through the service role or it fails with 42501.
function deps(extractor: ResumeExtractor | null = null): IntakeDeps {
  return { db: fake.asSession(), admin: fake.asClient(), upload: upload as never, deleteFile: deleteFile as never, extractor };
}
let deleteFile: ReturnType<typeof vi.fn>;

/** Post the export, upload the files the way the browser would, prepare. */
async function runBatch(
  d: IntakeDeps,
  files: { name: string; bytes: Uint8Array; type?: string }[],
  exportBytes: Uint8Array = TSV,
  actor: IntakeActor = HR,
) {
  const { batch } = await createBatch(d, actor, { name: 'cvviz-export.tsv', bytes: exportBytes });
  expect(batch.status).toBe('preparing');
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

const RESUMES = [
  'Image00731.pdf',
  'Image00732.pdf',
  'DOC_20250830_WA0002pdf.doc',
  'Mohan_Demo_Resume.pdf',
  'Priya_Demo_CV.pdf',
  'office_admin.pdf',
  'Demo_CV_Assistant_Professor_English.pdf',
  'My_CV_2025_Updated_2.pdf',
  'Lakshmi_Demo_Resume_CV.pdf',
].map((name) => ({ name, bytes: PDF(name) }));

const byIndex = (rows: IntakeRow[], i: number) => rows.find((r) => r.row_index === i)!;

beforeEach(() => {
  fake = new FakeSupabase();
  deleteFile = vi.fn(async () => true);
  n = 0;
  upload = vi.fn(async ({ file }: { file: File }) => {
    n += 1;
    return { url: `https://drive.example/file/${n}/${file.name}`, driveFileId: `drive-${n}` };
  });
  seedJobs();
});

describe('a batch from upload to proposals', () => {
  it('parses at upload, then pairs files, finds duplicates and proposes on prepare', async () => {
    const { batch, rows } = await runBatch(deps(), RESUMES);
    expect(batch).toMatchObject({ status: 'ready', row_count: 10, decided_count: 0, applied_count: 0, created_by_name: 'Kavitha Demo' });
    expect(rows).toHaveLength(10);

    // Row 1: exact title, its file found.
    expect(byIndex(rows, 1).proposal).toMatchObject({ action: 'file_under_job', job_id: J.principal.id, confidence: 'high' });
    expect(byIndex(rows, 1).resume).toMatchObject({ matched_upload: true, file_name: 'Image00731.pdf' });
    // Rows 2 and 3: the same person (email+phone, then phone with a second email) -> skip, pointing at row 1.
    for (const i of [2, 3]) {
      const r = byIndex(rows, i);
      expect(r.duplicate).toMatchObject({ kind: 'same_file', ref_id: byIndex(rows, 1).id });
      expect(r.proposal).toMatchObject({ action: 'skip', confidence: 'medium' });
    }
    // Row 2's "<base>_<digits>.pdf" name still finds Image00732.pdf.
    expect(byIndex(rows, 2).resume.matched_upload).toBe(true);
    // Row 4: a generic upper-case title, two posts fit -> low, alternatives named. Mangled file name paired.
    expect(byIndex(rows, 4).proposal.confidence).toBe('low');
    expect(byIndex(rows, 4).resume.matched_upload).toBe(true);
    // Row 5: phone was a date; title fits one post by words only -> medium.
    expect(byIndex(rows, 5).candidate.phone_issue).toMatch(/date/);
    // Filing would refuse it (no usable phone), so it is never more than low (M5).
    expect(byIndex(rows, 5).proposal).toMatchObject({ job_id: J.store_keeper.id, confidence: 'low' });
    expect(byIndex(rows, 5).proposal.reasons[0]).toBe('Cannot be filed yet: no usable phone number');
    // Row 6: the general pool.
    expect(byIndex(rows, 6).proposal).toMatchObject({ action: 'needs_new_job', confidence: 'low' });
    // Row 7, 9, 10: exact or half-of-a-slash titles -> high.
    // Row 7's post is at the OTHER college than this upload's, so never high.
    expect(byIndex(rows, 7).proposal).toMatchObject({ job_id: J.admin_officer.id, confidence: 'medium' });
    expect(byIndex(rows, 7).proposal.reasons[0]).toMatch(/not the college this upload belongs to/);
    // Row 9's resume file ("My_CV_2025_Updated_2.pdf") says nothing about whose it is: medium.
    expect(byIndex(rows, 9).proposal).toMatchObject({ job_id: J.history.id, confidence: 'medium' });
    expect(byIndex(rows, 9).proposal.reasons[0]).toMatch(/generic name/);
    // Row 10's post is also at the other college: medium for the same reason as row 7.
    expect(byIndex(rows, 10).proposal).toMatchObject({ job_id: J.lab_tech.id, confidence: 'medium' });
    // Row 8: the file name names the subject -> the matching post, medium.
    expect(byIndex(rows, 8).proposal).toMatchObject({ job_id: J.english.id, confidence: 'medium' });

    // The export rows are no longer held on the batch once rows exist.
    expect(fake.table('hr_intake_batches')[0].parsed_rows).toBeNull();
  });

  it('reads each resume once, at most three at a time, and uses the subject', async () => {
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    const extractor: ResumeExtractor = async ({ fileName }) => {
      active += 1;
      peak = Math.max(peak, active);
      seen.push(fileName);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      const subject = fileName.startsWith('DOC_') ? 'English' : null;
      return { qualification: 'M.A.', subject, experience_years: 6, current_role: null, summary: 'Six years.' } satisfies ResumeExtract;
    };
    const { rows } = await runBatch(deps(extractor), RESUMES);
    expect(peak).toBeLessThanOrEqual(3);
    // Rows 2 and 3 are the same person as row 1 and are never read.
    expect(seen).not.toContain('Image00732.pdf');
    expect(new Set(seen).size).toBe(seen.length);
    // The subject points to English, but row 4's resume was paired only by a
    // similar file name, so the card asks for a check instead of being high.
    expect(byIndex(rows, 4).proposal).toMatchObject({ job_id: J.english.id, confidence: 'medium' });
    expect(byIndex(rows, 4).proposal.reasons[0]).toMatch(/matched only by a similar file name/);
    expect(byIndex(rows, 4).proposal.reasons).toContain('Resume subject: English');
    expect(byIndex(rows, 4).resume.extract?.experience_years).toBe(6);
  });

  it(`reads at most ${MAX_EXTRACTIONS_PER_BATCH} resumes and says so on the rest`, async () => {
    const lines = ['File Name\tFirst Name\tEmail Address\tPhone Number\tJob'];
    const files = [];
    for (let i = 1; i <= 65; i += 1) {
      lines.push(`cv${i}.pdf\tP${i}\tp${i}@example.test\t9${String(100000000 + i)}\tPrincipal`);
      files.push({ name: `cv${i}.pdf`, bytes: PDF(`cv${i}`) });
    }
    const extractor = vi.fn(async () => null);
    const { rows } = await runBatch(deps(extractor), files, new TextEncoder().encode(lines.join('\n')));
    expect(extractor).toHaveBeenCalledTimes(MAX_EXTRACTIONS_PER_BATCH);
    const capped = rows.filter((r) => r.proposal.reasons.some((x) => x.startsWith('Resume not read')));
    expect(capped).toHaveLength(65 - MAX_EXTRACTIONS_PER_BATCH);
  });

  it('a resume reader that throws marks only that card', async () => {
    const extractor: ResumeExtractor = async ({ fileName }) => {
      if (fileName === 'office_admin.pdf') throw new Error('model timeout');
      return null;
    };
    const { rows } = await runBatch(deps(extractor), RESUMES);
    expect(byIndex(rows, 7).proposal.reasons).toContain('Could not read the resume');
    expect(byIndex(rows, 9).proposal.reasons).not.toContain('Could not read the resume');
  });

  it('expands a .zip, drops the junk, and removes the archive afterwards', async () => {
    const zip = new JSZip();
    zip.file('resumes/office_admin.pdf', PDF('zip-a'));
    zip.file('resumes/Lakshmi_Demo_Resume_CV.pdf', PDF('zip-b'));
    zip.file('__MACOSX/resumes/._office_admin.pdf', 'junk');
    zip.file('resumes/readme.txt', 'not a resume');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const { rows, batch } = await runBatch(deps(), [{ name: 'resumes.zip', bytes, type: 'application/x-zip-compressed' }]);
    expect(byIndex(rows, 7).resume.matched_upload).toBe(true);
    expect(byIndex(rows, 10).resume.matched_upload).toBe(true);
    expect(byIndex(rows, 1).proposal.reasons).toContain('Resume file was not in the upload');
    const got = await getBatch(deps(), batch.id);
    expect(got.skipped_files).toEqual([{ file_name: 'readme.txt', reason: 'Not a PDF, Word or image file' }]);
    expect([...fake.objects.keys()].some((k) => k.endsWith('resumes.zip'))).toBe(false);
  });

  it('a file no row names is reported and not kept', async () => {
    const { batch } = await runBatch(deps(), [...RESUMES, { name: 'someone_else.pdf', bytes: PDF('x') }]);
    const got = await getBatch(deps(), batch.id);
    expect(got.skipped_files).toContainEqual({ file_name: 'someone_else.pdf', reason: 'No row in the export names this file' });
    expect([...fake.objects.keys()].some((k) => k.endsWith('someone_else.pdf'))).toBe(false);
  });

  it('people already in MyJKKN are proposed as merges, with the record named', async () => {
    fake.table('hr_job_applications').push({ id: 'app-existing-1', email: 'ganesh.demo@example.test', job_id: J.history.id });
    fake.table('hr_recruitment_candidates').push({ id: 'cand-existing-1', email: 'Lakshmi.Other@example.test', phone: '+91 9900112233' });
    const { rows } = await runBatch(deps(), RESUMES);
    expect(byIndex(rows, 7).duplicate).toMatchObject({ kind: 'existing_application', ref_id: 'app-existing-1' });
    expect(byIndex(rows, 7).proposal).toMatchObject({ action: 'merge_existing', confidence: 'medium' });
    expect(byIndex(rows, 10).duplicate).toMatchObject({ kind: 'existing_candidate', ref_id: 'cand-existing-1' });
    expect(byIndex(rows, 10).duplicate.note).toBe('Already a candidate in MyJKKN (same phone number)');
  });

  it('prepare twice returns the same rows and writes nothing new', async () => {
    const first = await runBatch(deps(), RESUMES);
    const inserts = fake.log.filter((l) => l.startsWith('insert hr_intake_rows')).length;
    const again = await prepareBatch(deps(), HR, first.batch.id, { uploaded: [] });
    expect(again.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id));
    expect(fake.log.filter((l) => l.startsWith('insert hr_intake_rows')).length).toBe(inserts);
    await expect(createUploadUrls(deps(), first.batch.id, { files: [{ name: 'a.pdf', size: 10, type: 'application/pdf' }] }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('a prepare that breaks leaves the batch preparable again', async () => {
    const { batch } = await createBatch(deps(), HR, { name: 'e.tsv', bytes: TSV });
    fake.failures.set('hr_intake_rows.insert', { message: 'disk full' });
    await expect(prepareBatch(deps(), HR, batch.id, { uploaded: [] })).rejects.toThrow(/disk full/);
    expect(fake.table('hr_intake_rows')).toHaveLength(0);
    expect(fake.table('hr_intake_batches')[0]).toMatchObject({ status: 'preparing', prepare_claimed_at: null });
    const ok = await prepareBatch(deps(), HR, batch.id, { uploaded: [] });
    expect(ok.batch.status).toBe('ready');
  });

  it('lists batches newest first with their counts', async () => {
    await runBatch(deps(), []);
    const list = await listBatches(deps());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ row_count: 10, decided_count: 0 });
  });
});

describe('upload URLs and prepare refuse what they should', () => {
  it('only resume types, at most 10 MB each, one path per name', async () => {
    const { batch } = await createBatch(deps(), HR, { name: 'e.tsv', bytes: TSV });
    await expect(createUploadUrls(deps(), batch.id, { files: [{ name: 'notes.txt', size: 10, type: 'text/plain' }] }))
      .rejects.toMatchObject({ status: 400 });
    await expect(createUploadUrls(deps(), batch.id, { files: [{ name: 'big.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' }] }))
      .rejects.toMatchObject({ status: 413 });
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `f${i}.pdf`, size: 1, type: 'application/pdf' }));
    await expect(createUploadUrls(deps(), batch.id, { files: many })).rejects.toMatchObject({ status: 400 });

    const { uploads } = await createUploadUrls(deps(), batch.id, {
      files: [
        { name: 'cv.pdf', size: 5, type: 'application/pdf' },
        { name: 'cv.pdf', size: 5, type: '' },
        { name: 'scan.JPG', size: 5, type: '' },
      ],
    });
    expect(uploads.map((u) => u.path)).toEqual([`${batch.id}/cv.pdf`, `${batch.id}/cv-2.pdf`, `${batch.id}/scan.JPG`]);
    expect(uploads.map((u) => u.content_type)).toEqual(['application/pdf', 'application/pdf', 'image/jpeg']);
    expect(uploads[0].signed_url).toMatch(/^https:/);
    expect(uploads[0].token).toBeTruthy();
  });

  it('refuses a path outside the batch and a file that never arrived', async () => {
    const { batch } = await createBatch(deps(), HR, { name: 'e.tsv', bytes: TSV });
    await expect(prepareBatch(deps(), HR, batch.id, { uploaded: [{ name: 'x.pdf', path: 'other-batch/x.pdf' }] }))
      .rejects.toMatchObject({ status: 400 });
    await expect(prepareBatch(deps(), HR, batch.id, { uploaded: [{ name: 'x.pdf', path: `${batch.id}/../x.pdf` }] }))
      .rejects.toMatchObject({ status: 400 });
    await expect(prepareBatch(deps(), HR, batch.id, { uploaded: [{ name: 'x.pdf', path: `${batch.id}/x.pdf` }] }))
      .rejects.toThrow(/was not uploaded/);
  });

  it('a file that is not an export is a 400 in plain words', async () => {
    await expect(createBatch(deps(), HR, { name: 'e.csv', bytes: new TextEncoder().encode('Name,Mobile\nA,1') }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/does not look like a CVViZ export/) });
  });

  it('an unknown batch is a 404, not an empty page', async () => {
    await expect(getBatch(deps(), 'b0000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ status: 404 });
    await expect(getBatch(deps(), 'not-a-uuid')).rejects.toBeInstanceOf(IntakeError);
  });
});

describe('decide — every correction becomes a rule credited to its author', () => {
  it('choosing another post than proposed teaches a rule; the next batch uses it, credited', async () => {
    const { rows } = await runBatch(deps(), RESUMES);
    const row4 = byIndex(rows, 4);
    expect(row4.proposal.job_id).not.toBe(J.history.id);

    const res = await decide(deps(), HR, row4.id, { action: 'file_under_job', job_id: J.history.id });
    expect(res.row.decision).toMatchObject({ action: 'file_under_job', job_id: J.history.id, decided_by: HR.id, decided_by_name: 'Kavitha Demo', corrected: true });
    expect(res.rule).toMatchObject({ cvviz_job_title_norm: normaliseJobTitle(fixture.titles.generic), job_id: J.history.id, created_by: HR.id, created_by_name: 'Kavitha Demo', times_used: 0 });
    expect(res.rule_error).toBeNull();

    // Next batch: the same CVViZ title is routed by the rule and the card credits
    // her. The generic title also fits other posts, so it is medium, not high.
    const next = await runBatch(deps(), RESUMES);
    const p = byIndex(next.rows, 4).proposal;
    expect(p).toMatchObject({ action: 'file_under_job', job_id: J.history.id, confidence: 'medium', rule_id: res.rule!.id, rule_author_name: 'Kavitha Demo' });
    // Rows 4 and 8 both carry "Assistant Professor" in some case: both shaped by the rule.
    const rules = await listRules(deps());
    expect(rules).toHaveLength(1);
    expect(rules[0].times_used).toBe(2);
    expect(rules[0].job_title).toBe(J.history.title);
  });

  it('a later correction replaces the rule and moves the credit', async () => {
    const { rows } = await runBatch(deps(), RESUMES);
    await decide(deps(), HR, byIndex(rows, 4).id, { action: 'file_under_job', job_id: J.history.id });
    const next = await runBatch(deps(), RESUMES, TSV, HR2);
    const res = await decide(deps(), HR2, byIndex(next.rows, 4).id, { action: 'file_under_job', job_id: J.english.id });
    expect(res.row.decision?.corrected).toBe(true);
    expect(res.rule).toMatchObject({ job_id: J.english.id, created_by: HR2.id, created_by_name: 'Suresh Demo', times_used: 0 });
    expect(fake.table('hr_intake_match_rules')).toHaveLength(1);
  });

  it('choosing a post when the helper said "needs a new job" teaches a rule', async () => {
    const tsv = new TextEncoder().encode('First Name\tEmail Address\tPhone Number\tJob\nAnand\tanand@example.test\t9811111111\tVice Principal, \n');
    const { rows } = await runBatch(deps(), [], tsv);
    expect(rows[0].proposal.action).toBe('needs_new_job');
    const res = await decide(deps(), HR, rows[0].id, { action: 'file_under_job', job_id: J.principal.id });
    expect(res.rule).toMatchObject({ cvviz_job_title_norm: 'vice principal', job_id: J.principal.id });
  });

  it('confirming the proposal, skipping, or filing a general-pool row teaches nothing', async () => {
    const { rows } = await runBatch(deps(), RESUMES);
    const confirm = await decide(deps(), HR, byIndex(rows, 1).id, { action: 'file_under_job', job_id: J.principal.id });
    expect(confirm.row.decision?.corrected).toBe(false);
    expect(confirm.rule).toBeNull();
    const skip = await decide(deps(), HR, byIndex(rows, 9).id, { action: 'skip' });
    expect(skip.row.decision).toMatchObject({ action: 'skip', job_id: null, corrected: true });
    expect(skip.rule).toBeNull();
    const pool = await decide(deps(), HR, byIndex(rows, 6).id, { action: 'file_under_job', job_id: J.admin_officer.id });
    expect(pool.rule).toBeNull();
    expect(fake.table('hr_intake_match_rules')).toHaveLength(0);
  });

  it('the decision stands even when the rule cannot be saved, and says so', async () => {
    const { rows } = await runBatch(deps(), RESUMES);
    fake.failures.set('hr_intake_match_rules.insert', { code: '42501', message: 'new row violates row-level security policy' });
    const res = await decide(deps(), HR, byIndex(rows, 4).id, { action: 'file_under_job', job_id: J.history.id });
    expect(res.row.decision?.job_id).toBe(J.history.id);
    expect(res.rule).toBeNull();
    expect(res.rule_error).toMatch(/do not have access/);
  });

  it('refuses a missing job, a closed job, a bad action, and an unknown row', async () => {
    const { rows } = await runBatch(deps(), RESUMES);
    const id = byIndex(rows, 1).id;
    await expect(decide(deps(), HR, id, { action: 'file_under_job' })).rejects.toMatchObject({ status: 400 });
    await expect(decide(deps(), HR, id, { action: 'file_under_job', job_id: 'b0000000-0000-4000-8000-000000000999' })).rejects.toMatchObject({ status: 400 });
    await expect(decide(deps(), HR, id, { action: 'archive' as never })).rejects.toMatchObject({ status: 400 });
    await expect(decide(deps(), HR, 'b0000000-0000-4000-8000-000000000998', { action: 'skip' })).rejects.toMatchObject({ status: 404 });
  });

  it('a rule can be deleted; deleting it twice is a 404', async () => {
    const { rows } = await runBatch(deps(), RESUMES);
    const { rule } = await decide(deps(), HR, byIndex(rows, 4).id, { action: 'file_under_job', job_id: J.history.id });
    await deleteRule(deps(), rule!.id);
    await expect(deleteRule(deps(), rule!.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('accept-high', () => {
  it('decides every undecided high proposal as it stands, and nothing else', async () => {
    const { batch, rows } = await runBatch(deps(), RESUMES);
    await decide(deps(), HR, byIndex(rows, 7).id, { action: 'skip' });
    // The post for row 10 closes before anyone accepts it.
    fake.table('hr_recruitment_jobs').find((j) => j.id === J.lab_tech.id)!.status = 'closed';
    const { decided } = await acceptHigh(deps(), HR, batch.id);
    // High "file under job": only row 1 now (rows 7 and 10 are at the other
    // college, row 9's file name is generic). Row 7 was decided by hand.
    expect(decided).toBe(1);
    expect(byIndex((await getBatch(deps(), batch.id)).rows, 9).decision).toBeNull();
    const after = (await getBatch(deps(), batch.id)).rows;
    expect(byIndex(after, 1).decision).toMatchObject({ action: 'file_under_job', job_id: J.principal.id, corrected: false });
    expect(byIndex(after, 7).decision?.action).toBe('skip');
    expect(byIndex(after, 10).decision).toBeNull();
    expect(byIndex(after, 4).decision).toBeNull();
  });
});

describe('apply — the careers path, one row at a time', () => {
  async function decidedBatch() {
    const { batch, rows } = await runBatch(deps(), RESUMES);
    await decide(deps(), HR, byIndex(rows, 1).id, { action: 'file_under_job', job_id: J.principal.id });
    await decide(deps(), HR, byIndex(rows, 5).id, { action: 'file_under_job', job_id: J.store_keeper.id });
    await decide(deps(), HR, byIndex(rows, 9).id, { action: 'file_under_job', job_id: J.history.id });
    return { batch, rows };
  }

  it('files each decided row with source cvviz_import and reports each row on its own', async () => {
    const { batch, rows } = await decidedBatch();
    const { results } = await apply(deps(), HR, batch.id);
    const by = new Map(results.map((r) => [r.row_id, r]));

    const ok1 = by.get(byIndex(rows, 1).id)!;
    expect(ok1.ok).toBe(true);
    const app = fake.table('hr_job_applications').find((a) => a.id === ok1.application_id)!;
    expect(app).toMatchObject({
      job_id: J.principal.id,
      institution_id: J.principal.institution_id,
      first_name: 'K.Arun',
      email: 'arun.k.demo@example.test',
      phone: '9840011122',
      source: 'cvviz_import',
      status: 'pending',
      consent_at: null,
      applicant_user_id: null,
      cvviz_profile_url: 'https://app.cvviz.example/c/1001',
      submitted_at: '2026-09-30T09:14:05.000Z',
      drive_file_id: expect.stringMatching(/^drive-/),
      qualification: 'Not stated',
    });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ jobId: J.principal.id, jobTitle: J.principal.title, jobCode: J.principal.job_code }));

    // Row 5's phone cell was a date: refused with the reason, nothing uploaded for it.
    expect(by.get(byIndex(rows, 5).id)).toMatchObject({ ok: false, application_id: null });
    expect(by.get(byIndex(rows, 5).id)!.error).toBe('No usable phone number (Looks like a date (14/03/88), not a phone number)');
    expect(by.get(byIndex(rows, 9).id)!.ok).toBe(true);
    expect(upload).toHaveBeenCalledTimes(2);

    const got = await getBatch(deps(), batch.id);
    expect(got.batch.applied_count).toBe(2);
    expect(byIndex(got.rows, 5).applied).toMatchObject({ application_id: null, error: expect.stringMatching(/phone/) });
  });

  it('running apply again files nothing twice', async () => {
    const { batch } = await decidedBatch();
    const first = await apply(deps(), HR, batch.id);
    const again = await apply(deps(), HR, batch.id);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(fake.table('hr_job_applications')).toHaveLength(2);
    const ids = (r: typeof first) => r.results.filter((x) => x.ok).map((x) => x.application_id).sort();
    expect(ids(again)).toEqual(ids(first));
  });

  it('someone already applied to that post with that email: linked, not filed again', async () => {
    fake.table('hr_job_applications').push({ id: 'app-already', job_id: J.principal.id, email: 'arun.k.demo@example.test' });
    // The batch saw them as a merge; a person chose to file anyway.
    const { batch, rows } = await runBatch(deps(), RESUMES);
    expect(byIndex(rows, 1).proposal.action).toBe('merge_existing');
    await decide(deps(), HR, byIndex(rows, 1).id, { action: 'file_under_job', job_id: J.principal.id });
    const { results } = await apply(deps(), HR, batch.id, [byIndex(rows, 1).id]);
    expect(results).toEqual([{ row_id: byIndex(rows, 1).id, ok: true, application_id: 'app-already', error: null }]);
    expect(upload).not.toHaveBeenCalled();
  });

  it('a Drive upload that breaks fails that row only', async () => {
    const { batch, rows } = await decidedBatch();
    upload.mockImplementationOnce(async () => {
      throw new Error('Drive quota exceeded');
    });
    const { results } = await apply(deps(), HR, batch.id);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const broken = results.find((r) => !r.ok && r.row_id !== byIndex(rows, 5).id)!;
    expect(broken.error).toBe('Could not file: Drive quota exceeded');
    // A retry files the broken one.
    const retry = await apply(deps(), HR, batch.id, [broken.row_id]);
    expect(retry.results[0].ok).toBe(true);
  });

  it('a row claimed by another request right now is not filed twice', async () => {
    const { batch, rows } = await decidedBatch();
    fake.table('hr_intake_rows').find((r) => r.id === byIndex(rows, 1).id)!.apply_claimed_at = new Date().toISOString();
    const { results } = await apply(deps(), HR, batch.id, [byIndex(rows, 1).id]);
    expect(results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/another request is filing it/) });
    expect(upload).not.toHaveBeenCalled();
  });

  it('rows not decided "file under job" are reported, never filed', async () => {
    const { batch, rows } = await decidedBatch();
    const { results } = await apply(deps(), HR, batch.id, [byIndex(rows, 4).id, 'b0000000-0000-4000-8000-0000000000aa']);
    expect(results.map((r) => r.error)).toEqual(['Row not found in this batch', 'Decide this row as "file under job" first']);
  });

  it('closes the batch and removes the resume copies once everything is decided and filed', async () => {
    const tsv = new TextEncoder().encode('File Name\tFirst Name\tEmail Address\tPhone Number\tJob\nz.pdf\tZara\tzara@example.test\t9822222222\tPrincipal\n');
    const { batch, rows } = await runBatch(deps(), [{ name: 'z.pdf', bytes: PDF('z') }], tsv);
    await decide(deps(), HR, rows[0].id, { action: 'file_under_job', job_id: J.principal.id });
    expect([...fake.objects.keys()].length).toBe(1);
    await apply(deps(), HR, batch.id);
    const got = await getBatch(deps(), batch.id);
    expect(got.batch.status).toBe('closed');
    expect(got.rows[0].resume.storage_path).toBeNull();
    expect(fake.objects.size).toBe(0);
    await expect(decide(deps(), HR, rows[0].id, { action: 'skip' })).rejects.toMatchObject({ status: 409 });
  });
});
