/**
 * Validation for the unauthenticated apply endpoint. Everything arriving here is
 * attacker-controlled: trim, cap lengths, and trust the resume's BYTES, not its
 * name or the browser-supplied MIME type.
 */

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export type ResumeMime =
  | 'application/pdf'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);

export function sniffResumeType(bytes: Uint8Array, filename: string): ResumeMime | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' && startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (ext === 'doc' && startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'application/msword';
  if (ext === 'docx' && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

export interface ApplyInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  qualification: string;
  experience_months: number;
  current_job_title: string | null;
  current_company: string | null;
  current_job_duration_months: number | null;
  worked_cities: string[];
  utm_source: string | null;
  /** Re-wrapped with the sniffed MIME type so Drive stores the real one. */
  resume: File;
}

export type ParseResult =
  | { ok: true; value: ApplyInput }
  | { ok: false; fields: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(form: FormData, key: string, max: number): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function months(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 720 ? n : null;
}

export async function parseApplyForm(form: FormData): Promise<ParseResult> {
  const fields: Record<string, string> = {};

  const first_name = text(form, 'first_name', 100);
  const last_name = text(form, 'last_name', 100);
  const email = text(form, 'email', 200).toLowerCase();
  const phone = text(form, 'phone', 30);
  const qualification = text(form, 'qualification', 200);
  const expRaw = text(form, 'experience_months', 10);
  const durRaw = text(form, 'current_job_duration_months', 10);

  if (!first_name) fields.first_name = 'First name is required.';
  if (!last_name) fields.last_name = 'Last name is required.';
  if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';
  const digits = phone.replace(/[\s+\-()]/g, '');
  if (!/^\d{10,15}$/.test(digits)) fields.phone = 'Enter a valid phone number (10-15 digits).';
  if (!qualification) fields.qualification = 'Qualification is required.';
  const experience_months = months(expRaw);
  if (experience_months === null) fields.experience_months = 'Experience must be a whole number of months (0-720).';
  const current_job_duration_months = durRaw ? months(durRaw) : null;
  if (durRaw && current_job_duration_months === null) {
    fields.current_job_duration_months = 'Duration must be a whole number of months (0-720).';
  }
  if (form.get('consent') !== 'true') fields.consent = 'Please accept the privacy consent to apply.';

  let resume: File | null = null;
  const raw = form.get('resume');
  if (!raw || typeof raw === 'string') {
    fields.resume = 'Please attach your resume.';
  } else if (raw.size > MAX_RESUME_BYTES) {
    fields.resume = 'Resume must be under 2 MB.';
  } else {
    const bytes = new Uint8Array(await raw.arrayBuffer());
    const mime = sniffResumeType(bytes, raw.name);
    if (!mime) fields.resume = 'Resume must be a PDF, DOC or DOCX file.';
    else resume = new File([bytes], raw.name.slice(0, 200), { type: mime });
  }

  if (Object.keys(fields).length > 0 || !resume) return { ok: false, fields };

  const worked_cities = text(form, 'worked_cities', 1000)
    .split(',').map((c) => c.trim().slice(0, 60)).filter(Boolean).slice(0, 10);

  return {
    ok: true,
    value: {
      first_name, last_name, email, phone, qualification,
      experience_months: experience_months!,
      current_job_title: text(form, 'current_job_title', 150) || null,
      current_company: text(form, 'current_company', 150) || null,
      current_job_duration_months,
      worked_cities,
      utm_source: text(form, 'utm_source', 100) || null,
      resume,
    },
  };
}
