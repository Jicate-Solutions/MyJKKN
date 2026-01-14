'use client';

/**
 * Empty State Component
 * Created: 2026-01-14
 * Description: Display empty states for various timetable scenarios
 */

import { EmptyStateType } from '@/types/student-portal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CalendarX2,
  Coffee,
  Calendar,
  AlertCircle,
  UserX
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  type: EmptyStateType;
  onRetry?: () => void;
}

interface EmptyStateConfig {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: 'onRetry' | 'contact';
  } | null;
}

const EMPTY_STATES: Record<EmptyStateType, EmptyStateConfig> = {
  'no-timetable': {
    icon: CalendarX2,
    title: 'No Timetable Found',
    message: 'No timetable has been created for your section yet. Please contact your administration for assistance.',
    action: null
  },
  'no-section': {
    icon: UserX,
    title: 'Section Not Assigned',
    message: 'Your section has not been assigned yet. Please contact your administration to complete your enrollment.',
    action: null
  },
  'weekend': {
    icon: Coffee,
    title: "It's Sunday!",
    message: 'No classes today. Enjoy your day off and recharge for the week ahead!',
    action: null
  },
  'no-classes': {
    icon: Calendar,
    title: 'No Classes Today',
    message: 'No classes scheduled for today. Use this time to catch up on your studies or prepare for upcoming classes!',
    action: null
  },
  'error': {
    icon: AlertCircle,
    title: 'Failed to Load',
    message: 'Unable to load your timetable at this time. Please check your internet connection and try again.',
    action: {
      label: 'Retry',
      onClick: 'onRetry'
    }
  }
};

export function EmptyState({ type, onRetry }: EmptyStateProps) {
  const config = EMPTY_STATES[type];
  const Icon = config.icon;

  const handleAction = () => {
    if (config.action?.onClick === 'onRetry' && onRetry) {
      onRetry();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Icon className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">{config.title}</CardTitle>
            <CardDescription className="mt-2 text-base leading-relaxed">
              {config.message}
            </CardDescription>
          </div>
        </CardHeader>
        {config.action && (
          <CardContent className="flex justify-center pb-6">
            <Button onClick={handleAction} variant="default" size="lg">
              {config.action.label}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
