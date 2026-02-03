'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SolutionStatusBadge } from './solution-status-badge'
import { Hammer, BookOpen, Video, Calendar, DollarSign, Building2 } from 'lucide-react'
import type { SHSolutionWithClient, SolutionType } from '@/types/solutions'
import { formatDistanceToNow } from 'date-fns'

interface SolutionCardProps {
  solution: SHSolutionWithClient
}

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string; label: string }> = {
  software: { icon: Hammer, color: 'text-blue-600', label: 'Software' },
  training: { icon: BookOpen, color: 'text-green-600', label: 'Training' },
  content: { icon: Video, color: 'text-purple-600', label: 'Content' },
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function SolutionCard({ solution }: SolutionCardProps) {
  const config = typeConfig[solution.solution_type]
  const Icon = config.icon

  return (
    <Link href={`/solutions/${solution.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <Badge variant="outline" className="text-xs">
                {config.label}
              </Badge>
            </div>
            <SolutionStatusBadge status={solution.status} />
          </div>
          <CardTitle className="text-lg line-clamp-1 mt-2">{solution.title}</CardTitle>
          <CardDescription className="text-xs font-mono">
            {solution.solution_code}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {solution.problem_statement && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {solution.problem_statement}
            </p>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {solution.client && (
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                <span className="truncate max-w-[120px]">{solution.client.name}</span>
              </div>
            )}

            {solution.final_price && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>{formatCurrency(solution.final_price)}</span>
              </div>
            )}

            {solution.created_at && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDistanceToNow(new Date(solution.created_at), { addSuffix: true })}</span>
              </div>
            )}
          </div>

          {solution.partner_discount_applied && solution.partner_discount_applied > 0 && (
            <Badge variant="secondary" className="text-xs">
              {Math.round(solution.partner_discount_applied * 100)}% Partner Discount
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
