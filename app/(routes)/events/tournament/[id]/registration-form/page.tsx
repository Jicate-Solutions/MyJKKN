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
import { Loader2 } from 'lucide-react';
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
      <RegistrationFormsPanel eventId={id} />
    </ContentLayout>
  );
}
