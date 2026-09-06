'use client';

// app/(routes)/events/tournament/[id]/passes/page.tsx
//
// Printable QR entry-pass board for a sports tournament — the tournament port of
// the marathon QR-codes ops page (app/(routes)/events/marathon/[id]/ops/qr-codes).
// A NEW route, reachable directly at /events/tournament/[id]/passes. It does NOT
// touch the shared tournament detail page; a "Passes" button on that page is left
// as follow-up wiring for the orchestrator.
//
// Access: organizer / in-charge only (canManage). The passes API itself gates on
// canManageTournament, so committee/view-only roles get an explicit access-denied
// state here rather than a silent redirect (permission failures must be explicit).

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, QrCode } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { useTournament } from '@/hooks/events/use-tournaments';
import { useTournamentAccess } from '@/hooks/events/use-tournament-access';
import {
  TournamentPassesBoard,
  type TournamentPass,
} from './_components/tournament-passes-board';

interface PassesResponse {
  event: { id: string; name: string };
  count: number;
  passes: TournamentPass[];
}

export default function TournamentPassesPage() {
  const params = useParams();
  const eventId = String(params?.id ?? '');

  const { data: tournament, isLoading: loadingT } = useTournament(eventId);
  const access = useTournamentAccess(eventId, tournament);
  const canManage = access.canManage;

  const {
    data,
    isLoading: loadingPasses,
    isError,
    error,
  } = useQuery<PassesResponse>({
    queryKey: ['tournament-passes', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/tournament/${eventId}/qr/generate`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to load passes (${res.status})`);
      }
      return res.json();
    },
    // Only fetch once we know the caller is a manager — the API would 403 otherwise.
    enabled: !!eventId && !access.isLoading && canManage,
  });

  const eventName = tournament?.name ?? data?.event?.name ?? 'Tournament';

  const breadcrumb = (
    <PageBreadcrumb
      items={[
        { label: 'Events', href: '/events' },
        { label: 'Tournaments', href: '/events/tournament' },
        { label: eventName, href: `/events/tournament/${eventId}` },
        { label: 'Passes' },
      ]}
    />
  );

  // Loading access / tournament
  if (loadingT || access.isLoading) {
    return (
      <ContentLayout title="Tournament — Passes">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  // Explicit access-denied (never a silent redirect)
  if (!canManage) {
    return (
      <ContentLayout title="Tournament — Passes">
        {breadcrumb}
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            Entry passes are available to tournament organizers and in-charges only.
            Ask a sports coordinator to add you as an in-charge of this tournament.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${eventName} — Passes`}>
      {breadcrumb}

      <div className="mt-4 flex items-center gap-3 print:hidden">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <QrCode className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entry Passes</h1>
          <p className="text-sm text-muted-foreground">
            Printable QR passes for every active entry — scan at the gate to check
            learners in.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {loadingPasses ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {(error as Error)?.message || 'Could not load entry passes.'}
            </CardContent>
          </Card>
        ) : (
          <TournamentPassesBoard passes={data?.passes ?? []} eventName={eventName} />
        )}
      </div>
    </ContentLayout>
  );
}
