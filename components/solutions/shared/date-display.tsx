'use client'

import { format, formatDistanceToNow, isToday, isYesterday, isTomorrow } from 'date-fns'
import { cn } from '@/lib/utils'

interface DateDisplayProps {
  date: string | Date | null | undefined
  format?: string
  showRelative?: boolean
  className?: string
}

export function DateDisplay({
  date,
  format: formatString = 'MMM dd, yyyy',
  showRelative = false,
  className,
}: DateDisplayProps) {
  if (!date) {
    return <span className={cn('text-muted-foreground', className)}>-</span>
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (showRelative) {
    return (
      <span className={className}>
        {formatDistanceToNow(dateObj, { addSuffix: true })}
      </span>
    )
  }

  return <span className={className}>{format(dateObj, formatString)}</span>
}

// Smart date that shows "Today", "Yesterday", etc.
export function SmartDate({ date, className }: { date: string | Date | null | undefined; className?: string }) {
  if (!date) {
    return <span className={cn('text-muted-foreground', className)}>-</span>
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isToday(dateObj)) {
    return <span className={cn('text-green-600 font-medium', className)}>Today</span>
  }
  if (isYesterday(dateObj)) {
    return <span className={className}>Yesterday</span>
  }
  if (isTomorrow(dateObj)) {
    return <span className={cn('text-blue-600', className)}>Tomorrow</span>
  }

  return <span className={className}>{format(dateObj, 'MMM dd, yyyy')}</span>
}

// Date with time
export function DateTime({ date, className }: { date: string | Date | null | undefined; className?: string }) {
  if (!date) {
    return <span className={cn('text-muted-foreground', className)}>-</span>
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date

  return (
    <span className={className}>
      {format(dateObj, 'MMM dd, yyyy')} at {format(dateObj, 'h:mm a')}
    </span>
  )
}
