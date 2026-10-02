'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useVacateActorNames } from '@/hooks/campus-living/use-hostel-vacate';
import type { HostelVacateApproval, VacateStep } from '@/types/hostel-vacate';

const STEP_LABEL: Record<VacateStep, string> = {
  bills: 'Bills',
  principal: 'Principal',
  warden: 'Warden',
  mess: 'Mess In-charge',
  cao: 'CAO',
  fine: 'Fine',
};

const ACTION_LABEL: Record<HostelVacateApproval['action'], string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  system: 'System',
};

/** Every decision on the request, oldest first, with the remarks the approver left. */
export function DecisionTimeline({ approvals }: { approvals: HostelVacateApproval[] }) {
  const sorted = [...approvals].sort((a, b) => a.acted_at.localeCompare(b.acted_at));
  const { data: names = {} } = useVacateActorNames(
    sorted.map((a) => a.actor_id).filter((id): id is string => !!id),
  );

  if (sorted.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Decision History</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {sorted.map((a) => (
          <div key={a.id} className='border-l-2 pl-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm font-medium'>{STEP_LABEL[a.step] ?? a.step}</span>
              <Badge
                variant={a.action === 'rejected' ? 'destructive' : a.action === 'approved' ? 'success' : 'secondary'}
                className='text-xs'
              >
                {ACTION_LABEL[a.action]}
              </Badge>
            </div>
            <p className='text-xs text-muted-foreground'>
              {a.actor_id ? (names[a.actor_id] ?? 'Staff') : 'Automatic'} · {new Date(a.acted_at).toLocaleString()}
            </p>
            {a.remarks && <p className='mt-1 text-sm whitespace-pre-wrap'>{a.remarks}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
