/**
 * Business-card scanner — the pickers for a destination's missing parent.
 *
 * Three destinations need a row a card cannot name: an Event Sponsor must
 * belong to an event, and both internship destinations to a site. The review
 * screen asks for it right there, and the user may ALWAYS skip (Director
 * decision 2026-08-05) — so this route exists to fill the dropdown, never to
 * gate the save.
 *
 * Read-only, session-scoped: it runs on the CALLER's client so RLS decides
 * which events and sites they may see. A service-role read here would turn a
 * convenience picker into a cross-institution listing of every event on the
 * platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get('kind');

  if (kind === 'event') {
    // Newest first: a card collected today almost always belongs to a current
    // or recent event, not one from three years ago.
    const { data, error } = await supabase
      .from('events')
      .select('id, name, start_date')
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) {
      console.error('[card-scan/options] events read failed:', error.message);
      return NextResponse.json({ ok: false, error: 'Could not load events.' }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      kind: 'event',
      options: (data ?? []).map((e) => ({
        id: e.id,
        label: e.name,
        hint: e.start_date ? String(e.start_date).slice(0, 10) : null,
      })),
    });
  }

  if (kind === 'site') {
    const { data, error } = await supabase
      .from('internship_external_sites')
      .select('id, site_name')
      .order('site_name', { ascending: true })
      .limit(100);
    if (error) {
      console.error('[card-scan/options] sites read failed:', error.message);
      return NextResponse.json({ ok: false, error: 'Could not load sites.' }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      kind: 'site',
      // Empty today (internship_external_sites has no rows on production as of
      // 2026-08-05). The screen must therefore handle "nothing to pick" as a
      // normal state and fall through to Skip, not as an error.
      options: (data ?? []).map((s) => ({ id: s.id, label: s.site_name, hint: null })),
    });
  }

  return NextResponse.json(
    { ok: false, error: 'kind must be "event" or "site"' },
    { status: 400 },
  );
}
