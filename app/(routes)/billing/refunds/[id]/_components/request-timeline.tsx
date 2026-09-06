'use client';

import { Undo, Check, X, Banknote, FileText, Circle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { RefundRequest, RefundRequestAction } from '@/types/billing-refund-workflow';

interface Props {
  actions: RefundRequestAction[];
  flowSnapshot: RefundRequest['flow_snapshot'];
  currentStageIndex: number;
  status: RefundRequest['status'];
}

const ACTION_ICON: Record<RefundRequestAction['action_type'], typeof Undo> = {
  initiated: Undo,
  approved: Check,
  declined: X,
  disbursed: Banknote
};

const ACTION_ICON_CLASS: Record<RefundRequestAction['action_type'], string> = {
  initiated: 'text-muted-foreground bg-muted',
  approved: 'text-green-600 bg-green-100',
  declined: 'text-red-600 bg-red-100',
  disbursed: 'text-blue-600 bg-blue-100'
};

export function RequestTimeline({ actions, flowSnapshot, currentStageIndex, status }: Props) {
  const sorted = [...actions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const upcomingStages = status === 'pending_review' ? flowSnapshot.stages.slice(currentStageIndex) : [];
  const showDisbursementTail = status === 'pending_review' || status === 'pending_disbursement';

  return (
    <div className='space-y-6'>
      {sorted.map((action) => {
        const Icon = ACTION_ICON[action.action_type];
        return (
          <div key={action.id} className='flex gap-3'>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ACTION_ICON_CLASS[action.action_type]}`}>
              <Icon className='h-4 w-4' />
            </div>
            <div className='flex-1 space-y-1 pb-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>{action.stage_name}</p>
                <span className='text-xs text-muted-foreground'>
                  {action.actor?.full_name ?? 'Unknown'}
                  {action.actor_role_name ? ` (${action.actor_role_name})` : ''}
                </span>
              </div>
              <p className='text-xs text-muted-foreground'>
                {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })} ·{' '}
                {format(new Date(action.created_at), 'PPp')}
              </p>
              {action.notes && <p className='text-sm text-muted-foreground'>{action.notes}</p>}
              {action.attachments?.length > 0 && (
                <ul className='space-y-1 pt-1'>
                  {action.attachments.map((a) => (
                    <li key={a.drive_file_id} className='flex items-center gap-1.5 text-xs'>
                      <FileText className='h-3 w-3 text-muted-foreground' />
                      <a href={a.drive_url} target='_blank' rel='noreferrer' className='underline truncate max-w-[240px]'>
                        {a.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}

      {upcomingStages.map((stage) => (
        <div key={stage.key} className='flex gap-3 opacity-50'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
            <Circle className='h-4 w-4' />
          </div>
          <div className='flex-1 pb-2'>
            <p className='text-sm font-medium'>{stage.name}</p>
            <p className='text-xs text-muted-foreground'>Pending</p>
          </div>
        </div>
      ))}

      {showDisbursementTail && (
        <div className='flex gap-3 opacity-50'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
            <Banknote className='h-4 w-4' />
          </div>
          <div className='flex-1'>
            <p className='text-sm font-medium'>Disbursement</p>
            <p className='text-xs text-muted-foreground'>Pending</p>
          </div>
        </div>
      )}
    </div>
  );
}
