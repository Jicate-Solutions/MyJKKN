'use client'

import { useAuth } from '@/hooks/use-auth'
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMySubmission } from '@/hooks/startup-studio/use-event-submissions'
import { useMyDeclaration } from '@/hooks/startup-studio/use-track-declarations'
import { DeclarationForm } from './declaration-form'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  eventId: string
}

export function DeclarePageClient({ eventId }: Props) {
  const { profile } = useAuth()
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId)
  const { data: submission, isLoading: subLoading } = useMySubmission(eventId)
  const { data: existing, isLoading: declLoading } = useMyDeclaration(
    eventId,
    registration?.id ?? null
  )

  const isLoading = regLoading || subLoading || declLoading

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  if (!registration) {
    return (
      <p className="text-center text-muted-foreground py-10">
        You are not registered for this event.
      </p>
    )
  }

  // Only team leader (owner_id) can submit the declaration
  if (registration.owner_id !== profile?.id) {
    return (
      <div className="text-center space-y-2 py-10">
        <p className="font-medium">Only the team leader can declare the track.</p>
        {existing && (
          <p className="text-muted-foreground text-sm">
            Your team has declared:{' '}
            <strong className="text-foreground capitalize">
              {existing.track.replace(/_/g, ' ')}
            </strong>
          </p>
        )}
      </div>
    )
  }

  return (
    <DeclarationForm
      eventId={eventId}
      registrationId={registration.id}
      teamName={registration.team_name}
      appathonScore={submission?.total_score ?? 0}
      existing={existing ?? null}
    />
  )
}
