// GET /api/admission/calls/log/[id]/memo/signed-url
//
// Returns a 1-hour signed URL for the call-memos audio file attached to the
// given call_log id. The bucket (`call-memos`) is private — only authenticated
// users with access to the call log row can retrieve a signed URL.
//
// Used by the <VoiceMemoPanel> client component to play the audio without
// exposing the storage path or service-role key client-side.
//
// Storage path convention (per migration 20260509120000_voice_memo_pipeline):
//   call-memos/{institution_id}/{call_log_id}.webm
// memo_audio_url may be stored as either the full publicUrl OR the
// "call-memos/<path>" string OR the bare "<institution_id>/<callLogId>.webm"
// — we normalize to the relative-to-bucket path before signing.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export const dynamic = 'force-dynamic';

const STORAGE_BUCKET = 'call-memos';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

function normalizeStoragePath(rawUrl: string): string | null {
  if (!rawUrl) return null;
  // Already a bare relative path like "{institutionId}/{id}.webm"
  if (!rawUrl.includes('://') && !rawUrl.startsWith('call-memos/')) {
    return rawUrl.replace(/^\/+/, '');
  }
  // call-memos/{path}
  if (rawUrl.startsWith('call-memos/')) {
    return rawUrl.replace(/^call-memos\//, '');
  }
  // Full https URL — extract everything after /object/(public|sign)/call-memos/
  const m = rawUrl.match(/\/object\/(?:public|sign)\/call-memos\/([^?]+)/);
  if (m && m[1]) return m[1];
  // Last-ditch: take the last two path segments (institution/file.webm)
  try {
    const u = new URL(rawUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join('/');
  } catch {
    /* fall through */
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const { id: callLogId } = await context.params;
    if (!callLogId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'call_log id is required' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    // Look up the call log to (a) confirm it exists, (b) read memo_audio_url,
    // (c) verify the caller can see this row. Visibility check mirrors the
    // approach used elsewhere in this module: super_admins bypass; others must
    // share the call's institution_id OR be the assigned counselor.
    const { data: row, error: rowErr } = await supabase
      .from('admission_call_logs')
      .select('id, institution_id, counselor_id, memo_audio_url')
      .eq('id', callLogId)
      .maybeSingle();

    if (rowErr) {
      logger.error('admission/calls/memo/signed-url', 'Lookup failed', { callLogId, error: rowErr });
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: 'Failed to look up call log' },
        { status: 500 },
      );
    }
    if (!row) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Call log not found' },
        { status: 404 },
      );
    }
    if (!row.memo_audio_url) {
      return NextResponse.json(
        { error: 'NO_MEMO', message: 'No voice memo attached to this call' },
        { status: 404 },
      );
    }

    // Visibility check
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();
    const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';
    const sameInstitution = profile?.institution_id && profile.institution_id === row.institution_id;
    const isAssignedCounselor = row.counselor_id && row.counselor_id === user.id;
    if (!isSuperAdmin && !sameInstitution && !isAssignedCounselor) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have access to this call memo' },
        { status: 403 },
      );
    }

    const path = normalizeStoragePath(row.memo_audio_url);
    if (!path) {
      logger.error('admission/calls/memo/signed-url', 'Could not parse storage path', {
        callLogId,
        memo_audio_url: row.memo_audio_url,
      });
      return NextResponse.json(
        { error: 'BAD_PATH', message: 'Voice memo URL could not be parsed' },
        { status: 500 },
      );
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);

    if (signErr || !signed?.signedUrl) {
      logger.error('admission/calls/memo/signed-url', 'Signing failed', {
        callLogId,
        path,
        error: signErr,
      });
      return NextResponse.json(
        { error: 'SIGN_FAILED', message: signErr?.message || 'Failed to sign audio URL' },
        { status: 500 },
      );
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
    return NextResponse.json({ url: signed.signedUrl, expires_at: expiresAt });
  } catch (error: any) {
    logger.error('admission/calls/memo/signed-url', 'Unhandled error', { error });
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error?.message || 'Unhandled error' },
      { status: 500 },
    );
  }
}
