export const dynamic = 'force-dynamic';

/**
 * /api/hr/playbooks — HR duty playbooks (20271007161139).
 *
 * GET  ?duty=L1            → { duty, lines }        team members only
 * GET  ?view=proposals     → { proposals }           the HR head sees all waiting
 *                                                    proposals; any other team
 *                                                    member only their own
 * GET  ?view=contributors  → { contributors }        ordered by name, not count
 *
 * Every GET is for team members (a staff row), super admins, admins and the
 * manage key only: the database refuses anyone else (a learner or parent) with
 * 42501, which this route answers as 403.
 * POST { duty, text }      → { id }                  suggest a line, credited
 *                                                    to the caller by name
 *
 * Every rule (who may suggest, the 5-waiting limit, who may decide) lives in
 * the database functions; this route only passes the caller's session through.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PlaybookError, playbookService } from '@/lib/services/hr/playbooks/playbook-service';

function fail(err: unknown) {
  if (err instanceof PlaybookError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('[api/hr/playbooks] failed', err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const params = req.nextUrl.searchParams;
    const view = params.get('view');
    if (view === 'proposals') {
      return NextResponse.json({ proposals: await playbookService.openProposals(supabase) });
    }
    if (view === 'contributors') {
      return NextResponse.json({ contributors: await playbookService.contributors(supabase) });
    }
    const duty = params.get('duty');
    if (!duty) {
      return NextResponse.json({ error: 'Say which duty: ?duty=L1, or ?view=proposals / contributors.' }, { status: 400 });
    }
    return NextResponse.json({ duty, lines: await playbookService.linesForDuty(supabase, duty) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { duty?: unknown; text?: unknown } | null;
    if (!body || typeof body.duty !== 'string' || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'Send { duty, text }.' }, { status: 400 });
    }
    const id = await playbookService.suggest(supabase, body.duty, body.text);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
