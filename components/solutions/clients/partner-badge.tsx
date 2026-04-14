'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PartnerStatus } from '@/types/solutions'

interface PartnerBadgeProps {
  status: PartnerStatus
  showDiscount?: boolean
  className?: string
}

// Partner status display configuration
const partnerConfig: Record<PartnerStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className: string
  discount: number
}> = {
  yi: {
    label: 'YI Partner',
    variant: 'default',
    className: 'bg-blue-600 hover:bg-blue-700',
    discount: 50,
  },
  alumni: {
    label: 'Alumni',
    variant: 'default',
    className: 'bg-purple-600 hover:bg-purple-700',
    discount: 50,
  },
  mou: {
    label: 'MoU Partner',
    variant: 'default',
    className: 'bg-green-600 hover:bg-green-700',
    discount: 50,
  },
  referral: {
    label: 'Referral Partner',
    variant: 'default',
    className: 'bg-orange-600 hover:bg-orange-700',
    discount: 50,
  },
  standard: {
    label: 'Standard',
    variant: 'secondary',
    className: '',
    discount: 0,
  },
}

export function PartnerBadge({
  status,
  showDiscount = false,
  className,
}: PartnerBadgeProps) {
  const config = partnerConfig[status]

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
      {showDiscount && config.discount > 0 && (
        <span className="ml-1 opacity-80">({config.discount}% off)</span>
      )}
    </Badge>
  )
}

// Helper to get partner discount
export function getPartnerDiscount(status: PartnerStatus): number {
  return partnerConfig[status].discount
}

// Helper to check if status is a partner
export function isPartnerStatus(status: PartnerStatus): boolean {
  return status !== 'standard'
}
