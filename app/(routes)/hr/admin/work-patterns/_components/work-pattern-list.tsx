'use client';

/**
 * Card list of an institution's work patterns.
 *
 * Each card shows the week (or "No week saved yet"), hours, member count and
 * leave-entitlement figures at a glance; clicking one opens its detail view.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DAY_OF_WEEK_OPTIONS, toHHMM } from '@/types/hr-shift-timings';
import type { WorkPatternSummary } from '@/types/hr-work-patterns';
import { cn } from '@/lib/utils';

import { PatternFormDialog } from './pattern-form-dialog';

interface Props {
  /** Null under "All institutions" — the create dialog then asks which one. */
  institutionId: string | null;
  institutions: ReadonlyArray<{ id: string; name: string }>;
  /** Show each card's institution (the "All institutions" listing). */
  showInstitution: boolean;
  patterns: WorkPatternSummary[];
  isLoading: boolean;
  onSelect: (patternId: string) => void;
}

export function WorkPatternList({
  institutionId,
  institutions,
  showInstitution,
  patterns,
  isLoading,
  onSelect,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {patterns.length} work pattern{patterns.length === 1 ? '' : 's'}
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add pattern
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : patterns.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No work patterns yet. A pattern is a named working week — e.g. a
            3-day week — with its own hours, leave figures and members. Add one
            to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {patterns.map((p) => {
            const hours =
              p.first_half_start && p.second_half_end
                ? `${toHHMM(p.first_half_start)}–${toHHMM(p.second_half_end)}`
                : null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className="block w-full text-left"
              >
                <Card className={cn('transition-colors hover:bg-muted/50', !p.is_active && 'opacity-70')}>
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
                        {showInstitution && (
                          <Badge variant="outline" className="font-normal">
                            {p.institution_name ?? 'Institution'}
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                      )}

                      {p.working_days.length === 0 ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          No week saved yet
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {DAY_OF_WEEK_OPTIONS.map((d) => (
                            <span
                              key={d.value}
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[11px] font-medium',
                                p.working_days.includes(d.value)
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-muted-foreground/50',
                              )}
                            >
                              {d.short}
                            </span>
                          ))}
                          {hours && (
                            <span className="ml-2 text-xs text-muted-foreground">{hours}</span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">
                          {p.member_count} member{p.member_count === 1 ? '' : 's'}
                        </Badge>
                        {p.entitlements.map((e) => (
                          <Badge key={e.leave_type_code} variant="secondary">
                            {e.leave_type_code} {e.entitled_days}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <PatternFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        institutionId={institutionId}
        institutions={institutions}
        onSaved={(saved) => onSelect(saved.id)}
      />
    </div>
  );
}
