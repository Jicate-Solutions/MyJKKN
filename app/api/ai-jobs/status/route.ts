export const dynamic = 'force-dynamic';

// /api/ai-jobs/status?id=<uuid>
// GET — poll one job's status. Reuses the EXISTING fn_ai_job_status RPC, which
//       is requester-scoped (auth.uid()) so a user only ever reads their own
//       jobs. Returns { status, result, completed_at } (+ job_type when known).
//
// Auth + error shape mirror /api/ai-query.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
        { status: 401 },
      );
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'A valid job id is required' } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc('fn_ai_job_status', { p_job_id: id });
    if (error) {
      console.error('[ai-jobs/status] rpc error:', error.message);
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Failed to read job status.' } },
        { status: 500 },
      );
    }

    // fn_ai_job_status returns { status, result, error, job_type, completed_at }.
    const status = typeof data?.status === 'string' ? data.status : 'unknown';
    if (status === 'unauthorized') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
        { status: 401 },
      );
    }
    if (status === 'not_found') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job not found.' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status,
      result: data?.result ?? null,
      error: data?.error ?? null,
      job_type: data?.job_type ?? null,
      completed_at: data?.completed_at ?? null,
    });
  } catch (error) {
    console.error('[ai-jobs/status] route error:', error);
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 },
    );
  }
}
