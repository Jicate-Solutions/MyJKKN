'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
}

// Generic status badge for common statuses
export function StatusBadge({ status, variant = 'secondary', className }: StatusBadgeProps) {
  const statusMap: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: 'bg-green-100 text-green-800' },
    inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
    completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
    approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
    draft: { label: 'Draft', color: 'bg-slate-100 text-slate-800' },
    review: { label: 'In Review', color: 'bg-purple-100 text-purple-800' },
    on_hold: { label: 'On Hold', color: 'bg-amber-100 text-amber-800' },
  }

  const config = statusMap[status] || { label: status, color: '' }

  return (
    <Badge
      variant={variant}
      className={cn('border-0', config.color, className)}
    >
      {config.label}
    </Badge>
  )
}
