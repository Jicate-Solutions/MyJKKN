// app/api/calendar/feed/[token]/route.ts
//
// PUBLIC ICS feed for the MyJKKN calendar.  No session required — the token
// itself is the credential.  Google Calendar polls this URL with no auth header.
//
// fn_calendar_ics is a SECURITY DEFINER function GRANTed to anon; it resolves
// the token → user, bumps last_accessed_at, and returns calendar items
// (person-level leave already excluded server-side).

import { createClient } from '@supabase/supabase-js';
import { buildIcs } from '@/lib/calendar/ics';
import type { CalendarItem } from '@/types/calendar';

export const dynamic = 'force-dynamic';

/** Format a Date as 'YYYY-MM-DD' in UTC. */
function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token: rawToken } = await params;

  // Strip a trailing .ics extension if the subscriber appended it.
  const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;

  // Anon client — no user session.  fn_calendar_ics is granted to anon and
  // gates access entirely through the token.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();

  // Window: 90 days back → 365 days forward.
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);

  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 365);

  const { data, error } = await supabase.rpc('fn_calendar_ics', {
    p_token: token,
    p_start: toDateParam(start),
    p_end: toDateParam(end),
  });

  if (error) {
    // Do not expose DB error details on a public endpoint.
    // Return an empty (but valid) VCALENDAR so subscribers don't error out.
    console.error('[calendar/feed] rpc error:', error.code, error.message);
  }

  const items: CalendarItem[] = (data as CalendarItem[] | null) ?? [];
  const ics = buildIcs(items, 'MyJKKN Calendar');

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="myjkkn.ics"',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
