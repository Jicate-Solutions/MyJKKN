'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PhaseStatusBadge } from './phase-status-badge'
import {
  Calendar,
  DollarSign,
  Building2,
  Users,
  FileText,
  ExternalLink,
  GitBranch,
} from 'lucide-react'
import type { SHPhaseWithDetails } from '@/types/solutions'
import { formatDistanceToNow, format } from 'date-fns'

interface PhaseCardProps {
  phase: SHPhaseWithDetails
  showSolution?: boolean
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function PhaseCard({ phase, showSolution = false }: PhaseCardProps) {
  return (
    <Card className="transition-all hover:shadow-md hover:border-muted-foreground/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              Phase {phase.phase_number}
            </Badge>
            <PhaseStatusBadge status={phase.status} />
          </div>
          {phase.estimated_value && (
            <div className="flex items-center gap-1 text-sm font-medium">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              {formatCurrency(phase.estimated_value)}
            </div>
          )}
        </div>
        <CardTitle className="text-lg line-clamp-1 mt-2">{phase.title}</CardTitle>
        {showSolution && phase.solution && (
          <CardDescription className="text-xs">
            <Link
              href={`/solutions/${phase.solution.id}`}
              className="hover:underline text-primary"
            >
              {phase.solution.solution_code} - {phase.solution.title}
            </Link>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {phase.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {phase.description}
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {phase.solution?.client && (
            <div className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              <span className="truncate max-w-[120px]">{phase.solution.client.name}</span>
            </div>
          )}

          {phase.assignments && phase.assignments.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{phase.assignments.length} builder(s)</span>
            </div>
          )}

          {phase.iterations && phase.iterations.length > 0 && (
            <div className="flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              <span>v{phase.iterations[0].version}</span>
            </div>
          )}

          {phase.target_completion && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(phase.target_completion), 'dd MMM yyyy')}</span>
            </div>
          )}
        </div>

        {/* URLs */}
        <div className="flex flex-wrap gap-2">
          {phase.prd_url && (
            <a
              href={phase.prd_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              PRD
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {phase.prototype_url && (
            <a
              href={phase.prototype_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <GitBranch className="h-3 w-3" />
              Prototype
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {phase.production_url && (
            <a
              href={phase.production_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Production
            </a>
          )}
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t">
          Created {formatDistanceToNow(new Date(phase.created_at), { addSuffix: true })}
        </div>
      </CardContent>
    </Card>
  )
}
