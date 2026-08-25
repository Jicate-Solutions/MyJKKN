// app/(routes)/accreditation/cac/page.tsx
// ============================================================================
// CAC — Cluster Academic Council.
//
// A peer entry in the accreditation tab row, and the one entry there that is
// NOT an outside regulator. NAAC, NIRF, NBA, QS, DCI, PCI, INC, NCTE, AICTE and
// UGC all judge JKKN and expect a submission. The CAC is JKKN's own council, so
// this page carries no scorecard, no coverage percentage and no export button —
// inventing one would be inventing an authority that does not exist.
//
// It reads from accreditation_committees where committee_type = 'cluster'. No
// new database object is needed: the 'cluster' type and the member_institution_ids
// roster (with its CHECK demanding >= 2 members) are already live in production.
//
// Two things this page deliberately does NOT do:
//   - It does not create councils. Forming one lives on the committees hub
//     (PR #2482), which already owns the create dialog, the roster picker and
//     the >= 2-institution rule. This page routes there.
//   - It does not restate the per-council detail surface (PR #2487). It links.
//
// Vocabulary — "Spans N institutions", "[CODE] Name", and "a filing location,
// not an owner" — is taken verbatim from those two merged surfaces so all three
// read as one body rather than three descriptions of it.
// ============================================================================

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Network,
  Users,
  Building2,
  Calendar,
  ArrowRight,
  Landmark,
  ClipboardList,
  FileText,
  BarChart3,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useClusterCouncils,
  useAllInstitutions,
  useProfileNames,
  type ClusterCouncil,
} from '@/hooks/accreditation/use-cluster-councils';
import { useNAACCommitteeMembers } from '@/hooks/accreditation/use-naac-committees';
import { useCommitteeMeetings } from '@/hooks/accreditation/use-naac-committee-meetings';
import {
  summariseClusterSpan,
  type SpanInstitution,
} from './_lib/cluster-scope';
import { ClusterCollaborationSection } from './_components/cluster-collaboration-section';
import { UgcReadinessSection } from './_components/ugc-readiness-section';

const COMMITTEES_HUB = '/accreditation/naac/committees';

export default function ClusterAcademicCouncilPage() {
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const canView = isSuperAdmin || can('accreditation.cac.view');

  const { data: councils, isLoading: councilsLoading } = useClusterCouncils();
  const { data: institutions, isLoading: institutionsLoading } =
    useAllInstitutions();

  const institutionList = useMemo<SpanInstitution[]>(
    () => institutions ?? [],
    [institutions],
  );

  // Institutions covered by at least one council — the union, so two councils
  // that both include a college do not count it twice.
  const institutionsCovered = useMemo(() => {
    const ids = new Set<string>();
    (councils ?? []).forEach((c) =>
      (c.member_institution_ids ?? []).forEach((id) => id && ids.add(id)),
    );
    return ids.size;
  }, [councils]);

  const totalMembers = (councils ?? []).reduce(
    (sum, c) => sum + c.member_count,
    0,
  );

  const isLoading = councilsLoading || institutionsLoading;

  if (permsLoading) {
    return (
      <ContentLayout title="Cluster Academic Council">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  // Say why, rather than bouncing to a landing page with no explanation.
  if (!canView) {
    return (
      <ContentLayout title="Cluster Academic Council">
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p>You do not have permission to view the Cluster Academic Council.</p>
            <p className="text-xs">
              Ask your IQAC coordinator for the
              <code className="mx-1">accreditation.cac.view</code>
              permission.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Cluster Academic Council (CAC)">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'CAC', href: '/accreditation/cac' },
        ]}
      />

      <div className="space-y-6">
        {/* Header — states the asymmetry before anything else, because every
            neighbouring tab in this row sets the opposite expectation. */}
        <Card className="border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Network className="h-7 w-7 text-amber-600" />
              Cluster Academic Council (CAC)
            </CardTitle>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                This is JKKN&apos;s own council. Every other entry in this row —
                NAAC, NIRF, NBA, QS, DCI, PCI, INC, NCTE, AICTE, UGC — is an
                outside authority that inspects JKKN and awards it a rating. The
                CAC runs the other way round. It is how JKKN&apos;s colleges and
                schools decide things together, so that a decision taken once
                holds everywhere instead of being argued again in each place.
              </p>
              <p>
                So there is no score on this page and nothing here gets submitted
                to anybody outside. What it shows is the council itself: which
                institutions it speaks for, who sits on it, and when it has met.
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Councils on record
                </div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : (councils ?? []).length}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Institutions covered
                </div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : institutionsCovered}
                  {!isLoading && institutionList.length > 0 && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      of {institutionList.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Council members
                </div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : totalMembers}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  Reports to an outside body
                </div>
                <div className="mt-1 text-lg font-semibold">No</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {/* The same reading on one side of A4, for walking into a sitting
                  with a sheet of paper. It adds no number of its own — every
                  figure on it comes from the hooks this page already renders. */}
              <Link href="/accreditation/cac/brief">
                <Button size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  One-page brief
                </Button>
              </Link>
              <Link href={COMMITTEES_HUB}>
                <Button variant="outline" size="sm">
                  <Users className="mr-2 h-4 w-4" />
                  All committees and councils
                </Button>
              </Link>
              <Link href="/accreditation">
                <Button variant="outline" size="sm">
                  <Landmark className="mr-2 h-4 w-4" />
                  Accreditation hub
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Councils, or the honest absence of them */}
        {isLoading ? (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ) : (councils ?? []).length === 0 ? (
          <NoCouncilYet />
        ) : (
          <div className="space-y-4">
            {(councils ?? []).map((council) => (
              <CouncilCard
                key={council.id}
                council={council}
                institutions={institutionList}
              />
            ))}
          </div>
        )}

        {/* The measured section used to sit here. It was added 2026-07-30
            against the CEO's July 2026 framework, and it moved to the IQAC page
            on 2026-08-14 by Director decision.

            A pointer rather than a silent removal, because a reader who knows
            that framework by where it used to be would otherwise find a gap and
            conclude it had been dropped. Nothing was dropped; every metric is
            intact on the page this links to, readable by exactly the same people
            — the same eight roles hold `accreditation.cac.view` and
            `accreditation.metrics.view`. */}
        <MetricsMovedPointer />

        {/* The collaboration section. Added 2026-08-01. The measured section
            above reads each institution on its own and sets them side by side;
            this one reads what passes BETWEEN them, which is the only question
            a cluster body exists to answer and which nothing on this page could
            answer before. Same discipline as its neighbour: real numbers, no
            score, no ranking — and it stores nothing, every figure being derived
            from records other modules already own. */}
        <ClusterCollaborationSection />

        {/* The UGC readiness checklist. Added 2026-08-14. The section above
            reports what the colleges do with one another; this one sets that
            beside what the UGC's cluster guidance describes a cluster as
            having, so the asymmetry between the two is on one screen — JKKN
            does the cluster behaviour and files none of the cluster governance.

            It is NOT a compliance countdown. JKKN is not pursuing formal
            cluster status (Director decision, 2026-08-14); the guidance is read
            here because it describes something worth having, and the section
            says so in its own opening sentence rather than in a footnote.

            Gated separately on accreditation.cac.readiness.view — the reading
            is about what the council has and has not done, which is a narrower
            audience than the council's own roster and meeting record. A reader
            without the key is told the key's name, never bounced. */}
        <UgcReadinessSection />

        {/* Footer — where the row physically lives, which is not the same as
            whose council it is. Both facts matter and neither is obvious. */}
        <Card className="bg-muted/30">
          <CardContent className="space-y-2 pt-6 text-xs text-muted-foreground">
            <p>
              <strong>Where a council is stored.</strong> A cluster council is a
              row in the shared committees table, marked with the type{' '}
              <code>cluster</code>. That table labels every row with one of the
              ten outside bodies, and it has no label for a council JKKN runs for
              itself — so a council created here is filed under NAAC. That is a
              storage detail and nothing more. The council is JKKN&apos;s.
            </p>
            <p>
              <strong>Filing location, not owner.</strong> Each council also
              carries a single institution. Access rules are applied through that
              column, so it cannot be left blank, and it is normally set to JKKN
              Main Office. It records where the row is filed. It never means the
              council belongs to that one institution.
            </p>
            <p>
              The same council appears in two other places, and all three read
              from this one row: the{' '}
              <Link href={COMMITTEES_HUB} className="underline">
                committees hub
              </Link>{' '}
              lists it in its own cluster section, and each council&apos;s own
              page carries its full roster and its meeting record.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

// ----------------------------------------------------------------------------
// Empty state.
//
// This is the state the page ships into: production carries one committee and
// zero cluster councils. So the empty state is the page, and it has to teach
// rather than apologise — what the council is, why the database insists on at
// least two institutions, and the exact three clicks that form one. Forming it
// happens on the committees hub, which already owns that dialog.
// ----------------------------------------------------------------------------

function NoCouncilYet() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-5 w-5 text-amber-600" />
          No cluster council has been formed yet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Nothing is broken here. A cluster council is one standing group drawn
          from several JKKN institutions at once, meeting on a record, with what
          it decides written down. None has been formed, so there is nothing yet
          to show.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 text-sm font-medium">To form one</div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Open{' '}
              <Link href={COMMITTEES_HUB} className="font-medium underline">
                all committees and councils
              </Link>
              .
            </li>
            <li>
              Choose <strong>New committee</strong>, and set the type to{' '}
              <strong>Cluster council (CAC)</strong>.
            </li>
            <li>
              Tick every institution the council speaks for, then save. It will
              appear here, and in its own cluster section on that page.
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            At least two institutions are required. That rule is enforced by the
            database itself, not by the screen, so a council of one cannot be
            saved by any route.
          </p>
        </div>

        <Link href={COMMITTEES_HUB}>
          <Button size="sm">
            Open committees and councils
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// One council. Span first, because span is what makes it a cluster; then the
// people; then the meeting record.
// ----------------------------------------------------------------------------

function CouncilCard({
  council,
  institutions,
}: {
  council: ClusterCouncil;
  institutions: SpanInstitution[];
}) {
  const span = useMemo(
    () => summariseClusterSpan(council.member_institution_ids, institutions),
    [council.member_institution_ids, institutions],
  );

  const filedUnder = institutions.find((i) => i.id === council.institution_id);

  return (
    <Card className="border-2 border-amber-300">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {council.committee_name}
              <Badge variant="outline" className="text-[11px]">
                Cluster council (CAC)
              </Badge>
            </CardTitle>

            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Network className="h-4 w-4 text-amber-600" />
              {span.total > 0
                ? `Spans ${span.total} institution${span.total === 1 ? '' : 's'}`
                : 'Cluster roster not recorded'}
            </div>

            {span.labels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {span.labels.join(' · ')}
              </p>
            )}

            {span.hiddenCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {span.hiddenCount} further institution
                {span.hiddenCount === 1 ? ' is' : 's are'} on this roster but
                outside what you can see, so{' '}
                {span.hiddenCount === 1 ? 'its name is' : 'their names are'} not
                listed here.
              </p>
            )}

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Filed under {filedUnder?.name ?? 'an institution row'} — a filing
                location, not an owner. The council belongs to every institution
                it spans.
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-4">
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Formed {council.formed_at}
              </div>
              <div>Term end {council.term_end ?? '—'}</div>
            </div>
            <Link href={`${COMMITTEES_HUB}/${council.id}`}>
              <Button size="sm" variant="outline">
                Manage
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 md:grid-cols-2">
        <CouncilMembers council={council} />
        <CouncilMeetings councilId={council.id} />
      </CardContent>
    </Card>
  );
}

// The members service is keyed on committee_id alone — the NAAC name on the hook
// is historical, not a filter. Reusing it keeps one read path for a roster.
function CouncilMembers({ council }: { council: ClusterCouncil }) {
  const { data: members, isLoading } = useNAACCommitteeMembers(council.id);

  // Internal members are stored as a user id. A roster that renders them all as
  // "internal member" would be a list of nobody, so resolve the names.
  const userIds = useMemo(
    () =>
      (members ?? [])
        .map((m) => m.user_id)
        .filter((id): id is string => !!id),
    [members],
  );
  const { data: profiles } = useProfileNames(userIds);

  const memberLabel = (m: {
    is_external: boolean;
    user_id: string | null;
    external_name: string | null;
    external_org: string | null;
  }) => {
    if (m.is_external) {
      return `${m.external_name ?? 'External member'}${
        m.external_org ? ` · ${m.external_org}` : ''
      }`;
    }
    return profiles?.[m.user_id ?? ''] ?? 'Name not available';
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4 text-muted-foreground" />
        Members
        <Badge variant="secondary" className="text-[10px]">
          {council.member_count}
        </Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (members ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nobody has been added to this council yet. Add members on the
          council&apos;s own page.
        </p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{memberLabel(m)}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {m.role}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const IQAC_METRICS = '/accreditation/iqac';

/**
 * Where the CEO's framework went, and why.
 *
 * A link on its own would answer "where" and leave "why" to rumour. The
 * framework was issued in July 2026 and launched on THIS page, so its
 * disappearance from it is the kind of change a reader is entitled to see
 * explained in the place it used to be. The reason is stated in the reader's
 * terms — one college can move every one of these numbers by itself — rather
 * than as a governance argument.
 */
function MetricsMovedPointer() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            The measured metrics now live with the IQAC
          </div>
          <p className="max-w-2xl text-xs text-muted-foreground">
            The metric framework issued in July 2026 was read on this page. Every
            metric in it is still recorded and still readable, by exactly the
            same people — it has moved, not gone.
          </p>
          <p className="max-w-2xl text-xs text-muted-foreground">
            It moved because each of those numbers is one a single college can
            move on its own, which makes it a measure of that college&apos;s own
            quality. This council exists for what the colleges do{' '}
            <em>together</em>, and that is what the sections above now report.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={IQAC_METRICS}>
            Open the metrics
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CouncilMeetings({ councilId }: { councilId: string }) {
  const { data: meetings, isLoading } = useCommitteeMeetings(councilId);

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        Meetings
        <Badge variant="secondary" className="text-[10px]">
          {isLoading ? '—' : (meetings ?? []).length}
        </Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (meetings ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No meeting has been recorded. A council that never meets leaves no
          record of what it decided.
        </p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {(meetings ?? []).slice(0, 5).map((meeting) => (
            <li
              key={meeting.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">
                Meeting {meeting.meeting_no}
                {meeting.scheduled_for ? ` · ${meeting.scheduled_for}` : ''}
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {meeting.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
