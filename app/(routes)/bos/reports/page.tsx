'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

import { BosMeetingStatus, BosResolutionStatus, BOS_MEETING_STATUS_LABELS } from '@/types/bos';

// ── Shared fetch helper ────────────────────────────────────────────────────────

async function fetchReport<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }));
    throw new Error(err.error ?? 'Failed to fetch report');
  }
  return res.json();
}

// ── Resolution status badge ───────────────────────────────────────────────────

const RES_STATUS_COLORS: Record<BosResolutionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  deferred: 'bg-red-100 text-red-800',
  not_applicable: 'bg-gray-100 text-gray-600',
};

// ── Meeting Register Tab ──────────────────────────────────────────────────────

function MeetingRegisterTab({ institutionsId }: { institutionsId: string }) {
  const [academicYear, setAcademicYear] = useState('');

  const params = new URLSearchParams({ institutionsId });
  if (academicYear) params.set('academicYear', academicYear);

  const { data: meetings = [], isLoading } = useQuery<any[]>({
    queryKey: ['bos-report-meeting-register', institutionsId, academicYear],
    queryFn: () => fetchReport(`/api/bos/reports/meeting-register?${params.toString()}`),
    enabled: !!institutionsId,
  });

  return (
    <div className='space-y-4'>
      <div className='flex items-end gap-3'>
        <div className='space-y-1'>
          <Label className='text-xs'>Academic Year</Label>
          <Input
            placeholder='e.g. 2024-25'
            className='h-8 w-32 text-sm'
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
      ) : meetings.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>No meetings found.</p>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                {['#', 'Board', 'Title', 'Academic Year', 'Scheduled', 'Status', 'Present', 'Items'].map((h) => (
                  <th key={h} className='text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {meetings.map((m: any) => (
                <tr key={m.id} className='hover:bg-muted/20'>
                  <td className='px-3 py-2 text-muted-foreground'>{m.meeting_number}</td>
                  <td className='px-3 py-2 text-xs'>{m.board?.board_code ?? '—'}</td>
                  <td className='px-3 py-2 font-medium truncate max-w-[200px]'>{m.meeting_title ?? `Meeting ${m.meeting_number}`}</td>
                  <td className='px-3 py-2 text-xs'>{m.academic_year}</td>
                  <td className='px-3 py-2 text-xs'>
                    {m.scheduled_date ? format(new Date(m.scheduled_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className='px-3 py-2'>
                    <Badge variant='outline' className='text-xs'>{BOS_MEETING_STATUS_LABELS[m.status as BosMeetingStatus]}</Badge>
                  </td>
                  <td className='px-3 py-2 text-center'>{m.attendee_count ?? 0}</td>
                  <td className='px-3 py-2 text-center'>{m.agenda_item_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Resolution Compliance Tab ─────────────────────────────────────────────────

function ResolutionComplianceTab({ institutionsId }: { institutionsId: string }) {
  const [academicYear, setAcademicYear] = useState('');

  const params = new URLSearchParams({ institutionsId });
  if (academicYear) params.set('academicYear', academicYear);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ['bos-report-resolution-compliance', institutionsId, academicYear],
    queryFn: () => fetchReport(`/api/bos/reports/resolution-compliance?${params.toString()}`),
    enabled: !!institutionsId,
  });

  const pendingCount = items.filter((i) => i.resolution_status === 'pending').length;
  const completedCount = items.filter((i) => i.resolution_status === 'completed').length;

  return (
    <div className='space-y-4'>
      <div className='flex items-end gap-3'>
        <div className='space-y-1'>
          <Label className='text-xs'>Academic Year</Label>
          <Input
            placeholder='e.g. 2024-25'
            className='h-8 w-32 text-sm'
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
        </div>
        {items.length > 0 && (
          <div className='flex gap-3 ml-4 text-sm'>
            <span className='text-green-700 font-medium'>{completedCount} Completed</span>
            <span className='text-yellow-700 font-medium'>{pendingCount} Pending</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-16 w-full' />)}</div>
      ) : items.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>No resolutions found.</p>
      ) : (
        <div className='space-y-2'>
          {items.map((item: any) => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex items-start gap-3'>
                <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium'>
                  {item.item_number}
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <p className='text-sm font-medium'>{item.item_title}</p>
                    {item.resolution_status && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${RES_STATUS_COLORS[item.resolution_status as BosResolutionStatus]}`}>
                        {item.resolution_status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {item.resolution_text && (
                    <p className='text-xs text-muted-foreground mt-1 truncate'>{item.resolution_text}</p>
                  )}
                  <p className='text-xs text-muted-foreground mt-1'>
                    Meeting: {item.meeting?.meeting_title ?? item.meeting_id}
                    {item.meeting?.academic_year ? ` (${item.meeting.academic_year})` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composition Report Tab ────────────────────────────────────────────────────

function CompositionReportTab({ institutionsId }: { institutionsId: string }) {
  const [compositionId, setCompositionId] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<{ composition: any; members: any[] }>({
    queryKey: ['bos-report-composition', compositionId],
    queryFn: () => fetchReport(`/api/bos/reports/composition?compositionId=${compositionId}`),
    enabled: !!compositionId,
  });

  const members = data?.members ?? [];
  const composition = data?.composition;

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <Label className='text-xs'>Composition ID</Label>
        <div className='flex gap-2'>
          <Input
            placeholder='Paste composition UUID'
            className='h-8 text-sm max-w-xs'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => setCompositionId(search.trim())}
            className='h-8 px-3 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90'
          >
            Load
          </button>
        </div>
      </div>

      {isLoading && <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-12 w-full' />)}</div>}

      {composition && (
        <div className='space-y-3'>
          <div className='rounded-lg border p-3'>
            <p className='font-semibold'>{composition.composition_title}</p>
            <p className='text-xs text-muted-foreground'>
              {composition.board?.board_name} · {composition.academic_year} · {members.length} members
            </p>
          </div>

          <div className='rounded-lg border overflow-hidden'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50'>
                <tr>
                  {['S.No', 'Type', 'Name', 'Designation', 'Institution', 'Contact', 'Email'].map((h) => (
                    <th key={h} className='text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide'>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y'>
                {members.map((m: any, idx: number) => (
                  <tr key={m.id} className='hover:bg-muted/20'>
                    <td className='px-3 py-2 text-muted-foreground'>{idx + 1}</td>
                    <td className='px-3 py-2'>
                      <Badge variant='outline' className='text-xs capitalize'>{m.member_type.replace('_', ' ')}</Badge>
                    </td>
                    <td className='px-3 py-2 font-medium'>{m.display_name}</td>
                    <td className='px-3 py-2 text-xs'>{m.display_designation ?? '—'}</td>
                    <td className='px-3 py-2 text-xs'>{m.display_institution ?? '—'}</td>
                    <td className='px-3 py-2 text-xs'>{m.contact_no ?? '—'}</td>
                    <td className='px-3 py-2 text-xs'>{m.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reports Page ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { profile } = useAuth();
  const institutionsId = profile?.institution_id ?? '';

  return (
    <div className='space-y-6'>
      <PageHeader
        title='BoS Reports'
        description='NAAC/NBA-ready Board of Studies reports and compliance tracking.'
      />

      <Card>
        <CardContent className='p-4'>
          <Tabs defaultValue='meeting-register'>
            <TabsList className='mb-4'>
              <TabsTrigger value='meeting-register'>Meeting Register</TabsTrigger>
              <TabsTrigger value='resolution-compliance'>Resolution Compliance</TabsTrigger>
              <TabsTrigger value='composition'>Composition Report</TabsTrigger>
            </TabsList>

            <TabsContent value='meeting-register'>
              <MeetingRegisterTab institutionsId={institutionsId} />
            </TabsContent>

            <TabsContent value='resolution-compliance'>
              <ResolutionComplianceTab institutionsId={institutionsId} />
            </TabsContent>

            <TabsContent value='composition'>
              <CompositionReportTab institutionsId={institutionsId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
