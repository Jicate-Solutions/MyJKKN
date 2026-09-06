// =====================================================================
// Social engagement adoption nudges — the loop's heartbeat
// =====================================================================
// The department-Instagram engagement loop (PRs #1818/#1827) is live but silent.
// This one cron delivers the two nudges that make it get USED:
//
//   NUDGE #1 — weekly rota reminder: for each contributor assigned THIS week,
//     "it's your week to post for @handle." The loop's entry point.
//   NUDGE #2 — recognition: when a posted contribution earns real signal
//     (saves+shares+comments — NEVER likes), "your post earned N real-signal."
//     The reward half of "invited + rewarded" (CARRE RS4 coercion fix).
//
// Runs via the AI-routine dispatcher (editable day/time from /admin/ai-routines),
// NOT a raw vercel.json cron. Seeded DAILY: nudge #1 self-gates to the current
// week + reminded_at IS NULL (fires once, on the first daily tick of each week);
// nudge #2 sweeps daily so a learner hears about their signal within ~a day of
// metrics arriving. Both are idempotent via a per-row column.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deliverInApp } from '@/lib/social/notify';

/** Current week's Monday (Asia/Kolkata) as 'YYYY-MM-DD'. MUST match the owner
 *  console's assign-snap (`dow === 0 ? -6 : 1 - dow`) so reminders target the
 *  same week_start the console writes. */
function currentMondayISO(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); // shift into IST wall-clock
  const dow = ist.getUTCDay(); // 0=Sun..6=Sat in the IST-shifted clock
  ist.setUTCDate(ist.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return ist.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const started = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const result = {
    ok: true,
    week_start: currentMondayISO(),
    reminders: { due: 0, delivered: 0, duplicate: 0, errors: 0 },
    recognition: { candidates: 0, delivered: 0, duplicate: 0, no_signal: 0, errors: 0 },
    elapsed_ms: 0,
  };

  // Handle username lookup, memoised across both nudges.
  const handleCache = new Map<string, string | null>();
  const handleName = async (deptAccountId: string): Promise<string | null> => {
    if (handleCache.has(deptAccountId)) return handleCache.get(deptAccountId) ?? null;
    const { data } = await admin
      .from('social_dept_accounts')
      .select('username')
      .eq('id', deptAccountId)
      .maybeSingle();
    const name = (data?.username as string | undefined) ?? null;
    handleCache.set(deptAccountId, name);
    return name;
  };

  // ---- NUDGE #1: weekly rota reminder ---------------------------------------
  try {
    const monday = result.week_start;
    const { data: dueRota, error } = await admin
      .from('social_contributor_rota')
      .select('id, dept_account_id, contributor_profile_id')
      .eq('week_start', monday)
      .eq('status', 'assigned')
      .is('reminded_at', null);

    if (error) {
      result.reminders.errors++;
    } else {
      result.reminders.due = dueRota?.length ?? 0;
      for (const r of dueRota ?? []) {
        const username = (await handleName(r.dept_account_id)) ?? 'your department';
        const outcome = await deliverInApp(admin, {
          recipientId: r.contributor_profile_id,
          title: "It's your week to post 📸",
          body: `You're the contributor for @${username} this week. Share something worth saving — post an idea and the handle owner will publish it. Open the loop from your dashboard.`,
          url: '/dashboard',
          category: 'social:rota-reminder',
          idempotencyKey: `social-rota-reminder:${r.id}`,
          metadata: { rota_id: r.id, dept_account_id: r.dept_account_id, week_start: monday },
        });
        if (outcome === 'delivered') result.reminders.delivered++;
        else if (outcome === 'duplicate') result.reminders.duplicate++;
        else result.reminders.errors++;

        // Mark reminded only when it actually landed (or was already sent) — an
        // 'error' leaves reminded_at NULL so the next tick retries.
        if (outcome === 'delivered' || outcome === 'duplicate') {
          await admin
            .from('social_contributor_rota')
            .update({ reminded_at: new Date().toISOString() })
            .eq('id', r.id)
            .is('reminded_at', null);
        }
      }
    }
  } catch {
    result.reminders.errors++;
  }

  // ---- NUDGE #2: recognition for posted contributions that earned signal -----
  try {
    const { data: posted, error } = await admin
      .from('social_contributions')
      .select('id, contributor_profile_id, dept_account_id, ig_post_id')
      .eq('status', 'posted')
      .not('ig_post_id', 'is', null)
      .is('signal_notified_at', null);

    if (error) {
      result.recognition.errors++;
    } else {
      result.recognition.candidates = posted?.length ?? 0;
      for (const c of posted ?? []) {
        // Latest metrics snapshot for this post; real signal = saves+shares+comments.
        const { data: m } = await admin
          .from('ig_post_metrics')
          .select('saves, shares, comments, snapshot_at')
          .eq('post_id', c.ig_post_id as string)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const saves = Number(m?.saves ?? 0);
        const shares = Number(m?.shares ?? 0);
        const comments = Number(m?.comments ?? 0);
        const realSignal = saves + shares + comments;

        // No signal yet (metrics not in, or genuinely 0) → leave unmarked so a
        // later tick can recognise it once real signal arrives. Never celebrate 0.
        if (realSignal < 1) {
          result.recognition.no_signal++;
          continue;
        }

        const username = (await handleName(c.dept_account_id)) ?? 'your department';
        const outcome = await deliverInApp(admin, {
          recipientId: c.contributor_profile_id,
          title: 'Your post earned real signal 🌱',
          body: `Your contribution to @${username} earned ${realSignal} real-signal — ${saves} saves, ${shares} shares, ${comments} comments. That's people acting on it, not just scrolling past. Thank you for contributing.`,
          url: '/dashboard',
          category: 'social:recognition',
          idempotencyKey: `social-recognition:${c.id}`,
          metadata: {
            contribution_id: c.id,
            dept_account_id: c.dept_account_id,
            real_signal: realSignal,
            saves,
            shares,
            comments,
          },
        });
        if (outcome === 'delivered') result.recognition.delivered++;
        else if (outcome === 'duplicate') result.recognition.duplicate++;
        else result.recognition.errors++;

        if (outcome === 'delivered' || outcome === 'duplicate') {
          await admin
            .from('social_contributions')
            .update({ signal_notified_at: new Date().toISOString() })
            .eq('id', c.id)
            .is('signal_notified_at', null);
        }
      }
    }
  } catch {
    result.recognition.errors++;
  }

  result.elapsed_ms = Date.now() - started;
  return NextResponse.json(result);
}
