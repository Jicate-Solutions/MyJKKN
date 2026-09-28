// app/api/cron/grievance-sla-breach-check/route.ts
// ============================================================================
// GRIEVANCE SLA — hourly breach stamp + escalation (HOD -> Principal -> Director)
// ============================================================================
// Until 2026-09-28 this route only stamped sla_breached_at. It told nobody and
// never raised escalation_level: on production 6 of 8 open tickets were past
// their deadline, every one at escalation_level 0 and with no assignee.
//
// ONE RPC. Every rule lives in fn_grievance_escalation_tick, in the database
// (migration 20270420090000_grievance_sla_escalation.sql):
//   * newly overdue tickets are stamped breached (what this route always did);
//   * a ticket overdue at its current level moves up ONE level — HOD, then
//     Principal, then Director — is reassigned, notified and given that
//     level's own deadline; level 3 is the ceiling;
//   * ICC-only, anonymous and about-my-superior complaints never go to a HOD or
//     Principal; nobody gets a complaint they filed; test profiles get nothing;
//   * a level with nobody usable is skipped and the reason recorded; a ticket
//     with nobody at any level is counted as skipped_no_target, never silent;
//   * nothing escalates while grievance.escalation.enabled is off.
// This route adds no rule of its own, so it cannot loosen one.
//
// Scheduled hourly at :23 in vercel.json. ?dry_run=1 returns what the run WOULD
// do and writes nothing.
//
// Auth: CRON_SECRET Bearer header only — Vercel cron sends it (the Bearer-only
// crons in vercel.json, e.g. whatsapp-byow-health, prove it), and a secret in
// a URL ends up in logs. An RPC error, or a run that answered success:false,
// is HTTP 500 so the failure is recorded instead of a healthy-looking 200.
// Updated: 2026-09-28.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

interface EscalationTickResult {
  success?: boolean;
  error?: string;
  dry_run?: boolean;
  enabled?: boolean;
  breached_stamped?: number;
  escalated?: number;
  notified?: number;
  notify_failed?: number;
  skipped_no_target?: number;
  levels_skipped?: number;
  at_ceiling?: number;
  switched_off?: number;
  tickets?: unknown[];
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = ['1', 'true'].includes(request.nextUrl.searchParams.get('dry_run') ?? '');
  const started = Date.now();
  const admin = createServiceRoleClient();

  const { data, error } = await admin.rpc('fn_grievance_escalation_tick', { p_dry_run: dryRun });
  if (error) {
    logger.error('grievance/cron/escalation', 'fn_grievance_escalation_tick failed', error);
    return NextResponse.json(
      { ok: false, error: `escalation rpc failed: ${error.message}`, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const result = (data ?? null) as EscalationTickResult | null;
  if (!result || typeof result !== 'object' || result.success !== true) {
    const message = result?.error ?? 'escalation run returned no result';
    logger.error('grievance/cron/escalation', 'run refused', message);
    return NextResponse.json({ ok: false, error: message, elapsed_ms: Date.now() - started }, { status: 500 });
  }

  // Top-level numbers: the dispatcher's status line reads top-level counters only.
  const counters = {
    breached: Number(result.breached_stamped ?? 0),
    escalated: Number(result.escalated ?? 0),
    notified: Number(result.notified ?? 0),
    notify_failed: Number(result.notify_failed ?? 0),
    skipped_no_target: Number(result.skipped_no_target ?? 0),
    levels_skipped: Number(result.levels_skipped ?? 0),
    at_ceiling: Number(result.at_ceiling ?? 0),
    switched_off: Number(result.switched_off ?? 0),
  };

  const summary =
    `${result.dry_run ? 'DRY RUN — would escalate' : 'escalated'} ${counters.escalated}, ` +
    `marked breached ${counters.breached}, no one to escalate to ${counters.skipped_no_target}, ` +
    `at the top level ${counters.at_ceiling}` +
    (counters.notify_failed > 0 ? `, ${counters.notify_failed} notice(s) FAILED to send` : '') +
    (result.enabled === false ? ' (escalation switched off)' : '');

  // A ticket nobody can take, or a notice that did not send, is something a
  // person must fix — say it loudly.
  if (counters.skipped_no_target > 0 || counters.notify_failed > 0) {
    logger.warn('grievance/cron/escalation', summary, { ...counters, tickets: result.tickets });
  } else {
    logger.info('grievance/cron/escalation', summary, counters);
  }

  return NextResponse.json({
    ok: true,
    summary,
    dry_run: result.dry_run ?? dryRun,
    enabled: result.enabled ?? null,
    ...counters,
    elapsed_ms: Date.now() - started,
    result,
  });
}
