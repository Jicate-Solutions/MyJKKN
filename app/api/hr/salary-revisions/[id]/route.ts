export const dynamic = 'force-dynamic';

/**
 * GET  /api/hr/salary-revisions/:id   one request, its comments and — only for
 *      the asker, the principal of an HOD's request and the Director — the
 *      reason it was stopped or refused (ruling 14).
 * POST /api/hr/salary-revisions/:id   { action, ... }
 *      'comment'        { body }                       anyone who can see it (ruling 10)
 *      'college_agree'  { note? }                      the principal (ruling 2)
 *      'college_stop'   { reason }                     the principal, reason required
 *      'approve'        { finalMonthlyGross?, note? }  the Director (rulings 3, 12)
 *      'refuse'         { reason }                     the Director, reason required (ruling 14)
 *      'target_flag'    { month, note }                the principal flags a month (7 Oct 2026, ruling 5)
 *      'target_decide'  { month, met, note? }          the Director decides a flagged month
 *      'target_lapse'   { note }                       the Director lapses an earlier held part
 *
 * GET also carries `targets`: the held part of the raise and its monthly
 * numbers (20271007180207), as row level security lets the caller see them.
 * The person whose raise it is (even if they asked for it) never reads the
 * tables; they get numbers, state and dates only, no notes or flags (round 7).
 *
 * Every rule is enforced in Postgres (20270519090000); this route only passes
 * the caller's own session through and turns refusals into HTTP answers.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRevisionService } from '@/lib/services/hr/salary-revision/salary-revision-service';
import { UUID, callerIsApprover, errorResponse } from '@/lib/services/hr/salary-revision/route-helpers';

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    const { id } = (await context?.params) ?? {};
    if (!id || !UUID.test(id)) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
    try {
      const forDirector = await callerIsApprover(auth.supabase);
      const [detail, targets] = await Promise.all([
        SalaryRevisionService.get(auth.supabase, id, forDirector),
        SalaryRevisionService.targets(auth.supabase, id),
      ]);
      return NextResponse.json({ ...detail, targets });
    } catch (err) {
      return errorResponse(err, 'get');
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'read', allowApiKey: false },
);

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A month as yyyy-MM-01 (the database counts whole calendar months). */
function monthOf(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(0, 7)}-01` : null;
}

export const POST = withAuth(
  async (request, auth, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id || !UUID.test(id)) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
    const body = await request.json().catch(() => null);
    const action = body?.action;
    try {
      switch (action) {
        case 'comment': {
          const text = optionalText(body?.body);
          if (!text) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
          await SalaryRevisionService.comment(auth.supabase, id, text);
          return NextResponse.json({ ok: true });
        }
        case 'college_agree':
          return NextResponse.json({
            status: await SalaryRevisionService.collegeDecide(auth.supabase, id, true, optionalText(body?.note)),
          });
        case 'college_stop': {
          const reason = optionalText(body?.reason);
          if (!reason) {
            return NextResponse.json({ error: 'Write a short reason. The head of department who asked will see it.' }, { status: 400 });
          }
          return NextResponse.json({ status: await SalaryRevisionService.collegeDecide(auth.supabase, id, false, reason) });
        }
        case 'approve': {
          const raw = body?.finalMonthlyGross;
          const finalMonthlyGross = raw === null || raw === undefined || raw === '' ? null : Number(raw);
          if (finalMonthlyGross !== null && (!Number.isFinite(finalMonthlyGross) || finalMonthlyGross <= 0)) {
            return NextResponse.json({ error: 'The new monthly pay must be more than zero.' }, { status: 400 });
          }
          return NextResponse.json({
            status: await SalaryRevisionService.directorDecide(auth.supabase, id, {
              approve: true, finalMonthlyGross, reason: optionalText(body?.note),
            }),
          });
        }
        case 'refuse': {
          const reason = optionalText(body?.reason);
          if (!reason) {
            return NextResponse.json({ error: 'Write a short reason. Only the person who asked will see it.' }, { status: 400 });
          }
          return NextResponse.json({
            status: await SalaryRevisionService.directorDecide(auth.supabase, id, {
              approve: false, finalMonthlyGross: null, reason,
            }),
          });
        }
        case 'target_flag': {
          const month = monthOf(body?.month);
          const note = optionalText(body?.note);
          if (!month) return NextResponse.json({ error: 'Which month?' }, { status: 400 });
          if (!note) return NextResponse.json({ error: 'Write a short note: the Director sees it with the numbers.' }, { status: 400 });
          await SalaryRevisionService.flagMonth(auth.supabase, id, month, note);
          return NextResponse.json({ ok: true });
        }
        case 'target_decide': {
          const month = monthOf(body?.month);
          if (!month) return NextResponse.json({ error: 'Which month?' }, { status: 400 });
          if (typeof body?.met !== 'boolean') {
            return NextResponse.json({ error: 'Say whether the month counts as met or missed.' }, { status: 400 });
          }
          return NextResponse.json({
            status: await SalaryRevisionService.decideMonth(auth.supabase, id, month, body.met, optionalText(body?.note)),
          });
        }
        case 'target_lapse': {
          const note = optionalText(body?.note);
          if (!note) return NextResponse.json({ error: 'Write a short note: why the held part lapses.' }, { status: 400 });
          return NextResponse.json({ status: await SalaryRevisionService.lapseHeld(auth.supabase, id, note) });
        }
        default:
          return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
      }
    } catch (err) {
      return errorResponse(err, String(action));
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'write', allowApiKey: false },
);
