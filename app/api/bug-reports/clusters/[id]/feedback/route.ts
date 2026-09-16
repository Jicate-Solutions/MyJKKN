export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../../_auth';

/**
 * Reporter feedback — increment #2 of the bug-cluster self-improving loop
 * (docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md).
 * THE KEYSTONE: the reporter's 👍/👎 answer is the loop's ground truth.
 *
 * GET  — feedback state for the Groups-tab section (status + answer counts).
 * POST — { action: 'prepare' }  build pending_send rows for eligible members
 *                               (E3: odd-ones-out excluded; needs a one-fix
 *                               verdict). Nothing is visible to reporters yet.
 *        { action: 'send' }     ★ HUMAN GATE #3 ★ — the admin clicking this
 *                               button IS the approval. Flips rows to 'sent'
 *                               under the 3-open-prompts cap (E4) and fans an
 *                               in-app notification to each newly-sent
 *                               reporter. No AI verdict can trigger this.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const { response } = await requireBugAdmin();
    if (response) return response;

    const admin = createAdminClient() as any;
    const { data: rows, error } = await admin
      .from('bug_fix_feedback_requests')
      .select('id, bug_id, status, answer, expires_at, sent_at, answered_at, answered_by, admin_note')
      .eq('cluster_id', clusterId);
    if (error) throw error;

    const now = Date.now();
    const SOON = 3 * 24 * 60 * 60 * 1000; // fn_bug_feedback_admin_confirm's window
    const state = {
      total: rows?.length ?? 0,
      pending_send: 0,
      sent: 0,
      delivered: 0,
      answered: 0,
      expired: 0,
      yes: 0, // 👍 fixed — REPORTER answers only
      no: 0, // 👎 not fixed — REPORTER answers only
      // Director ruling 2026-09-15: admin confirmations are their own evidence.
      admin_yes: 0,
      admin_no: 0,
      // silent reporters an admin may confirm for: expired, or within 3 days of it
      admin_confirmable: [] as { id: string; bug_id: string; expires_at: string; expired: boolean }[]
    };
    for (const r of rows ?? []) {
      const expired =
        r.status !== 'answered' && new Date(r.expires_at).getTime() <= now;
      if (expired) state.expired += 1;
      else if (r.status === 'pending_send') state.pending_send += 1;
      else if (r.status === 'sent') state.sent += 1;
      else if (r.status === 'delivered') state.delivered += 1;
      else if (r.status === 'answered') state.answered += 1;
      const byAdmin = r.answered_by === 'admin';
      if (r.answer === 'fixed') {
        if (byAdmin) state.admin_yes += 1;
        else state.yes += 1;
      }
      if (r.answer === 'not_fixed') {
        if (byAdmin) state.admin_no += 1;
        else state.no += 1;
      }
      if (
        r.status !== 'answered' &&
        r.status !== 'pending_send' &&
        new Date(r.expires_at).getTime() <= now + SOON
      ) {
        state.admin_confirmable.push({ id: r.id, bug_id: r.bug_id, expires_at: r.expires_at, expired });
      }
    }
    return NextResponse.json({ feedback: state });
  } catch (error) {
    logger.error('bug-reports/clusters', `Feedback state failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to load feedback state' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const { user, response } = await requireBugAdmin();
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const admin = createAdminClient() as any;

    if (action === 'prepare') {
      const { data, error } = await admin.rpc('fn_bug_feedback_prepare', {
        p_cluster_id: clusterId,
        p_fix_pr: body?.fix_pr ?? null,
        p_deploy_sha: body?.deploy_sha ?? null
      });
      if (error) throw error;
      if (!data?.success) {
        return NextResponse.json({ error: data?.error ?? 'prepare failed' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...data });
    }

    if (action === 'admin_confirm') {
      // Director ruling 2026-09-15: a silent reporter's question may be
      // confirmed by a super admin — recorded as the ADMIN's evidence
      // (answered_by='admin'), never as the reporter's. The RPC re-checks the
      // role, the expiry window and that the reporter has not answered.
      const requestId = typeof body?.request_id === 'string' ? body.request_id : null;
      const answer = body?.answer === 'pos' || body?.answer === 'neg' ? body.answer : null;
      if (!requestId || !answer) {
        return NextResponse.json({ error: 'request_id and answer (pos|neg) are required' }, { status: 400 });
      }
      const { data, error } = await admin.rpc('fn_bug_feedback_admin_confirm', {
        p_request_id: requestId,
        p_answer: answer,
        p_note: typeof body?.note === 'string' ? body.note.slice(0, 500) : null,
        p_admin_user_id: user.id
      });
      if (error) throw error;
      if (!data?.success) {
        return NextResponse.json({ error: data?.error ?? 'admin confirm failed' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...data });
    }

    if (action === 'send') {
      // ★ The click that reached here IS the human approval (gate #3). ★
      const { data, error } = await admin.rpc('fn_bug_feedback_approve_send', {
        p_cluster_id: clusterId
      });
      if (error) throw error;
      if (!data?.success) {
        return NextResponse.json({ error: data?.error ?? 'send failed' }, { status: 400 });
      }

      // In-app nudge (locked D1: both surfaces) for each newly-sent reporter.
      // Best-effort: a notification failure must not undo the send.
      // Schema per the live notifications table (title/body/url/category/kind/
      // priority/targeting/created_by — there is NO type/message column; the
      // first ship used those and failed silently inside this try/catch).
      // created_by = the admin whose click approved the send (gate #3).
      const reporterIds: string[] = (data.sent_reporter_ids ?? []).filter(Boolean);
      if (reporterIds.length > 0) {
        try {
          const { data: notification, error: notifError } = await admin
            .from('notifications')
            .insert({
              title: 'One of your reports may be fixed',
              body: 'A problem you reported looks fixed. Open My Bug Reports and tap Fixed or Still broken — your answer keeps the fixes honest.',
              url: '/my-bug-reports',
              category: 'bug_reports:fix_feedback',
              kind: 'work_item',
              priority: 'normal',
              targeting: { type: 'user', user_ids: reporterIds },
              metadata: { source: 'bug_fix_feedback', cluster_id: clusterId },
              created_by: user!.id
            })
            .select('id')
            .single();
          if (notifError) throw notifError;
          if (notification?.id) {
            await admin.from('user_notifications').insert(
              reporterIds.map((uid) => ({ notification_id: notification.id, user_id: uid }))
            );
          }
        } catch (e) {
          logger.warn('bug-reports/clusters', 'feedback notification fan-out failed', e);
        }
      }

      return NextResponse.json({
        ok: true,
        sent: data.sent,
        queued_by_cap: data.queued_by_cap
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('bug-reports/clusters', `Feedback action failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Feedback action failed' }, { status: 500 });
  }
}
