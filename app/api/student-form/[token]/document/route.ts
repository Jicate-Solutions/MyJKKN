// app/api/student-form/[token]/document/route.ts
//
// Public — no auth. A postgraduate applicant uploads their degree mark sheet or
// entrance scorecard from the self-fill link (Director ruling 2026-09-30). The
// HMAC-signed token names the learner; the file is written with the service role
// into the private learner-admission-documents bucket and recorded on the
// learner_admission_documents checklist. This route can only WRITE for the
// token's own learner — it never reads or lists anyone's files.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';
import {
  LEARNER_DOCUMENTS_BUCKET,
  LEARNER_DOCUMENT_MAX_BYTES,
  LEARNER_DOCUMENT_TYPES,
  PG_DEGREE_DOC_TYPES,
} from '@/lib/admission/learner-documents';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid';
    if (['malformed_token', 'bad_signature', 'bad_payload', 'token_not_found', 'token_id_mismatch'].includes(msg)) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 410 });
  }

  const formData = await request.formData();
  const docType = String(formData.get('doc_type') ?? '');
  const file = formData.get('file');
  if (!(docType in PG_DEGREE_DOC_TYPES)) {
    return NextResponse.json({ error: 'unknown document type' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  }
  const ext = LEARNER_DOCUMENT_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Only PDF, JPG or PNG files can be uploaded' }, { status: 415 });
  }
  if (file.size > LEARNER_DOCUMENT_MAX_BYTES) {
    return NextResponse.json({ error: 'The file is larger than 5 MB' }, { status: 413 });
  }

  const svc = createServiceRoleClient() as any;
  const learnerId = ctx.learner_profile_id;
  const { data: existing } = await svc
    .from('learner_admission_documents')
    .select('document_ref')
    .eq('learner_id', learnerId)
    .eq('doc_type', docType)
    .maybeSingle();

  const path = `${learnerId}/${docType}-${Date.now()}.${ext}`;
  const { error: upErr } = await svc.storage
    .from(LEARNER_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed: ' + upErr.message }, { status: 500 });
  }

  const receivedAt = new Date().toISOString();
  const { error: rowErr } = await svc.from('learner_admission_documents').upsert(
    {
      learner_id: learnerId,
      doc_type: docType,
      is_received: true,
      received_at: receivedAt,
      received_by: null,
      received_via: 'upload',
      document_ref: path,
      notes: 'Uploaded by the applicant through the self-fill link',
    },
    { onConflict: 'learner_id,doc_type' },
  );
  if (rowErr) {
    await svc.storage.from(LEARNER_DOCUMENTS_BUCKET).remove([path]);
    return NextResponse.json({ error: 'record_failed: ' + rowErr.message }, { status: 500 });
  }

  const oldRef = existing?.document_ref as string | undefined;
  if (oldRef && oldRef !== path && oldRef.startsWith(`${learnerId}/`)) {
    await svc.storage.from(LEARNER_DOCUMENTS_BUCKET).remove([oldRef]);
  }

  return NextResponse.json({ ok: true, doc_type: docType, received_at: receivedAt });
}
