'use client';

import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { BosMeeting, BOS_MEETING_STATUS_ORDER, isBosChairmanRow } from '@/types/bos';
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
  /**
   * Button label override. Defaults to "Download PDF" to preserve existing
   * callers; pass e.g. "Download Word" for the DOCX variant.
   */
  buttonLabel?: string;
}

function DocCard({ title, description, onGenerate, disabled, disabledReason, buttonLabel = 'Download PDF' }: DocCardProps) {
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
        {loading ? 'Generating...' : buttonLabel}
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
  // Board name — read directly from the meeting embed (server-enriched via
  // fetchCoeBoardMaps in /api/bos/meetings/[id]). Previously this used
  // useBosBoard(meeting.board_id), which depended on the user's COE board
  // scope; for any user whose scope didn't include this meeting's board
  // (e.g. faculty members on cross-institution boards) the lookup returned
  // undefined and the PDF heading lost the board-name portion. The detail
  // endpoint now guarantees meeting.board is populated whenever the COE
  // board lookup succeeds, so we just read it here. The "Board of Studies -"
  // prefix is stripped because COE's board_name already includes it for
  // some boards but not others — we want just the discipline label
  // (e.g. "COMPUTER SCIENCE").
  const boardName = meeting.board?.board_name
    ?.replace(/^\s*Board of Studies\s*-\s*/i, '')
    .trim();

  const chairmanMember = members.find((m) => isBosChairmanRow(m));
  const chairmanName = chairmanMember?.display_name ?? 'Chairman';

  const isLoading = loadingAgenda || loadingAttendance || loadingMembers;

  const hasAgenda = agendaItems.length > 0 || !!meeting.agenda_text;
  const hasAttendance = attendance.length > 0;

  const statusIndex = BOS_MEETING_STATUS_ORDER.indexOf(meeting.status);
  const isBeforeCompleted = statusIndex < BOS_MEETING_STATUS_ORDER.indexOf('completed');

  // Build the per-institution PDF header (logos + seal/sign fetched as base64
  // data-URLs). Seal + sign are optional — only Arts/Science populates them in
  // institution-header.ts; Engineering returns undefined and the meeting-notice
  // generator falls back to the text-only "Principal" line.
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

  const generateNotice = async () => {
    const [{ generateMeetingNoticePdf }, header] = await Promise.all([
      import('@/lib/utils/bos/bos-pdf-generator'),
      buildHeader(),
    ]);
    generateMeetingNoticePdf({ header, meeting, agendaItems, chairmanName });
    toast.success('Meeting notice downloaded');
  };

  const generateMinutes = async () => {
    try {
      const [header, h] = await Promise.all([
        buildHeader(),
        Promise.resolve(getInstitutionHeader(institutionCtx?.name)),
      ]);

      const response = await fetch(`/api/bos/meetings/${meeting.id}/minutes-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting,
          attendees: attendance,
          agendaItems,
          chairmanName,
          boardName,
          boardType: meeting.board_type,
          institutionName: h.institution_name || institutionCtx?.name || 'J.K.K. NATARAJA COLLEGE',
          institutionAddress: h.institution_address,
          institutionAccreditation: h.institution_accreditation,
          secretaryName: h.officials?.secretary_name || 'Secretary',
          principalName: h.officials?.principal_name || 'Principal',
          principalTitle: 'Principal',
          contactCell: h.officials?.contact_cell,
          contactWeb: h.officials?.contact_web,
          contactEmail: h.officials?.contact_email,
          logoImage: header.logoImage,
          rightLogoImage: header.rightLogoImage,
        }),
      });

      if (!response.ok) throw new Error('PDF generation failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `minutes-meeting-${meeting.meeting_number}-${meeting.academic_year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Minutes downloaded');
    } catch (error) {
      console.error('Failed to generate minutes PDF:', error);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  // DOCX twin of generateMinutes — same content, different renderer. The module
  // is lazy-imported so the docx library (~300KB gzipped) doesn't ship in the
  // initial bundle for users who never download a Word doc.
  const generateMinutesWord = async () => {
    const [{ generateMinutesDocx }, header] = await Promise.all([
      import('@/lib/utils/bos/meeting-minutes-docx'),
      buildHeader(),
    ]);
    await generateMinutesDocx({
      header,
      meeting,
      attendees: attendance,
      agendaItems,
      chairmanName,
      boardName,
    });
    toast.success('Minutes (Word) downloaded');
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
          {/* Word-format twin of the Minutes PDF. Same content, different
              renderer (docx library, lazy-imported in generateMinutesWord). */}
          <DocCard
            title='Minutes of Meeting (Word)'
            description='Same content as the PDF, in editable .docx format'
            disabled={isBeforeCompleted || !hasAttendance}
            disabledReason={
              isBeforeCompleted
                ? 'Meeting must be completed first'
                : !hasAttendance
                ? 'Record attendance first'
                : undefined
            }
            onGenerate={generateMinutesWord}
            buttonLabel='Download Word'
          />
        </div>
      </div>

    </div>
  );
}
