'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BosMeetingStatus, BOS_MEETING_STATUS_LABELS } from '@/types/bos';

const STATUS_TABS: Array<{ value: BosMeetingStatus | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'principal_approved', label: 'Approved' },
  { value: 'noticed', label: 'Notice Sent' },
  { value: 'expert_invited', label: 'Experts Invited' },
  { value: 'completed', label: 'Completed' },
  { value: 'minutes_drafted', label: 'Minutes Drafted' },
  { value: 'minutes_approved', label: 'Minutes Approved' },
  { value: 'ratified', label: 'Ratified' },
];

interface MeetingStatusTabsProps {
  currentStatus?: BosMeetingStatus;
}

export function MeetingStatusTabs({ currentStatus }: MeetingStatusTabsProps) {
  const searchParams = useSearchParams();

  const buildHref = (status: BosMeetingStatus | undefined) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (status) {
      params.set('status', status);
    } else {
      params.delete('status');
    }
    params.set('page', '1');
    return `/bos/meetings?${params.toString()}`;
  };

  return (
    <div className='border-b'>
      <nav className='flex overflow-x-auto -mb-px gap-0.5'>
        {STATUS_TABS.map((tab) => {
          const isActive = tab.value === currentStatus;
          return (
            <Link
              key={tab.value ?? 'all'}
              href={buildHref(tab.value)}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
