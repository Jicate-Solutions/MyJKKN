'use client';

import { AlertCircle, AlertTriangle, Clock, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type AlertFilter =
  | 'all'
  | 'no-progress'
  | 'unresolved-blockers'
  | 'missed-commitments';

interface AlertsPanelProps {
  noProgressCount: number;
  unresolvedBlockerCount: number;
  missedCommitmentCount: number;
  activeFilter: AlertFilter;
  onFilterChange: (filter: AlertFilter) => void;
}

interface AlertItem {
  key: AlertFilter;
  icon: React.ReactNode;
  label: string;
  count: number;
  accent: string;
  activeAccent: string;
  description: string;
}

export function AlertsPanel({
  noProgressCount,
  unresolvedBlockerCount,
  missedCommitmentCount,
  activeFilter,
  onFilterChange,
}: AlertsPanelProps) {
  const items: AlertItem[] = [
    {
      key: 'no-progress',
      icon: <Clock className="h-4 w-4" />,
      label: 'No Progress',
      count: noProgressCount,
      accent:
        'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40',
      activeAccent:
        'border-l-amber-500 bg-amber-100 dark:bg-amber-950/60 ring-1 ring-amber-400/50',
      description: 'Paid users unchanged since last week',
    },
    {
      key: 'unresolved-blockers',
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Unresolved Blockers',
      count: unresolvedBlockerCount,
      accent:
        'border-l-red-500 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40',
      activeAccent:
        'border-l-red-500 bg-red-100 dark:bg-red-950/60 ring-1 ring-red-400/50',
      description: 'Teams reporting blockers they can\'t solve alone',
    },
    {
      key: 'missed-commitments',
      icon: <AlertCircle className="h-4 w-4" />,
      label: 'Missed Commitments',
      count: missedCommitmentCount,
      accent:
        'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20 hover:bg-orange-50 dark:hover:bg-orange-950/40',
      activeAccent:
        'border-l-orange-500 bg-orange-100 dark:bg-orange-950/60 ring-1 ring-orange-400/50',
      description: 'Teams that did not meet last week\'s commitment',
    },
  ];

  const totalIssues =
    noProgressCount + unresolvedBlockerCount + missedCommitmentCount;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Alerts
          {totalIssues > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              · {totalIssues} issue{totalIssues === 1 ? '' : 's'}
            </span>
          )}
        </h2>
        {activeFilter !== 'all' && (
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Filter className="h-3 w-3" />
            Clear filter
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const isActive = activeFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                onFilterChange(isActive ? 'all' : item.key)
              }
              disabled={item.count === 0}
              className="text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Card
                className={cn(
                  'border-l-4 transition-colors',
                  isActive ? item.activeAccent : item.accent,
                  item.count === 0 && 'bg-muted/20',
                )}
              >
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'shrink-0 mt-0.5',
                        item.count === 0
                          ? 'text-muted-foreground'
                          : 'text-foreground',
                      )}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums">
                          {item.count}
                        </span>
                        <span className="text-xs font-medium truncate">
                          {item.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
