// app/(routes)/accreditation/cac/_components/ugc-readiness-section.tsx
// ============================================================================
// Part C of the Cluster Academic Council page — the UGC readiness checklist.
//
// The section above this one reports what passes between the colleges. This one
// sets that beside what the UGC's cluster guidance describes a cluster as
// having, and the gap between the two columns is the finding: JKKN already does
// the cluster BEHAVIOUR and files none of the cluster GOVERNANCE.
//
// ⚠ NO EXTERNAL DEADLINE, AND THE SCREEN HAS TO SAY SO. JKKN is not pursuing
// formal cluster status (Director decision, 2026-08-14). Nothing here is
// submitted, nobody assesses it, and no date attaches to any row. A checklist
// drawn from a regulator's document reads as a compliance countdown unless it
// says otherwise in its own opening sentence, so it does — before the rows,
// not in a footnote under them.
//
// THREE THINGS THIS DELIBERATELY DOES NOT DO.
//
//   1. It carries no score, no proportion and no ordering of the colleges. Not
//      even "four of six". A fraction turns a checklist into a rating, and a
//      rating implies somebody entitled to award one; on JKKN's own council
//      nobody is. `ugc-readiness.ts` exports no helper that could produce such
//      a total, which is what keeps this true as the file is edited.
//
//   2. It prints no bare zero. `Figure` below is the same component the
//      collaboration section uses — duplicated rather than imported, because
//      that file is owned by a parallel change and must not be touched by this
//      one. If the two ever diverge, THIS is the copy to correct, not the
//      original. A zero reads as a measured bad result and would libel a
//      college for a gap in the platform.
//
//   3. It does not soften the reading. Most rows are red. That is the point of
//      putting them on a screen.
//
// EVERY FIGURE IS DERIVED AT READ TIME. Three of the four reads are ones the
// page already makes — `fn_cac_cluster_totals()` for the exchange edges and the
// funnel, and the cluster-council list — so they are already in React Query's
// cache by the time this mounts and cost nothing. The fourth,
// `fn_cac_internal_agreements_count()`, is this section's own and is the one
// request it adds: no other panel reads the agreements register, and counting
// it in the browser would return the viewer's RLS slice rather than the
// cluster's. No number here can go stale against the data it describes.
//
// ⚠ THAT FOURTH READ IS DELIBERATELY NOT FOLDED INTO `readError`. Its migration
// is Director-gated and unapplied, so on a database that has not received it the
// function does not exist and the call fails. Treating that as a section-wide
// read fault would blank six rows over one absent figure; instead the count
// reads as absent, which is exactly what it is, and the row says "nothing
// recorded yet" — the same thing it says on a database where the column exists
// and nobody has filed an agreement.
// ============================================================================

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ScrollText,
  CheckCircle2,
  Circle,
  CircleOff,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCacExchangeEdges,
  useCacSolutionFunnel,
  splitExchange,
  summariseFunnel,
} from '@/hooks/accreditation/use-cac-cluster';
import { useClusterCouncils } from '@/hooks/accreditation/use-cluster-councils';
import {
  buildUgcReadiness,
  isSatisfied,
  CAC_READINESS_PERMISSION,
  UGC_GUIDANCE,
  type ReadinessRow,
  type ReadinessState,
} from '../_lib/ugc-readiness';

// ----------------------------------------------------------------------------
// The agreements count.
//
// Read through a SECURITY DEFINER function rather than by counting
// `institution_collaborations` from the browser: that table is RLS-scoped, so a
// council member scoped to one college would be shown their own college's
// agreements as the cluster's, and two members would read two different figures
// from the same screen. Same reasoning, and the same fix, as the 2026-08-01
// rewrite of the cluster reads.
// ----------------------------------------------------------------------------

const internalAgreementsKey = ['accreditation', 'cac-internal-agreements'] as const;

async function fetchInternalAgreementsCount(): Promise<number> {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_cac_internal_agreements_count');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

// ----------------------------------------------------------------------------
// A figure, or the reason there is no figure. Never a bare 0.
//
// Deliberately identical to the `Figure` in cluster-collaboration-section.tsx.
// See note 2 in the header for why it is copied rather than imported.
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// How a state is shown.
//
// Words, never a colour alone and never a symbol alone — a reader who cannot
// distinguish amber from green, or who is reading this printed, gets the same
// reading as everyone else. The four labels are written to be true out of
// context, because a badge is the one string that gets read on its own.
// ----------------------------------------------------------------------------

const STATE_PRESENTATION: Record<
  ReadinessState,
  { label: string; icon: React.ReactNode; className: string }
> = {
  'in-place': {
    label: 'Already happening',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    className: 'border-emerald-500/40 bg-emerald-500/5',
  },
  'awaiting-entry': {
    label: 'Nothing recorded yet',
    icon: <Circle className="h-4 w-4 text-amber-600" />,
    className: 'border-amber-500/40 bg-amber-500/5',
  },
  'not-expressible': {
    label: 'Nothing records this',
    icon: <CircleOff className="h-4 w-4 text-amber-600" />,
    className: 'border-amber-500/40 bg-amber-500/5',
  },
  blocked: {
    label: 'Waiting on the line above',
    icon: <Lock className="h-4 w-4 text-amber-600" />,
    className: 'border-amber-500/40 bg-amber-500/5',
  },
  elsewhere: {
    label: 'Read on the council’s own page',
    icon: <ArrowRight className="h-4 w-4 text-muted-foreground" />,
    className: 'border-muted-foreground/30 bg-muted/30',
  },
};

function ReadinessRowCard({ row }: { row: ReadinessRow }) {
  const presentation = STATE_PRESENTATION[row.state];

  return (
    <section className={`space-y-3 rounded-lg border p-4 ${presentation.className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0">{presentation.icon}</span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold">{row.asks}</h3>
            <p className="text-xs text-muted-foreground">{row.reading}</p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {presentation.label}
        </Badge>
      </div>

      {row.figures.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {row.figures.map((f) => (
            <div key={f.label} className="rounded-md border bg-card p-3">
              <div className="text-xs text-muted-foreground">{f.label}</div>
              <div className="mt-1">
                <Figure value={f.value} reason={f.reason} suffix={f.unit || undefined} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A finding with no next click is a complaint. Shown only where the line
          is not already true — a satisfied row needs no route, and offering one
          would read as a correction to something that is working. */}
      {row.fix && !isSatisfied(row) && (
        <Button asChild variant="outline" size="sm">
          <Link href={row.fix.href}>
            {row.fix.label}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// The section.
// ----------------------------------------------------------------------------

export function UgcReadinessSection() {
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();

  // Every hook runs before any branch. The three reads below share React
  // Query's cache with the rest of the page, so calling them here adds no
  // request even for a reader who turns out not to hold the key.
  const { data: edgeData, isLoading: edgesLoading, error: edgesError } =
    useCacExchangeEdges();
  const { data: funnelData, isLoading: funnelLoading, error: funnelError } =
    useCacSolutionFunnel();
  const { data: councils, isLoading: councilsLoading } = useClusterCouncils();
  const { data: internalAgreements, isLoading: agreementsLoading } = useQuery({
    queryKey: internalAgreementsKey,
    queryFn: fetchInternalAgreementsCount,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // No retry, and the error is deliberately not read: see the note in the
    // header. An unapplied migration must cost this one figure, not the section.
    retry: false,
  });

  const rows = useMemo(() => {
    const edges = edgeData ?? [];
    const bookings = splitExchange(edges, 'booking');
    const teaching = splitExchange(edges, 'teaching');
    const funnel = summariseFunnel(funnelData ?? []);

    // An edge carries the distinct people on that ONE pair, so summing the
    // edges counts a person once per pair they teach into. That is an upper
    // bound, not a headcount, and the closing note on screen says so rather
    // than letting the figure be read as exact.
    const teachingPeople = [...teaching.peer, ...teaching.hub].reduce(
      (n, e) => n + (e.people ?? 0),
      0,
    );

    return buildUgcReadiness({
      // Absent read and empty register are the same reading here — neither is
      // an agreement on record — and `figure()` renders both as the reason.
      internalAgreements: internalAgreements ?? 0,
      councilsConstituted: (councils ?? []).length,
      peerBookings: bookings.peerUnits,
      hubBookings: bookings.hubUnits,
      teachingAssignments: teaching.totalUnits,
      teachingPeople,
      publications: funnel.publications,
    });
  }, [edgeData, funnelData, councils, internalAgreements]);

  const isLoading =
    edgesLoading || funnelLoading || councilsLoading || agreementsLoading;
  const readError = edgesError ?? funnelError;

  if (permsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Say why, and name the key. Never a silent hide and never a redirect — a
  // reader who cannot see this section must be able to ask for it by name.
  if (!(isSuperAdmin || can(CAC_READINESS_PERMISSION))) {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-2 py-8 text-center text-sm text-muted-foreground">
          <p>
            You do not have permission to view the UGC readiness checklist for
            this council.
          </p>
          <p className="text-xs">
            Ask your IQAC coordinator for the
            <code className="mx-1">{CAC_READINESS_PERMISSION}</code>
            permission.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ScrollText className="h-5 w-5 text-amber-600" />
          What the UGC guidance describes, set against JKKN
        </CardTitle>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">
              Nothing on this list is due to anybody.
            </strong>{' '}
            JKKN is not applying for cluster status and none of this is
            submitted, inspected or dated. The guidance below is read here for
            one reason only — it describes something worth having, and JKKN is
            holding itself to it. The only reader of this list is JKKN.
          </p>
          <p>
            Each line is what the {UGC_GUIDANCE.issuer}&apos;s{' '}
            <em>{UGC_GUIDANCE.document}</em> ({UGC_GUIDANCE.issued}, section{' '}
            {UGC_GUIDANCE.section}) describes a cluster of institutions as
            having, set beside what JKKN can show today. Every figure is worked
            out at the moment the page loads. There is no score, no ordering of
            the colleges and no total.
          </p>
          <p>
            Read together, the lines say one thing: the colleges already behave
            like a cluster, and almost none of it is written down.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {readError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">The readiness figures could not be read.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing below this line is known either way — this is a fault in
              the read, not a finding about any institution.{' '}
              {String((readError as Error)?.message ?? '')}
            </p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          rows.map((row) => <ReadinessRowCard key={row.id} row={row} />)
        )}

        <p className="text-[11px] italic text-muted-foreground">
          Two kinds of empty are possible above and they are not the same.{' '}
          <em>Nothing recorded yet</em> means the platform holds a place for it
          and nobody has used it — somebody typing fixes that.{' '}
          <em>Nothing records this</em> means no record anywhere can hold it, and
          typing does not help; the shape of the record would have to change
          first. Nothing on this list is of the second kind any more — the
          agreement between two colleges was the last one, and the register can
          now hold it — so every gap above is one somebody typing can close. The
          count of Senior Learners is an upper bound, since one person teaching
          into two colleges is counted on each pair.
        </p>
      </CardContent>
    </Card>
  );
}
