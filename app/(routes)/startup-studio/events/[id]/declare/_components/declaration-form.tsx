'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TrackCard } from './track-card'
import { TRACKS } from '@/lib/constants/startup-studio/tracks'
import {
  useDeclareTrack,
  useUpdateTrackDeclaration,
} from '@/hooks/startup-studio/use-track-declarations'
import type { TrackId, TrackDeclaration } from '@/types/startup-studio'

interface DeclarationFormProps {
  eventId: string
  registrationId: string
  teamName: string
  appathonScore: number
  existing: TrackDeclaration | null
}

export function DeclarationForm({
  eventId,
  registrationId,
  teamName,
  appathonScore,
  existing,
}: DeclarationFormProps) {
  const DRAFT_KEY = `track_declaration_draft_${eventId}_${registrationId}`

  const [selectedTrack, setSelectedTrack] = useState<TrackId | null>(
    existing?.track ?? null
  )
  const [reason, setReason] = useState(existing?.reason ?? '')

  // Restore draft from localStorage if no existing declaration
  useEffect(() => {
    if (!existing) {
      try {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.track) setSelectedTrack(parsed.track)
          if (parsed.reason) setReason(parsed.reason)
        }
      } catch {}
    }
  }, [existing, DRAFT_KEY])

  // Auto-save draft on change
  useEffect(() => {
    if (!existing && selectedTrack) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ track: selectedTrack, reason }))
    }
  }, [selectedTrack, reason, existing, DRAFT_KEY])

  const declare = useDeclareTrack(eventId, registrationId)
  const update = useUpdateTrackDeclaration(eventId, registrationId)

  const isWithin7Days = existing
    ? new Date(existing.declared_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    : true

  const isLocked = !!existing && !isWithin7Days
  const isPending = declare.isPending || update.isPending

  async function handleSubmit() {
    if (!selectedTrack) return

    try {
      if (existing && isWithin7Days) {
        await update.mutateAsync({
          id: existing.id,
          dto: { track: selectedTrack, reason: reason || undefined },
        })
        toast.success(
          `Track updated to ${TRACKS.find(t => t.id === selectedTrack)?.label ?? selectedTrack}!`
        )
      } else if (!existing) {
        await declare.mutateAsync({
          event_id: eventId,
          team_id: registrationId,
          track: selectedTrack,
          reason: reason || undefined,
        })
        toast.success(
          `Welcome to ${TRACKS.find(t => t.id === selectedTrack)?.label ?? selectedTrack}!`
        )
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      // Errors are already handled by the mutation's onError toast
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground space-y-1">
        <p>Team: <span className="text-foreground font-medium">{teamName}</span></p>
        <p>Appathon Score: <span className="text-foreground font-medium">{appathonScore} pts</span></p>
      </div>

      {isLocked && (
        <Alert>
          <AlertDescription>
            Declaration window closed. Your track is set to{' '}
            <strong>{TRACKS.find(t => t.id === existing?.track)?.label ?? existing?.track}</strong>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {TRACKS.map(track => (
          <TrackCard
            key={track.id}
            trackId={track.id}
            selected={selectedTrack === track.id}
            onSelect={setSelectedTrack}
            disabled={isLocked || isPending}
          />
        ))}
      </div>

      {!isLocked && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">
              Why did you choose this track?{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="In 1-2 sentences, why is this the right path for your team?"
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 300))}
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/300</p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!selectedTrack || isPending}
            className="w-full"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending
              ? 'Submitting...'
              : existing
              ? 'Update Track Choice'
              : 'Submit Declaration'}
          </Button>
        </div>
      )}
    </div>
  )
}
