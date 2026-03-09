'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useEvent } from '@/hooks/startup-studio/use-events'
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMySubmission } from '@/hooks/startup-studio/use-event-submissions'
import { useMyDeclaration } from '@/hooks/startup-studio/use-track-declarations'
import { useMyCaseStudy } from '@/hooks/startup-studio/use-case-studies'
import { trackRequiresCaseStudy } from '@/lib/constants/startup-studio/tracks'
import { CaseStudyForm } from './_components/case-study-form'

export default function CaseStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

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

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event?.name ?? 'Event', href: `/startup-studio/events/${id}` },
    { label: 'Case Study' },
  ]

  if (isLoading) {
    return (
      <ContentLayout title="Case Study">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="space-y-4 mt-4 pb-10 max-w-2xl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </ContentLayout>
    )
  }

  if (!event || !registration) {
    return (
      <ContentLayout title="Case Study">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="space-y-6 mt-4 pb-10">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/startup-studio/events/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
          <div className="text-center py-10 text-muted-foreground text-sm">
            No registration found. Make sure you have registered for this event.
          </div>
        </div>
      </ContentLayout>
    )
  }

  if (!isSuperAdmin && (!declaration || !trackRequiresCaseStudy(declaration.track))) {
    return (
      <ContentLayout title="Case Study">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="space-y-6 mt-4 pb-10">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/startup-studio/events/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
          <div className="text-center py-10 space-y-2">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">Case Study Not Required</p>
            <p className="text-sm text-muted-foreground">
              Case studies are only for teams on the JICATE Solutions or Solve for Industry tracks.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Case Study">
      <PageBreadcrumb items={breadcrumbs} />
      <div className="space-y-6 mt-4 pb-10">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Case Study
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{event.name}</p>
        </div>
        <div className="max-w-2xl">
          {/* score: uses submission total_score as approximation; admin can correct via adminUpdateCaseStudy */}
          <CaseStudyForm
            eventId={id}
            registrationId={registration.id}
            track={(declaration?.track ?? 'jicate_solutions') as 'solve_for_industry' | 'jicate_solutions'}
            appName={submission?.app_name ?? registration.team_name}
            appUrl={submission?.live_app_url ?? ''}
            score={submission?.total_score ?? 0}
            existing={existing ?? null}
          />
        </div>
      </div>
    </ContentLayout>
  )
}
