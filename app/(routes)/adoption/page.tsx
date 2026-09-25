// ============================================================================
// ADOPTION (Principal)
// ============================================================================
// Created: 2026-09-16
//
// The same loop as /admin/adoption, seen from one college. Totals for every
// labelled feature, and — for the principal of THIS institution only — the
// names behind them, because "38% used it" is not something a principal can
// act on and "these eleven people have not" is.
//
// Names are the database's decision, not this page's. fn_adoption_people
// raises 42501 unless the caller is a super admin or the principal of exactly
// the institution asked for, and this page passes ONLY the signed-in person's
// own institution_id — never an id from the URL, so there is no id to tamper
// with. When the refusal comes back, the section says so in words and keeps
// showing the totals. It never redirects and never renders an empty list that
// looks like "nobody here" (CLAUDE.md #27).
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Adoption', icon: 'TrendingUp' } as const;

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
  activeShareLabel,
  isDeadFeature,
  isSkipped,
  isTermFeature,
  shippedAgo,
  summariseAdoption,
  toNumber,
  type AdoptionMetricRow,
  rollingWeekStart,
  countsWhat,
  COUNTS_WHAT_LABEL,
} from '@/lib/adoption/summarise';

/** Beyond this the list stops being something a person reads and starts being
 *  a download. The page says so rather than silently truncating. */
const PEOPLE_LIMIT = 200;

interface PersonRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  institution_id: string | null;
  ever_used: boolean;
  last_day: string | null;
  total_count: number | string | null;
  asked_at: string | null;
}

/** What came back when we asked for the names of one feature's people. */
type PeopleResult =
  | { kind: 'names'; people: PersonRow[] }
  | { kind: 'totals-only' }
  | { kind: 'error'; message: string };

const STATUS_TONE: Record<string, string> = {
  live: 'text-green-700 dark:text-emerald-400',
  simplify: 'text-amber-700 dark:text-amber-400',
  retrain: 'text-amber-700 dark:text-amber-400',
  retired: 'text-red-600 dark:text-red-400',
};

function Headline({ value, label, hint }: { value: number; label: string; hint: string }) {
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

export default async function AdoptionPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    return (
      <ContentLayout title="Adoption">
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          You don&rsquo;t have access to this page — we could not read your profile. Sign in
          again, and if it keeps happening contact the MyJKKN admin team.
        </div>
      </ContentLayout>
    );
  }

  const institutionId = profile.institution_id ?? null;

  if (!institutionId) {
    return (
      <ContentLayout title="Adoption">
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          You don&rsquo;t have access to this page — it shows one institution&rsquo;s
          adoption, and your profile is not attached to an institution. Contact the MyJKKN
          admin team to have yours set.
        </div>
      </ContentLayout>
    );
  }

  const supabase = await createServerSupabaseClient();

  // One clock for the whole render: the rolling window and the dead rule must agree.
  const now = new Date();
  const { data: metricsData, error: metricsError } = await supabase.rpc('fn_adoption_metrics', {
    // A ROLLING seven days, not the calendar week (see rollingWeekStart).
    p_week_start: rollingWeekStart(now),
    p_institution_id: institutionId,
  });

  if (metricsError) {
    return (
      <ContentLayout title="Adoption">
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          {metricsError.code === '42501'
            ? 'You don’t have access to these numbers. Contact the MyJKKN admin team.'
            : `The numbers could not be read: ${metricsError.message}`}
        </div>
      </ContentLayout>
    );
  }

  const rows = (metricsData ?? []) as AdoptionMetricRow[];
  const { labelled, measured, dead, groups } = summariseAdoption(rows, now);
  const institutionName = profile.institutions?.name ?? null;
  // Features skipped on purpose are out of the three numbers, so they are out
  // of the list too — otherwise the headline would count two and the page
  // would show three. A principal has no decision to make about them.
  const tracked = groups.filter((group) => !isSkipped(group));

  // Names, one read per feature. Scoped to this person's own institution and
  // nothing else: no other id is ever passed, so a principal cannot reach
  // another college's people even by accident.
  const peopleByFeature = new Map<string, PeopleResult>(
    await Promise.all(
      tracked.map(async (group): Promise<[string, PeopleResult]> => {
        const { data, error } = await supabase.rpc('fn_adoption_people', {
          p_feature_key: group.feature_key,
          p_institution_id: institutionId,
        });
        if (error) {
          if (error.code === '42501') return [group.feature_key, { kind: 'totals-only' }];
          return [group.feature_key, { kind: 'error', message: error.message }];
        }
        return [group.feature_key, { kind: 'names', people: (data ?? []) as PersonRow[] }];
      })
    )
  );

  return (
    <ContentLayout title="Adoption" fullWidth>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Adoption</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What share of the people a feature was built for actually used it in the last
            seven days
            {institutionName ? ` at ${institutionName}` : ''}. A feature counts as dead when
            it is at least {DEAD_AFTER_DAYS} days old and under {DEAD_WEEKLY_PCT}% for every
            role it was meant for. A seasonal feature is judged on the last completed term
            instead, never on the one running.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Headline
            value={labelled}
            label="Features labelled"
            hint="Anything not labelled is not measured at all."
          />
          <Headline
            value={measured}
            label="Measured"
            hint="Labelled features with intended people here."
          />
          <Headline
            value={dead}
            label="Dead"
            hint={`At least ${DEAD_AFTER_DAYS} days old and under ${DEAD_WEEKLY_PCT}% everywhere.`}
          />
        </div>

        {tracked.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Nothing is being measured here yet.
          </div>
        ) : null}

        {tracked.map((group) => {
          const result = peopleByFeature.get(group.feature_key);
          const featureIsDead = isDeadFeature(group, now);
          const seasonal = isTermFeature(group);
          const people = result?.kind === 'names' ? result.people : [];
          const shown = people.slice(0, PEOPLE_LIMIT);
          const notUsed = people.filter((person) => !person.ever_used).length;

          return (
            <section
              key={group.feature_key}
              className="rounded-xl border border-border bg-card shadow-sm dark:shadow-none"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{group.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    Used means: {group.core_action}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {group.feature_key} · shipped {group.shipped_at.slice(0, 10)} (
                    {shippedAgo(group.shipped_at, now)})
                  </p>
                  {/* "Last term" means nothing without the dates it covers. */}
                  {seasonal ? (
                    <p className="text-xs text-muted-foreground/70">
                      {group.prev_term_start && group.prev_term_end
                        ? `last term ${group.prev_term_start} → ${group.prev_term_end}`
                        : 'no completed term yet'}
                      {group.term_start && group.term_end
                        ? ` · current term ${group.term_start} → ${group.term_end}`
                        : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {featureIsDead ? (
                    <Badge variant="outline" className="text-red-600 dark:text-red-400">
                      dead
                    </Badge>
                  ) : null}
                  {countsWhat(group) ? (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground"
                      title={COUNTS_WHAT_LABEL[countsWhat(group)!].hint}
                    >
                      {COUNTS_WHAT_LABEL[countsWhat(group)!].label}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="outline"
                    className={STATUS_TONE[group.status] ?? 'text-foreground'}
                  >
                    {group.status}
                  </Badge>
                </div>
              </div>

              <div className="border-b border-border p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>For whom</TableHead>
                      <TableHead className="text-right">Intended</TableHead>
                      {/* A seasonal feature gets two cells: the term running now,
                          and the last completed term — which is the one that
                          decides whether anybody actually uses it. */}
                      <TableHead className="text-right">
                        {seasonal ? activeShareLabel(group) : 'Used in the last 7 days'}
                      </TableHead>
                      <TableHead className="text-right">
                        {seasonal ? 'Last term' : activeShareLabel(group)}
                      </TableHead>
                      <TableHead className="text-right">Ever</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row, index) => (
                      <TableRow key={`${group.feature_key}-${row.role ?? index}`}>
                        <TableCell className="text-sm">
                          {row.role === 'all' ? 'Everyone signed in' : (row.role ?? '—')}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {toNumber(row.intended_count)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {seasonal ? (
                            <>
                              {toNumber(row.pct_term).toFixed(1)}%
                              <div className="text-xs text-muted-foreground">
                                {toNumber(row.term_active)} of {toNumber(row.intended_count)}
                              </div>
                            </>
                          ) : (
                            toNumber(row.weekly_active)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-foreground">
                          {seasonal ? (
                            <>
                              {toNumber(row.pct_prev_term).toFixed(1)}%
                              <div className="text-xs text-muted-foreground">
                                {toNumber(row.prev_term_active)} of{' '}
                                {toNumber(row.intended_count)}
                              </div>
                            </>
                          ) : (
                            `${toNumber(row.pct_weekly).toFixed(1)}%`
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {toNumber(row.pct_ever).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="p-4">
                {result?.kind === 'totals-only' ? (
                  <p className="text-sm text-muted-foreground">
                    Names are shown to the principal of this institution only; you are seeing
                    totals.
                  </p>
                ) : result?.kind === 'error' ? (
                  <p className="text-sm text-muted-foreground">
                    The names could not be read: {result.message}
                  </p>
                ) : people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nobody here is intended to use this feature yet.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {notUsed} of {people.length} have never used it.
                      {people.length > PEOPLE_LIMIT
                        ? ` Showing the first ${PEOPLE_LIMIT}.`
                        : ''}
                    </p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Used it</TableHead>
                            <TableHead>Last day</TableHead>
                            <TableHead className="text-right">Times</TableHead>
                            <TableHead>Asked on</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shown.map((person) => (
                            <TableRow key={person.user_id}>
                              <TableCell className="text-sm">
                                <div className="text-foreground">
                                  {person.full_name ?? 'Unnamed'}
                                </div>
                                {person.email ? (
                                  <div className="text-xs text-muted-foreground">
                                    {person.email}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {person.role ?? '—'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {person.ever_used ? (
                                  <span className="text-green-700 dark:text-emerald-400">
                                    yes
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">no</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {person.last_day ?? '—'}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                {toNumber(person.total_count)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {person.asked_at ? person.asked_at.slice(0, 10) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </ContentLayout>
  );
}
