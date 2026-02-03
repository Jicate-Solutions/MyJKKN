'use client'

import { Badge } from '@/components/ui/badge'
import type { MouStatus } from '@/types/solutions'
import { cn } from '@/lib/utils'

interface MouStatusBadgeProps {
  status: MouStatus
  className?: string
}

const statusConfig: Record<MouStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-800' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  signed: { label: 'Signed', color: 'bg-emerald-100 text-emerald-800' },
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-800' },
  renewed: { label: 'Renewed', color: 'bg-purple-100 text-purple-800' },
}

export function MouStatusBadge({ status, className }: MouStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge
      variant="outline"
      className={cn('border-0 font-medium', config.color, className)}
    >
      {config.label}
    </Badge>
  )
}

// Export config for use in selects
export { statusConfig as mouStatusConfig }
