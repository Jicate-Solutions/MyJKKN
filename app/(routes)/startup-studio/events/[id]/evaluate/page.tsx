'use client'

import { use, useState } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useEvent } from '@/hooks/startup-studio/use-events'
import {
  useEvaluatorTeams,
  useUpsertVerification,
} from '@/hooks/startup-studio/use-appathon-verifications'
import { VerificationCard } from './_components/verification-card'
import { EvaluatorProgressBar } from './_components/evaluator-progress-bar'
import type { EvaluatorTeamCard, VerificationStatus } from '@/types/startup-studio'

type TabValue = 'pending' | 'verified' | 'flagged' | 'all'

export default function EvaluatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const profileId = profile?.id ?? ''

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: teams = [], isLoading: teamsLoading } = useEvaluatorTeams(id, profileId)
  const { mutateAsync: upsertVerification, isPending } = useUpsertVerification(id, profileId)
  const [tab, setTab] = useState<TabValue>('pending')

  if (eventLoading) {
    return (
      <ContentLayout title="Demo Day Evaluation">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    )
  }
  if (!event) return notFound()

  if (!event.metrics_frozen_at) {
    return (
      <ContentLayout title="Demo Day Evaluation">
        <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-12">
          <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Evaluation Not Open Yet</h2>
          <p className="text-sm text-muted-foreground">
            The admin must freeze team metrics before evaluation can begin.
            Please wait for the 9:15 AM signal.
          </p>
          <Link href={`/startup-studio/events/${id}`}>
            <Button variant="outline" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Event
            </Button>
          </Link>
        </div>
      </ContentLayout>
    )
  }

  const pendingTeams = teams.filter(
    t => !t.verification || t.verification.verification_status === 'pending'
  )
  const verifiedTeams = teams.filter(t => t.verification?.verification_status === 'verified')
  const flaggedTeams = teams.filter(
    t =>
      t.verification?.verification_status === 'flagged' ||
      t.verification?.verification_status === 'disqualified'
  )

  const handleVerify = async (
    team: EvaluatorTeamCard,
    status: VerificationStatus,
    data: any,
    flagReason?: string
  ) => {
    if (!team.submission || !profileId) return
    await upsertVerification({
      submission_id: team.submission.id,
      venue_id: team.venue_id,
      presented: data.presented,
      app_live: data.app_live,
      verified_users: Number(data.verified_users ?? 0),
      verified_active_users: Number(data.verified_active_users ?? 0),
      verified_revenue: Number(data.verified_revenue ?? 0),
      verification_status: status,
      flag_reason: flagReason,
      notes: data.notes,
    })
  }

  const tabTeams: Record<TabValue, EvaluatorTeamCard[]> = {
    pending: pendingTeams,
    verified: verifiedTeams,
    flagged: flaggedTeams,
    all: teams,
  }

  return (
    <ContentLayout title="Demo Day Evaluation">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Evaluate' },
      ]} />

      <div className="space-y-4 max-w-2xl mt-4 pb-10">
        <div className="flex items-center gap-3">
          <Link href={`/startup-studio/events/${id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Demo Day Evaluation</h1>
            <p className="text-xs text-muted-foreground">{event.name}</p>
          </div>
        </div>

        {teams.length === 0 && !teamsLoading && (
          <Alert>
            <AlertDescription>
              No teams assigned to your venue for Demo Day, or you are not assigned as a judge/evaluator for this event.
            </AlertDescription>
          </Alert>
        )}

        {teams.length > 0 && (
          <>
            <EvaluatorProgressBar
              total={teams.length}
              verified={verifiedTeams.length}
              flagged={flaggedTeams.length}
            />

            <Tabs value={tab} onValueChange={v => setTab(v as TabValue)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="pending">Pending ({pendingTeams.length})</TabsTrigger>
                <TabsTrigger value="verified">Done ({verifiedTeams.length})</TabsTrigger>
                <TabsTrigger
                  value="flagged"
                  className={flaggedTeams.length > 0 ? 'text-amber-600' : ''}
                >
                  Flagged ({flaggedTeams.length})
                </TabsTrigger>
                <TabsTrigger value="all">All ({teams.length})</TabsTrigger>
              </TabsList>

              {(['pending', 'verified', 'flagged', 'all'] as TabValue[]).map(tabKey => (
                <TabsContent key={tabKey} value={tabKey} className="space-y-3 mt-3">
                  {teamsLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : tabTeams[tabKey].length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      No teams in this category
                    </div>
                  ) : (
                    tabTeams[tabKey].map(team => (
                      <VerificationCard
                        key={team.registration_id}
                        team={team}
                        onVerify={(status, data, flagReason) =>
                          handleVerify(team, status, data, flagReason)
                        }
                        isSubmitting={isPending}
                      />
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  )
}
