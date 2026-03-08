'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TeamVoteCardProps {
  teamName: string
  appName: string | null
  institutionName: string
  demoSlot: number | null
  slotIndex: number           // fallback display number if demoSlot is null
  totalVotes: number
  averageRating: number       // e.g. 4.2, 0 means no votes yet
  myRating: number            // 0 = not voted yet
  onVote: (rating: number) => void
  isSubmitting: boolean
  votingOpen: boolean
}

export function TeamVoteCard({
  teamName,
  appName,
  institutionName,
  demoSlot,
  slotIndex,
  totalVotes,
  averageRating,
  myRating,
  onVote,
  isSubmitting,
  votingOpen,
}: TeamVoteCardProps) {
  const [hovered, setHovered] = useState(0)

  const displaySlot = demoSlot ?? slotIndex

  return (
    <Card className={cn(
      'transition-colors',
      myRating > 0 && 'border-primary/40 bg-primary/5'
    )}>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header: team info + live vote count */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                #{displaySlot}
              </span>
              <p className="font-semibold text-sm leading-tight">{teamName}</p>
            </div>
            {appName && (
              <p className="text-xs text-muted-foreground mt-0.5">{appName}</p>
            )}
            <p className="text-xs text-muted-foreground">{institutionName}</p>
          </div>

          {/* Live vote count */}
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold tabular-nums">
                {totalVotes > 0 ? averageRating.toFixed(1) : '—'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </p>
          </div>
        </div>

        {/* Star rating input */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={!votingOpen || isSubmitting}
              onClick={() => onVote(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className={cn(
                'p-0.5 rounded transition-transform',
                votingOpen && !isSubmitting
                  ? 'hover:scale-110 cursor-pointer'
                  : 'cursor-not-allowed opacity-50'
              )}
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
            >
              <Star
                className={cn(
                  'h-6 w-6 transition-colors',
                  (hovered || myRating) >= star
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-muted text-muted-foreground/40'
                )}
              />
            </button>
          ))}
          {myRating > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Your vote: {myRating}★
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
