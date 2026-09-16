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
  isOldEnoughToJudge,
  shippedAgo,
  summariseAdoption,
  toNumber,
  type AdoptionMetricRow,
  type Numeric,
} from '@/lib/adoption/summarise';
import { FeatureActions, type PendingProposal } from './_components/feature-actions';
import { RegisterFeatureForm } from './_components/register-feature-form';

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

  const [metricsResult, loginsResult, proposalsResult] = await Promise.all([
    supabase.rpc('fn_adoption_metrics', { p_week_start: null, p_institution_id: null }),
    supabase.rpc('fn_adoption_logins_daily', { p_days: 30, p_institution_id: null }),
    supabase
      .from('adoption_proposals')
      .select('id, feature_key, proposed_option, recommendation, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ]);

  const metricsError = metricsResult.error;
  const rows = (metricsResult.data ?? []) as AdoptionMetricRow[];
  const loginDays = (loginsResult.data ?? []) as LoginDay[];

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

  const now = new Date();
  const { labelled, measured, dead, groups } = summariseAdoption(rows, now);
  const weekStart = rows[0]?.week_start ?? null;

  return (
    <ContentLayout title="Feature adoption" fullWidth>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Feature adoption
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What share of the people a feature was built for actually used it this week
            {weekStart ? ` (week beginning ${weekStart})` : ''}. A feature is called dead
            when it is at least {DEAD_AFTER_DAYS} days old and under {DEAD_WEEKLY_PCT}% for
            every role it was meant for.
          </p>
        </div>

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
            label="Measured this week"
            hint="Labelled features that have intended people to measure."
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

        {groups.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            No features are labelled yet, so nothing is being measured. Label one above and
            it will appear here from the next use onward.
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
                  <TableHead className="text-right">Weekly</TableHead>
                  <TableHead className="text-right">Ever</TableHead>
                  <TableHead className="text-right">Asked</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const span = group.rows.length;
                  const daysOld = daysSinceShipped(group.shipped_at, now);
                  const featureIsDead = isDeadFeature(group, now);
                  const answers = Object.entries(group.answers);
                  const pending = pendingByFeature.get(group.feature_key) ?? null;

                  return group.rows.map((row, index) => (
                    <TableRow key={`${group.feature_key}-${row.role ?? index}`}>
                      {index === 0 ? (
                        <TableCell rowSpan={span} className="align-top">
                          <div className="font-medium text-foreground">{group.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {group.feature_key}
                          </div>
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

                      <TableCell className="align-top text-right text-sm tabular-nums">
                        <span
                          className={
                            toNumber(row.pct_weekly) < DEAD_WEEKLY_PCT && featureIsDead
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : 'text-foreground'
                          }
                        >
                          {pct(row.pct_weekly)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {toNumber(row.weekly_active)} of {toNumber(row.intended_count)}
                        </div>
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
                          <Badge
                            variant="outline"
                            className={STATUS_TONE[group.status] ?? 'text-foreground'}
                          >
                            {group.status}
                          </Badge>
                          {featureIsDead ? (
                            <div className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                              dead
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
      </div>
    </ContentLayout>
  );
}
