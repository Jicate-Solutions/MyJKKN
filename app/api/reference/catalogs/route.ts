export const dynamic = 'force-dynamic';

// app/api/reference/catalogs/route.ts
// External (Application Hub) reference API — directory of catalogs that have
// been switched ON for API access (reference_catalogs.api_enabled).
// READ-ONLY by design; auth mirrors app/api/api-management/*.

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  authenticateReferenceApi,
  logReferenceApiUsage,
} from '@/lib/services/reference/reference-api-auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  const startedAt = Date.now();
  const auth = await authenticateReferenceApi(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: corsHeaders }
    );
  }

  const { data, error } = await auth.supabase.rpc('fn_reference_api_catalogs');
  const status = error ? 500 : 200;
  await logReferenceApiUsage(auth, request, '/api/reference/catalogs', status, startedAt);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load catalogs' },
      { status: 500, headers: corsHeaders }
    );
  }
  return NextResponse.json(
    { catalogs: data ?? [] },
    { status: 200, headers: corsHeaders }
  );
}
