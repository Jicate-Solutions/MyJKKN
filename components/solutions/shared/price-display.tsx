'use client'

import { cn } from '@/lib/utils'

interface PriceDisplayProps {
  amount: number | null | undefined
  currency?: string
  locale?: string
  className?: string
  showSign?: boolean
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: string = 'INR',
  locale: string = 'en-IN'
): string {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function PriceDisplay({
  amount,
  currency = 'INR',
  locale = 'en-IN',
  className,
  showSign = false,
}: PriceDisplayProps) {
  if (amount === null || amount === undefined) {
    return <span className={cn('text-muted-foreground', className)}>-</span>
  }

  const formatted = formatCurrency(amount, currency, locale)
  const isPositive = amount > 0
  const isNegative = amount < 0

  return (
    <span
      className={cn(
        'font-medium',
        showSign && isPositive && 'text-green-600',
        showSign && isNegative && 'text-red-600',
        className
      )}
    >
      {showSign && isPositive && '+'}
      {formatted}
    </span>
  )
}

// Compact version for small spaces
export function PriceCompact({ amount, className }: { amount: number | null | undefined; className?: string }) {
  if (amount === null || amount === undefined) return <span className={className}>-</span>

  if (amount >= 10000000) {
    return <span className={className}>{(amount / 10000000).toFixed(1)}Cr</span>
  }
  if (amount >= 100000) {
    return <span className={className}>{(amount / 100000).toFixed(1)}L</span>
  }
  if (amount >= 1000) {
    return <span className={className}>{(amount / 1000).toFixed(0)}K</span>
  }
  return <span className={className}>{amount}</span>
}
