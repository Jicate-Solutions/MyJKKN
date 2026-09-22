// PUBLIC (no auth) — an external candidate applies for a public job from jkkn.ac.in.
// Service role: anon has no RLS path to hr_job_applications.
// Spec: docs/superpowers/specs/2026-09-21-public-careers-api-design.md
//
// Gate order, cheapest and least trusting first:
//   origin → content-length cap → coarse per-IP limit → read body → honeypot →
//   validate → Drive available → strict per-IP + per-(job,email) limits → service.
// The body is only buffered after the size cap and the coarse limiter, and the
// strict limiter only counts submissions that PASSED validation, so a typo never
// locks a real applicant out for an hour while junk still can't be replayed freely.

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { deleteDriveFile, uploadResumeToJobFolder } from '@/lib/google/drive-upload';
import { MAX_RESUME_BYTES, parseApplyForm } from '@/lib/services/hr/public-careers/apply-validation';
import { preflight, resolveAllowedOrigin, withCors } from '@/lib/services/hr/public-careers/cors';
import { clientIp, createRateLimiter } from '@/lib/services/hr/public-careers/rate-limit';
import { submitExternalApplication } from '@/lib/services/hr/public-careers/public-careers-service';
import { notifyHrOfApplication, sendApplicantConfirmation } from '@/lib/services/hr/public-careers/after-apply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Resume cap plus generous room for the text fields and multipart framing. */
export const MAX_BODY_BYTES = MAX_RESUME_BYTES + 256 * 1024;

const HOUR = 60 * 60 * 1000;
/** Any request that costs us a body read — malformed ones included. */
const coarsePerIp = createRateLimiter({ limit: 30, windowMs: HOUR });
/** Submissions that passed validation and reached the service. */
const strictPerIp = createRateLimiter({ limit: 5, windowMs: HOUR });
/** Same person, same job — keyed independently of IP (defence in depth against XFF games). */
const perJobEmail = createRateLimiter({ limit: 3, windowMs: HOUR });

/** Real applicants never see or fill this; the CDC employer form uses the same trap. */
const HONEYPOT_FIELD = 'company_fax';

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }), request);
  const tooMany = () => reply({ error: 'Too many applications from this connection. Please try again later.' }, 429);

  if (!resolveAllowedOrigin(request.headers.get('origin'))) {
    return reply({ error: 'Origin not allowed.' }, 403);
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return reply({ error: 'Application is too large. Resume must be under 2 MB.' }, 413);
  }

  const ip = clientIp(request);
  if (!coarsePerIp(ip)) return tooMany();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'Send the application as multipart/form-data.' }, 400);
  }

  const trap = form.get(HONEYPOT_FIELD);
  if (typeof trap === 'string' && trap.trim() !== '') {
    // Look successful, persist nothing. Logged so a false positive (a browser
    // autofilling the trap for a real person) is at least detectable.
    console.warn('[public/careers] honeypot hit', { ip, email: String(form.get('email') ?? '').slice(0, 120) });
    return reply({ reference: 'RECEIVED' }, 201);
  }

  const parsed = await parseApplyForm(form);
  if (parsed.ok === false) {
    return reply({ error: 'Please correct the highlighted fields.', fields: parsed.fields }, 400);
  }

  if (!isDriveConfigured()) return reply({ error: 'Applications are temporarily unavailable.' }, 503);

  const { id } = await params;
  if (!strictPerIp(ip) || !perJobEmail(`${id}:${parsed.value.email}`)) return tooMany();

  const db = createServiceRoleClient();

  try {
    const result = await submitExternalApplication(
      { db, upload: uploadResumeToJobFolder, deleteFile: deleteDriveFile },
      id,
      parsed.value,
    );
    if (result.kind === 'not_found') return reply({ error: 'This job is no longer accepting applications.' }, 404);
    // A repeat application answers exactly like a first one. Distinguishing them
    // would let anyone probe whether a named person has applied for a role.
    if (result.kind === 'duplicate') return reply({ reference: result.reference }, 201);

    const { application } = result;
    const v = parsed.value;
    after(async () => {
      await notifyHrOfApplication(db, application, `${v.first_name} ${v.last_name}`.trim());
      await sendApplicantConfirmation(db, application, v.email, v.first_name);
    });
    return reply({ reference: application.reference }, 201);
  } catch (err) {
    console.error('[public/careers] apply failed', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
