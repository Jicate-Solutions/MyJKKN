'use client';

import { differenceInDays } from 'date-fns';
import { DataAlertBanner } from '@/components/shared/data-alert-banner/data-alert-banner';
import { useOverdueProspects } from '@/hooks/solutions/use-overdue-prospects';

export function OverdueAlertBanner() {
  const { data } = useOverdueProspects();

  const overdueProspects = data?.data ?? [];
  const count = overdueProspects.length;

  const today = new Date();
  const topItems = overdueProspects.slice(0, 3).map((p) => {
    const daysOverdue = p.next_action_date
      ? differenceInDays(today, new Date(p.next_action_date))
      : 0;
    return {
      id: p.id,
      label: p.company_name,
      sublabel: `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`,
    };
  });

  return (
    <DataAlertBanner
      count={count}
      severity="warning"
      dismissible
      title="{count} follow-up{plural} overdue"
      description="Review and reassign these prospects to keep your pipeline healthy."
      topItems={topItems}
      cta={{ href: '/solutions/pipeline/list?overdue=true', label: 'View All Overdue' }}
    />
  );
}
