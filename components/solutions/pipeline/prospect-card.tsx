'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PipelineStageBadge } from './pipeline-stage-badge';
import {
  Building2,
  User,
  IndianRupee,
  CalendarClock,
  Clock,
  Hammer,
  BookOpen,
  Video,
} from 'lucide-react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Prospect, SolutionType, SourceType } from '@/lib/services/solutions/types';

interface ProspectCardProps {
  prospect: Prospect;
  onClick?: () => void;
  compact?: boolean;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  placement: 'Placement',
  alumni: 'Alumni',
  clinical: 'Clinical',
  referral: 'Referral',
  direct: 'Direct',
  yi: 'Young Indians',
  intent: 'Intent',
};

const SOLUTION_CONFIG: Record<SolutionType, { icon: React.ElementType; label: string; color: string }> = {
  software: { icon: Hammer, label: 'Software', color: 'text-blue-600' },
  training: { icon: BookOpen, label: 'Training', color: 'text-green-600' },
  content: { icon: Video, label: 'Content', color: 'text-purple-600' },
};

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ProspectCard({ prospect, onClick, compact = false }: ProspectCardProps) {
  const daysSinceContact = prospect.last_contact_date
    ? differenceInDays(new Date(), new Date(prospect.last_contact_date))
    : null;

  const isOverdue = daysSinceContact !== null && daysSinceContact > 7;

  const solutionConfig = prospect.solution_type_interest
    ? SOLUTION_CONFIG[prospect.solution_type_interest]
    : null;
  const SolutionIcon = solutionConfig?.icon;

  if (compact) {
    return (
      <Card
        className={cn(
          'cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50',
          isOverdue && 'border-red-200'
        )}
        onClick={onClick}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm line-clamp-1">{prospect.company_name}</p>
            {prospect.expected_deal_size ? (
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {formatCurrency(prospect.expected_deal_size)}
              </span>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground line-clamp-1">
            {prospect.contact_person}
          </p>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {SOURCE_LABELS[prospect.source_type]}
              </Badge>
              {solutionConfig && SolutionIcon && (
                <SolutionIcon className={cn('h-3.5 w-3.5', solutionConfig.color)} />
              )}
            </div>
            {daysSinceContact !== null && (
              <span
                className={cn(
                  'text-[10px] flex items-center gap-0.5',
                  isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'
                )}
              >
                <Clock className="h-3 w-3" />
                {daysSinceContact}d
              </span>
            )}
          </div>

          {prospect.next_action && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 border-t pt-1.5">
              {prospect.next_action}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50',
        isOverdue && 'border-red-200'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="font-semibold text-sm line-clamp-1">{prospect.company_name}</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground line-clamp-1">
                {prospect.contact_person}
              </p>
            </div>
          </div>
          <PipelineStageBadge stage={prospect.pipeline_stage} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {prospect.expected_deal_size ? (
            <div className="flex items-center gap-1 text-sm font-semibold">
              <IndianRupee className="h-3.5 w-3.5" />
              {formatCurrency(prospect.expected_deal_size).replace('₹', '')}
            </div>
          ) : null}

          {solutionConfig && SolutionIcon && (
            <Badge variant="outline" className="text-xs gap-1">
              <SolutionIcon className={cn('h-3 w-3', solutionConfig.color)} />
              {solutionConfig.label}
            </Badge>
          )}

          <Badge variant="outline" className="text-xs">
            {SOURCE_LABELS[prospect.source_type]}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
          {prospect.next_action ? (
            <div className="flex items-center gap-1 min-w-0">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{prospect.next_action}</span>
            </div>
          ) : (
            <span className="italic">No next action</span>
          )}

          {daysSinceContact !== null && (
            <span
              className={cn(
                'flex items-center gap-1 shrink-0 ml-2',
                isOverdue ? 'text-red-600 font-medium' : ''
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {daysSinceContact === 0
                ? 'Today'
                : `${daysSinceContact}d ago`}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
