// =====================================================================
// PDE clinical-case deadline reminders
// =====================================================================
// A learner gets one notification when a case is assigned. This cron adds the
// deadline nudges (user decisions 2026-07-23 / 2026-07-24):
//   • the day BEFORE the deadline ("due tomorrow"), and
//   • ON the deadline day ("due today — last chance").
//
// Audience each window: assigned + enrolled learners who have NOT passed the case
// yet AND still have attempts left (fn_pde_due_soon_reminders, cap from the global
// clinical-reasoning policy). Works for open (nudged) and class_only (locked)
// assignments alike.
//
// One notification per learner per window: if several cases are due the same day,
// they are combined into a single "N cases due …" card that links to the case
// list; a single case links straight to itself. Idempotent via deliverInApp's
// idempotency_key (window + learner + due-date) — safe to run more than once a day.
//
// Runs daily, morning IST. Auth: CRON_SECRET via `Authorization: Bearer` or `?secret=`.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deliverInApp } from '@/lib/social/notify';

/** A date in IST as 'YYYY-MM-DD' (JKKN is India-only; +05:30, no DST). */
function istDateISO(offsetDays: number): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); // shift into IST wall-clock
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist.toISOString().slice(0, 10);
}

interface Recipient {
  assessment_id: string;
  case_title: string;
  user_id: string;
  due_at: string;
}

interface WindowSpec {
  offset: number;      // 0 = today, 1 = tomorrow
  when: string;        // 'today' | 'tomorrow' — used in copy
  prefix: string;      // idempotency + category discriminator
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

  // Global attempt cap (default 5) — used to skip learners who are out of tries.
  const { data: capData } = await admin.rpc('fn_get_policy_clinical_reasoning', {
    p_key: 'lifetime_attempts_per_case',
  });
  const cap = Number(capData) > 0 ? Number(capData) : 5;

  const windows: WindowSpec[] = [
    { offset: 1, when: 'tomorrow', prefix: 'due-soon' },
    { offset: 0, when: 'today', prefix: 'due-today' },
  ];

  const result: Record<string, unknown> = { ok: true, cap, windows: {}, elapsed_ms: 0 };

  for (const w of windows) {
    const dueDate = istDateISO(w.offset);
    const tally = { due_date: dueDate, candidates: 0, learners: 0, delivered: 0, duplicate: 0, errors: 0 };

    const { data: rows, error } = await admin.rpc('fn_pde_due_soon_reminders', {
      p_due_date: dueDate,
      p_max_attempts: cap,
    });
    if (error) {
      (result.windows as Record<string, unknown>)[w.when] = { ...tally, error: error.message };
      continue;
    }
    const recipients = (Array.isArray(rows) ? rows : []) as Recipient[];
    tally.candidates = recipients.length;

    // One notification per learner: combine multiple cases due the same day.
    const byLearner = new Map<string, Recipient[]>();
    for (const r of recipients) {
      const list = byLearner.get(r.user_id) ?? [];
      list.push(r);
      byLearner.set(r.user_id, list);
    }
    tally.learners = byLearner.size;

    for (const [userId, cases] of byLearner) {
      const single = cases.length === 1;
      const title = single
        ? `A clinical case is due ${w.when} ⏰`
        : `${cases.length} clinical cases are due ${w.when} ⏰`;
      const lead = w.when === 'today' ? 'Last chance — ' : '';
      const body = single
        ? `${lead}"${cases[0].case_title}" is due ${w.when}. Open it and finish before the deadline.`
        : `${lead}You have ${cases.length} clinical cases due ${w.when}: ${cases
            .map((c) => `"${c.case_title}"`)
            .join(', ')}. Open them from your case list.`;
      const url = single ? `/pde/learn/cases/${cases[0].assessment_id}` : '/pde/learn/cases';

      const outcome = await deliverInApp(admin, {
        recipientId: userId,
        title,
        body,
        url,
        category: single ? `pde.case.${w.prefix.replace('-', '_')}` : `pde.case.${w.prefix.replace('-', '_')}.batch`,
        idempotencyKey: `pde-${w.prefix}:${userId}:${dueDate}`,
        metadata: {
          kind: 'pde_case_due_reminder',
          when: w.when,
          due_date: dueDate,
          assessment_ids: cases.map((c) => c.assessment_id),
        },
      });
      if (outcome === 'delivered') tally.delivered++;
      else if (outcome === 'duplicate') tally.duplicate++;
      else tally.errors++;
    }

    (result.windows as Record<string, unknown>)[w.when] = tally;
  }

  result.elapsed_ms = Date.now() - started;
  return NextResponse.json(result);
}
