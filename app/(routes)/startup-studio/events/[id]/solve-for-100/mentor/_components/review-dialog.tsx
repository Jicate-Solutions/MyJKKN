'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  History,
  Loader2,
  MessageSquare,
  Smartphone,
  Users,
  XCircle,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useTeamHistory } from '@/hooks/startup-studio/use-solve100-weekly';
import type { Solve100TeamRow } from '@/types/startup-studio';

interface ReviewDialogProps {
  team: Solve100TeamRow | null;
  currentWeek: number;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (checkinId: string, notes: string) => Promise<void>;
  isSubmitting: boolean;
}

const APP_STATUS_LABELS: Record<string, string> = {
  live: 'Live',
  needs_fixes: 'Needs Fixes',
  building: 'Building',
  pivoting: 'Pivoting',
};

export function ReviewDialog({
  team,
  currentWeek,
  eventId,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: ReviewDialogProps) {
  const [notes, setNotes] = useState('');
  const checkinId = team?.current_checkin?.id;

  // Reset notes when team changes / dialog opens
  useEffect(() => {
    if (open && team) {
      setNotes(team.current_checkin?.mentor_notes ?? '');
    }
    if (!open) setNotes('');
  }, [open, team]);

  // Pull team history to show past mentor notes. Only active when open.
  const { data: history = [], isLoading: historyLoading } = useTeamHistory(
    open ? eventId : '',
    open ? team?.team_id ?? '' : '',
  );

  const pastReviews = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return history
      .filter(
        (c: any) =>
          !!c?.mentor_notes && c?.id !== checkinId,
      )
      .sort((a: any, b: any) => (b.week_number ?? 0) - (a.week_number ?? 0));
  }, [history, checkinId]);

  if (!team) return null;

  const current = team.current_checkin;
  const previous = team.previous_checkin;

  const handleSubmit = async () => {
    if (!checkinId) {
      toast.error('No check-in to review');
      return;
    }
    const trimmed = notes.trim();
    if (!trimmed) {
      toast.error('Please write some feedback before marking reviewed');
      return;
    }
    try {
      await onSubmit(checkinId, trimmed);
      toast.success('Review submitted');
    } catch (err) {
      console.error('[startup-studio/solve-for-100/mentor] Review submission failed:', err);
      toast.error('Could not save review — please try again');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {team.team_name}
            {team.institution_name && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {team.institution_name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Week {currentWeek} check-in review
            {current?.submitted_at && (
              <>
                {' '}
                &middot; submitted{' '}
                {format(new Date(current.submitted_at), 'dd MMM yyyy, h:mm a')}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!current ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            This team hasn&apos;t submitted a check-in for Week {currentWeek}{' '}
            yet.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-3">
              <MetricBlock
                icon={<Users className="h-3.5 w-3.5" />}
                label="Paid Users"
                value={current.verified_paid_users ?? 0}
                previous={previous?.verified_paid_users ?? 0}
              />
              <MetricBlock
                icon={<Users className="h-3.5 w-3.5" />}
                label="Total Users"
                value={current.total_users ?? 0}
                previous={previous?.total_users ?? 0}
              />
              <MetricBlock
                icon={<Users className="h-3.5 w-3.5" />}
                label="Active Users"
                value={current.active_users ?? 0}
                previous={previous?.active_users ?? 0}
              />
            </div>

            {/* Last week review */}
            {previous && (
              <Section
                icon={<History className="h-3.5 w-3.5" />}
                label="Last Week's Commitment"
              >
                <p className="text-sm leading-relaxed">
                  {previous.commitment || (
                    <span className="italic text-muted-foreground">
                      No commitment on record
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {previous.commitment_met === true ? (
                    <Badge className="bg-green-100 text-green-800 border-0 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Met
                    </Badge>
                  ) : previous.commitment_met === false ? (
                    <Badge className="bg-red-100 text-red-800 border-0 gap-1">
                      <XCircle className="h-3 w-3" /> Missed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Not reported
                    </Badge>
                  )}
                </div>
                {current.commitment_result && (
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    <span className="font-medium">What happened: </span>
                    {current.commitment_result}
                  </p>
                )}
              </Section>
            )}

            {/* This week commitment */}
            <Section
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label={`Week ${currentWeek} Commitment`}
            >
              <p className="text-sm leading-relaxed">
                {current.commitment || (
                  <span className="italic text-muted-foreground">
                    No commitment provided
                  </span>
                )}
              </p>
            </Section>

            {/* Customer + plan */}
            {(current.target_customer_name ||
              current.problem_description ||
              current.acquisition_plan) && (
              <Section
                icon={<Users className="h-3.5 w-3.5" />}
                label="First Customer Plan"
              >
                <div className="space-y-2 text-sm">
                  {current.target_customer_name && (
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Target:{' '}
                      </span>
                      <span className="font-medium">
                        {current.target_customer_name}
                      </span>
                      {current.target_customer_location && (
                        <span className="text-muted-foreground">
                          {' '}
                          — {current.target_customer_location}
                        </span>
                      )}
                    </div>
                  )}
                  {current.problem_description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {current.problem_description}
                    </p>
                  )}
                  {current.pricing && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Pricing: </span>
                      <span className="font-medium">{current.pricing}</span>
                    </div>
                  )}
                  {current.acquisition_plan && (
                    <div className="text-xs leading-relaxed">
                      <span className="text-muted-foreground">Plan: </span>
                      {current.acquisition_plan}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* App status */}
            {(current.app_status || current.app_url) && (
              <Section
                icon={<Smartphone className="h-3.5 w-3.5" />}
                label="App Status"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {current.app_status && (
                    <Badge variant="outline" className="text-[10px]">
                      {APP_STATUS_LABELS[current.app_status] ??
                        current.app_status}
                    </Badge>
                  )}
                  {current.app_url && (
                    <a
                      href={current.app_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {current.app_url.replace(/^https?:\/\//, '').slice(0, 40)}
                    </a>
                  )}
                </div>
              </Section>
            )}

            {/* Blocker */}
            {current.biggest_blocker && (
              <Section
                icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                label="Biggest Blocker"
              >
                <div
                  className={cn(
                    'text-sm p-3 rounded-md',
                    current.blocker_resolved
                      ? 'bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100'
                      : 'bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-100',
                  )}
                >
                  {current.biggest_blocker}
                  <div className="mt-2">
                    {current.blocker_resolved ? (
                      <Badge className="text-[10px] bg-green-100 text-green-800 border-0 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Resolved
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-red-100 text-red-800 border-0">
                        Unresolved
                      </Badge>
                    )}
                  </div>
                </div>
              </Section>
            )}

            <Separator />

            {/* Mentor notes input */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <MessageSquare className="h-3 w-3" /> Your Feedback{' '}
                <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What's working? What should they focus on next week? Be specific and actionable."
                rows={4}
                className="resize-none text-sm"
                disabled={isSubmitting}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                The team will see this feedback in their weekly check-in.
              </p>
            </div>

            {/* Past reviews */}
            {historyLoading ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : pastReviews.length > 0 ? (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-2">
                  <History className="h-3 w-3" /> Past Reviews (
                  {pastReviews.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {pastReviews.map((c: any) => (
                    <div
                      key={c.id}
                      className="bg-muted/40 rounded-md p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Week {c.week_number}</span>
                        {c.mentor_reviewed_at && (
                          <span>
                            {format(new Date(c.mentor_reviewed_at), 'dd MMM')}
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {c.mentor_notes}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !checkinId || notes.trim().length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>Mark as Reviewed</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

function MetricBlock({
  icon,
  label,
  value,
  previous,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  previous: number;
}) {
  const delta = value - previous;
  return (
    <div className="bg-muted/40 rounded-md p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-lg font-bold tabular-nums">{value}</span>
        {delta !== 0 && (
          <span
            className={cn(
              'text-[10px] font-medium',
              delta > 0 ? 'text-green-600' : 'text-red-600',
            )}
          >
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
