'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { SplitType, CalculatedSplit } from '@/types/solutions'

// Revenue split configurations
export const REVENUE_SPLIT_CONFIGS: Record<SplitType, Record<string, number>> = {
  software: {
    jicate: 40,
    department: 40,
    institution: 20,
  },
  training_track_a: {
    cohort: 60,
    council: 20,
    infrastructure: 20,
  },
  training_track_b: {
    cohort: 30,
    department: 20,
    jicate: 30,
    institution: 20,
  },
  content: {
    learners: 60,
    council: 20,
    infrastructure: 20,
  },
}

interface RevenueSplitDisplayProps {
  splitType: SplitType
  amount?: number
  hodDiscount?: number
  isFirstPhase?: boolean
  hasReferral?: boolean
  showConfig?: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const splitTypeLabels: Record<SplitType, string> = {
  software: 'Software Solutions (40-40-20)',
  training_track_a: 'Training Track A - Community (60-20-20)',
  training_track_b: 'Training Track B - Corporate (30-20-30-20)',
  content: 'Content Production (60-20-20)',
}

const recipientColors: Record<string, string> = {
  jicate: 'bg-blue-500',
  department: 'bg-green-500',
  institution: 'bg-purple-500',
  cohort: 'bg-orange-500',
  council: 'bg-cyan-500',
  infrastructure: 'bg-gray-500',
  learners: 'bg-pink-500',
  referral_bonus: 'bg-yellow-500',
}

// Calculate revenue splits
export function calculateRevenueSplits(
  amount: number,
  splitType: SplitType,
  options: {
    hodDiscount?: number
    isFirstPhase?: boolean
    hasReferral?: boolean
  } = {}
): {
  splits: CalculatedSplit[]
  hodDiscountApplied: number
  referralBonusApplied: number
} {
  const config = REVENUE_SPLIT_CONFIGS[splitType]
  const { hodDiscount = 0, hasReferral = false } = options

  let hodDiscountApplied = 0
  let referralBonusApplied = 0
  const splits: CalculatedSplit[] = []

  Object.entries(config).forEach(([recipientType, percentage]) => {
    let splitAmount = (amount * percentage) / 100

    // Apply HOD discount from department share
    if (recipientType === 'department' && hodDiscount > 0) {
      const discount = (splitAmount * hodDiscount) / 100
      hodDiscountApplied = discount
      splitAmount -= discount
    }

    // Apply referral bonus from department share
    if (recipientType === 'department' && hasReferral) {
      const bonus = splitAmount * 0.1 // 10% referral bonus
      referralBonusApplied = bonus
      splitAmount -= bonus
    }

    splits.push({
      recipientType,
      recipientName: recipientType.charAt(0).toUpperCase() + recipientType.slice(1),
      amount: splitAmount,
      percentage,
    })
  })

  // Add referral bonus as separate entry if applicable
  if (referralBonusApplied > 0) {
    splits.push({
      recipientType: 'referral_bonus',
      recipientName: 'Referral Bonus',
      amount: referralBonusApplied,
      percentage: 0,
    })
  }

  return { splits, hodDiscountApplied, referralBonusApplied }
}

export function RevenueSplitDisplay({
  splitType,
  amount,
  hodDiscount = 0,
  isFirstPhase = false,
  hasReferral = false,
  showConfig = true,
}: RevenueSplitDisplayProps) {
  const config = REVENUE_SPLIT_CONFIGS[splitType]
  const hasAmount = amount !== undefined && amount > 0

  // Calculate actual splits if amount provided
  const result = hasAmount
    ? calculateRevenueSplits(amount, splitType, {
        hodDiscount,
        isFirstPhase,
        hasReferral,
      })
    : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Revenue Split</span>
          <Badge variant="outline">{splitTypeLabels[splitType]}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {showConfig && !hasAmount && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Standard split configuration:
            </p>
            {Object.entries(config).map(([key, percentage]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{key.replace('_', ' ')}</span>
                  <span className="font-medium">{percentage}%</span>
                </div>
                <Progress
                  value={percentage}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        )}

        {hasAmount && result && (
          <div className="space-y-4">
            <div className="text-center pb-2 border-b">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold">{formatCurrency(amount)}</p>
            </div>

            {result.hodDiscountApplied > 0 && (
              <div className="flex justify-between text-sm text-orange-600 bg-orange-50 p-2 rounded">
                <span>HOD Discount Applied</span>
                <span>-{formatCurrency(result.hodDiscountApplied)}</span>
              </div>
            )}

            {result.referralBonusApplied > 0 && (
              <div className="flex justify-between text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                <span>Referral Bonus (from dept share)</span>
                <span>{formatCurrency(result.referralBonusApplied)}</span>
              </div>
            )}

            <div className="space-y-3">
              {result.splits.map((split: CalculatedSplit) => (
                <div key={split.recipientType} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          recipientColors[split.recipientType] || 'bg-primary'
                        }`}
                      />
                      {split.recipientName}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(split.amount)}
                      <span className="text-muted-foreground ml-1">
                        ({split.percentage}%)
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={split.percentage}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Compact version for tables
export function RevenueSplitBadges({ splitType }: { splitType: SplitType }) {
  const config = REVENUE_SPLIT_CONFIGS[splitType]

  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(config).map(([key, percentage]) => (
        <Badge key={key} variant="outline" className="text-xs">
          {key.charAt(0).toUpperCase() + key.slice(1)}: {percentage}%
        </Badge>
      ))}
    </div>
  )
}
