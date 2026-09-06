// =====================================================================
// /api/cron/pde-at-risk-flag — PDE at-risk pipeline
// =====================================================================
// Turns /pde/admin/at-risk from a page that computes risk on load into a
// pipeline that RECORDS it and TELLS someone. Every 6 hours it reads the
// existing `pde_at_risk_learners` view, appends one durable row per flagged
// learner per UTC day to `pde_at_risk_log`, and notifies the staff of the
// affected institution about learners who crossed into at-risk for the FIRST
// time.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel Cron sends
// this automatically) OR `?secret=<value>` for manual/test invocations —
// identical to app/api/cron/pde-quest-risk-tier/route.ts and
// app/api/cron/pde-gaming-defense/route.ts.
//
// Idempotent: dedup is enforced twice — a pre-check in the sweep and the
// UNIQUE index pde_at_risk_log(learner_id, flag_date) in the DB. Re-running
// inside the same UTC day returns flagged: 0, duplicates_skipped: N and sends
// no notification.
//
// Notification cadence: ONLY on newly-flagged learners (no prior log history),
// never on continuing ones. Otherwise the six-hourly cadence would page staff
// about the same learner four times a day indefinitely. The idempotency key
// folds the UTC day + institution, so a second run the same day that finds
// nothing new stays silent.
//
// Partial failure: a per-learner insert error is collected into `errors` and
// the sweep continues — one broken profile must not drop the whole day's
// history. Only a failure to READ the source view/profiles aborts the run.
//
// Schedule: "53 */6 * * *" in vercel.json (every 6h at :53 UTC — off-peak,
// off the :00/:30 herd where 17 other MyJKKN crons already sit).
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { runAtRiskFlagSweep, type NewFlag } from '@/lib/services/pde-at-risk-flag-service';

const JOB_NAME = 'pde-at-risk-flag';

/** Permission that defines "staff who care about at-risk learners". */
const AT_RISK_PERMISSION = 'pde.admin.at_risk.view';

const RISK_LABEL: Record<NewFlag['risk_level'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  struggling: 'Struggling',
};

/**
 * Recipient LOOKUP (not an authorization gate): every active profile in
 * `institutionId` holding a role whose permissions grant AT_RISK_PERMISSION,
 * plus super admins as the always-on fallback so a misconfigured institution
 * never means nobody is told.
 *
 * Roles are read and filtered in JS rather than via a PostgREST JSON filter —
 * the permission keys contain dots, which PostgREST's `->>` path syntax reads
 * as nesting. There are only ~20 active roles, so this is one small read.
 */
async function resolveRecipients(
  supabase: ReturnType<typeof createServiceRoleClient>,
  institutionId: string,
  permittedRoleUserIds: string[],
  superAdminIds: string[],
): Promise<string[]> {
  const recipients = new Set<string>(superAdminIds);

  if (permittedRoleUserIds.length > 0) {
    const { data: scoped } = await supabase
      .from('profiles')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .in('id', permittedRoleUserIds);
    for (const p of (scoped ?? []) as Array<{ id: string }>) recipients.add(p.id);
  }

  return Array.from(recipients);
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const ranAt = new Date().toISOString();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, job: JOB_NAME, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  try {
    const result = await runAtRiskFlagSweep(supabase);

    // ── Notify: newly-flagged learners only, grouped by institution ────────
    let notified = 0;
    const institutionsNotified: string[] = [];

    if (result.newlyAtRisk.length > 0) {
      // Recipient substrate, fetched once for the whole run.
      const { data: roles } = await supabase
        .from('custom_roles')
        .select('id, permissions')
        .eq('is_active', true);

      const permittedRoleIds = ((roles ?? []) as Array<{
        id: string;
        permissions: Record<string, unknown> | null;
      }>)
        .filter((r) => r.permissions?.[AT_RISK_PERMISSION] === true)
        .map((r) => r.id);

      let permittedRoleUserIds: string[] = [];
      if (permittedRoleIds.length > 0) {
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role_id', permittedRoleIds);
        permittedRoleUserIds = Array.from(
          new Set(
            ((userRoles ?? []) as Array<{ user_id: string }>).map((u) => u.user_id).filter(Boolean),
          ),
        );
      }

      // notifications.created_by is NOT NULL — cron alerts use the first
      // super admin (convention shared with copo-attainment / loop-adherence).
      const { data: superAdmins } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_super_admin', true)
        .eq('is_active', true);
      const superAdminIds = ((superAdmins ?? []) as Array<{ id: string }>).map((s) => s.id);
      const createdBy = superAdminIds[0];

      const byInstitution = new Map<string, NewFlag[]>();
      for (const flag of result.newlyAtRisk) {
        const bucket = byInstitution.get(flag.institution_id) ?? [];
        bucket.push(flag);
        byInstitution.set(flag.institution_id, bucket);
      }

      for (const [institutionId, flags] of byInstitution) {
        const recipients = await resolveRecipients(
          supabase,
          institutionId,
          permittedRoleUserIds,
          superAdminIds,
        );
        if (recipients.length === 0) continue;

        const names = flags
          .slice(0, 10)
          .map(
            (f) =>
              `${f.full_name || 'Unnamed learner'} (${RISK_LABEL[f.risk_level]}${
                f.days_inactive !== null ? `, ${f.days_inactive}d inactive` : ''
              })`,
          )
          .join(' · ');

        const outcome = await fanoutNotification(supabase, {
          title: `${flags.length} learner${flags.length === 1 ? '' : 's'} newly flagged as at-risk`,
          body:
            names +
            (flags.length > 10 ? ` · …and ${flags.length - 10} more` : '') +
            ' — open the at-risk list to review.',
          userIds: recipients,
          createdBy,
          priority: 'high',
          category: 'pde',
          url: '/pde/admin/at-risk',
          // Day + institution: a second run the same day that finds nothing
          // new sends nothing; a genuinely new flag tomorrow pages again.
          idempotencyKey: `pde-at-risk:${result.flagDate}:${institutionId}`,
          source: 'pde-at-risk-cron',
          metadata: {
            flag_date: result.flagDate,
            institution_id: institutionId,
            newly_flagged: flags.length,
            learner_ids: flags.map((f) => f.learner_id),
          },
        });

        notified += outcome.notified;
        if (outcome.notified > 0) institutionsNotified.push(institutionId);
      }
    }

    if (result.errors.length > 0) {
      console.warn(`[cron:${JOB_NAME}] ${result.errors.length} per-learner errors`, result.errors);
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      elapsed_ms: Date.now() - started,
      flag_date: result.flagDate,
      evaluated: result.evaluated,
      flagged: result.flagged,
      duplicates_skipped: result.duplicatesSkipped,
      skipped_no_institution: result.skippedNoInstitution,
      newly_at_risk: result.newlyAtRisk.length,
      notified,
      institutions_notified: institutionsNotified,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 },
    );
  }
}
