import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
vi.mock('@/lib/google/drive-client', () => ({ isDriveConfigured: () => true }));
vi.mock('@/lib/google/drive-upload', () => ({ uploadResumeToJobFolder: vi.fn(), deleteDriveFile: vi.fn() }));
const submit = vi.fn();
vi.mock('@/lib/services/hr/public-careers/public-careers-service', () => ({
  submitExternalApplication: (...a: unknown[]) => submit(...a),
}));
vi.mock('@/lib/services/hr/public-careers/after-apply', () => ({
  notifyHrOfApplication: vi.fn(), sendApplicantConfirmation: vi.fn(),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void fn(),
}));

import { POST, OPTIONS, MAX_BODY_BYTES } from '@/app/api/public/careers/jobs/[id]/apply/route';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ id: JOB_ID }) };
let ipSeq = 0;

function req(fields: Record<string, string | File>, opts: { origin?: string; ip?: string; contentLength?: string } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const headers: Record<string, string> = {
    origin: opts.origin ?? 'https://jkkn.ac.in',
    'x-forwarded-for': opts.ip ?? `10.0.0.${++ipSeq}`,
    // A browser always declares the multipart length; the test Request does not.
    'content-length': opts.contentLength ?? '2048',
  };
  return new Request(`https://my.jkkn.ac.in/api/public/careers/jobs/${JOB_ID}/apply`, {
    method: 'POST', body: fd, headers,
  }) as never;
}

const VALID = {
  first_name: 'Priya', last_name: 'R', email: 'priya@example.com', phone: '9876543210',
  qualification: 'M.Pharm', experience_months: '24', consent: 'true',
  resume: new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cv.pdf'),
};
const CREATED = {
  kind: 'created',
  application: { applicationId: 'a', reference: 'JOB-1-ABC', jobTitle: 't', institutionId: 'i', institutionName: 'n' },
};

beforeEach(() => submit.mockReset());

describe('POST /api/public/careers/jobs/[id]/apply', () => {
  it('rejects a disallowed origin with 403', async () => {
    const res = await POST(req(VALID, { origin: 'https://evil.example' }), params);
    expect(res.status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects an oversized body by content-length before reading it', async () => {
    const res = await POST(req(VALID, { contentLength: String(MAX_BODY_BYTES + 1) }), params);
    expect(res.status).toBe(413);
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses a body with no usable Content-Length (411) before reading it', async () => {
    const res = await POST(req(VALID, { contentLength: 'abc' }), params);
    expect(res.status).toBe(411);
    expect(submit).not.toHaveBeenCalled();
  });

  it('silently accepts honeypot submissions without saving', async () => {
    const res = await POST(req({ ...VALID, company_fax: '12345' }), params);
    expect(res.status).toBe(201);
    expect(submit).not.toHaveBeenCalled();
  });

  it('returns 400 with field errors', async () => {
    const res = await POST(req({ ...VALID, email: 'bad' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).fields.email).toBeTruthy();
  });

  it('maps service outcomes to status codes; a duplicate looks exactly like a fresh 201', async () => {
    submit.mockResolvedValueOnce({ kind: 'not_found' });
    expect((await POST(req(VALID), params)).status).toBe(404);

    submit.mockResolvedValueOnce({ kind: 'duplicate', reference: 'JOB-1-OLD' });
    const dup = await POST(req(VALID), params);
    expect(dup.status).toBe(201);
    expect(await dup.json()).toEqual({ reference: 'JOB-1-OLD' });

    submit.mockResolvedValueOnce(CREATED);
    const ok = await POST(req(VALID), params);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ reference: 'JOB-1-ABC' });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://jkkn.ac.in');
  });

  it('does not burn the strict limit on validation failures, but does on accepted submissions', async () => {
    submit.mockResolvedValue(CREATED);
    const ip = '9.9.9.9';
    for (let i = 0; i < 5; i++) expect((await POST(req({ ...VALID, email: 'bad' }, { ip }), params)).status).toBe(400);
    for (let i = 0; i < 5; i++) expect((await POST(req({ ...VALID, email: `p${i}@example.com` }, { ip }), params)).status).toBe(201);
    expect((await POST(req({ ...VALID, email: 'p9@example.com' }, { ip }), params)).status).toBe(429);
    expect(submit).toHaveBeenCalledTimes(5);
  });

  it('caps the same (job, email) pair regardless of IP', async () => {
    submit.mockResolvedValue(CREATED);
    const fields = { ...VALID, email: 'pair@example.com' };
    for (let i = 0; i < 3; i++) expect((await POST(req(fields), params)).status).toBe(201);
    expect((await POST(req(fields), params)).status).toBe(429);
  });

  it('answers OPTIONS', async () => {
    const res = await OPTIONS(new Request('https://x', { method: 'OPTIONS', headers: { origin: 'https://jkkn.ac.in' } }) as never);
    expect(res.status).toBe(204);
  });
});
