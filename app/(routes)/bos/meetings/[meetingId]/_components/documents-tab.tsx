'use client';

import { useState } from 'react';
import { FileText, Download, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import { BosMeeting, BosMember, BosAgendaItem, BosMeetingAttendee, BOS_MEETING_STATUS_ORDER } from '@/types/bos';
import { useBosAgendaItems } from '@/hooks/bos/use-bos-agenda';
import { useBosAttendance } from '@/hooks/bos/use-bos-attendance';
import { useBosMembersByComposition } from '@/hooks/bos/use-bos-members';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { logger } from '@/lib/utils/enhanced-logger';
import type { BosPdfHeader } from '@/lib/utils/bos/bos-pdf-generator';

// ── helpers ───────────────────────────────────────────────────────────────────

async function toBase64(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

// ── Document Card ─────────────────────────────────────────────────────────────

interface DocCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  onGenerate: () => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

function DocCard({ title, description, onGenerate, disabled, disabledReason }: DocCardProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onGenerate();
    } catch (err) {
      logger.error('academic/bos', 'Failed to generate document', err);
      toast.error((err as Error).message || 'Failed to generate document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex items-center gap-4 rounded-lg border p-3'>
      <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted'>
        <FileText className='h-4 w-4 text-muted-foreground' />
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-xs text-muted-foreground'>{disabledReason ?? description}</p>
      </div>
      <Button
        size='sm'
        variant='outline'
        onClick={handleClick}
        disabled={disabled || loading}
        className='shrink-0'
      >
        <Download className='mr-2 h-3.5 w-3.5' />
        {loading ? 'Generating...' : 'Download PDF'}
      </Button>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

interface DocumentsTabProps {
  meeting: BosMeeting;
  compositionId: string;
}

export function DocumentsTab({ meeting, compositionId }: DocumentsTabProps) {
  const { data: agendaItems = [], isLoading: loadingAgenda } = useBosAgendaItems(meeting.id);
  const { data: attendance = [], isLoading: loadingAttendance } = useBosAttendance(meeting.id);
  const { data: members = [], isLoading: loadingMembers } = useBosMembersByComposition(compositionId);
  const { data: institutionCtx } = useInstitutionContext();

  const chairmanMember = members.find((m) => m.member_type === 'chairman');
  const chairmanName = chairmanMember?.display_name ?? 'Chairman';
  const externalMembers = members.filter(
    (m) => m.member_type !== 'internal_member' && m.member_type !== 'chairman'
  );

  const isLoading = loadingAgenda || loadingAttendance || loadingMembers;

  const hasAgenda = agendaItems.length > 0 || !!meeting.agenda_text;
  const hasAttendance = attendance.length > 0;

  const statusIndex = BOS_MEETING_STATUS_ORDER.indexOf(meeting.status);
  const isBeforeNoticed   = statusIndex < BOS_MEETING_STATUS_ORDER.indexOf('noticed');
  const isBeforeCompleted = statusIndex < BOS_MEETING_STATUS_ORDER.indexOf('completed');

  // Build the per-institution PDF header (logos fetched as base64 data-URLs)
  async function buildHeader(): Promise<BosPdfHeader> {
    const h = getInstitutionHeader(institutionCtx?.name);
    const [logoImage, rightLogoImage] = await Promise.all([
      toBase64('/logo.png'),
      toBase64(h.rightLogoImage),
    ]);
    return {
      institution_name: h.institution_name,
      institution_accreditation: h.institution_accreditation,
      institution_address: h.institution_address,
      logoImage,
      rightLogoImage,
    };
  }

  const generateNotice = async () => {
    const [{ generateMeetingNoticePdf }, header] = await Promise.all([
      import('@/lib/utils/bos/bos-pdf-generator'),
      buildHeader(),
    ]);
    generateMeetingNoticePdf({ header, meeting, agendaItems, chairmanName });
    toast.success('Meeting notice downloaded');
  };

  const generateMinutes = async () => {
    const [{ generateMinutesPdf }, header] = await Promise.all([
      import('@/lib/utils/bos/bos-pdf-generator'),
      buildHeader(),
    ]);
    generateMinutesPdf({ header, meeting, attendees: attendance, agendaItems, chairmanName });
    toast.success('Minutes downloaded');
  };

  const generateCallLetterFor = async (member: BosMember) => {
    const [{ generateCallLetterPdf }, header] = await Promise.all([
      import('@/lib/utils/bos/bos-pdf-generator'),
      buildHeader(),
    ]);
    generateCallLetterPdf({ header, meeting, agendaItems, expert: member, chairmanName });
    toast.success(`Call letter for ${member.display_name} downloaded`);
  };

  if (isLoading) {
    return (
      <div className='space-y-3'>
        {[1, 2, 3].map((i) => <Skeleton key={i} className='h-16 w-full' />)}
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      {/* ── General Documents ──────────────────────────── */}
      <div>
        <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3'>
          Meeting Documents
        </h4>
        <div className='space-y-2'>
          <DocCard
            title='Meeting Notice'
            description='Official notice to all members with agenda'
            disabled={!hasAgenda}
            disabledReason={!hasAgenda ? 'Add agenda items first' : undefined}
            onGenerate={generateNotice}
          />
          <DocCard
            title='Minutes of Meeting'
            description='Full minutes with attendance and resolutions'
            disabled={isBeforeCompleted || !hasAttendance}
            disabledReason={
              isBeforeCompleted
                ? 'Meeting must be completed first'
                : !hasAttendance
                ? 'Record attendance first'
                : undefined
            }
            onGenerate={generateMinutes}
          />
        </div>
      </div>

      {/* ── Call Letters ───────────────────────────────── */}
      {externalMembers.length > 0 && (
        <div>
          <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3'>
            Call Letters — External Experts
          </h4>
          <div className='space-y-2'>
            {externalMembers.map((member) => (
              <div key={member.id} className='flex items-center gap-4 rounded-lg border p-3'>
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted'>
                  <Users className='h-4 w-4 text-muted-foreground' />
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium'>{member.display_name}</p>
                  <p className='text-xs text-muted-foreground'>
                    {member.display_designation ?? ''}
                    {member.display_institution ? ` · ${member.display_institution}` : ''}
                  </p>
                </div>
                <Badge variant='outline' className='text-xs capitalize'>
                  {member.member_type.replace('_', ' ')}
                </Badge>
                <Button
                  size='sm'
                  variant='outline'
                  className='shrink-0'
                  onClick={() => generateCallLetterFor(member)}
                  disabled={isBeforeNoticed || !hasAgenda}
                  title={
                    isBeforeNoticed
                      ? 'Available after notice is sent'
                      : !hasAgenda
                      ? 'Add agenda items first'
                      : undefined
                  }
                >
                  <Download className='mr-2 h-3.5 w-3.5' />
                  Call Letter
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
