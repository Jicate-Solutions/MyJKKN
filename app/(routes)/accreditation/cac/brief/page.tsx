// app/(routes)/accreditation/cac/brief/page.tsx
// ============================================================================
// /accreditation/cac/brief — the Council's one-page brief, for printing.
//
// The CAC page is a screen you scroll. This is the same reading on one side of
// A4, for somebody walking into a sitting with a sheet of paper. It adds no
// number of its own: every figure below comes from the SAME hooks the CAC page
// renders, so a second implementation cannot drift away from the first.
//
// It does add one reading the CAC page has never carried — how many
// (college, metric) pairs have somebody's name against them. That is the
// Council's own question, it is the thing a Principal or the CEO can change in
// the next ten minutes, and it is computed by the owner desk's own pure helpers
// (see ./_lib/use-ownership-rollup.ts) rather than by a fresh count.
//
// THREE RULES INHERITED FROM THE CAC PAGE, DELIBERATELY, NOT COPIED BY ACCIDENT:
//   1. No total, no percentage-of-quality, no ordering of colleges against each
//      other. The Council measures; it does not award.
//   2. A metric with no source reads "not captured yet", never 0 — a zero is a
//      measured bad result and would libel a college for a gap in the platform.
//   3. A read that FAILED, or that the viewer is not allowed to make, says so.
//      It never renders as a zero, because a zero is a claim about JKKN and a
//      denied read is a claim about the reader.
//
// Rule 3 is why the ownership block checks a SECOND permission before it counts
// anything. This page opens on accreditation.cac.view; the owner rows are gated
// on accreditation.naac.narrative.view. Somebody holding only the first would
// otherwise be shown a perfectly formatted "nothing is owned" that is really
// "you cannot see who owns things".
//
// Printing reuses the platform guide's mechanism (app/(routes)/guide/page.tsx):
// a visibility-hide-then-reveal block scoped to one id, plus `print:hidden` on
// every piece of chrome. No PDF asset, no server render — the browser's own
// print dialog produces the sheet.
// ============================================================================

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Printer } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useClusterCouncils,
  useAllInstitutions,
} from '@/hooks/accreditation/use-cluster-councils';
import {
  useCacSolutionFunnel,
  useCacExchangeEdges,
  useCacCurriculumOverlapSummary,
  useCacCollaborationIsolation,
  isolatedInstitutions,
  splitExchange,
  summariseFunnel,
} from '@/hooks/accreditation/use-cac-cluster';
import {
  useCacMeasuredMetrics,
  classifyMeasuredRead,
  metricsWithData,
} from '@/hooks/accreditation/use-cac-metrics';
import {
  CAC_CATALOG_VERSION,
  summariseCatalog,
} from '../_lib/cac-metric-catalog';
import { useOwnershipRollup } from './_lib/use-ownership-rollup';

const PRINT_ID = 'cac-brief-print';

// Same shape as the platform guide's PRINT_CSS: hide everything, reveal one
// subtree, keep backgrounds so the figure boxes survive the printer.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #${PRINT_ID}, #${PRINT_ID} * { visibility: visible; }
  #${PRINT_ID} {
    position: absolute; left: 0; top: 0; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @page { size: A4 portrait; margin: 12mm; }
}
`;

/** The owner rows sit behind their own key — see rule 3 in the header. */
const OWNER_READ_KEY = 'accreditation.naac.narrative.view';
const CAC_VIEW_KEY = 'accreditation.cac.view';

function num(n: number): string {
  return n.toLocaleString('en-IN');
}

export default function ClusterCouncilBriefPage() {
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const canView = isSuperAdmin || can(CAC_VIEW_KEY);
  const canReadOwners = isSuperAdmin || can(OWNER_READ_KEY);

  const { data: councils, isLoading: councilsLoading } = useClusterCouncils();
  const { data: institutions, isLoading: institutionsLoading } = useAllInstitutions();
  const { data: funnel, isLoading: funnelLoading } = useCacSolutionFunnel();
  const { data: edges } = useCacExchangeEdges();
  const { data: overlap } = useCacCurriculumOverlapSummary();
  const { data: isolation } = useCacCollaborationIsolation();
  const {
    data: measured,
    isLoading: measuredLoading,
    isError: measuredFailed,
  } = useCacMeasuredMetrics();
  const {
    data: ownership,
    isLoading: ownershipLoading,
    isError: ownershipFailed,
  } = useOwnershipRollup(canView && canReadOwners);

  const catalog = useMemo(() => summariseCatalog(), []);
  const funnelTotals = useMemo(() => summariseFunnel(funnel ?? []), [funnel]);
  const teaching = useMemo(() => splitExchange(edges ?? [], 'teaching'), [edges]);
  const bookings = useMemo(() => splitExchange(edges ?? [], 'booking'), [edges]);
  const alone = useMemo(() => isolatedInstitutions(isolation ?? []), [isolation]);

  const readOutcome = classifyMeasuredRead(measured, measuredFailed);
  const liveMetrics = useMemo(
    () => (measured ? metricsWithData(measured).size : 0),
    [measured],
  );

  const institutionsCovered = useMemo(() => {
    const ids = new Set<string>();
    (councils ?? []).forEach((c) =>
      (c.member_institution_ids ?? []).forEach((id) => id && ids.add(id)),
    );
    return ids.size;
  }, [councils]);

  const totalMembers = (councils ?? []).reduce((sum, c) => sum + c.member_count, 0);
  const loading = councilsLoading || institutionsLoading || funnelLoading || measuredLoading;

  if (permsLoading) {
    return (
      <ContentLayout title="Council brief">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  // Say why, and name the key. Never a silent bounce to a landing page.
  if (!canView) {
    return (
      <ContentLayout title="Council brief">
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p>You do not have permission to view the Cluster Academic Council brief.</p>
            <p className="text-xs">
              Ask your IQAC coordinator for the
              <code className="mx-1">{CAC_VIEW_KEY}</code>
              permission.
            </p>
            <p className="pt-2">
              <Link href="/accreditation" className="underline">
                Back to the accreditation hub
              </Link>
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Cluster Academic Council — one-page brief">
      <style>{PRINT_CSS}</style>

      <PageBreadcrumb
        className="print:hidden"
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'CAC', href: '/accreditation/cac' },
          { label: 'Brief', href: '/accreditation/cac/brief' },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/accreditation/cac">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the council
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print this page
        </Button>
        <span className="text-xs text-muted-foreground">
          Sized for one side of A4. Menus and buttons are left off the paper.
        </span>
      </div>

      <div id={PRINT_ID} className="mt-4 max-w-3xl space-y-3 text-[13px] leading-snug">
        <header className="border-b pb-2">
          <h1 className="text-xl font-bold">Cluster Academic Council — brief</h1>
          <p className="text-muted-foreground">
            JKKN&apos;s own council. Not a regulator, and nothing here is submitted to
            anybody outside. Metric framework {CAC_CATALOG_VERSION}.
          </p>
        </header>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            What the council is for
          </h2>
          <p>
            Every other entry in the accreditation row is an outside authority that
            inspects JKKN and rates it. The council runs the other way round: it is how
            JKKN&apos;s colleges and schools decide something once, so that the decision
            holds everywhere instead of being argued again in each place. The dividing
            line is reach — a number one college can move alone belongs to that
            college&apos;s IQAC; a number that only moves when two or more colleges act
            together is the council&apos;s.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            The cluster, as recorded today
          </h2>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Councils on record" value={num((councils ?? []).length)} />
              <Figure
                label="Institutions covered"
                value={`${num(institutionsCovered)} of ${num((institutions ?? []).length)}`}
              />
              <Figure label="Council members" value={num(totalMembers)} />
              <Figure
                label="Metrics with a number"
                value={
                  readOutcome === 'values'
                    ? `${num(liveMetrics)} of ${num(catalog.metrics)}`
                    : 'could not be read'
                }
              />
            </div>
          )}
          <p className="text-muted-foreground">
            {readOutcome === 'read-failed'
              ? 'The measured read failed, so nothing is known about any metric right now — that is a fault in the reading, not a finding about any college.'
              : readOutcome === 'nothing-returned'
                ? 'The measured read returned no value for any metric of any college. Every wired metric emptying at once is a fault in the feed, not the cluster going quiet.'
                : `The rest read "not captured yet". That means nobody has collected it — it is not a zero, and it is not a comment on how any college performs.`}
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            What passes between the colleges
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure label="Teaching, college to college" value={num(teaching.peerUnits)} />
            <Figure label="Bookings, college to college" value={num(bookings.peerUnits)} />
            <Figure
              label="Course titles taught in more than one college"
              value={overlap ? num(overlap.shared_titles) : '—'}
            />
            <Figure label="Colleges with no link to a sibling" value={num(alone.length)} />
          </div>
          <p className="text-muted-foreground">
            Traffic through JKKN Main Office is counted separately and is not included
            above — shared central provision is worth counting, and it is not colleges
            choosing each other. Departments activated: {num(funnelTotals.departmentsActivated)}.
            Solutions on record: {num(funnelTotals.solutions)}. Published:{' '}
            {num(funnelTotals.publications)}.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Who is accountable
          </h2>
          <OwnershipLine
            canRead={canReadOwners}
            loading={ownershipLoading}
            failed={ownershipFailed}
            rollup={ownership}
          />
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Three things you can do about it
          </h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong>Name one accountable person per body per college.</strong> On the
              owner desk, leaving the metric blank makes that person accountable for that
              body&apos;s whole list in that college — so a single name settles dozens of
              rows at once. They are then asked to confirm, and may decline.
            </li>
            <li>
              <strong>Put one &ldquo;not captured yet&rdquo; metric on the next agenda</strong>{' '}
              and decide which module will hold the record that answers it. Accreditation
              has almost no data entry of its own; a metric becomes answerable when the
              everyday record behind it starts being kept.
            </li>
            <li>
              <strong>Record the sitting.</strong> A council that never meets leaves no
              record of what it decided, and a decision nobody wrote down cannot hold in
              a college that was not in the room.
            </li>
          </ol>
          <div className="flex flex-wrap gap-3 pt-1 text-xs print:hidden">
            <Link href="/accreditation/manage/owners" className="underline">
              Open the owner desk
            </Link>
            <Link href="/accreditation/cac" className="underline">
              Open the council page
            </Link>
            <Link href="/accreditation/naac/committees" className="underline">
              All committees and councils
            </Link>
          </div>
        </section>

        <footer className="border-t pt-2 text-[11px] text-muted-foreground">
          Every figure above is read live when this page is opened, from the same sources
          the council page uses. Some are recomputed by an overnight job, so a figure can
          be up to a day behind the work it describes. Nothing on this sheet is a score,
          a ranking, or a submission.
        </footer>
      </div>
    </ContentLayout>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}

/**
 * The ownership sentence, or the honest reason there isn't one.
 *
 * Four outcomes, kept apart on purpose — three of them are statements about the
 * reader or the read, and only one is a statement about JKKN.
 */
function OwnershipLine({
  canRead,
  loading,
  failed,
  rollup,
}: {
  canRead: boolean;
  loading: boolean;
  failed: boolean;
  rollup: ReturnType<typeof useOwnershipRollup>['data'];
}) {
  if (!canRead) {
    return (
      <p className="text-muted-foreground">
        You can open this brief but not the ownership records, so no count is shown here.
        That is about your access, not about the cluster. The key that opens them is{' '}
        <code>{OWNER_READ_KEY}</code>.
      </p>
    );
  }
  if (loading) return <Skeleton className="h-14 w-full" />;
  if (failed || !rollup) {
    return (
      <p className="text-muted-foreground">
        The ownership records could not be read just now, so no count is shown. This says
        nothing about how many metrics are owned.
      </p>
    );
  }
  if (rollup.total === 0) {
    return (
      <p className="text-muted-foreground">
        No college is readable to you here, so there is nothing to count.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure
          label="Pairs with a name against them"
          value={`${num(rollup.assigned)} of ${num(rollup.total)}`}
        />
        <Figure label="Confirmed by the person named" value={num(rollup.confirmed)} />
        <Figure label="Waiting to be confirmed" value={num(rollup.pending)} />
        <Figure label="Declined, needs somebody else" value={num(rollup.declined)} />
      </div>
      <p className="text-muted-foreground">
        Counted as one pair per college per metric, across the {num(rollup.institutions)}{' '}
        {rollup.institutions === 1 ? 'college' : 'colleges'} you can see and the{' '}
        {num(rollup.metrics)} metrics in the active framework — the same job is a
        different person&apos;s in each college.{' '}
        {rollup.assigned === 0
          ? 'Nobody has been named against anything yet, which is the honest starting position and the cheapest of the three actions below to change.'
          : 'A pair with nobody named is not a failure by anyone; it is work that currently belongs to no one.'}
      </p>
    </>
  );
}
