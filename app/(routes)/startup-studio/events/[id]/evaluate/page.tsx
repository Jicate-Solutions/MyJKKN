'use client'

import { use, useState, useEffect } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useEvent } from '@/hooks/startup-studio/use-events'
import {
  useEvaluatorTeams,
  useTeamsForVenue,
  useUpsertVerification,
} from '@/hooks/startup-studio/use-appathon-verifications'
import { useEventVenues } from '@/hooks/startup-studio/use-event-venues'
import { VerificationTable } from './_components/verification-table'
import { EvaluatorProgressBar } from './_components/evaluator-progress-bar'
import type { EvaluatorTeamCard, VerificationStatus } from '@/types/startup-studio'

type TabValue = 'pending' | 'verified' | 'flagged' | 'all'

export default function EvaluatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const profileId = profile?.id ?? ''
  const isSuperAdmin = profile?.role === 'super_admin'

  const [tab, setTab] = useState<TabValue>('pending')
  const [selectedVenueId, setSelectedVenueId] = useState('')

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: teams = [], isLoading: teamsLoading } = useEvaluatorTeams(id, profileId)
  const { data: allVenues = [] } = useEventVenues(id, 'demo_day')
  const { data: adminTeams = [], isLoading: adminTeamsLoading } = useTeamsForVenue(
    id, selectedVenueId, profileId
  )
  const { mutateAsync: upsertVerification, isPending } = useUpsertVerification(id, profileId)

  // Auto-select the first venue when venues load (super_admin only)
  useEffect(() => {
    if (isSuperAdmin && !selectedVenueId && allVenues.length > 0) {
      setSelectedVenueId(allVenues[0].id)
    }
  }, [isSuperAdmin, allVenues, selectedVenueId])

  const displayTeams = isSuperAdmin ? adminTeams : teams
  const displayLoading = isSuperAdmin ? adminTeamsLoading : teamsLoading

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
        <div className="mx-auto p-6 text-center space-y-4 pt-12">
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

  const pendingTeams = displayTeams.filter(
    t => !t.verification || t.verification.verification_status === 'pending'
  )
  const verifiedTeams = displayTeams.filter(t => t.verification?.verification_status === 'verified')
  const flaggedTeams = displayTeams.filter(
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
    all: displayTeams,
  }

  return (
    <ContentLayout title="Demo Day Evaluation">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Evaluate' },
      ]} />

      <div className="space-y-4 mt-4 pb-10">
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

        {isSuperAdmin && (
          <div className="mb-4">
            <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a venue to evaluate" />
              </SelectTrigger>
              <SelectContent>
                {allVenues.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.manual_name ?? v.resource?.name ?? 'Unnamed Venue'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isSuperAdmin && !selectedVenueId && allVenues.length === 0 && (
          <Alert>
            <AlertDescription>
              No Demo Day venues found. Go to the{' '}
              <Link href={`/startup-studio/events/${id}/venues`} className="underline font-medium">
                Venues page
              </Link>{' '}
              and create a venue with Day Type = Demo Day first.
            </AlertDescription>
          </Alert>
        )}

        {isSuperAdmin && !selectedVenueId && allVenues.length > 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Select a venue above to begin evaluation.
          </p>
        )}

        {!isSuperAdmin && displayTeams.length === 0 && !displayLoading && (
          <Alert>
            <AlertDescription>
              No teams assigned to your venue for Demo Day, or you are not assigned as a judge/evaluator for this event.
            </AlertDescription>
          </Alert>
        )}

        {isSuperAdmin && selectedVenueId && displayTeams.length === 0 && !displayLoading && (
          <Alert>
            <AlertDescription>
              No teams are allocated to this venue for Demo Day.
            </AlertDescription>
          </Alert>
        )}

        {displayTeams.length > 0 && (
          <>
            <EvaluatorProgressBar
              total={displayTeams.length}
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
                <TabsTrigger value="all">All ({displayTeams.length})</TabsTrigger>
              </TabsList>

              {(['pending', 'verified', 'flagged', 'all'] as TabValue[]).map(tabKey => (
                <TabsContent key={tabKey} value={tabKey} className="mt-3">
                  {displayLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : tabTeams[tabKey].length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      No teams in this category
                    </div>
                  ) : (
                    <VerificationTable
                      teams={tabTeams[tabKey]}
                      onVerify={handleVerify}
                      isSubmitting={isPending}
                    />
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
