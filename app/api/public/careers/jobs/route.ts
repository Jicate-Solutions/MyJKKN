// PUBLIC (no auth) — open, public job postings for jkkn.ac.in. Service-role read,
// whitelisted columns only (toPublicJob). Safe to call from a server (ISR) or browser.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { preflight, withCors } from '@/lib/services/hr/public-careers/cors';
import { listPublicJobs } from '@/lib/services/hr/public-careers/public-careers-service';

export const dynamic = 'force-dynamic';

const CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    const body = await listPublicJobs(createServiceRoleClient(), {
      institution_id: sp.get('institution_id'),
      q: sp.get('q'),
      job_type: sp.get('job_type'),
    });
    return withCors(NextResponse.json(body, { headers: { 'Cache-Control': CACHE } }), request);
  } catch (err) {
    console.error('[public/careers] list failed', err);
    return withCors(NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }), request);
  }
}
