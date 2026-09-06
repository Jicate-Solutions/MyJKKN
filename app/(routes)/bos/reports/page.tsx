'use client';

import { Suspense, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Download, FileArchive } from 'lucide-react';
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
import { useInstitutionContext, useInstitutionContextById } from '@/hooks/use-institution-context';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import type { BosPdfHeader } from '@/lib/utils/bos/bos-pdf-generator';
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
        <div className='rounded-lg border overflow-x-auto'>
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
          <div className='flex flex-wrap gap-3 ml-4 text-sm'>
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

          <div className='rounded-lg border overflow-x-auto'>
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

  // Brand from the meeting's own institution — not the logged-in user's
  // context. Super-admins have no institutionCtx (falls back to Arts), and
  // CET is identified by counselling_code "CET", not the free-text name.
  const meetingInstitutionsId: string | undefined =
    selectedMeeting?.institutions_id
    ?? institutionCtx?.myjkkn_id
    ?? (institutionsId || undefined);
  const { data: meetingInstCtx } = useInstitutionContextById(meetingInstitutionsId);

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
  const meetingDate = meetingDateRaw ? format(new Date(meetingDateRaw), 'dd-MMM-yyyy').toUpperCase() : '—';

  const ugPgLabel = inferBoardUgPg(boardType, boardCode, boardName);

  async function buildHeaderImages() {
    // Resolve branding from the meeting's institution at download time so we
    // never race the context query or fall back to Arts for CET meetings.
    let ctx = meetingInstCtx ?? institutionCtx;
    const resolveId =
      selectedMeeting?.institutions_id
      ?? institutionCtx?.myjkkn_id
      ?? (institutionsId || undefined);
    if (resolveId && (!ctx || ctx.myjkkn_id !== resolveId)) {
      try {
        const res = await fetch(`/api/institutions/resolve?institutionId=${resolveId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) ctx = json.data;
        }
      } catch {
        // Keep whatever context we already have
      }
    }
    const header = getInstitutionHeader(
      ctx?.name ?? ctx?.display_name,
      ctx?.counselling_code ?? ctx?.institution_code,
    );
    // CET: single engineering mark on the left (no right logo).
    // Arts/other: trust mark left + institution mark right.
    const isCet = header.ref_prefix === 'JKKNCET';
    if (isCet) {
      const cetLogoPath = header.logoImage ?? header.rightLogoImage;
      const logoImage = cetLogoPath ? await toBase64(cetLogoPath) : undefined;
      return { header, logoImage, rightLogoImage: undefined };
    }
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
    // Remove all variations of department mentions (beginning, middle, or end)
    cleanedInstitution = cleanedInstitution
      .replace(/^DEPARTMENT\s+OF\s+[^,]+\s*,?\s*/gi, '') // DEPARTMENT OF at start
      .replace(/,?\s*DEPARTMENT\s+OF\s+[^,]+\s*,?\s*/gi, '') // DEPARTMENT OF in middle
      .replace(/,?\s*DEPARTMENT\s+OF\s+[^,]+$/gi, '') // DEPARTMENT OF at end
      .replace(/^Dept\.?\s*/gi, '')
      .replace(/,?\s*Dept\.?\s*/gi, '')
      .split(',').map(s => s.trim()).filter(Boolean);

    // Remove standalone department names (common academic departments)
    const departmentNames = ['COMMERCE', 'SCIENCE', 'ARTS', 'ENGINEERING', 'MANAGEMENT', 'EDUCATION', 'LAW'];
    cleanedInstitution = cleanedInstitution
      .filter(part => !departmentNames.includes(part.toUpperCase()))
      .join(', ');

    return {
      institution_name: header.institution_name,
      // CET banner_lines[0] is "( An Autonomous Institution )"
      institution_subtitle: header.banner_lines?.[0],
      institution_address: header.institution_address,
      institution_accreditation: header.institution_accreditation,
      logoImage,
      rightLogoImage,
      member_name: member?.display_name ?? '—',
      member_designation: member?.display_designation,
      member_department: member?.display_department,
      member_institution: cleanedInstitution || member?.display_institution,
      member_address: member?.address,
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
        <div className='rounded-lg border overflow-x-auto'>
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

// ── Minutes of Meeting Tab ────────────────────────────────────────────────────
// Bulk one-click download of every held meeting's "Minutes of Meeting" as Word
// (.docx). Uses the SAME client-side docx builder the meeting Documents tab's
// "Minutes of Meeting (Word)" button uses (buildMinutesDocxDoc), packing each to
// a blob and bundling them into a single .zip via JSZip. We build Word rather
// than the Puppeteer/HTML PDF because the native docx layout avoids the PDF's
// alignment quirks — and it needs no server round-trip per meeting.

// Strip COE's "Board of Studies - " prefix — mirrors documents-tab.tsx so the
// PDF heading gets just the discipline label.
function cleanBoardName(name?: string | null): string | undefined {
  return name?.replace(/^\s*Board of Studies\s*-\s*/i, '').trim();
}

// Statuses at/after which the meeting has actually been held and its minutes
// document exists. Note: 'completed' is NOT in BOS_MEETING_STATUS_ORDER, so an
// order-index comparison (as documents-tab does) silently no-ops — we match the
// explicit set instead. Anything earlier (draft…expert_invited) has no minutes.
const MINUTES_READY_STATUSES: BosMeetingStatus[] = [
  'completed',
  'minutes_drafted',
  'minutes_approved',
  'ratified',
];

function MinutesOfMeetingTab({ institutionsId }: { institutionsId: string }) {
  const [academicYear, setAcademicYear] = useState('all');
  const [regulationId, setRegulationId] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { data: institutionCtx } = useInstitutionContext();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

  // Data source: the scope-aware meetings hook (NOT the meeting-register report).
  // The report filters strictly on profile.institution_id; useBosMeetings resolves
  // the caller's BoS scope server-side — a principal sees every meeting in their
  // (CAS-expanded) institution — which is what a bulk-minutes action needs.
  const { data: meetingsResp, isLoading } = useBosMeetings({ limit: 200, sortOrder: 'desc' });
  const allMeetings = (meetingsResp?.data ?? []) as any[];

  // Regulation options come from the real regulations table (institution-scoped).
  // Meetings carry no regulation_id, so we bridge on year: a regulation's
  // regulation_year (e.g. 2026) matches meetings whose academic_year starts with
  // that year (e.g. "2026-2027").
  //
  // Scope the fetch by the institution_id(s) of the actually-loaded meetings
  // rather than the caller's profile.institution_id — for a CAS/school principal
  // the profile value can be empty or point at a sibling with no regulations,
  // which left this dropdown blank. The meetings' own institutions_id is
  // authoritative (and may be several UUIDs across a CAS pair).
  const meetingInstitutionIds = [
    ...new Set(allMeetings.map((m) => m.institutions_id).filter(Boolean)),
  ] as string[];
  // Super-admin has no institution and sees every meeting, so DON'T couple the
  // regulation options to whichever meetings happened to load — fetch the full
  // list (route returns all active regulations when no institutionIds are sent).
  // Non-admins stay scoped to their loaded meetings' institutions (the CAS/school
  // principal fix above). Without this branch a super-admin whose loaded meetings
  // belong to institutions with no regulations saw an empty dropdown.
  const { data: regulationsResp } = useQuery<{ data: any[] }>({
    queryKey: ['bos-report-regulations', isSuperAdmin ? 'all' : meetingInstitutionIds],
    queryFn: () =>
      fetchReport(
        isSuperAdmin
          ? '/api/bos/regulations'
          : `/api/bos/regulations?institutionIds=${meetingInstitutionIds.join(',')}`,
      ),
    enabled: isSuperAdmin || meetingInstitutionIds.length > 0,
  });
  const regulations = regulationsResp?.data ?? [];
  const selectedRegulation = regulations.find((r) => r.id === regulationId);

  // Distinct academic years present in the loaded meetings (newest first).
  const academicYears = [...new Set(allMeetings.map((m) => m.academic_year).filter(Boolean))]
    .sort()
    .reverse();

  // Apply the two dropdown filters.
  const meetings = allMeetings.filter((m) => {
    if (academicYear !== 'all' && m.academic_year !== academicYear) return false;
    if (selectedRegulation) {
      const year = String(selectedRegulation.regulation_year ?? '');
      if (year && !String(m.academic_year ?? '').startsWith(year)) return false;
    }
    return true;
  });

  // A meeting's minutes are downloadable once it has been held (status in the
  // minutes-ready set) AND has attendance recorded.
  const isEligible = (m: any) =>
    MINUTES_READY_STATUSES.includes(m.status) && (m.attendee_count ?? 0) > 0;
  const eligible = meetings.filter(isEligible);

  // Selection: if the user has ticked specific rows, download only those;
  // otherwise the button downloads every eligible meeting. Selection is kept in
  // sync with the eligible set so a filter change can't leave a stale id ticked.
  const eligibleIds = new Set(eligible.map((m) => m.id));
  const selectedEligible = eligible.filter((m) => selected.has(m.id));
  const targets = selectedEligible.length > 0 ? selectedEligible : eligible;
  const allSelected = eligible.length > 0 && selectedEligible.length === eligible.length;

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(eligibleIds));

  const safe = (s: string) => (s || '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40);

  // Build the full letterhead (logos + optional seal/sign as base64 data-URLs)
  // exactly as the meeting Documents tab does, so the bulk Word files are
  // identical to the single "Minutes of Meeting (Word)" download.
  async function buildHeader(): Promise<BosPdfHeader> {
    const h = getInstitutionHeader(institutionCtx?.name);
    const [logoImage, rightLogoImage, sealImage, signImage] = await Promise.all([
      toBase64('/logo.png'),
      toBase64(h.rightLogoImage),
      h.sealImage ? toBase64(h.sealImage) : Promise.resolve(undefined),
      h.signImage ? toBase64(h.signImage) : Promise.resolve(undefined),
    ]);
    return {
      institution_name: h.institution_name,
      institution_accreditation: h.institution_accreditation,
      institution_address: h.institution_address,
      logoImage,
      rightLogoImage,
      officials: h.officials,
      sealImage,
      signImage,
    };
  }

  // Generate one meeting's minutes as a Word (.docx) blob, fully client-side via
  // the shared buildMinutesDocxDoc. Fetches the full meeting detail + agenda +
  // attendance so the content matches the single-meeting Word download.
  async function generateOne(
    meetingId: string,
    header: BosPdfHeader,
  ): Promise<{ blob: Blob; filename: string }> {
    const [detailRes, agendaRes, attendanceRes] = await Promise.all([
      fetch(`/api/bos/meetings/${meetingId}`),
      fetch(`/api/bos/meetings/${meetingId}/agenda`),
      fetch(`/api/bos/meetings/${meetingId}/attendance`),
    ]);
    if (!detailRes.ok) throw new Error('Failed to load meeting');
    const meeting = await detailRes.json();
    const agendaItems = agendaRes.ok ? await agendaRes.json() : [];
    const attendees = attendanceRes.ok ? await attendanceRes.json() : [];

    // Chairman is the attendee whose member record is typed 'chairman'; falls
    // back to the literal like documents-tab does.
    const chairmanName =
      attendees.find((a: any) => a.member?.member_type === 'chairman')?.member?.display_name ??
      'Chairman';

    const { buildMinutesDocxDoc, Packer } = await import('@/lib/utils/bos/meeting-minutes-docx');
    const doc = buildMinutesDocxDoc({
      header,
      meeting,
      attendees,
      agendaItems,
      chairmanName,
      boardName: cleanBoardName(meeting.board?.board_name),
    });
    const blob = await Packer.toBlob(doc);
    const filename = `minutes-meeting-${meeting.meeting_number}-${meeting.academic_year}.docx`;
    return { blob, filename };
  }

  async function handleDownloadAll() {
    if (targets.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    try {
      const JSZip = (await import('jszip')).default;
      const header = await buildHeader();
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let failures = 0;

      // Sequential: packing each .docx is CPU-bound and the per-meeting fetches
      // are cheap. One-at-a-time keeps the UI responsive and lets us report
      // accurate progress.
      for (let i = 0; i < targets.length; i++) {
        try {
          const { blob, filename } = await generateOne(targets[i].id, header);
          // Guard against duplicate filenames (same number+year across boards).
          let name = filename;
          let n = 2;
          while (usedNames.has(name)) name = filename.replace(/\.docx$/, `-${n++}.docx`);
          usedNames.add(name);
          zip.file(name, blob);
        } catch (err) {
          failures++;
          console.error(`[minutes bulk] meeting ${targets[i].id} failed:`, err);
        }
        setProgress({ done: i + 1, total: targets.length });
      }

      const succeeded = targets.length - failures;
      if (succeeded === 0) {
        toast.error('Could not generate any minutes.');
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      const scopeTag = selectedEligible.length > 0 ? 'Selected' : 'All';
      const yearTag = academicYear !== 'all' ? `_${safe(academicYear)}` : '';
      const regTag = selectedRegulation ? `_${safe(selectedRegulation.regulation_code ?? '')}` : '';
      a.download = `BoS_Minutes_${scopeTag}${yearTag}${regTag}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        failures === 0
          ? `${succeeded} minutes downloaded`
          : `${succeeded} downloaded, ${failures} failed`,
      );
    } catch (err) {
      console.error('[minutes bulk] failed:', err);
      toast.error('Failed to build minutes archive');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='space-y-1'>
            <Label className='text-xs'>Academic Year</Label>
            <Select value={academicYear} onValueChange={setAcademicYear}>
              <SelectTrigger className='h-8 w-40 text-sm'>
                <SelectValue placeholder='All years' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All years</SelectItem>
                {academicYears.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Regulation</Label>
            <Select value={regulationId} onValueChange={setRegulationId}>
              <SelectTrigger className='h-8 w-44 text-sm'>
                <SelectValue placeholder='All regulations' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All regulations</SelectItem>
                {regulations.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size='sm'
          onClick={handleDownloadAll}
          disabled={busy || targets.length === 0}
        >
          <FileArchive className='mr-1.5 h-3.5 w-3.5' />
          {busy && progress
            ? `Generating ${progress.done}/${progress.total}…`
            : selectedEligible.length > 0
              ? `Download Selected (Word) (${targets.length})`
              : `Download All Minutes (Word) (${eligible.length})`}
        </Button>
      </div>

      {isLoading ? (
        <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
      ) : meetings.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>No meetings found.</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='w-8 px-3 py-2'>
                  <input
                    type='checkbox'
                    aria-label='Select all available minutes'
                    className='h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed'
                    checked={allSelected}
                    disabled={busy || eligible.length === 0}
                    onChange={toggleAll}
                  />
                </th>
                {['#', 'Board', 'Title', 'Academic Year', 'Date', 'Status', 'Minutes'].map((h) => (
                  <th key={h} className='text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {meetings.map((m: any) => {
                const ready = isEligible(m);
                return (
                  <tr key={m.id} className='hover:bg-muted/20'>
                    <td className='px-3 py-2'>
                      <input
                        type='checkbox'
                        aria-label={`Select ${m.meeting_title ?? 'meeting'}`}
                        className='h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed'
                        checked={selected.has(m.id)}
                        disabled={!ready || busy}
                        onChange={() => toggleOne(m.id)}
                      />
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>{m.meeting_number}</td>
                    <td className='px-3 py-2 text-xs'>{m.board?.board_code ?? '—'}</td>
                    <td className='px-3 py-2 font-medium truncate max-w-[200px]'>{m.meeting_title ?? `Meeting ${m.meeting_number}`}</td>
                    <td className='px-3 py-2 text-xs'>{m.academic_year}</td>
                    <td className='px-3 py-2 text-xs'>
                      {m.actual_date || m.scheduled_date
                        ? format(new Date(m.actual_date || m.scheduled_date), 'dd MMM yyyy')
                        : '—'}
                    </td>
                    <td className='px-3 py-2'>
                      <Badge variant='outline' className='text-xs'>{BOS_MEETING_STATUS_LABELS[m.status as BosMeetingStatus]}</Badge>
                    </td>
                    <td className='px-3 py-2'>
                      {ready ? (
                        <span className='text-xs text-green-700 font-medium'>Available</span>
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          {MINUTES_READY_STATUSES.includes(m.status) ? 'No attendance' : 'Not held yet'}
                        </span>
                      )}
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

const REPORTS_TABS = [
  'meeting-register',
  'minutes-of-meeting',
  'resolution-compliance',
  'composition',
  'attendance-certificates',
] as const;

function ReportsPageInner() {
  const { profile } = useAuth();
  const institutionsId = profile?.institution_id ?? '';
  const [activeTab, setActiveTab] = useTabParam('meeting-register', REPORTS_TABS);

  return (
    <div className='space-y-6'>
      <PageHeader
        title='BoS Reports'
        description='NAAC/NBA-ready Board of Studies reports and compliance tracking.'
      />

      <Card>
        <CardContent className='p-4'>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='mb-4 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
              <TabsTrigger value='meeting-register'>Meeting Register</TabsTrigger>
              <TabsTrigger value='minutes-of-meeting'>Minutes of Meeting</TabsTrigger>
              <TabsTrigger value='resolution-compliance'>Resolution Compliance</TabsTrigger>
              <TabsTrigger value='composition'>Composition Report</TabsTrigger>
              <TabsTrigger value='attendance-certificates'>Attendance Certificates</TabsTrigger>
            </TabsList>

            <TabsContent value='meeting-register'>
              <MeetingRegisterTab institutionsId={institutionsId} />
            </TabsContent>

            <TabsContent value='minutes-of-meeting'>
              <MinutesOfMeetingTab institutionsId={institutionsId} />
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

export default function ReportsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ReportsPageInner />
    </Suspense>
  );
}
