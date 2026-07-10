'use client';

/**
 * Read-only detail view for one approval workflow. The table row already
 * carries the full hr_approval_flows record (steps JSONB included), so this
 * dialog renders from props — no extra fetch. Names are resolved via the
 * same lookup maps the table uses.
 */

import { CalendarClock, GitBranch, Pencil, UserRound, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  MONTHLY_SALARY_BAND_LABELS,
  ROLE_CATEGORY_LABELS,
  type ApprovalFlowStepTemplate,
  type HRApprovalFlow,
  type MonthlySalaryBand,
  type RoleCategory,
} from '@/types/hr-recruitment';

interface FlowDetailsDialogProps {
  flow: HRApprovalFlow | null;
  orgNameById: ReadonlyMap<string, string>;
  roleNameByKey: ReadonlyMap<string, string>;
  onClose: () => void;
  /** Present only for editable (band-less category) flows. */
  onEdit?: (flow: HRApprovalFlow) => void;
}

export function FlowDetailsDialog({
  flow,
  orgNameById,
  roleNameByKey,
  onClose,
  onEdit,
}: FlowDetailsDialogProps) {
  const cond = (flow?.conditions ?? {}) as Record<string, string>;
  const category = cond.role_category;
  const band = cond.monthly_salary_band;
  const steps = flow?.steps ?? [];
  const editable = !!flow && !!category && !band;

  const approverLabel = (s: ApprovalFlowStepTemplate) =>
    s.approver_name ??
    roleNameByKey.get((s.approver_role ?? '').toLowerCase()) ??
    s.approver_role ??
    '—';

  return (
    <Dialog open={!!flow} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-lg'>
        {flow && (
          <>
            <DialogHeader>
              <DialogTitle className='flex flex-wrap items-center gap-2 pr-6'>
                <GitBranch className='h-4 w-4 shrink-0 text-muted-foreground' />
                <span className='break-words'>{flow.flow_name}</span>
                <Badge
                  variant={flow.is_active ? 'default' : 'secondary'}
                  className='text-[10px]'
                >
                  {flow.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Candidates matching this organization and role category are routed
                through the chain below. The chain is frozen onto each candidate
                when they enter the pipeline.
              </DialogDescription>
            </DialogHeader>

            <div className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
              <div>
                <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  Organization
                </p>
                <p className='mt-0.5'>
                  {orgNameById.get(flow.hr_organization_id) ?? flow.hr_organization_id}
                </p>
              </div>
              <div>
                <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  Role category
                </p>
                <p className='mt-0.5 flex flex-wrap items-center gap-1.5'>
                  {category
                    ? (ROLE_CATEGORY_LABELS[category as RoleCategory] ?? category)
                    : '—'}
                  {band && (
                    <Badge variant='outline' className='text-[10px]'>
                      {MONTHLY_SALARY_BAND_LABELS[band as MonthlySalaryBand] ?? band}
                    </Badge>
                  )}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <p className='mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                Approval chain · {steps.length} step{steps.length === 1 ? '' : 's'}
              </p>
              {steps.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No steps configured — candidates in this scope can&rsquo;t be
                  submitted for approval.
                </p>
              ) : (
                <ol className='space-y-0'>
                  {steps.map((s, idx) => {
                    const isLast = idx === steps.length - 1;
                    const isFinal = (s.step_type ?? (isLast ? 'final' : 'review')) === 'final';
                    const pinned = !!s.approver_user_id;
                    return (
                      <li key={idx} className='relative flex gap-3 pb-4 last:pb-0'>
                        {!isLast && (
                          <span
                            aria-hidden
                            className='absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-border'
                          />
                        )}
                        <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold tabular-nums'>
                          {idx + 1}
                        </span>
                        <div className='min-w-0 flex-1'>
                          <p className='flex flex-wrap items-center gap-1.5 text-sm font-medium'>
                            {pinned ? (
                              <UserRound className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                            ) : (
                              <Users className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                            )}
                            <span className='break-words'>{approverLabel(s)}</span>
                          </p>
                          <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                            <Badge
                              variant={isFinal ? 'default' : 'secondary'}
                              className='text-[10px]'
                            >
                              {isFinal ? 'Final approval' : 'Review'}
                            </Badge>
                            <Badge variant='outline' className='text-[10px]'>
                              {pinned ? 'Pinned user' : 'Role-based'}
                            </Badge>
                            {s.interview_required && (
                              <Badge variant='outline' className='text-[10px]'>
                                Interview required
                              </Badge>
                            )}
                            {!!s.escalate_after_hours && (
                              <Badge
                                variant='outline'
                                className='inline-flex items-center gap-1 text-[10px]'
                              >
                                <CalendarClock className='h-3 w-3' />
                                Escalate after {s.escalate_after_hours}h
                              </Badge>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button variant='outline' onClick={onClose}>
                Close
              </Button>
              {editable && onEdit && (
                <Button onClick={() => onEdit(flow)}>
                  <Pencil className='mr-2 h-4 w-4' />
                  Edit Workflow
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
