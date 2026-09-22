// PUBLIC (no auth) — an external candidate applies for a public job from jkkn.ac.in.
// Service role: anon has no RLS path to hr_job_applications. Order is cheap and
// reversible first, the Drive upload last (inside submitExternalApplication).
// Spec: docs/superpowers/specs/2026-09-21-public-careers-api-design.md

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { deleteDriveFile, uploadResumeToJobFolder } from '@/lib/google/drive-upload';
import { parseApplyForm } from '@/lib/services/hr/public-careers/apply-validation';
import { preflight, resolveAllowedOrigin, withCors } from '@/lib/services/hr/public-careers/cors';
import { clientIp, createRateLimiter } from '@/lib/services/hr/public-careers/rate-limit';
import { submitExternalApplication } from '@/lib/services/hr/public-careers/public-careers-service';
import { notifyHrOfApplication, sendApplicantConfirmation } from '@/lib/services/hr/public-careers/after-apply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const allow = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }), request);

  if (!resolveAllowedOrigin(request.headers.get('origin'))) {
    return reply({ error: 'Origin not allowed.' }, 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'Send the application as multipart/form-data.' }, 400);
  }

  // Honeypot: real users never see `website`. Look successful, persist nothing.
  const trap = form.get('website');
  if (typeof trap === 'string' && trap.trim() !== '') return reply({ reference: 'RECEIVED' }, 201);

  if (!allow(clientIp(request))) {
    return reply({ error: 'Too many applications from this connection. Please try again later.' }, 429);
  }

  const parsed = await parseApplyForm(form);
  if (parsed.ok === false) {
    return reply({ error: 'Please correct the highlighted fields.', fields: parsed.fields }, 400);
  }

  if (!isDriveConfigured()) return reply({ error: 'Applications are temporarily unavailable.' }, 503);

  const { id } = await params;
  const db = createServiceRoleClient();

  try {
    const result = await submitExternalApplication(
      { db, upload: uploadResumeToJobFolder, deleteFile: deleteDriveFile },
      id,
      parsed.value,
    );
    if (result.kind === 'not_found') return reply({ error: 'This job is no longer accepting applications.' }, 404);
    if (result.kind === 'duplicate') return reply({ error: 'You have already applied for this job.' }, 409);

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
