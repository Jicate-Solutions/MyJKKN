export const dynamic = 'force-dynamic';

// app/api/reference/catalogs/[catalog]/route.ts
// External (Application Hub) reference API — entries of ONE switched-on
// catalog. Active entries only (Director decision); switched-off and unknown
// catalogs both return 404 so the API does not reveal which catalogs exist.

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ catalog: string }> }
): Promise<NextResponse> {
  await connection();
  const startedAt = Date.now();
  const { catalog } = await params;

  const auth = await authenticateReferenceApi(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: corsHeaders }
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search');
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const { data, error } = await auth.supabase.rpc('fn_reference_api_rows', {
    p_catalog_key: catalog,
    p_search: search && search.trim() !== '' ? search.trim() : null,
    p_limit: Number.isFinite(limit) ? limit : 100,
    p_offset: Number.isFinite(offset) ? offset : 0,
  });

  const notAvailable =
    error && String(error.message ?? '').includes('CATALOG_NOT_AVAILABLE');
  const status = notAvailable ? 404 : error ? 500 : 200;
  await logReferenceApiUsage(
    auth,
    request,
    `/api/reference/catalogs/${catalog}`,
    status,
    startedAt
  );

  if (notAvailable) {
    return NextResponse.json(
      { error: 'Catalog not found or not available through the API' },
      { status: 404, headers: corsHeaders }
    );
  }
  if (error) {
    return NextResponse.json(
      { error: 'Failed to load catalog entries' },
      { status: 500, headers: corsHeaders }
    );
  }
  return NextResponse.json(data, { status: 200, headers: corsHeaders });
}
