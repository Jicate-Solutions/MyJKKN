'use client'

import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface EvaluatorProgressBarProps {
  total: number
  verified: number
  flagged: number
}

export function EvaluatorProgressBar({ total, verified, flagged }: EvaluatorProgressBarProps) {
  const completed = verified + flagged
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completed} of {total} teams evaluated
        </span>
        <div className="flex gap-2">
          <Badge className="bg-green-500">{verified} verified</Badge>
          {flagged > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-400">
              {flagged} flagged
            </Badge>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  )
}
