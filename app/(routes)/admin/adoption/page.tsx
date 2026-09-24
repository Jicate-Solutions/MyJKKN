// ============================================================================
// FEATURE ADOPTION (Super-Admin)
// ============================================================================
// Created: 2026-09-16
//
// MyJKKN ships features. Until now it had no idea whether anyone used them.
// This page is the measuring end of the adoption loop: every labelled feature,
// the share of its intended people who did its core action THIS WEEK, and the
// three actions that follow from a low share — ask the non-users why, propose
// simplify/retrain/retire, and record the Director's decision.
//
// Three numbers at the top, and they are deliberately three:
//   labelled — how many features have been labelled at all. The gap between
//              this and what actually shipped is the honest measure of how
//              much of the platform is unmeasured.
//   measured — how many of those have intended people to measure. A feature
//              nobody is assigned to scores 0% for a reason that is not
//              "unused", and lumping the two together would hide it.
//   dead     — old enough to judge, and under the bar for every intended role.
//
// Read-only until a button is pressed, and gated server-side on
// profiles.is_super_admin BEFORE any read. The refusal is an explicit panel,
// never a redirect (CLAUDE.md #27): a silent bounce is the one failure a
// person cannot diagnose.
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Feature adoption', icon: 'TrendingUp' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { createServerSupabaseClient, getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DEAD_AFTER_DAYS,
  DEAD_WEEKLY_PCT,
  canAskWhy,
  daysSinceShipped,
  isDeadFeature,
  isSkipped,
  isStale,
  isOldEnoughToJudge,
  isTermFeature,
  shippedAgo,
  skippedGroups,
  summariseAdoption,
  toNumber,
  type AdoptionMetricRow,
  type Numeric,
  rollingWeekStart,
  isEventFeature,
  countsWhat,
  COUNTS_WHAT_LABEL,
} from '@/lib/adoption/summarise';
import {
  lastSentLabel,
  reminderTotalsByFeature,
  reminderTotalsFor,
  type ReminderSummaryRow,
} from '@/lib/adoption/reminders';
import { FeatureActions, type PendingProposal } from './_components/feature-actions';
import { RegisterFeatureForm } from './_components/register-feature-form';
import { SyncUsageButton } from './_components/sync-usage-button';

interface LoginDay {
  day: string;
  logins: number | string | null;
}

/** A status a decision has written onto a feature. Live is the normal state;
 *  the other three are the outcome of a card the Director tapped. */
const STATUS_TONE: Record<string, string> = {
  live: 'text-green-700 dark:text-emerald-400',
  simplify: 'text-amber-700 dark:text-amber-400',
  retrain: 'text-amber-700 dark:text-amber-400',
  retired: 'text-red-600 dark:text-red-400',
};

/** 30 days of sign-ins as one line. No chart library: it is a single series
 *  with no axis worth drawing, and the shape is the whole message. */
function SignInLine({ days }: { days: LoginDay[] }) {
  if (days.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough days recorded yet to draw a line. Sign-ins start counting from the day
        the adoption loop was switched on.
      </p>
    );
  }

  const width = 600;
  const height = 48;
  const counts = days.map((day) => toNumber(day.logins));
  const peak = Math.max(...counts, 1);
  const step = width / (days.length - 1);
  const path = counts
    .map((count, index) => {
      const x = index * step;
      const y = height - 2 - (count / peak) * (height - 4);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const latest = counts[counts.length - 1];

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        role="img"
        aria-label={`Daily sign-ins over the last ${days.length} days. Highest ${peak}, latest ${latest}.`}
      >
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{days[0].day}</span>
        <span>
          peak {peak} · latest {latest}
        </span>
        <span>{days[days.length - 1].day}</span>
      </div>
    </div>
  );
}

function Headline({
  value,
  label,
  hint,
}: {
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function pct(value: Numeric): string {
  return `${toNumber(value).toFixed(1)}%`;
}

export default async function FeatureAdoptionPage() {
  const { profile } = await getEnhancedUserProfile();

  // Canonical super-admin definition (matches hooks/use-permissions.ts and the
  // SuperAdminOnly guard): the boolean flag OR the role. Gating on the flag
  // alone would show a role-based super admin the link and then deny the page.
  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Feature adoption">
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          You don&rsquo;t have access to this page — it is for super administrators. Contact
          the MyJKKN admin team.
        </div>
      </ContentLayout>
    );
  }

  const supabase = await createServerSupabaseClient();

  // Off by default: nothing is recorded or asked until this policy is true.
  const { data: loopEnabledData } = await supabase.rpc('fn_get_policy_bool', {
    p_key: 'adoption.loop.enabled',
    p_default: false,
  });
  const loopEnabled = loopEnabledData === true;

  const now = new Date();
  const [metricsResult, loginsResult, proposalsResult, remindersResult] = await Promise.all([
    // One clock for the whole render: the rolling window and the dead rule must agree.
    supabase.rpc('fn_adoption_metrics', {
      // A ROLLING seven days, not the calendar week: on a Monday or Tuesday a
      // calendar week is barely begun and every share reads as a collapse.
      p_week_start: rollingWeekStart(now),
      p_institution_id: null,
    }),
    supabase.rpc('fn_adoption_logins_daily', { p_days: 30, p_institution_id: null }),
    supabase
      .from('adoption_proposals')
      .select('id, feature_key, proposed_option, recommendation, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    // Ruling 10: reminders sent per feature. Totals only; RLS on
    // adoption_reminders keeps even these to super admins.
    supabase.rpc('fn_adoption_reminder_summary'),
  ]);

  const metricsError = metricsResult.error;
  const rows = (metricsResult.data ?? []) as AdoptionMetricRow[];
  const loginDays = (loginsResult.data ?? []) as LoginDay[];
  // A missing function (migration not applied yet) reads as "none yet" for
  // every feature rather than breaking the page.
  const reminderTotals = reminderTotalsByFeature(
    (remindersResult.data ?? []) as ReminderSummaryRow[]
  );

  const pendingByFeature = new Map<string, PendingProposal>();
  for (const proposal of (proposalsResult.data ?? []) as Array<{
    id: string;
    feature_key: string;
    proposed_option: string;
    recommendation: string | null;
  }>) {
    if (!pendingByFeature.has(proposal.feature_key)) {
      pendingByFeature.set(proposal.feature_key, {
        id: proposal.id,
        proposed_option: proposal.proposed_option,
        recommendation: proposal.recommendation,
      });
    }
  }

  const { labelled, measured, dead, groups } = summariseAdoption(rows, now);
  const weekStart = rows[0]?.week_start ?? null;
  // Skipped features are labelled but deliberately not measured. They are out
  // of the three numbers and out of the table; they get a plain list at the
  // bottom instead, so the decision stays visible and reversible.
  const tracked = groups.filter((group) => !isSkipped(group));
  const skipped = skippedGroups(groups);

  return (
    <ContentLayout title="Feature adoption" fullWidth>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Feature adoption
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What share of the people a feature was built for actually used it in the last
            seven days{weekStart ? ` (since ${weekStart})` : ''}. A feature is called dead
            when it is at least {DEAD_AFTER_DAYS} days old and under {DEAD_WEEKLY_PCT}% for
            every role it was meant for. A seasonal feature — marked{' '}
            <span className="font-medium text-foreground">term</span> — is judged on the LAST
            COMPLETED term, never the one running, and only if it shipped before that term
            began.
          </p>
        </div>

        {!loopEnabled ? (
          <div className="rounded-xl border border-amber-400/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="font-medium">Recording is switched off.</span> Nothing is being
            recorded, pulled from the usage log, or asked until the platform policy
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">adoption.loop.enabled</code>
            is turned on. The numbers below are whatever was recorded before.
          </div>
        ) : null}

        {loopEnabled ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Asking and reminding now run on their own, every morning at 10:33.
            </span>{' '}
            When a feature is under {DEAD_WEEKLY_PCT}% for everyone it was built for, the people
            who have not used it get the one-tap &ldquo;why not?&rdquo; question — once per
            feature, never more than once a week. People who have never used a feature get one
            plain reminder, at most once a month. Nobody gets more than one of these a day, and
            each run stops at the limit set in the platform policy
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              adoption.tick.max_notifications
            </code>
            . The Ask why button below still works for sending a question straight away.
          </div>
        ) : null}

        {metricsError ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            The numbers could not be read: {metricsError.message}. Nothing below is
            trustworthy until that is fixed.
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Headline
            value={labelled}
            label="Features labelled"
            hint="Anything not labelled is not measured at all."
          />
          <Headline
            value={measured}
            label="Measured"
            hint="Labelled features that something records and that have intended people."
          />
          <Headline
            value={dead}
            label="Dead"
            hint={`At least ${DEAD_AFTER_DAYS} days old and under ${DEAD_WEEKLY_PCT}% everywhere.`}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sign-ins, last 30 days
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            The one app-wide line. Everything else on this page is per feature.
          </p>
          <SignInLine days={loginDays} />
        </div>

        <RegisterFeatureForm />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Measure from the usage log</p>
            <p className="text-xs text-muted-foreground">
              Features labelled with a usage-log event are measured from what the platform already
              records (last 30 days), no new code needed. Safe to press again.
            </p>
          </div>
          <SyncUsageButton disabled={!loopEnabled} />
        </div>

        {tracked.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Nothing is being measured yet. Label a feature above and it will appear here
            from the next use onward.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm dark:shadow-none">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>For whom</TableHead>
                  <TableHead>Core action</TableHead>
                  <TableHead>Shipped</TableHead>
                  {/* One table, two cadences: the column header stays neutral and
                      each cell says which share it is showing. */}
                  <TableHead className="text-right">Active</TableHead>
                  {/* Only a term feature has a last term, and for it this is the
                      column that decides. Weekly features leave it blank. */}
                  <TableHead className="text-right">Last term</TableHead>
                  <TableHead className="text-right">Ever</TableHead>
                  <TableHead className="text-right">Asked</TableHead>
                  <TableHead className="text-right">Reminded</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracked.map((group) => {
                  const span = group.rows.length;
                  const daysOld = daysSinceShipped(group.shipped_at, now);
                  const featureIsDead = isDeadFeature(group, now);
                  const answers = Object.entries(group.answers);
                  const pending = pendingByFeature.get(group.feature_key) ?? null;
                  const seasonal = isTermFeature(group);

                  return group.rows.map((row, index) => (
                    <TableRow key={`${group.feature_key}-${row.role ?? index}`}>
                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top">
                          <div className="font-medium text-foreground">{group.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {group.feature_key}
                          </div>
                          {seasonal ? (
                            <div className="text-xs text-muted-foreground">
                              <div>judged by last term</div>
                              {group.prev_term_start && group.prev_term_end ? (
                                <div>
                                  last term {group.prev_term_start} → {group.prev_term_end}
                                </div>
                              ) : (
                                <div>no completed term yet</div>
                              )}
                              {group.term_start && group.term_end ? (
                                <div>
                                  current term {group.term_start} → {group.term_end}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {group.module ? (
                            <div className="text-xs text-muted-foreground">
                              {group.module}
                            </div>
                          ) : null}
                          {group.source_pr ? (
                            <div className="text-xs text-muted-foreground/70">
                              PR {group.source_pr}
                            </div>
                          ) : null}
                        </TableCell>
                      ) : null}

                      <TableCell className="align-top text-sm">
                        {row.role === 'all' ? 'Everyone signed in' : (row.role ?? '—')}
                        <div className="text-xs text-muted-foreground">
                          {toNumber(row.intended_count)} intended
                        </div>
                      </TableCell>

                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top text-sm">
                          {group.core_action}
                        </TableCell>
                      ) : null}

                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top text-sm">
                          {group.shipped_at.slice(0, 10)}
                          <div className="text-xs text-muted-foreground">
                            {shippedAgo(group.shipped_at, now)}
                          </div>
                          {!isOldEnoughToJudge(group, now) ? (
                            <div className="text-xs text-muted-foreground/70">
                              too new to judge
                            </div>
                          ) : null}
                        </TableCell>
                      ) : null}

                      {/* The RUNNING share. For a seasonal feature this is the
                          term in progress: shown, never judged, because the
                          season it belongs to may not have come round yet. */}
                      <TableCell className="align-top text-right text-sm tabular-nums">
                        <span
                          className={
                            !seasonal &&
                            toNumber(row.pct_weekly) < DEAD_WEEKLY_PCT &&
                            featureIsDead
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : 'text-foreground'
                          }
                        >
                          {pct(seasonal ? row.pct_term : row.pct_weekly)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {toNumber(seasonal ? row.term_active : row.weekly_active)} of{' '}
                          {toNumber(row.intended_count)} {seasonal ? 'this term' : 'in 7 days'}
                        </div>
                      </TableCell>

                      {/* The LAST COMPLETED term — the number a term feature is
                          actually judged on. */}
                      <TableCell className="align-top text-right text-sm tabular-nums">
                        {seasonal ? (
                          <>
                            <span
                              className={
                                toNumber(row.pct_prev_term) < DEAD_WEEKLY_PCT && featureIsDead
                                  ? 'font-semibold text-red-600 dark:text-red-400'
                                  : 'text-foreground'
                              }
                            >
                              {pct(row.pct_prev_term)}
                            </span>
                            <div className="text-xs text-muted-foreground">
                              {toNumber(row.prev_term_active)} of{' '}
                              {toNumber(row.intended_count)} last term
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-right text-sm tabular-nums text-muted-foreground">
                        {pct(row.pct_ever)}
                      </TableCell>

                      {index === 0 ? (
                        <TableCell
                          rowSpan={span}
                          className="align-top text-right text-sm tabular-nums"
                        >
                          {group.asked_count}
                        </TableCell>
                      ) : null}

                      {index === 0 ? (
                        <TableCell
                          rowSpan={span}
                          className="align-top text-right text-sm tabular-nums"
                        >
                          {reminderTotalsFor(reminderTotals, group.feature_key).sent}
                          <div className="text-xs text-muted-foreground">
                            {lastSentLabel(reminderTotalsFor(reminderTotals, group.feature_key))}
                          </div>
                        </TableCell>
                      ) : null}

                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top">
                          {answers.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {answers.map(([option, count]) => (
                                <span
                                  key={option}
                                  className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                                >
                                  {option}: {count}
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      ) : null}

                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge
                              variant="outline"
                              className={STATUS_TONE[group.status] ?? 'text-foreground'}
                            >
                              {group.status}
                            </Badge>
                            <Badge variant="outline" className="text-muted-foreground">
                              {isEventFeature(group) ? 'when needed' : seasonal ? 'term' : 'weekly'}
                            </Badge>
                            {countsWhat(group) ? (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                                title={COUNTS_WHAT_LABEL[countsWhat(group)!].hint}
                              >
                                {COUNTS_WHAT_LABEL[countsWhat(group)!].label}
                              </Badge>
                            ) : null}
                          </div>
                          {featureIsDead ? (
                            <div className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                              dead
                            </div>
                          ) : null}
                          {!group.usage_wired ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              not measured — nothing records this key yet
                            </div>
                          ) : null}
                          {isStale(group, now) ? (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                              stale — last pulled from the usage log{' '}
                              {group.usage_synced_at ? `${daysSinceShipped(group.usage_synced_at, now)} days ago` : 'never'}
                            </div>
                          ) : null}
                          {pending ? (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                              card waiting: {pending.proposed_option}
                            </div>
                          ) : null}
                        </TableCell>
                      ) : null}

                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top">
                          <FeatureActions
                            featureKey={group.feature_key}
                            title={group.title}
                            daysOld={daysOld}
                            canAsk={canAskWhy(group, now)}
                            askedCount={group.asked_count}
                            pendingProposal={pending}
                            cadence={group.cadence}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {skipped.length > 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">Skipped on purpose</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Labelled so the list stays complete, then kept out of every number above.
              These are not dead and nobody is asked about them. Clear the skip reason on a
              label to start measuring it again.
            </p>
            <ul className="space-y-1.5">
              {skipped.map((group) => (
                <li key={group.feature_key} className="text-sm">
                  <span className="font-medium text-foreground">{group.title}</span>
                  <span className="text-muted-foreground"> · {group.feature_key}</span>
                  <span className="block text-xs text-muted-foreground">
                    {group.skip_reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ContentLayout>
  );
}
