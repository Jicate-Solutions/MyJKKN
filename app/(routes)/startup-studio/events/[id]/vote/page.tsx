'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Vote } from 'lucide-react'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useEvent } from '@/hooks/startup-studio/use-events'
import { useEventRegistrations, useEventDemoSlots } from '@/hooks/startup-studio/use-event-registrations'
import {
  useVoteSummaries,
  useMyVotes,
  useCastVote,
  useAudienceVotesRealtime,
} from '@/hooks/startup-studio/use-audience-votes'
import { TeamVoteCard } from './_components/team-vote-card'

export default function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { profile } = useAuth()
  const profileId = profile?.id ?? ''

  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: registrations = [], isLoading: regsLoading } = useEventRegistrations({ event_id: id })
  const { data: demoSlots = [] } = useEventDemoSlots(id)
  const { data: summaries = [] } = useVoteSummaries(id)
  const { data: myVotes = [] } = useMyVotes(id, profileId)
  const { mutate: castVote } = useCastVote(id, profileId)

  // Subscribe to live vote updates
  useAudienceVotesRealtime(id)

  const votingOpen = !!event?.voting_opened_at && !event?.voting_closed_at

  // Build lookup maps
  const summaryMap = new Map(summaries.map(s => [s.submission_id, s]))
  const myVoteMap = new Map(myVotes.map(v => [v.submission_id, v.rating]))
  const slotMap = new Map(demoSlots.map(s => [s.registration_id, s.slot_order]))

  // Normalize submission: PostgREST returns a 1-to-many join as an array; take first element.
  const normalizedRegistrations = registrations.map(r => ({
    ...r,
    submission: Array.isArray(r.submission) ? (r.submission[0] ?? null) : r.submission,
  }))

  // Only list teams that have a submitted project, sorted by demo slot (nulls last)
  const teamsWithSubmissions = normalizedRegistrations
    .filter(r => !!r.submission?.id)
    .sort((a, b) => {
      const slotA = slotMap.get(a.id) ?? null
      const slotB = slotMap.get(b.id) ?? null
      if (slotA === null && slotB === null) return 0
      if (slotA === null) return 1
      if (slotB === null) return -1
      return slotA - slotB
    })

  if (eventLoading) {
    return (
      <ContentLayout title="Live Voting">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    )
  }

  if (!votingOpen) {
    return (
      <ContentLayout title="Live Voting">
        <div className="mx-auto p-6 text-center space-y-4 pt-12 max-w-sm">
          <Vote className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">
            {!event?.voting_opened_at ? 'Voting Not Open Yet' : 'Voting Has Closed'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {!event?.voting_opened_at
              ? 'The admin will open audience voting when presentations begin.'
              : 'Thank you for voting! Results will be announced shortly.'}
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

  return (
    <ContentLayout title="Live Voting">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name ?? 'Event', href: `/startup-studio/events/${id}` },
        { label: 'Live Voting' },
      ]} />

      <div className="space-y-4 mt-4 pb-10">
        <div className="flex items-center gap-3">
          <Link href={`/startup-studio/events/${id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Vote className="h-5 w-5 text-primary" />
              Live Audience Voting
            </h1>
            <p className="text-xs text-muted-foreground">{event?.name}</p>
          </div>
        </div>

        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <AlertDescription className="text-green-700 dark:text-green-400 text-sm">
            Voting is open! Rate each team 1–5 stars. You can update your rating anytime.
          </AlertDescription>
        </Alert>

        {regsLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : teamsWithSubmissions.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No team submissions found for this event.
          </div>
        ) : (
          <div className="space-y-3">
            {teamsWithSubmissions.map((reg, index) => {
              const submissionId = reg.submission!.id
              const voteSummary = summaryMap.get(submissionId)
              const myRating = myVoteMap.get(submissionId) ?? 0
              const institutionName = (reg.institution as any)?.name ?? ''

              return (
                <TeamVoteCard
                  key={reg.id}
                  teamName={reg.team_name}
                  appName={reg.submission!.app_name ?? ''}
                  institutionName={institutionName}
                  demoSlot={slotMap.get(reg.id) ?? null}
                  slotIndex={index + 1}
                  totalVotes={voteSummary?.total_votes ?? 0}
                  averageRating={voteSummary?.average_rating ?? 0}
                  myRating={myRating}
                  onVote={(rating) => {
                    setSubmittingId(submissionId)
                    castVote({ submissionId, rating }, {
                      onSettled: () => setSubmittingId(null),
                    })
                  }}
                  isSubmitting={submittingId === submissionId}
                  votingOpen={votingOpen}
                />
              )
            })}
          </div>
        )}
      </div>
    </ContentLayout>
  )
}
