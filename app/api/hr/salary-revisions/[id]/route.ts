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
      return NextResponse.json(await SalaryRevisionService.get(auth.supabase, id, forDirector));
    } catch (err) {
      return errorResponse(err, 'get');
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'read', allowApiKey: false },
);

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
        default:
          return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
      }
    } catch (err) {
      return errorResponse(err, String(action));
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'write', allowApiKey: false },
);
