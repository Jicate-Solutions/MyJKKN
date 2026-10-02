'use client';

// Registration Form builder — dedicated page for one tournament.
// Split out of the detail page (2026-07): the inline builder was cramped and
// saved on every keystroke. Reached from the detail page's Registration card;
// gated by the same canManage rule the inline section used.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTournament } from '@/hooks/events/use-tournaments';
import { useTournamentAccess } from '@/hooks/events/use-tournament-access';
import { RegistrationFormsPanel } from '@/components/events/registration/registration-forms-panel';

export default function TournamentRegistrationFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: tournament, isLoading } = useTournament(id);
  const access = useTournamentAccess(id, tournament);
  const canManage = access.canManage;
  const accessLoading = access.isLoading;

  // Managers only — mirrors the old inline builder's `if (!canManage) return null`.
  // Wait for access (permissions + membership) to finish loading before redirecting,
  // otherwise a real manager gets bounced while `can()`/`isSuperAdmin` are still false.
  useEffect(() => {
    if (!isLoading && !accessLoading && tournament && !canManage) {
      router.replace(`/events/tournament/${id}`);
    }
  }, [isLoading, accessLoading, tournament, canManage, id, router]);

  if (isLoading || accessLoading) {
    return (
      <ContentLayout title="Registration Form">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!tournament) {
    return (
      <ContentLayout title="Registration Form">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Tournament not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!canManage) return null; // redirecting

  return (
    <ContentLayout title={`Registration Form · ${tournament.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Events', href: '/events' },
          { label: 'Tournaments', href: '/events/tournament' },
          { label: tournament.name, href: `/events/tournament/${id}` },
          { label: 'Registration Form' },
        ]}
      />
      {tournament.status === 'draft' && (
        // Draft closes public registration regardless of the form's own
        // Active switch — without this, an Active form's link just says
        // "not open" and nobody knows why.
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This tournament is still a <span className="font-semibold">Draft</span>, so its public
            registration link shows &ldquo;not open&rdquo; even when a form below is Active. Set the
            tournament to <span className="font-semibold">Active</span> (Tournaments list → Change
            Status) to open registration.
          </p>
        </div>
      )}
      {tournament.status !== 'draft' &&
        !(tournament.divisions ?? []).some((d) => d.is_active) && (
          // The public page needs at least one active division (sport) to
          // register into; with none it says "No events to register for yet".
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This tournament has <span className="font-semibold">no sports (divisions)</span> yet,
              so its public registration link has nothing to register for. Add a sport from{' '}
              <span className="font-semibold">Edit Tournament</span>.
            </p>
          </div>
        )}
      <div className="mt-4">
        <RegistrationFormsPanel
          eventId={id}
          backHref={`/events/tournament/${id}`}
          eventName={tournament.name}
        />
      </div>
    </ContentLayout>
  );
}
