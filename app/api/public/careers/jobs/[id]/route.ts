// PUBLIC (no auth) — one open, public job posting. 404 for anything not visible.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { preflight, withCors } from '@/lib/services/hr/public-careers/cors';
import { getPublicJob } from '@/lib/services/hr/public-careers/public-careers-service';

export const dynamic = 'force-dynamic';

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const job = await getPublicJob(createServiceRoleClient(), id);
    if (!job) return withCors(NextResponse.json({ error: 'Job not found.' }, { status: 404 }), request);
    return withCors(NextResponse.json({ data: job }), request);
  } catch (err) {
    console.error('[public/careers] detail failed', err);
    return withCors(NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }), request);
  }
}
