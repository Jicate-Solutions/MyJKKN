'use client'

import { Badge } from '@/components/ui/badge'
import type { PhaseStatus } from '@/types/solutions'
import { cn } from '@/lib/utils'

interface PhaseStatusBadgeProps {
  status: PhaseStatus
  className?: string
}

const statusConfig: Record<
  PhaseStatus,
  { label: string; color: string }
> = {
  prospecting: { label: 'Prospecting', color: 'bg-slate-100 text-slate-800' },
  discovery: { label: 'Discovery', color: 'bg-blue-100 text-blue-800' },
  prd_writing: { label: 'PRD Writing', color: 'bg-indigo-100 text-indigo-800' },
  prototype_building: { label: 'Prototype', color: 'bg-violet-100 text-violet-800' },
  client_demo: { label: 'Client Demo', color: 'bg-purple-100 text-purple-800' },
  revisions: { label: 'Revisions', color: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-800' },
  deploying: { label: 'Deploying', color: 'bg-cyan-100 text-cyan-800' },
  training: { label: 'Training', color: 'bg-teal-100 text-teal-800' },
  live: { label: 'Live', color: 'bg-green-100 text-green-800' },
  in_amc: { label: 'In AMC', color: 'bg-sky-100 text-sky-800' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
  on_hold: { label: 'On Hold', color: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
}

export function PhaseStatusBadge({ status, className }: PhaseStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-0 font-medium',
        config.color,
        className
      )}
    >
      {config.label}
    </Badge>
  )
}

// Export config for use in selects
export { statusConfig as phaseStatusConfig }
