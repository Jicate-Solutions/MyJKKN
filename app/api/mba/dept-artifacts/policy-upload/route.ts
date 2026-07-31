// app/api/mba/dept-artifacts/policy-upload/route.ts
// POST (multipart) — an officer uploads the department's real policy document.
//
// Decision (2026-07-29): an uploaded file ALWAYS WINS. Once this succeeds the
// department's policy artifact is source='upload', status='approved', and the AI
// writer RPC refuses to overwrite it. Any prior version is snapshotted into
// mba_dept_artifact_versions first, so nothing already on record is destroyed.
//
// Who: CEO / CAO / EAO only (improvement.area_policy.approve). Checked here so the
// caller gets a clear 403 instead of a storage object nobody can use, and checked
// AGAIN inside fn_mba_dept_policy_upload with the caller's own JWT — the bucket
// write below uses the service-role key, which bypasses storage RLS.
//
// Where: the PRIVATE 'dept-policies' bucket, at "<area_id>/<uuid>.<ext>". Never a
// public URL; reads go through /api/mba/dept-artifacts/policy-file.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  POLICY_APPROVE_PERMISSION,
  POLICY_BUCKET,
  POLICY_UPLOAD_MAX_BYTES,
  POLICY_UPLOAD_MIME_TYPES,
} from '@/lib/services/mba-dept-artifacts/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canApprove } = await supabase.rpc('user_has_permission', {
      permission_name: POLICY_APPROVE_PERMISSION,
    });
    if (canApprove !== true) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Only the CEO, CAO or Executive Administrative Officer can upload a department policy.',
        },
        { status: 403 },
      );
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ ok: false, error: 'Expected a file upload' }, { status: 400 });
    }
    const areaId = String(form.get('area_id') ?? '');
    const note = String(form.get('note') ?? '').trim();
    const file = form.get('file');

    if (!UUID_RE.test(areaId)) {
      return NextResponse.json({ ok: false, error: 'A valid area_id is required' }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: 'No document was attached' }, { status: 400 });
    }
    if (file.size > POLICY_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'That document is larger than 10 MB.' },
        { status: 400 },
      );
    }
    if (!(POLICY_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: 'Only PDF, DOC and DOCX documents can be uploaded.' },
        { status: 400 },
      );
    }

    // The stored key is generated here — never taken from the filename — so a
    // crafted name cannot escape the area's folder. The original name is kept as
    // data on the row, which is what the reader sees.
    const ext = EXT_BY_MIME[file.type] ?? 'pdf';
    const objectPath = `${areaId}/${crypto.randomUUID()}.${ext}`;
    const originalName = (file.name || `policy.${ext}`).slice(0, 200);

    const admin = createServiceRoleClient();
    const { error: uploadError } = await admin.storage
      .from(POLICY_BUCKET)
      .upload(objectPath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      console.error('[POST /api/mba/dept-artifacts/policy-upload] Storage:', uploadError.message);
      return NextResponse.json(
        { ok: false, error: `Could not store the document — ${uploadError.message}` },
        { status: 500 },
      );
    }

    // Record it as the live policy through the caller's own client, so the RPC's
    // authority check runs against the real person, not the service role.
    const { error: rpcError } = await supabase.rpc('fn_mba_dept_policy_upload', {
      p_area_id: areaId,
      p_file_path: objectPath,
      p_file_name: originalName,
      p_file_size: file.size,
      p_file_mime: file.type,
      p_note: note || null,
    });

    if (rpcError) {
      // Rejected after the bytes landed — take them back out so a refused upload
      // leaves nothing behind in the bucket.
      const { error: cleanupError } = await admin.storage.from(POLICY_BUCKET).remove([objectPath]);
      if (cleanupError) {
        console.error(
          '[POST /api/mba/dept-artifacts/policy-upload] Orphan left in bucket:',
          objectPath,
          cleanupError.message,
        );
      }
      console.error('[POST /api/mba/dept-artifacts/policy-upload] RPC:', rpcError.message);
      return NextResponse.json(
        { ok: false, error: `Could not record the policy — ${rpcError.message}` },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, file_name: originalName });
  } catch (error) {
    console.error('[POST /api/mba/dept-artifacts/policy-upload] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
