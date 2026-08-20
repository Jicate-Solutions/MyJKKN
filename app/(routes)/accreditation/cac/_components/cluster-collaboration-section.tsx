// app/(routes)/accreditation/cac/_components/cluster-collaboration-section.tsx
// ============================================================================
// The collaboration half of the Cluster Academic Council page.
//
// The council could already see itself — its roster, its meetings — and it could
// see each institution's metrics beside each other. What it had never been able
// to see is the thing a cluster body exists for: whether the colleges actually
// work with one another. These four panels answer that from records the platform
// already holds. Nothing new is stored; every figure is derived at read time.
//
// FOUR DECISIONS SHAPE EVERY LINE HERE.
//
//   1. No bare zero, anywhere. The council's second locked decision. A zero on a
//      screen reads as a measured bad result and would libel a college for a gap
//      in the platform. Every empty figure is replaced by the reason it is empty
//      — "nothing recorded yet", "nothing captures this", "outside what you can
//      see" — and those three are not interchangeable.
//
//   2. Hub traffic is never folded into peer collaboration. A college booking
//      the central office is using shared infrastructure; two colleges booking
//      each other is collaboration. A combined headline would be arithmetically
//      true and would describe a cluster that does not exist. The panels report
//      them as separate segments, and the smaller peer figure is the one given
//      the collaboration heading.
//
//   3. Volume alone is never the verdict. One college receives the great
//      majority of all cross-campus teaching in the cluster. Ranked by exchange
//      volume that is the best result on the page; read as staffing it is a
//      dependency on two sibling colleges. The panel states both, because a
//      panel that stated only the first would be the failure mode this section
//      was built to avoid.
//
//   4. No count is written into prose. Every number on screen is derived from
//      the rows that came back. Eleven hardcoded counts had to be stripped out
//      of this module once already when the data moved and the sentences did
//      not.
//
// ON WHAT "EMPTY" MEANS HERE. Every figure comes from `fn_cac_cluster_totals()`,
// which reads the five views as its definer and therefore returns the cluster,
// not the viewer's slice of it. An empty panel now means one thing only: the
// platform holds nothing at that stage. It is no longer capable of meaning "your
// access rules are narrower than the cluster", which is what it could mean until
// 2026-08-01 and which made every absence unreadable — a council member scoped
// to one college was shown 0 cross-campus bookings and 0 shared course titles
// while the cluster held 78 and 1,067. That ambiguity is gone, so the panels
// state absences plainly instead of hedging them.
// ============================================================================

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Share2,
  TrendingDown,
  BookOpen,
  Unplug,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import {
  useCacSolutionFunnel,
  useCacExchangeEdges,
  useCacCurriculumOverlap,
  useCacCurriculumOverlapSummary,
  useCacCollaborationIsolation,
  useCacCollegeSizes,
  summariseFunnel,
  solutionStages,
  finishLines,
  splitExchange,
  concentration,
  sizeStanding,
  perCollegeExchange,
  isolatedInstitutions,
  neverLentToAnyone,
  type CacExchangeEdge,
  type CacFunnelRow,
  type CacCollegeExchangeRow,
} from '@/hooks/accreditation/use-cac-cluster';

// ----------------------------------------------------------------------------
// Small shared pieces.
// ----------------------------------------------------------------------------

/** A figure, or the reason there is no figure. Never a bare 0. */
function Figure({
  value,
  reason,
  suffix,
}: {
  value: number | null | undefined;
  reason: string;
  suffix?: string;
}) {
  if (value === null || value === undefined || value === 0) {
    return <span className="text-sm font-normal text-muted-foreground">{reason}</span>;
  }
  return (
    <span className="text-2xl font-bold">
      {value.toLocaleString()}
      {suffix ? <span className="ml-1 text-sm font-normal">{suffix}</span> : null}
    </span>
  );
}

function PanelShell({
  icon,
  title,
  lead,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function ReadFailed({ what, error }: { what: string; error: unknown }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">{what} could not be read.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Nothing below this line is known either way — this is a fault in the read,
        not a finding about any institution.{' '}
        {String((error as Error)?.message ?? '')}
      </p>
    </div>
  );
}

/** Said once per panel that reads through the viewer's own access rules. */
function ScopeNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] italic text-muted-foreground">{children}</p>;
}

// The name is null only when the view's LEFT JOIN to `institutions` found no
// row. Now that the read is cluster-wide it is never a viewer-scope effect.
const instLabel = (name: string | null, code: string | null) =>
  name ? `${code ? `[${code}] ` : ''}${name}` : 'An institution with no row on record';

// ----------------------------------------------------------------------------
// PANEL 1 — the solution funnel.
//
// The drop-off is the finding, so the stages are laid out in order and the
// falls between them are shown rather than left to be inferred. A department
// count on its own describes an intention; the funnel describes what came of it.
//
// THREE STAGES AND TWO FINISH LINES (Director decisions #2, #3, #13).
//   Started, built and used are counted SEPARATELY rather than read off one
//   status column. Then the run ENDS IN TWO PLACES, not one: 'used by someone'
//   and 'published' sit side by side, same size, same weight, in a fixed order
//   that does not follow their values — and with no arrow between them, because
//   neither leads to the other and neither outranks the other. A publication is
//   recorded because NAAC and NIRF ask for it; it never beats a real user.
//
//   The stage row keeps its arrows. Started → built → used IS a sequence and
//   drawing it as one is honest. The finish-line row must never grow one.
// ----------------------------------------------------------------------------

function SolutionFunnelPanel() {
  const { data, isLoading, error } = useCacSolutionFunnel();
  const rows = useMemo<CacFunnelRow[]>(() => data ?? [], [data]);
  const totals = useMemo(() => summariseFunnel(rows), [rows]);

  // Both derived in the hook, where they can be tested without a database.
  const stages = useMemo(() => solutionStages(totals), [totals]);
  const endings = useMemo(() => finishLines(totals), [totals]);

  // TWO DIFFERENT QUIETS, AND THEY MUST NOT BE RECONCILED (Director decision
  // #11). `silent` counts departments that PRODUCED NOTHING — an outcome, 43 of
  // 44 today. `allDormant` reports that every activated department is currently
  // marked dormant — a status, 44 of 44 today. They are near-identical numbers
  // describing different facts, and averaging or merging them would destroy
  // information the council needs. The copy below names them apart on purpose.
  const silent = totals.departmentsActivated - totals.departmentsProducing;
  const allDormant =
    totals.departmentsActivated > 0 &&
    totals.departmentsDormant === totals.departmentsActivated;

  return (
    <PanelShell
      icon={<TrendingDown className="h-4 w-4 text-amber-600" />}
      title="From a started solution to a real user"
      lead="Each college nominates departments to produce solutions. This follows what happened next — started, built, used — and where the work landed."
    >
      {error ? (
        <ReadFailed what="The solution funnel" error={error} />
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No college has activated a solution department yet, so there is no
          funnel to draw.
        </p>
      ) : (
        <>
          {/* Director decision #11: when every activated department has gone
              quiet, the panel says so in one line before any figure is read.
              A council member should not have to add up a table to learn it. */}
          {allDormant && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">
                Every one of the{' '}
                {totals.departmentsActivated.toLocaleString()} departments the
                colleges activated is marked dormant today. Not one is still
                marked active.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The activations below are real and are still counted — this line
                is about the status those departments hold now, which is a
                separate question from what they produced. Worth asking the
                colleges whether the work stopped or whether the record simply
                stopped being kept.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stages.map((s, idx) => (
              <div key={s.key} className="relative rounded-md border bg-card p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="mt-1">
                  <Figure value={s.value} reason={s.empty} />
                </div>
                {s.derivedFrom ? (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {s.derivedFrom}
                  </p>
                ) : null}
                {idx > 0 && (
                  <ArrowRight className="absolute -left-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground lg:block" />
                )}
              </div>
            ))}
          </div>

          {/* THE TWO FINISH LINES. Same grid cell, same type scale, no arrow
              between them and no order that depends on their values — the run
              ends in two places and neither is the better one. */}
          <div>
            <p className="text-xs font-medium">Where the work landed</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Two ways for the same work to land. Neither is ranked above the
              other, and one does not lead to the other.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {endings.map((f) => (
                <div key={f.key} className="rounded-md border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{f.label}</div>
                  <div className="mt-1">
                    <Figure value={f.value} reason={f.empty} />
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {f.meaning}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {silent > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">
                {silent.toLocaleString()} of the{' '}
                {totals.departmentsActivated.toLocaleString()} activated
                departments have produced nothing.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Activation is a decision; a solution is an outcome. The gap
                between the two is what the council can act on, and it is not
                visible from the department count alone. This counts what was
                PRODUCED, and is a different question from how many departments
                are currently marked dormant — the two figures are close
                together and are not the same measurement.
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs">
                  <th className="px-3 py-2 text-left font-medium">Institution</th>
                  <th className="px-3 py-2 text-right font-medium">Departments</th>
                  <th className="px-3 py-2 text-right font-medium">Producing</th>
                  <th className="px-3 py-2 text-right font-medium">Solutions</th>
                  <th className="px-3 py-2 text-right font-medium">Phases</th>
                  <th className="px-3 py-2 text-right font-medium">Publications</th>
                  <th className="px-3 py-2 text-right font-medium">Currently dormant</th>
                  <th className="px-3 py-2 text-right font-medium">At risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.institution_id ?? r.institution_name ?? 'unknown'} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {instLabel(r.institution_name, r.iqac_code)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {/* An em-dash was adequate while every row in this table
                          had activated something. The view now returns all eight
                          assessed colleges rather than only those with activity,
                          so this branch is reached by real colleges and has to
                          say what it means, like every sibling cell. */}
                      {r.departments_activated > 0 ? (
                        r.departments_activated
                      ) : (
                        <span className="text-xs text-muted-foreground">none activated yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.departments_producing > 0 ? (
                        r.departments_producing
                      ) : (
                        <span className="text-xs text-muted-foreground">none yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.solutions > 0 ? (
                        r.solutions
                      ) : (
                        <span className="text-xs text-muted-foreground">nothing recorded yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.phases > 0 ? (
                        r.phases
                      ) : (
                        <span className="text-xs text-muted-foreground">nothing recorded yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.publications > 0 ? (
                        r.publications
                      ) : (
                        <span className="text-xs text-muted-foreground">nothing recorded yet</span>
                      )}
                    </td>
                    {/* The last two cells report CURRENT STATUS, not a record
                        that was never entered — so their empty branch says
                        "none", not "nothing recorded yet". A bare 0 is still
                        forbidden here: it would read as a measured bad result.
                        `> 0` also absorbs the undefined a pre-2026-09-08 bundle
                        receives, which would otherwise print nothing at all. */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.departments_dormant > 0 ? (
                        r.departments_dormant
                      ) : (
                        <span className="text-xs text-muted-foreground">none dormant</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.departments_at_risk > 0 ? (
                        r.departments_at_risk
                      ) : (
                        <span className="text-xs text-muted-foreground">none at risk</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ScopeNote>
            &quot;Nothing recorded yet&quot; means the platform can hold that stage
            and no row has been entered — not that the work did not happen off the
            platform. The last two columns are different again: they report the
            status a department holds today, which can change without anything
            the college did being undone.
          </ScopeNote>
        </>
      )}
    </PanelShell>
  );
}

// ----------------------------------------------------------------------------
// PANEL 2 — the exchange map.
//
// Two sources, and their giver/receiver columns run OPPOSITE ways: a Senior
// Learner whose home is A working on B's plan means A gives and B receives, while a
// booking of A's room by someone from B also means A gives and B receives. The
// view resolves both into one direction so this component never has to.
//
// Hub and peer are drawn as separate segments. That separation is the whole
// point of the panel: most cross-institution booking traffic is a college using
// the central office, which is shared infrastructure and not two colleges
// choosing to work together.
// ----------------------------------------------------------------------------

function EdgeList({ edges, unitWord }: { edges: CacExchangeEdge[]; unitWord: string }) {
  if (edges.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
    );
  }
  return (
    <ul className="space-y-1.5 text-xs">
      {edges.map((e, i) => (
        <li
          key={`${e.giver_institution_id ?? i}-${e.receiver_institution_id ?? i}`}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="font-medium">{instLabel(e.giver_name, e.giver_iqac_code)}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span>{instLabel(e.receiver_name, e.receiver_iqac_code)}</span>
          <Badge variant="secondary" className="text-[10px]">
            {e.units} {unitWord}
            {e.people > 0 ? ` · ${e.people} ${e.people === 1 ? 'person' : 'people'}` : ''}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * Give and receive per college, with size beside them.
 *
 * The two lists above are pairs; this is the same edges read per college, which
 * is the only way to see what any one college gives and receives overall. Size
 * sits in the same row rather than in a footnote because the two numbers are
 * only interpretable together — 53 assignments received means one thing to a
 * college of 1,200 and another to a college of 240.
 *
 * Ordered by size, largest first, and NOT by exchange volume. Ordering by
 * exchange would publish a league table of collaboration, which this page
 * refuses everywhere else.
 */
function PerCollegeExchangeTable({ rows }: { rows: CacCollegeExchangeRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No college sizes are on record, so give and receive cannot be set beside
        them.
      </p>
    );
  }
  const cell = (n: number) =>
    n > 0 ? (
      <span className="tabular-nums">{n.toLocaleString()}</span>
    ) : (
      <span className="text-[11px] text-muted-foreground">none</span>
    );

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs">
            <th className="px-3 py-2 text-left font-medium">College</th>
            <th className="px-3 py-2 text-right font-medium">Active learners</th>
            <th className="px-3 py-2 text-right font-medium">Teaching given</th>
            <th className="px-3 py-2 text-right font-medium">Teaching received</th>
            <th className="px-3 py-2 text-right font-medium">Bookings made</th>
            <th className="px-3 py-2 text-right font-medium">Bookings hosted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.institution_id} className="border-b last:border-0">
              <td className="px-3 py-2">{instLabel(r.institution_name, r.iqac_code)}</td>
              <td className="px-3 py-2 text-right">
                {/* A college can genuinely have no active cohort — Education is
                    one today — and a bare 0 in a size column would read as a
                    measured failing rather than as a college between intakes. */}
                {r.active_learners > 0 ? (
                  <span className="tabular-nums">
                    {r.active_learners.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    no active cohort
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right">{cell(r.teaching_given)}</td>
              <td className="px-3 py-2 text-right">{cell(r.teaching_received)}</td>
              <td className="px-3 py-2 text-right">{cell(r.bookings_given)}</td>
              <td className="px-3 py-2 text-right">{cell(r.bookings_received)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExchangeMapPanel() {
  const { data, isLoading, error } = useCacExchangeEdges();
  const { data: sizeData } = useCacCollegeSizes();
  const edges = useMemo<CacExchangeEdge[]>(() => data ?? [], [data]);

  const teaching = useMemo(() => splitExchange(edges, 'teaching'), [edges]);
  const bookings = useMemo(() => splitExchange(edges, 'booking'), [edges]);
  const perCollege = useMemo(
    () => perCollegeExchange(edges, sizeData ?? []),
    [edges, sizeData],
  );

  return (
    <PanelShell
      icon={<Share2 className="h-4 w-4 text-amber-600" />}
      title="What the colleges give each other"
      lead="Two records already carry cross-campus exchange: Senior Learners scheduled onto another college's plan, and resources booked across an institution boundary."
    >
      {error ? (
        <ReadFailed what="The exchange map" error={error} />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Teaching across campuses</div>
              <Badge variant="outline" className="text-[10px]">
                {teaching.totalUnits > 0
                  ? `${teaching.totalUnits} assignments`
                  : 'nothing recorded yet'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              A Senior Learner whose home college is on the left is scheduled to
              teach on the plan of the college on the right.
            </p>
            <EdgeList
              edges={[...teaching.peer, ...teaching.hub].sort((a, b) => b.units - a.units)}
              unitWord="assignments"
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Resources booked across campuses</div>
              <Badge variant="outline" className="text-[10px]">
                {bookings.totalUnits > 0
                  ? `${bookings.totalUnits} bookings`
                  : 'nothing recorded yet'}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-[11px] text-muted-foreground">
                  College to college
                </div>
                <div className="mt-0.5">
                  <Figure value={bookings.peerUnits} reason="nothing recorded yet" />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {bookings.peerPairs > 0
                    ? `across ${bookings.peerPairs} ${bookings.peerPairs === 1 ? 'pair' : 'pairs'} of colleges`
                    : 'no pair of colleges has booked from the other'}
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-[11px] text-muted-foreground">
                  With the central office
                </div>
                <div className="mt-0.5">
                  <Figure value={bookings.hubUnits} reason="nothing recorded yet" />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  shared central infrastructure, not collaboration between
                  colleges
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-xs font-medium">College to college</div>
              <EdgeList edges={bookings.peer} unitWord="bookings" />
              <div className="pt-1 text-xs font-medium">With the central office</div>
              <EdgeList edges={bookings.hub} unitWord="bookings" />
            </div>
          </div>
        </div>
      )}

      {!error && !isLoading && (
        <div className="space-y-2 pt-2">
          <div className="text-sm font-medium">
            What each college gives and receives
          </div>
          <p className="text-xs text-muted-foreground">
            College-to-college only; traffic with the central office is counted
            in its own segment above. Every assessed college is listed, including
            those that have exchanged nothing — a college missing from this table
            would read as one outside the cluster rather than one that has not
            started.
          </p>
          <PerCollegeExchangeTable rows={perCollege} />
        </div>
      )}

      <ScopeNote>
        The two figures are kept apart on purpose. Counting them together would
        produce a headline that is arithmetically correct and describes a cluster
        that does not exist — the central-office traffic is shared infrastructure,
        and only the college-to-college figure is two colleges choosing to work
        together.
      </ScopeNote>
    </PanelShell>
  );
}

// ----------------------------------------------------------------------------
// PANEL 3 — curriculum overlap.
//
// The number is a FLOOR and the panel has to say so in the same breath it prints
// it. Titles are matched exactly after lowercasing and trimming, so any college
// that spells a shared course even slightly differently does not match and is
// missing from the count. The evidence for that is in the data itself: some of
// the titles that DO match across three colleges match because the same typing
// mistake was made in all three.
// ----------------------------------------------------------------------------

function CurriculumOverlapPanel() {
  const { data: top, isLoading: topLoading, error: topError } = useCacCurriculumOverlap();
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useCacCurriculumOverlapSummary();

  const isLoading = topLoading || summaryLoading;
  const error = topError ?? summaryError;

  const sharePct =
    summary && summary.distinct_titles > 0
      ? Math.round((100 * summary.shared_titles) / summary.distinct_titles)
      : null;

  return (
    <PanelShell
      icon={<BookOpen className="h-4 w-4 text-amber-600" />}
      title="Courses taught in more than one college"
      lead="Where the same subject is already being taught in several places, the council has something to standardise, share or teach jointly."
    >
      {error ? (
        <ReadFailed what="The learning-framework overlap" error={error} />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border bg-card p-3">
              <div className="text-xs text-muted-foreground">Distinct course titles</div>
              <div className="mt-1">
                <Figure
                  value={summary?.distinct_titles}
                  reason="no course is recorded yet"
                />
              </div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-xs text-muted-foreground">
                Taught in more than one college
              </div>
              <div className="mt-1">
                <Figure value={summary?.shared_titles} reason="none found" />
              </div>
              {sharePct !== null && sharePct > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {sharePct}% of the titles above — and this is a floor
                </p>
              )}
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-xs text-muted-foreground">Widest span</div>
              <div className="mt-1">
                <Figure
                  value={summary?.widest_span}
                  reason="none found"
                  suffix="colleges share one title"
                />
              </div>
            </div>
          </div>

          {(top ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs">
                    <th className="px-3 py-2 text-left font-medium">Course title</th>
                    <th className="px-3 py-2 text-right font-medium">Colleges</th>
                    <th className="px-3 py-2 text-left font-medium">Where</th>
                  </tr>
                </thead>
                <tbody>
                  {(top ?? []).map((row) => (
                    <tr key={row.course_title} className="border-b last:border-0">
                      <td className="px-3 py-2 capitalize">{row.course_title}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.institution_count}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {(row.institution_names ?? []).join(' · ') ||
                          'no institution name on record'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Read this as a floor.</p>
            <p className="mt-1">
              Titles are matched exactly, after lowercasing and trimming spaces.
              Any college that writes a shared course even slightly differently
              does not match and is missing from the count above. The data proves
              the point against itself: some titles that span three colleges match
              only because the identical spelling mistake was typed in all three.
              Wherever data entry varied, real sharing is invisible here — so the
              true overlap is higher than this, never lower.
            </p>
          </div>
        </>
      )}
    </PanelShell>
  );
}

// ----------------------------------------------------------------------------
// PANEL 4 — isolation, and the dependency hiding inside the same edges.
//
// Two readings of one dataset, deliberately side by side. On the left, colleges
// that have never exchanged anything with a sibling. On the right, the college
// receiving the largest share of the cluster's cross-campus teaching — which is
// simultaneously the best collaboration figure on this page and a staffing
// concentration. A panel that ranked institutions by exchange volume would
// publish the first reading of that number and bury the second.
// ----------------------------------------------------------------------------

function IsolationPanel() {
  const { data, isLoading, error } = useCacCollaborationIsolation();
  const { data: edgeData } = useCacExchangeEdges();
  const { data: sizeData } = useCacCollegeSizes();

  const rows = useMemo(() => data ?? [], [data]);
  const isolated = useMemo(() => isolatedInstitutions(rows), [rows]);
  const neverLent = useMemo(() => neverLentToAnyone(rows), [rows]);
  const teachingTop = useMemo(
    () => concentration(edgeData ?? [], 'teaching'),
    [edgeData],
  );
  // The size of the college on the receiving end. Null while sizes are still
  // loading, and null if it cannot be matched — in both cases the panel simply
  // omits the sentence rather than guessing at a proportion.
  const topStanding = useMemo(
    () =>
      teachingTop
        ? sizeStanding(sizeData ?? [], teachingTop.institutionId, teachingTop.name)
        : null,
    [sizeData, teachingTop],
  );

  return (
    <PanelShell
      icon={<Unplug className="h-4 w-4 text-amber-600" />}
      title="Who is not connected, and who is leaned on"
      lead="The same edges read twice — once for the colleges that appear on none of them, once for the college that appears on most of them."
    >
      {error ? (
        <ReadFailed what="The isolation reading" error={error} />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No teaching institution is on record, so neither reading can be drawn.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium">
              No exchange with any sibling college
            </div>
            <p className="text-xs text-muted-foreground">
              Counted across {rows.length} teaching{' '}
              {rows.length === 1 ? 'institution' : 'institutions'}. Bookings with
              the central office do not count here — that is shared
              infrastructure, not a link between two colleges.
            </p>
            {isolated.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Every teaching institution has at least one link to a sibling.
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {isolated.map((r) => (
                  <li key={r.institution_id} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {instLabel(r.institution_name, r.iqac_code)}
                  </li>
                ))}
              </ul>
            )}

            {neverLent.length > 0 && (
              // A SEPARATE reading, not a subset of the list above. An
              // institution can have booked a sibling's room — so it is not
              // isolated — and still have lent nothing of its own. Writing this
              // as "of these" would have been a false sentence about a real
              // institution.
              <p className="pt-1 text-[11px] text-muted-foreground">
                Read the other way round:{' '}
                {neverLent
                  .map((r) => r.institution_name ?? 'an institution with no row on record')
                  .join(', ')}{' '}
                {neverLent.length === 1 ? 'has' : 'have'} had nothing of theirs
                booked by anyone at all, the central office included. Whatever
                they own has never been taken up — which is a different gap from
                never having asked.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Where cross-campus teaching lands
            </div>
            {!teachingTop ? (
              <p className="text-xs text-muted-foreground">
                No cross-campus teaching is recorded yet, so there is nothing to
                concentrate.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-semibold">{teachingTop.name}</span>{' '}
                  receives {teachingTop.units.toLocaleString()} of the{' '}
                  {teachingTop.total.toLocaleString()} cross-campus teaching
                  assignments in the cluster —{' '}
                  <span className="font-semibold">{teachingTop.sharePct}%</span>,
                  from {teachingTop.sources}{' '}
                  {teachingTop.sources === 1 ? 'college' : 'colleges'}.
                </p>
                {topStanding && (
                  // Size belongs in the same breath as the share. Without it the
                  // sentence above reads as a college that cannot staff itself;
                  // with it, the same figures describe a small college being
                  // covered by larger siblings, which is the behaviour a cluster
                  // exists to produce. Stated as a share of cluster learners
                  // rather than as a rank — a rank would have to call this the
                  // smallest college, and that is not true while another college
                  // has no active cohort at all.
                  <p className="text-sm">
                    It holds{' '}
                    <span className="font-semibold">
                      {topStanding.activeLearners.toLocaleString()}
                    </span>{' '}
                    of the cluster&apos;s{' '}
                    {topStanding.clusterLearners.toLocaleString()} active
                    learners — {topStanding.sharePct}% of the learners, receiving{' '}
                    {teachingTop.sharePct}% of the teaching.
                  </p>
                )}
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">
                      As collaboration,
                    </span>{' '}
                    this is the strongest working relationship in the cluster and
                    the one the council would point at as proof the model works.
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-foreground">
                      As staffing,
                    </span>{' '}
                    it is a dependency: that teaching is being supplied by other
                    colleges, and it stops if either of them needs its own people
                    back. Both readings are true of the same number, and the
                    council needs the second one before it decides anything about
                    the first.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
}

// ----------------------------------------------------------------------------
// The section.
// ----------------------------------------------------------------------------

export function ClusterCollaborationSection() {
  return (
    <Card className="border-2 border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Share2 className="h-5 w-5 text-amber-600" />
          What the cluster does together
        </CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Four readings drawn from records the platform already holds. Nothing
          here is entered by anyone and nothing is stored — each figure is worked
          out at the moment the page loads, so it cannot go stale against the data
          it describes. As everywhere on this page there is no score, no total and
          no ordering of the colleges against one another.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <SolutionFunnelPanel />
        <ExchangeMapPanel />
        <CurriculumOverlapPanel />
        <IsolationPanel />

        <p className="text-[11px] italic text-muted-foreground">
          Every panel here is the whole cluster, the same for everyone on the
          council, whichever college you belong to. A small number means the
          colleges are quiet — it can no longer mean you are seeing part of the
          picture.
        </p>
      </CardContent>
    </Card>
  );
}
