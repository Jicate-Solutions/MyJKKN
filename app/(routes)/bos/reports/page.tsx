'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import type { BosMeetingAttendee } from '@/types/bos';
import { useBosMeetings } from '@/hooks/bos/use-bos-meetings';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import {
  generateBosAttendanceCertificatePDF,
  inferBoardUgPg,
  type BosAttendanceCertificateData,
} from '@/lib/utils/internal-marks/internal-marks-pdf';

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

// ── Shared helpers ────────────────────────────────────────────────────────────

async function toBase64(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return undefined; }
}

// ── Attendance Certificates Tab ───────────────────────────────────────────────

function AttendanceCertificatesTab({ institutionsId }: { institutionsId: string }) {
  const [meetingId, setMeetingId] = useState('');
  const [pdfLoading, setPdfLoading] = useState<string | null>(null); // 'all' | member_id | null
  const { data: institutionCtx } = useInstitutionContext();

  const { data: meetingsData } = useBosMeetings({ limit: 100, sortOrder: 'desc' });
  const meetings = meetingsData?.data ?? [];
  const selectedMeeting = meetings.find((m) => m.id === meetingId) as any;

  const { data: attendeesRaw = [], isLoading: attendeesLoading } = useQuery<BosMeetingAttendee[]>({
    queryKey: ['bos-attendance-cert', meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/meetings/${meetingId}/attendance`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!meetingId,
    staleTime: 60_000,
  });

  const presentAttendees = attendeesRaw.filter((a) => a.attendance_status === 'present');

  // Board info from the meeting's joined board record
  const board = selectedMeeting?.board as any;
  const boardName: string = board?.board_name ?? 'Department';
  const boardCode: string = board?.board_code ?? '';
  const boardType: string | null = board?.board_type ?? null;

  // Prefer actual date; fall back to scheduled date
  const meetingDateRaw = selectedMeeting?.actual_date || selectedMeeting?.scheduled_date;
  const meetingDate = meetingDateRaw ? format(new Date(meetingDateRaw), 'dd MMMM yyyy') : '—';

  const ugPgLabel = inferBoardUgPg(boardType, boardCode, boardName);

  async function buildHeaderImages() {
    const header = getInstitutionHeader(institutionCtx?.name);
    const [logoImage, rightLogoImage] = await Promise.all([
      toBase64('/logo.png'),
      toBase64(header.rightLogoImage),
    ]);
    return { header, logoImage, rightLogoImage };
  }

  function makeCertData(
    attendee: BosMeetingAttendee,
    header: ReturnType<typeof getInstitutionHeader>,
    logoImage?: string,
    rightLogoImage?: string,
  ): BosAttendanceCertificateData {
    const member = (attendee as any).member;
    // Clean institution field: remove department info (appears in meeting sentence instead)
    let cleanedInstitution = member?.display_institution ?? '';
    cleanedInstitution = cleanedInstitution
      .replace(/^DEPARTMENT OF [^,]+,?\s*/gi, '')
      .replace(/,?\s*DEPARTMENT OF [^,]+/gi, '')
      .replace(/^Dept\.?\s+/gi, '')
      .replace(/,?\s*Dept\.?\s+/gi, '')
      .trim();

    return {
      institution_name: header.institution_name,
      institution_address: header.institution_address,
      institution_accreditation: header.institution_accreditation,
      logoImage,
      rightLogoImage,
      member_name: member?.display_name ?? '—',
      member_designation: member?.display_designation,
      member_institution: cleanedInstitution || member?.display_institution,
      member_address: member?.display_address,
      board_name: boardName,
      board_code: boardCode,
      board_type: boardType,
      meeting_date: meetingDate,
    };
  }

  const safe = (s: string) => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 30);

  async function handleDownloadOne(attendee: BosMeetingAttendee) {
    setPdfLoading(attendee.member_id);
    try {
      const { header, logoImage, rightLogoImage } = await buildHeaderImages();
      const cert = makeCertData(attendee, header, logoImage, rightLogoImage);
      generateBosAttendanceCertificatePDF(
        [cert],
        `BOS_Attendance_${safe(cert.member_name)}_${new Date().toISOString().split('T')[0]}.pdf`,
      );
      toast.success('Certificate downloaded');
    } catch {
      toast.error('Failed to generate certificate');
    } finally {
      setPdfLoading(null);
    }
  }

  async function handleDownloadAll() {
    if (presentAttendees.length === 0) return;
    setPdfLoading('all');
    try {
      const { header, logoImage, rightLogoImage } = await buildHeaderImages();
      const certs = presentAttendees.map((a) => makeCertData(a, header, logoImage, rightLogoImage));
      generateBosAttendanceCertificatePDF(
        certs,
        `BOS_Attendance_All_${safe(boardName)}_${new Date().toISOString().split('T')[0]}.pdf`,
      );
      toast.success(`${certs.length} certificates downloaded`);
    } catch {
      toast.error('Failed to generate certificates');
    } finally {
      setPdfLoading(null);
    }
  }

  return (
    <div className='space-y-4'>
      {/* Meeting selector */}
      <div className='space-y-1.5'>
        <Label className='text-xs'>Meeting</Label>
        <Select value={meetingId} onValueChange={setMeetingId}>
          <SelectTrigger className='max-w-sm h-8 text-sm'>
            <SelectValue placeholder='Select a meeting…' />
          </SelectTrigger>
          <SelectContent>
            {meetings.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {(m as any).meeting_title ?? `Meeting #${m.meeting_number}`}
                {m.scheduled_date ? ` — ${format(new Date(m.scheduled_date), 'dd MMM yyyy')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Meeting info strip */}
      {selectedMeeting && (
        <div className='rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap'>
          <span><strong>Board:</strong> {boardName}</span>
          {boardCode && <span><strong>Code:</strong> {boardCode}</span>}
          {ugPgLabel && <Badge variant='outline' className='text-xs'>{ugPgLabel}</Badge>}
          <span><strong>Date:</strong> {meetingDate}</span>
          <span><strong>Present:</strong> {presentAttendees.length}</span>
        </div>
      )}

      {/* Download all button */}
      {presentAttendees.length > 0 && (
        <div className='flex justify-end'>
          <Button
            size='sm'
            variant='outline'
            onClick={handleDownloadAll}
            disabled={pdfLoading === 'all'}
          >
            <Download className='mr-1.5 h-3.5 w-3.5' />
            {pdfLoading === 'all' ? 'Generating…' : `Download All (${presentAttendees.length})`}
          </Button>
        </div>
      )}

      {/* Attendees list */}
      {attendeesLoading ? (
        <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
      ) : !meetingId ? (
        <p className='text-sm text-muted-foreground text-center py-8'>Select a meeting to view attendees.</p>
      ) : presentAttendees.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>No present attendees recorded for this meeting.</p>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                {['S.No', 'Name', 'Designation', 'Institution', 'Type', 'Certificate'].map((h) => (
                  <th key={h} className='text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {presentAttendees.map((a, idx) => {
                const member = (a as any).member;
                return (
                  <tr key={a.member_id} className='hover:bg-muted/20'>
                    <td className='px-3 py-2 text-muted-foreground'>{idx + 1}</td>
                    <td className='px-3 py-2 font-medium'>{member?.display_name ?? '—'}</td>
                    <td className='px-3 py-2 text-xs'>{member?.display_designation ?? '—'}</td>
                    <td className='px-3 py-2 text-xs'>{member?.display_institution ?? '—'}</td>
                    <td className='px-3 py-2'>
                      <Badge variant='outline' className='text-xs capitalize'>
                        {member?.member_type?.replace(/_/g, ' ') ?? '—'}
                      </Badge>
                    </td>
                    <td className='px-3 py-2'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs'
                        onClick={() => handleDownloadOne(a)}
                        disabled={!!pdfLoading}
                      >
                        <Download className='mr-1 h-3 w-3' />
                        {pdfLoading === a.member_id ? 'Generating…' : 'Download'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
              <TabsTrigger value='attendance-certificates'>Attendance Certificates</TabsTrigger>
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

            <TabsContent value='attendance-certificates'>
              <AttendanceCertificatesTab institutionsId={institutionsId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
