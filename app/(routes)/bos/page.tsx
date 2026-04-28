'use client';

import { useRouter } from 'next/navigation';
import { CalendarDays, Users, ClipboardList, AlertTriangle, Plus } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useBosMeetings } from '@/hooks/bos/use-bos-meetings';
import { useBosCompositions } from '@/hooks/bos/use-bos-compositions';
import { BOS_MEETING_STATUS_LABELS, BosMeetingStatus } from '@/types/bos';

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  href,
  loading,
  variant = 'default',
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  href?: string;
  loading?: boolean;
  variant?: 'default' | 'warning';
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => href && router.push(href)}
      className={`w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
        variant === 'warning' ? 'border-amber-200 bg-amber-50/50' : ''
      }`}
    >
      <div className='flex items-center justify-between mb-2'>
        <p className='text-xs text-muted-foreground font-medium uppercase tracking-wide'>{label}</p>
        <Icon className={`h-4 w-4 ${variant === 'warning' ? 'text-amber-500' : 'text-muted-foreground'}`} />
      </div>
      {loading ? (
        <Skeleton className='h-8 w-16' />
      ) : (
        <p className={`text-3xl font-bold ${variant === 'warning' ? 'text-amber-700' : ''}`}>{value}</p>
      )}
    </button>
  );
}

const STATUS_VARIANT: Partial<Record<BosMeetingStatus, 'default' | 'secondary' | 'outline'>> = {
  draft: 'outline',
  ratified: 'default',
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function BoSDashboard() {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();
  const router = useRouter();

  const canCreateMeeting = isSuperAdmin || canAccess('bos.meetings', 'create');
  const canCreateComposition = isSuperAdmin || canAccess('bos.compositions', 'create');

  const { data: meetingsData, isLoading: loadingMeetings } = useBosMeetings({
    institutionsId: profile?.institution_id,
  });
  const { data: compositionsData, isLoading: loadingCompositions } = useBosCompositions({
    institutionsId: profile?.institution_id,
  });

  const meetings = meetingsData?.data ?? [];
  const compositions = compositionsData?.data ?? [];
  const totalMeetings = meetingsData?.metadata.total ?? 0;
  const activeCompositions = compositions.filter((c) => c.is_active).length;
  const inProgressMeetings = meetings.filter(
    (m) => m.status !== 'ratified' && m.status !== 'draft'
  ).length;

  const expiringCompositions = compositions.filter((c) => {
    if (!c.term_end_date || !c.is_active) return false;
    const daysLeft = differenceInDays(new Date(c.term_end_date), new Date());
    return daysLeft >= 0 && daysLeft <= 60;
  });

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          Manage BoS compositions, meetings, resolutions, and NAAC-ready reports.
        </p>
        <div className='flex items-center gap-2'>
          {canCreateComposition && (
            <Button size='sm' variant='outline' onClick={() => router.push('/bos/compositions/new')}>
              <Plus className='mr-2 h-4 w-4' />New Composition
            </Button>
          )}
          {canCreateMeeting && (
            <Button size='sm' onClick={() => router.push('/bos/meetings/new')}>
              <Plus className='mr-2 h-4 w-4' />Schedule Meeting
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────── */}
      <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
        <SummaryCard label='Total Meetings' value={totalMeetings} icon={CalendarDays}
          href='/bos/meetings' loading={loadingMeetings} />
        <SummaryCard label='Active Compositions' value={activeCompositions} icon={ClipboardList}
          href='/bos/compositions' loading={loadingCompositions} />
        <SummaryCard label='In Progress' value={inProgressMeetings} icon={Users}
          href='/bos/meetings' loading={loadingMeetings} />
        <SummaryCard label='Expiring Soon' value={expiringCompositions.length} icon={AlertTriangle}
          href='/bos/compositions' loading={loadingCompositions}
          variant={expiringCompositions.length > 0 ? 'warning' : 'default'} />
      </div>

      {/* ── Expiring alert ─────────────────────────────── */}
      {expiringCompositions.length > 0 && (
        <Card className='border-amber-200 bg-amber-50/30'>
          <CardContent className='p-4 flex items-center gap-3'>
            <AlertTriangle className='h-5 w-5 text-amber-600 shrink-0' />
            <div>
              <p className='text-sm font-medium text-amber-800'>
                {expiringCompositions.length} composition{expiringCompositions.length > 1 ? 's' : ''} expiring within 60 days
              </p>
              <p className='text-xs text-amber-700'>Review and renew before term ends.</p>
            </div>
            <Button size='sm' variant='outline'
              className='ml-auto border-amber-300 text-amber-700 hover:bg-amber-100'
              onClick={() => router.push('/bos/compositions')}
            >Review</Button>
          </CardContent>
        </Card>
      )}

      {/* ── Recent meetings ─────────────────────────────── */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-base'>Recent Meetings</CardTitle>
            <Button variant='link' size='sm' className='h-auto p-0 text-xs'
              onClick={() => router.push('/bos/meetings')}>View all →</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingMeetings ? (
            <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
          ) : meetings.length === 0 ? (
            <div className='text-center py-6 text-sm text-muted-foreground'>
              No meetings yet.
              {canCreateMeeting && (
                <Button variant='link' size='sm' className='mt-1 block mx-auto'
                  onClick={() => router.push('/bos/meetings/new')}>
                  Schedule the first meeting →
                </Button>
              )}
            </div>
          ) : (
            <div className='space-y-2'>
              {meetings.slice(0, 6).map((m) => {
                const board = m.board as any;
                return (
                  <button
                    key={m.id}
                    className='w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors'
                    onClick={() => router.push(`/bos/meetings/${m.id}`)}
                  >
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium truncate'>
                        {m.meeting_title ?? `Meeting ${m.meeting_number}/${m.academic_year}`}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {board?.board_code ?? ''}
                        {m.scheduled_date ? ` · ${format(new Date(m.scheduled_date), 'dd MMM yyyy')}` : ''}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[m.status] ?? 'secondary'} className='text-xs shrink-0'>
                      {BOS_MEETING_STATUS_LABELS[m.status]}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
