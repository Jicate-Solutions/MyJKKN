'use client';

// School of Influence — the front door an applicant actually lands on
// (spec §7 S4). Spec: specs/school-of-influence-batches-2026-07-30.md
//
// The event is the programme's public face; the cohort spine has no apply path
// of its own. This page asks the server for the apply context and then does one
// of exactly two things:
//   • context.refusal is set  → print the reason, in words, with what to do next
//   • context.refusal is null → render the application form
//
// It never redirects on a refusal. A bounce to /dashboard or /events is the
// failure CLAUDE.md rule 27 exists to stop: the applicant clicks, lands
// somewhere else, clicks again, and never learns that (say) applications closed
// last Tuesday or that their profile has no learner record.
//
// This route lives under [id], so the nav-reachability gate skips it (dynamic
// segments are excluded) — no NAV_EXCLUDE entry is needed.

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, Loader2, Users } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SoiApplyContext } from '@/lib/services/school-of-influence/apply-types';
import { SoiApplyForm } from './_components/soi-apply-form';
import {
  SoiApplicationOutcome,
  useOwnApplicationOutcome,
} from './_components/soi-application-outcome';

/**
 * The two refusal codes that mean "you already have an application or a place
 * here". Only on these does the screen go and read the applicant's own record,
 * so the ordinary apply path costs no extra query.
 */
const HAS_OWN_APPLICATION_CODES = ['already_applied', 'already_member'];

const formatDay = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

function useApplyContext(eventId: string) {
  return useQuery<SoiApplyContext>({
    queryKey: ['soi-apply-context', eventId],
    enabled: !!eventId,
    // Capacity and the intake window move under the applicant's feet, so this
    // must not be served from a warm cache — a stale "2 places left" is how
    // somebody fills in a form they can no longer submit.
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(
        `/api/school-of-influence/apply?eventId=${encodeURIComponent(eventId)}`
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Could not load the application form.');
      }
      return (await response.json()) as SoiApplyContext;
    },
  });
}

export default function SchoolOfInfluenceApplyPage() {
  const params = useParams();
  const eventId = String(params?.id ?? '');
  const queryClient = useQueryClient();
  const { data: context, isLoading, error } = useApplyContext(eventId);

  // Director decision, 2026-08-01: a turned-down applicant must read the
  // coordinator's actual words, not a generic sentence. That text lives on the
  // applicant's own registration row, so it is fetched only when the refusal
  // says they have one.
  const hasOwnApplication =
    !!context?.refusal && HAS_OWN_APPLICATION_CODES.includes(context.refusal.code);
  const { data: outcome, isLoading: outcomeLoading } = useOwnApplicationOutcome(
    eventId,
    hasOwnApplication
  );

  const title = context?.eventName ?? 'School of Influencer';

  if (isLoading) {
    return (
      <ContentLayout title="Apply">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !context) {
    return (
      <ContentLayout title="Apply">
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>The application form could not be loaded</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : 'Something went wrong loading this programme. Please try again in a moment.'}
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const opensOn = formatDay(context.registrationOpensAt);
  const closesOn = formatDay(context.registrationClosesAt);

  return (
    <ContentLayout title={title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: title, href: `/events/${eventId}` },
          { label: 'Apply' },
        ]}
      />

      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Apply to join this programme. Places are limited and every application is
            reviewed by a coordinator.
          </p>
          {(opensOn || closesOn) && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {opensOn && closesOn
                ? `Applications open ${opensOn} – ${closesOn}`
                : opensOn
                  ? `Applications open from ${opensOn}`
                  : `Applications close ${closesOn}`}
            </p>
          )}
        </div>

        {context.refusal ? (
          <>
            {/*
              The refusal IS the page. Explicit, on screen, with the next step.

              When the applicant has an application of their own here, the
              account of THAT — including a rejection's actual reason — replaces
              this generic sentence rather than sitting beneath it. Showing both
              would leave the vague message on top, which is exactly what the
              Director asked to be fixed. While the record is loading, and if it
              cannot be read or cannot be honestly interpreted, the screen falls
              back to the sentence it has always shown: less specific, still true.
            */}
            {hasOwnApplication && outcomeLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : outcome ? (
              <SoiApplicationOutcome
                eventId={eventId}
                outcome={outcome}
                fallbackBatchName={context.existingMembership?.batchName ?? null}
              />
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>You cannot apply right now</AlertTitle>
                <AlertDescription>{context.refusal.message}</AlertDescription>
              </Alert>
            )}

            {context.refusal.code === 'not_signed_in' && (
              <Button asChild size="sm">
                <Link href={`/auth/login?redirect=/events/${eventId}/apply`}>Sign in</Link>
              </Button>
            )}

            {context.batches.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Batches
                  </CardTitle>
                  <CardDescription>
                    Batches run at the same time. Each one opens and closes its own
                    applications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {context.batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
                    >
                      <span className="text-sm font-medium">{batch.name}</span>
                      <Badge
                        variant={batch.acceptingNow ? 'secondary' : 'outline'}
                        className="text-[10px] font-normal"
                      >
                        {!batch.intakeOpen
                          ? 'Applications closed'
                          : batch.isFull
                            ? batch.fullBehaviour === 'waitlist'
                              ? 'Full — waiting list'
                              : 'Full'
                            : `${Math.max(batch.capacity - batch.occupancy, 0)} of ${batch.capacity} places left`}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <SoiApplyForm
            context={context}
            onApplied={() =>
              queryClient.invalidateQueries({ queryKey: ['soi-apply-context', eventId] })
            }
          />
        )}
      </div>
    </ContentLayout>
  );
}
