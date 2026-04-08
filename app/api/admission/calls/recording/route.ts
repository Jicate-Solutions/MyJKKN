

// app/api/admission/calls/recording/route.ts
// GET /api/admission/calls/recording?url=<recording_url>
// Proxies Exotel call recordings with auth so the browser can play them.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  // ── Parse & validate URL ──────────────────────────────────────────────────
  const recordingUrl = request.nextUrl.searchParams.get('url');
  if (!recordingUrl) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Missing url query parameter' },
      { status: 400 }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(recordingUrl);
  } catch {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Invalid URL' },
      { status: 400 }
    );
  }

  // Only allow Exotel recording domains
  const allowedHosts = ['recordings.exotel.com', 'exotel.com'];
  if (!allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'URL must be an Exotel recording URL' },
      { status: 400 }
    );
  }

  // ── Exotel credentials ────────────────────────────────────────────────────
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;
  if (!apiKey || !apiToken) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Exotel credentials not configured' },
      { status: 500 }
    );
  }

  // ── Proxy the recording ───────────────────────────────────────────────────
  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString('base64')}`;

  let upstream: Response;
  try {
    upstream = await fetch(recordingUrl, {
      headers: { Authorization: authHeader },
      redirect: 'follow',
    });
  } catch {
    return NextResponse.json(
      { error: 'BAD_GATEWAY', message: 'Failed to reach Exotel recording server' },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502;
    const error = upstream.status === 404 ? 'NOT_FOUND' : 'BAD_GATEWAY';
    const message =
      upstream.status === 404
        ? 'Recording not found'
        : `Exotel returned ${upstream.status}`;
    return NextResponse.json({ error, message }, { status });
  }

  // ── Stream response back ──────────────────────────────────────────────────
  const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
  const contentLength = upstream.headers.get('content-length');

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    // Recordings don't change — cache aggressively
    'Cache-Control': 'private, max-age=86400, immutable',
  };
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  // Stream the body through without buffering
  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
