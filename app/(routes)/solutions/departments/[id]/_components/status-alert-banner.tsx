'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, XCircle, CheckCircle2, Clock } from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface StatusAlertBannerProps {
  status: 'pending_approval' | 'active' | 'at_risk' | 'dormant';
  lastRevenueAt: string | null;
  departmentName: string;
}

// ============================================
// HELPERS
// ============================================

function monthsSince(date: string | null): number {
  if (!date) return 99; // Never had revenue
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
}

// ============================================
// COMPONENT
// ============================================

export function StatusAlertBanner({ status, lastRevenueAt, departmentName }: StatusAlertBannerProps) {
  const months = monthsSince(lastRevenueAt);

  if (status === 'active') {
    // Subtle success banner for active departments
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-200">Active</AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          {departmentName} is actively generating revenue.
          {lastRevenueAt && months > 0 && (
            <span> Last revenue recorded {months} month{months !== 1 ? 's' : ''} ago.</span>
          )}
          {lastRevenueAt && months === 0 && (
            <span> Revenue recorded this month.</span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'at_risk') {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">At Risk</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          {departmentName} has not generated revenue in{' '}
          {months > 0 ? `${months} month${months !== 1 ? 's' : ''}` : 'a while'}.
          Generate revenue to maintain active status.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'dormant') {
    return (
      <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertTitle className="text-red-800 dark:text-red-200">Dormant</AlertTitle>
        <AlertDescription className="text-red-700 dark:text-red-300">
          {departmentName} is DORMANT. No revenue for 3+ months.
          Any new revenue will auto-reactivate this department.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'pending_approval') {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">Pending Approval</AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          Awaiting Director approval to activate as Solution Department.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
