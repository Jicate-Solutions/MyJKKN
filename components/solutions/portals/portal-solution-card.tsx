'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Hammer, BookOpen, Video, Calendar, ArrowRight } from 'lucide-react'
import type { SHSolutionWithClient, SolutionType, SolutionStatus } from '@/types/solutions'
import { formatDistanceToNow } from 'date-fns'

interface PortalSolutionCardProps {
  solution: SHSolutionWithClient
}

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string; label: string }> = {
  software: { icon: Hammer, color: 'text-blue-600 bg-blue-50', label: 'Software' },
  training: { icon: BookOpen, color: 'text-green-600 bg-green-50', label: 'Training' },
  content: { icon: Video, color: 'text-purple-600 bg-purple-50', label: 'Content' },
}

const statusConfig: Record<SolutionStatus, { color: string; label: string }> = {
  active: { color: 'bg-emerald-100 text-emerald-700', label: 'Active' },
  on_hold: { color: 'bg-amber-100 text-amber-700', label: 'On Hold' },
  completed: { color: 'bg-blue-100 text-blue-700', label: 'Completed' },
  cancelled: { color: 'bg-red-100 text-red-700', label: 'Cancelled' },
  in_amc: { color: 'bg-indigo-100 text-indigo-700', label: 'In AMC' },
}

// Calculate solution progress based on status and type
function getSolutionProgress(solution: SHSolutionWithClient): number {
  if (solution.status === 'completed') return 100
  if (solution.status === 'cancelled') return 0
  if (solution.status === 'in_amc') return 100

  // For active/on_hold, estimate based on type
  switch (solution.solution_type) {
    case 'software':
      // Would calculate from phase statuses
      return 50
    case 'training':
      // Would calculate from session completion
      return 60
    case 'content':
      // Would calculate from deliverable completion
      return 40
    default:
      return 0
  }
}

export function PortalSolutionCard({ solution }: PortalSolutionCardProps) {
  const config = typeConfig[solution.solution_type]
  const status = statusConfig[solution.status]
  const Icon = config.icon
  const progress = getSolutionProgress(solution)

  return (
    <Link href={`/solutions/portal/solutions/${solution.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className={`p-2 rounded-lg ${config.color.split(' ')[1]}`}>
              <Icon className={`h-5 w-5 ${config.color.split(' ')[0]}`} />
            </div>
            <Badge className={status.color} variant="secondary">
              {status.label}
            </Badge>
          </div>
          <CardTitle className="text-lg mt-3 group-hover:text-primary transition-colors">
            {solution.title}
          </CardTitle>
          <p className="text-xs text-muted-foreground font-mono">
            {solution.solution_code}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {solution.problem_statement && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {solution.problem_statement}
            </p>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {solution.created_at && (
                <span>
                  Started {formatDistanceToNow(new Date(solution.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
