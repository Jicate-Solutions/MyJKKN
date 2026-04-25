'use client';

// Visual stage stepper for a vacate request. Reads engine rule stages from
// the approval_chain_runs join and highlights the current stage + past ones.
// Also displayed on /my-hostel for the student's own request.

import { CheckCircle2, Circle, Clock, XCircle, Users, UserCheck, UserCog, Building } from 'lucide-react';
import type { StageDefinition } from '@/types/approval-chain';
import type { VacateRequestStatus } from '@/types/hostel-vacate';

const STAGE_NAME_TO_STATUS: Record<string, VacateRequestStatus> = {
  parent_consent: 'pending_parent',
  warden_approval: 'pending_warden',
  chief_warden_approval: 'pending_chief',
  dues_clearance: 'pending_dues',
};

const actorIcon: Record<string, typeof Users> = {
  parent: Users,
  warden: UserCheck,
  chief_warden: UserCog,
  hostel_office: Building,
};

interface ApprovalStepperProps {
  stages: StageDefinition[];
  status: VacateRequestStatus;
  currentStageIdx: number;
}

export function ApprovalStepper({ stages, status, currentStageIdx }: ApprovalStepperProps) {
  const isTerminal = status === 'completed' || status === 'rejected' || status === 'cancelled';

  return (
    <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 overflow-x-auto'>
      {stages.map((s, idx) => {
        const Icon = actorIcon[s.actor_role_key] ?? Users;
        const isPast = idx < currentStageIdx || (status === 'completed' && idx <= currentStageIdx);
        const isCurrent = idx === currentStageIdx && !isTerminal && status !== 'draft';
        const isFuture = idx > currentStageIdx;

        let tone = 'text-muted-foreground';
        let BgIcon = Circle;
        if (status === 'rejected' && idx === currentStageIdx) {
          tone = 'text-destructive';
          BgIcon = XCircle;
        } else if (isPast) {
          tone = 'text-green-600';
          BgIcon = CheckCircle2;
        } else if (isCurrent) {
          tone = 'text-blue-600 font-medium';
          BgIcon = Clock;
        }

        return (
          <div key={s.stage_idx} className='flex items-center gap-2'>
            <div
              className={
                'flex items-center gap-2 rounded-md border px-3 py-2 bg-background shrink-0 ' +
                (isCurrent ? 'border-blue-300 ring-1 ring-blue-200' : '') +
                (isFuture ? 'opacity-50' : '')
              }
            >
              <BgIcon className={'h-4 w-4 ' + tone} />
              <Icon className='h-4 w-4 text-muted-foreground' />
              <div className='flex flex-col'>
                <span className={'text-sm ' + tone}>{s.stage_label}</span>
                <span className='text-xs text-muted-foreground'>
                  {s.actor_role_key.replace(/_/g, ' ')} &middot; {s.sla_hours}h
                </span>
              </div>
            </div>
            {idx < stages.length - 1 && (
              <div className='h-0.5 w-6 bg-border hidden sm:block' />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function mapStageToStatus(stageName: string): VacateRequestStatus | null {
  return STAGE_NAME_TO_STATUS[stageName] ?? null;
}
