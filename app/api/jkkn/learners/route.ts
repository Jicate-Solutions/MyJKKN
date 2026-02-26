import { NextRequest, NextResponse } from 'next/server';
import type { JkknLearnerUpstreamResponse } from '@/types/jkkn-api/learners';

const JKKN_API_BASE_URL =
  process.env.JKKN_API_BASE_URL ?? 'https://www.jkkn.ai/api';
const JKKN_API_KEY = process.env.JKKN_API_KEY;

/**
 * GET /api/jkkn/learners
 *
 * Secure server-side proxy for the JKKN learners/profiles endpoint.
 * The API key is stored in JKKN_API_KEY (server-only env var) and is
 * never sent to the browser. Accepts ?page, ?limit, ?search,
 * ?institution_id, ?program_id, ?semester_id, ?section_id,
 * ?lifecycle_status, ?isActive params that are forwarded to upstream.
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

  const institution_id = searchParams.get('institution_id');
  if (institution_id) upstreamParams.set('institution_id', institution_id);

  const program_id = searchParams.get('program_id');
  if (program_id) upstreamParams.set('program_id', program_id);

  const semester_id = searchParams.get('semester_id');
  if (semester_id) upstreamParams.set('semester_id', semester_id);

  const section_id = searchParams.get('section_id');
  if (section_id) upstreamParams.set('section_id', section_id);

  const lifecycle_status = searchParams.get('lifecycle_status');
  if (lifecycle_status) upstreamParams.set('lifecycle_status', lifecycle_status);

  const isActive = searchParams.get('isActive');
  if (isActive !== null) upstreamParams.set('isActive', isActive);

  try {
    const res = await fetch(
      `${JKKN_API_BASE_URL}/api-management/learners/profiles?${upstreamParams}`,
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
    const upstream: JkknLearnerUpstreamResponse = await res.json();
    if (upstream.pagination) {
      return NextResponse.json({
        data: upstream.data,
        metadata: {
          page: upstream.pagination.page,
          limit: upstream.pagination.limit,
          totalPages: upstream.pagination.totalPages,
          total: upstream.pagination.total,
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
