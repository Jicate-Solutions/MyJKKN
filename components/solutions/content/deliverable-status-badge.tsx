'use client'

import { Badge } from '@/components/ui/badge'
import type { DeliverableStatus } from '@/types/solutions'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

interface DeliverableStatusBadgeProps {
  status: DeliverableStatus
  revisionCount?: number
  className?: string
}

const statusConfig: Record<
  DeliverableStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  review: { label: 'In Review', variant: 'outline' },
  revision: { label: 'Revision', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

const REVISION_FLAG_THRESHOLD = 3

export function DeliverableStatusBadge({
  status,
  revisionCount = 0,
  className,
}: DeliverableStatusBadgeProps) {
  const config = statusConfig[status]
  const isFlagged = revisionCount > REVISION_FLAG_THRESHOLD

  return (
    <div className="flex items-center gap-1">
      <Badge
        variant={config.variant}
        className={cn(
          status === 'in_progress' && 'bg-blue-100 text-blue-800 hover:bg-blue-100',
          status === 'approved' && 'bg-green-100 text-green-800 hover:bg-green-100',
          status === 'revision' && 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
          status === 'review' && 'bg-purple-100 text-purple-800 hover:bg-purple-100',
          className
        )}
      >
        {config.label}
      </Badge>
      {isFlagged && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {revisionCount} revisions
        </Badge>
      )}
    </div>
  )
}
