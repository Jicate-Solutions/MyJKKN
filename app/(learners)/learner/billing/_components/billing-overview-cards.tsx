'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  CheckCircle,
  Target,
  Activity,
  Wallet,
  Calendar
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { LearnerBillingStats } from '@/types/learner-billing';

interface BillingOverviewCardsProps {
  stats: LearnerBillingStats;
  loading?: boolean;
  onPayNow?: (amount: number) => void;
  onViewDetails?: (type: 'overdue' | 'unpaid' | 'paid') => void;
}

export function BillingOverviewCards({
  stats,
  loading = false,
  onPayNow,
  onViewDetails
}: BillingOverviewCardsProps) {
  if (loading) {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6'>
        {[...Array(4)].map((_, i) => (
          <Card key={i} className='animate-pulse border-0 shadow-md'>
            <CardHeader className='pb-2 p-4 sm:p-6'>
              <div className='h-4 bg-gray-200 rounded w-3/4'></div>
            </CardHeader>
            <CardContent className='p-4 sm:p-6 pt-0'>
              <div className='space-y-3'>
                <div className='h-8 bg-gray-200 rounded w-1/2'></div>
                <div className='h-2 bg-gray-200 rounded'></div>
                <div className='h-3 bg-gray-200 rounded w-2/3'></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const paymentPercentage = stats.total_amount_billed > 0
    ? (stats.total_amount_paid / stats.total_amount_billed) * 100
    : 0;

  const overallHealthScore = Math.max(0, 100 - (stats.overdue_bills * 25));

  const cards = [
    {
      id: 'total-amount',
      title: 'Total Amount',
      value: formatCurrency(stats.total_amount_billed),
      subtitle: `${stats.total_bills} bills`,
      icon: DollarSign,
      iconColor: 'text-[#0b6d41]',
      iconBg: 'bg-green-100',
      trend: {
        value: paymentPercentage,
        label: `${paymentPercentage.toFixed(1)}% paid`,
        isPositive: paymentPercentage > 75
      },
      progress: {
        value: paymentPercentage,
        color: paymentPercentage > 75 ? 'bg-[#0b6d41]' : paymentPercentage > 50 ? 'bg-[#ffde59]' : 'bg-red-500'
      },
      action: {
        label: 'View Bills',
        onClick: () => onViewDetails?.('paid')
      }
    },
    {
      id: 'outstanding',
      title: 'Outstanding',
      value: formatCurrency(stats.outstanding_amount),
      subtitle: `${stats.unpaid_bills + stats.overdue_bills} pending`,
      icon: Wallet,
      iconColor: stats.outstanding_amount > 0 ? 'text-yellow-600' : 'text-[#0b6d41]',
      iconBg: stats.outstanding_amount > 0 ? 'bg-[#ffde59]/20' : 'bg-green-100',
      trend: {
        value: stats.overdue_amount,
        label: stats.overdue_bills > 0
          ? `₹${stats.overdue_amount.toFixed(0)} overdue`
          : 'All up to date',
        isPositive: stats.overdue_bills === 0
      },
      progress: {
        value: stats.outstanding_amount > 0
          ? (stats.overdue_amount / stats.outstanding_amount) * 100
          : 0,
        color: stats.overdue_bills > 0 ? 'bg-red-500' : 'bg-[#0b6d41]'
      },
      action: {
        label: stats.outstanding_amount > 0 ? 'Pay Now' : 'View Details',
        onClick: stats.outstanding_amount > 0
          ? () => onPayNow?.(stats.outstanding_amount)
          : () => onViewDetails?.('unpaid'),
        variant: stats.outstanding_amount > 0 ? 'default' : 'outline'
      }
    },
    {
      id: 'overdue',
      title: 'Overdue Bills',
      value: stats.overdue_bills.toString(),
      subtitle: formatCurrency(stats.overdue_amount),
      icon: AlertTriangle,
      iconColor: stats.overdue_bills > 0 ? 'text-red-600' : 'text-[#0b6d41]',
      iconBg: stats.overdue_bills > 0 ? 'bg-red-100' : 'bg-green-100',
      trend: {
        value: stats.overdue_bills,
        label: stats.overdue_bills > 0
          ? 'Immediate action required'
          : 'No overdue payments',
        isPositive: stats.overdue_bills === 0
      },
      alert: stats.overdue_bills > 0,
      action: {
        label: stats.overdue_bills > 0 ? 'Pay Overdue' : 'All Clear',
        onClick: () => onViewDetails?.('overdue'),
        variant: stats.overdue_bills > 0 ? 'destructive' : 'outline'
      }
    },
    {
      id: 'health-score',
      title: 'Payment Health',
      value: `${overallHealthScore}%`,
      subtitle: getHealthStatus(overallHealthScore),
      icon: Activity,
      iconColor: getHealthColor(overallHealthScore),
      iconBg: getHealthBgColor(overallHealthScore),
      trend: {
        value: stats.paid_bills,
        label: `${stats.paid_bills} bills paid`,
        isPositive: true
      },
      progress: {
        value: overallHealthScore,
        color: overallHealthScore > 80 ? 'bg-[#0b6d41]' : overallHealthScore > 60 ? 'bg-[#ffde59]' : 'bg-red-500'
      },
      badge: {
        text: getHealthBadge(overallHealthScore),
        variant: overallHealthScore > 80 ? 'default' : overallHealthScore > 60 ? 'secondary' : 'destructive'
      }
    }
  ];

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6'>
      {cards.map((card) => (
        <Card
          key={card.id}
          className={`border-0 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 ${
            card.alert
              ? 'ring-2 ring-red-300 bg-gradient-to-br from-red-50 via-rose-50 to-pink-50'
              : getCardGradient(card.id)
          }`}
        >
          <CardHeader className='pb-2 sm:pb-3 p-3 sm:p-4 lg:p-6'>
            <div className='flex items-start justify-between'>
              <div className='flex items-center gap-2 sm:gap-3'>
                <div className={`p-2 sm:p-3 rounded-full ${card.iconBg} shadow-md`}>
                  <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${card.iconColor}`} />
                </div>
                <div className='min-w-0 flex-1'>
                  <CardTitle className='text-xs sm:text-sm font-medium text-gray-700 truncate'>
                    {card.title}
                  </CardTitle>
                  {card.badge && (
                    <Badge variant={card.badge.variant as any} className='mt-1 text-xs inline-block'>
                      {card.badge.text}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className='p-3 sm:p-4 lg:p-6 pt-0'>
            <div className='space-y-3 sm:space-y-4'>
              {/* Main Value */}
              <div className='text-center sm:text-left'>
                <div className='text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1 break-words'>
                  {card.value}
                </div>
                <div className='text-xs sm:text-sm text-gray-600'>
                  {card.subtitle}
                </div>
              </div>

              {/* Progress Bar */}
              {card.progress && (
                <div className='space-y-2'>
                  <Progress
                    value={card.progress.value}
                    className='h-2 sm:h-3 bg-gray-200'
                  />
                  <div className='flex justify-between text-xs text-gray-500'>
                    <span>0%</span>
                    <span className='font-medium'>{card.progress.value.toFixed(0)}%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Trend Information */}
              <div className='flex items-center justify-center sm:justify-start gap-2'>
                <div className={`p-1 rounded-full ${
                  card.trend.isPositive ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {card.trend.isPositive ? (
                    <TrendingUp className='h-3 w-3 sm:h-4 sm:w-4 text-[#0b6d41]' />
                  ) : (
                    <TrendingDown className='h-3 w-3 sm:h-4 sm:w-4 text-red-600' />
                  )}
                </div>
                <span className={`text-xs sm:text-sm font-medium ${
                  card.trend.isPositive ? 'text-[#0b6d41]' : 'text-red-700'
                }`}>
                  {card.trend.label}
                </span>
              </div>

              {/* Action Button */}
              {card.action && (
                <Button
                  size='sm'
                  variant={card.action.variant as any || 'outline'}
                  onClick={card.action.onClick}
                  className='w-full mt-2 sm:mt-3 text-xs sm:text-sm py-2 sm:py-3 font-medium shadow-md hover:shadow-lg transition-all duration-200'
                >
                  {card.action.label}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Helper functions
function getHealthStatus(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs Attention';
}

function getHealthColor(score: number): string {
  if (score >= 80) return 'text-[#0b6d41]';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getHealthBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100';
  if (score >= 60) return 'bg-[#ffde59]/20';
  return 'bg-red-100';
}

function getHealthBadge(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Poor';
}

function getCardGradient(cardId: string): string {
  const gradients = {
    'total-amount': 'bg-gradient-to-br from-green-50 via-gray-50 to-green-100 border-green-200',
    'outstanding': 'bg-gradient-to-br from-yellow-50 via-gray-50 to-[#ffde59]/30 border-yellow-200',
    'overdue': 'bg-gradient-to-br from-red-50 via-gray-50 to-red-100 border-red-200',
    'health-score': 'bg-gradient-to-br from-green-50 via-gray-50 to-green-100 border-green-200'
  };
  return gradients[cardId as keyof typeof gradients] || 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200';
}