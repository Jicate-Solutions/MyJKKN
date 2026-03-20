'use client'

import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyHighestLevelForEvent } from '@/hooks/startup-studio/use-progression'
import { getProgressionLevel, PROGRESSION_LEVELS } from '@/lib/constants/startup-studio/progression'
import { format } from 'date-fns'
import type { ProgressionLevelNumber } from '@/types/startup-studio'

interface Props {
  eventId: string
}

export function ProgressionLevelWidget({ eventId }: Props) {
  const { data: current, isLoading } = useMyHighestLevelForEvent(eventId)

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />

  if (!current) {
    return (
      <div className="rounded-xl border p-4 bg-muted/30">
        <p className="text-sm font-medium text-muted-foreground">Progression Level</p>
        <p className="text-xs text-muted-foreground mt-1">
          No level assigned yet. Levels are assigned after Demo Day verification.
        </p>
      </div>
    )
  }

  const levelConfig = getProgressionLevel(current.level as ProgressionLevelNumber)
  const progressPercent = ((current.level / 5) * 100)
  const nextLevel = current.level < 5
    ? PROGRESSION_LEVELS.find(p => p.level === current.level + 1)
    : null

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Progression Level</p>
        <span className="text-xs text-muted-foreground">Level {current.level} of 5</span>
      </div>

      <Progress value={progressPercent} className="h-2" />

      <div>
        <p className="font-semibold">{levelConfig?.name ?? current.level_name}</p>
        <p className="text-sm text-muted-foreground italic mt-0.5">
          &quot;{levelConfig?.identity}&quot;
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Achieved: {format(new Date(current.achieved_at), 'dd MMM yyyy')}
      </p>

      {nextLevel && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          <span className="font-medium text-foreground">Next: {nextLevel.name}</span>
          <span> — {nextLevel.test}</span>
        </div>
      )}
    </div>
  )
}
