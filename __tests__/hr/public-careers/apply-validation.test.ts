import { describe, expect, it } from 'vitest';
import { parseApplyForm, sniffResumeType, MAX_RESUME_BYTES } from '@/lib/services/hr/public-careers/apply-validation';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
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
    if (r.ok !== true) return;
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
    if (r.ok === false) expect(r.fields).toHaveProperty(field);
  });

  it('rejects an oversize resume', async () => {
    const big = new Uint8Array(MAX_RESUME_BYTES + 1);
    big.set(PDF);
    const r = await parseApplyForm(form({ resume: new File([big], 'cv.pdf') }));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.fields.resume).toMatch(/2 MB/);
  });
});
