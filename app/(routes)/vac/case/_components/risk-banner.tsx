'use client';

import { AlertTriangle, CheckCircle2, PartyPopper, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CASERiskLevel } from '@/types/case';

interface RiskBannerProps {
  riskLevel: CASERiskLevel;
}

interface RiskConfig {
  icon: React.ReactNode;
  message: string;
  className: string;
}

const RISK_CONFIG: Record<CASERiskLevel, RiskConfig> = {
  on_track: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    message: "You're on track! Keep up the great work.",
    className:
      'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  },
  at_risk: {
    icon: <AlertTriangle className="h-5 w-5" />,
    message: 'You need to pick up the pace to stay on schedule.',
    className:
      'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300',
  },
  critical: {
    icon: <XCircle className="h-5 w-5" />,
    message: 'Critical: Immediate action is needed to meet graduation requirements.',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  },
  overdue: {
    icon: <Clock className="h-5 w-5" />,
    message: 'Overdue: Please contact your CASE coordinator immediately.',
    className:
      'border-gray-400 bg-gray-900 text-white dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100',
  },
  completed: {
    icon: <PartyPopper className="h-5 w-5" />,
    message: 'Congratulations! All tracks are complete. You are graduation-ready!',
    className:
      'border-green-300 bg-green-100 text-green-900 dark:border-green-700 dark:bg-green-950/60 dark:text-green-200',
  },
};

export function RiskBanner({ riskLevel }: RiskBannerProps) {
  const config = RISK_CONFIG[riskLevel];

  if (!config) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-4 py-3',
        config.className
      )}
    >
      <span className="shrink-0">{config.icon}</span>
      <p className="text-sm font-medium">{config.message}</p>
    </div>
  );
}
