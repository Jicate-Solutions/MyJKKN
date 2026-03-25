'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

const daysBetween = (start: string, end: string): number => {
  const startMs = new Date(start + 'T00:00:00').getTime()
  const endMs = new Date(end + 'T00:00:00').getTime()
  return Math.round(Math.abs(endMs - startMs) / (1000 * 60 * 60 * 24))
}

interface PendingDateRangeWarningBannerProps {
  startDate: string
  endDate: string
}

export function PendingDateRangeWarningBanner({ startDate, endDate }: PendingDateRangeWarningBannerProps) {
  const days = daysBetween(startDate, endDate)

  if (days <= 30) return null

  return (
    <Alert className="border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertDescription>
        Showing more than 30 days may be slow for large institutions. Consider narrowing your filters.
      </AlertDescription>
    </Alert>
  )
}
