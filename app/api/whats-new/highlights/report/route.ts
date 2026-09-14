// app/api/whats-new/highlights/report/route.ts
//
// "This write-up is wrong." One tap, from any signed-in reader.
//
//   POST /api/whats-new/highlights/report   body: { sha }
//
// Director ruling 7 (2026-09-13): every write-up carries a report-it link. It
// is the REVIEW LAYER — it replaces the approval queue he declined, by moving
// the check from one person doing weekly work to every reader doing nothing
// until something looks wrong. It must also yield an honest count of how often
// the writing is wrong.
//
// The writer publishes UNREVIEWED, twice an hour. This route and the two
// sibling rulings (5: a hidden write-up is never rewritten; 8: a silent stop is
// not silent) are what make that cadence safe. See
// specs/whats-new/highlight-writer-rulings-2026-09-13.md.
//
// ── NO BODY BEYOND THE sha, AND THAT IS THE DESIGN
// A description box is the approval queue's friction reappearing at the reader's
// end of the page. The sibling mechanism that DOES take a description —
// app/api/bug-reports — requires ten characters and a page URL, and is aimed at
// code defects with a reproduction. A wrong sentence has none. So this takes the
// change id and nothing else, and the value of the endpoint is the COUNT.
//
// ── WRITES RUN AS THE SIGNED-IN USER, never the service role.
// The three rules that matter are all RLS on changelog_highlight_reports
// (20261207090000): you may only file as yourself, only about a write-up you
// can actually see, and only once. Writing with the service role would work and
// would quietly move all three into whatever this file remembers to check.
//
// ── REPORTING IS NOT A TAKEDOWN.
// Nothing here changes a highlight's status. A single reader can be wrong about
// a sentence that is right, and a page any reader can un-publish by tapping
// fastest is worse than the fault it would be fixing. The tally is a signal for
// a super admin, who already has the queue and the Hide action.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Same shape the sibling route validates — a short git hash, nothing else. */
const SHA_RE = /^[0-9a-fA-F]{4,64}$/;

/** One application writes here today, and the caller does not get to name it.
 *  Taking it from the body would let a reader attach a report to another
 *  application's commit — the same reason the sibling PUT hardcodes it. */
const APP_KEY = 'myjkkn';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Sign in to report a write-up.' },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'The request body was not readable.' },
      { status: 400 }
    );
  }

  const sha = typeof body?.sha === 'string' ? body.sha : '';
  if (!SHA_RE.test(sha)) {
    return NextResponse.json(
      { ok: false, error: 'A change id is required.' },
      { status: 400 }
    );
  }

  const { error } = await (supabase as any)
    .from('changelog_highlight_reports')
    .insert({ app_key: APP_KEY, sha, reported_by: user.id });

  if (error) {
    // 23505 — this reader already reported this write-up. That is a SUCCESS
    // from the reader's side: their view says "reported", and the count is
    // unchanged because it is a count of distinct readers. Reporting the same
    // thing twice must never look like a failure to a person who tapped twice.
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, sha, already: true });
    }
    // 23503 — the entry left changelog_entries between the page loading and
    // the tap (the sync prunes). There is nothing left to report.
    if (error.code === '23503') {
      return NextResponse.json(
        {
          ok: false,
          error: 'That change is no longer in the changelog, so nothing was reported.',
        },
        { status: 409 }
      );
    }
    // 42501 — the RLS WITH CHECK refused: no visible approved write-up for this
    // change. An explicit refusal a person can read, never a silent 200
    // (CLAUDE.md #27).
    if (error.code === '42501') {
      return NextResponse.json(
        {
          ok: false,
          error: 'There is no write-up you can see for that change, so nothing was reported.',
        },
        { status: 403 }
      );
    }
    console.error('[whats-new/highlights/report] write failed', { sha, error });
    return NextResponse.json(
      { ok: false, error: 'The report could not be saved.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, sha, already: false });
}
