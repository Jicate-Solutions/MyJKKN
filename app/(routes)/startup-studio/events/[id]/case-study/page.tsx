'use client'

import { use } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useEvent } from '@/hooks/startup-studio/use-events'
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMySubmission } from '@/hooks/startup-studio/use-event-submissions'
import { useMyDeclaration } from '@/hooks/startup-studio/use-track-declarations'
import { useMyCaseStudy } from '@/hooks/startup-studio/use-case-studies'
import { trackRequiresCaseStudy } from '@/lib/constants/startup-studio/tracks'
import { CaseStudyForm } from './_components/case-study-form'

export default function CaseStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: registration, isLoading: registrationLoading } = useMyRegistration(id)
  const { data: submission, isLoading: submissionLoading } = useMySubmission(id)
  const { data: declaration, isLoading: declarationLoading } = useMyDeclaration(id, registration?.id)
  const { data: existing, isLoading: caseStudyLoading } = useMyCaseStudy(id, registration?.id)

  const isLoading =
    eventLoading ||
    registrationLoading ||
    submissionLoading ||
    declarationLoading ||
    caseStudyLoading

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!event || !registration) {
    return (
      <div className="container max-w-2xl py-10 text-center">
        <h1 className="text-xl font-bold mb-2">Not Found</h1>
        <p className="text-muted-foreground">
          No event or registration found. Make sure you have registered for this event.
        </p>
      </div>
    )
  }

  if (!declaration || !trackRequiresCaseStudy(declaration.track)) {
    return (
      <div className="container max-w-2xl py-10 text-center">
        <h1 className="text-xl font-bold mb-2">Case Study Not Required</h1>
        <p className="text-muted-foreground">
          Case studies are only for teams on the JICATE Solutions or Solve for Industry tracks.
        </p>
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-6">
      {/* score: uses submission total_score as approximation; admin can correct via adminUpdateCaseStudy */}
      <CaseStudyForm
        eventId={id}
        registrationId={registration.id}
        track={declaration.track as 'solve_for_industry' | 'jicate_solutions'}
        appName={submission?.app_name ?? registration.team_name}
        appUrl={submission?.live_app_url ?? ''}
        score={submission?.total_score ?? 0}
        existing={existing ?? null}
      />
    </div>
  )
}
