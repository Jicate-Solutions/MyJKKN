'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, CalendarDays, Users } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useBosMeetings } from '@/hooks/bos/use-bos-meetings';
import { BOS_MEETING_STATUS_LABELS, BosMeetingStatus } from '@/types/bos';

// Nav manifest override — gives the BoS tab a council-appropriate icon. The
// label auto-derives to "Academic Council" from the path. Visibility is gated
// by MENU_PERMISSIONS['/bos/academic-council'] (super-admin + principal).
export const navMeta = { label: 'Academic Council', icon: 'Landmark' };

// Academic Council meetings reuse the bos_meetings table (meeting_type =
// 'academic_council'); this page is just the AC-scoped view of that list. The
// detail/edit routes are shared with BoS meetings under /bos/meetings/[id].
export default function AcademicCouncilPage() {
  return (
    <PermissionGuard module='academic.bos-academic-council' action='manage'>
      <AcademicCouncilList />
    </PermissionGuard>
  );
}

// Status → badge tone. Mirrors the BoS meeting list's colour language so the
// two views feel like one system.
function statusVariant(status: BosMeetingStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'minutes_approved' || status === 'ratified') return 'default';
  if (status === 'draft') return 'outline';
  return 'secondary';
}

function AcademicCouncilList() {
  const { data, isLoading } = useBosMeetings({ meetingType: 'academic_council', limit: 100 });
  const meetings = data?.data ?? [];

  return (
    <div className='w-full space-y-4 overflow-x-hidden'>
      <PageHeader
        title='Academic Council'
        description='Institution-level council meetings that ratify Board of Studies recommendations. Convened by the Principal.'
      >
        <Button asChild size='sm'>
          <Link href='/bos/academic-council/new'>
            <Plus className='mr-2 h-4 w-4' />
            New Council Meeting
          </Link>
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-16 w-full' />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
            <Users className='h-8 w-8 text-muted-foreground/50' />
            <p className='font-medium'>No Academic Council meetings yet</p>
            <p className='text-sm text-muted-foreground'>
              Schedule the first council meeting — the current Board of Studies chairmen are added automatically.
            </p>
            <Button asChild size='sm' className='mt-2'>
              <Link href='/bos/academic-council/new'>
                <Plus className='mr-2 h-4 w-4' />
                New Council Meeting
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-2'>
          {meetings.map((m) => (
            <Link key={m.id} href={`/bos/meetings/${m.id}`} className='block'>
              <Card className='transition-colors hover:bg-muted/50'>
                <CardContent className='flex items-center justify-between gap-4 p-4'>
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>
                      {m.meeting_title ?? `Council Meeting #${m.meeting_number}`}
                    </p>
                    <div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                      <span>Meeting #{m.meeting_number}</span>
                      <span>{m.academic_year}</span>
                      {m.scheduled_date && (
                        <span className='inline-flex items-center gap-1'>
                          <CalendarDays className='h-3 w-3' />
                          {format(new Date(m.scheduled_date), 'dd MMM yyyy')}
                          {m.scheduled_time ? ` · ${m.scheduled_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={statusVariant(m.status)}>
                    {BOS_MEETING_STATUS_LABELS[m.status]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
