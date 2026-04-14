'use client'

import { Badge } from '@/components/ui/badge'
import type { SolutionStatus } from '@/types/solutions'
import { cn } from '@/lib/utils'

interface SolutionStatusBadgeProps {
  status: SolutionStatus
  className?: string
}

const statusConfig: Record<SolutionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  on_hold: { label: 'On Hold', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  in_amc: { label: 'In AMC', variant: 'default' },
}

export function SolutionStatusBadge({ status, className }: SolutionStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge
      variant={config.variant}
      className={cn(
        status === 'active' && 'bg-green-100 text-green-800 hover:bg-green-100',
        status === 'completed' && 'bg-blue-100 text-blue-800 hover:bg-blue-100',
        status === 'in_amc' && 'bg-purple-100 text-purple-800 hover:bg-purple-100',
        className
      )}
    >
      {config.label}
    </Badge>
  )
}
