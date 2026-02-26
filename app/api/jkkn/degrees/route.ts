import { NextRequest, NextResponse } from 'next/server';
import type { JkknDegreeUpstreamResponse } from '@/types/jkkn-api/degrees';

const JKKN_API_BASE_URL =
  process.env.JKKN_API_BASE_URL ?? 'https://www.jkkn.ai/api';
const JKKN_API_KEY = process.env.JKKN_API_KEY;

/**
 * GET /api/jkkn/degrees
 *
 * Secure server-side proxy for the JKKN degrees endpoint.
 * JKKN_API_KEY is a server-only env var — never sent to the browser.
 * Accepts ?page, ?limit, ?search, ?institution_id, ?degree_type, ?isActive.
 *
 * NOTE: The upstream API uses { count, data, pagination } — normalised here
 * to the standard JkknPaginatedResponse shape: { data, metadata }.
 */
export async function GET(request: NextRequest) {
  if (!JKKN_API_KEY) {
    return NextResponse.json(
      { error: 'JKKN_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const upstreamParams = new URLSearchParams({
    page: searchParams.get('page') ?? '1',
    limit: searchParams.get('limit') ?? '20',
  });
  const search = searchParams.get('search');
  if (search) upstreamParams.set('search', search);
  const institutionId = searchParams.get('institution_id');
  if (institutionId) upstreamParams.set('institution_id', institutionId);
  const degreeType = searchParams.get('degree_type');
  if (degreeType) upstreamParams.set('degree_type', degreeType);
  const isActive = searchParams.get('isActive');
  if (isActive !== null) upstreamParams.set('isActive', isActive);

  try {
    const res = await fetch(
      `${JKKN_API_BASE_URL}/api-management/organizations/degrees?${upstreamParams}`,
      {
        headers: {
          Authorization: `Bearer ${JKKN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Upstream API responded with ${res.status} ${res.statusText}`,
          details: body,
        },
        { status: res.status }
      );
    }

    // Normalise upstream { count, data, pagination } → { data, metadata }
    // Guard against Format B: { data, metadata } — already normalised, pass through.
    const upstream = await res.json();
    if (upstream.pagination) {
      return NextResponse.json({
        data: upstream.data,
        metadata: {
          page: upstream.pagination.current_page,
          limit: upstream.pagination.limit,
          totalPages: upstream.pagination.total_pages,
          total: upstream.pagination.total_records,
        },
      });
    }
    return NextResponse.json(upstream);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reach the JKKN API.', details: message },
      { status: 502 }
    );
  }
}
