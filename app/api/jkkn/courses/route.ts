import { NextRequest, NextResponse } from 'next/server';
import type { JkknCourseUpstreamResponse } from '@/types/jkkn-api/courses';

const JKKN_API_BASE_URL =
  process.env.JKKN_API_BASE_URL ?? 'https://www.jkkn.ai/api';
const JKKN_API_KEY = process.env.JKKN_API_KEY;

/**
 * GET /api/jkkn/courses
 *
 * Secure server-side proxy for the JKKN courses endpoint.
 * JKKN_API_KEY is a server-only env var — never sent to the browser.
 *
 * NOTE: The upstream courses API uses a different response envelope:
 *   { count, data, pagination: { current_page, total_pages, total_records, limit } }
 *
 * This handler normalises it to the standard JkknPaginatedResponse shape:
 *   { data, metadata: { page, limit, totalPages, total } }
 *
 * Accepts: ?page, ?limit (default 50, max 200), ?is_active
 * Does NOT accept: ?search (not supported by the courses endpoint)
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
    limit: searchParams.get('limit') ?? '50',
  });
  const isActive = searchParams.get('is_active');
  if (isActive !== null) upstreamParams.set('is_active', isActive);

  try {
    const res = await fetch(
      `${JKKN_API_BASE_URL}/api-management/organizations/courses?${upstreamParams}`,
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
    const upstream: JkknCourseUpstreamResponse = await res.json();
    return NextResponse.json({
      data: upstream.data,
      metadata: {
        page: upstream.pagination.current_page,
        limit: upstream.pagination.limit,
        totalPages: upstream.pagination.total_pages,
        total: upstream.pagination.total_records,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reach the JKKN API.', details: message },
      { status: 502 }
    );
  }
}
