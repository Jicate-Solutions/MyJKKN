'use client';

// One-click attendance-report PDF, sitting right next to the attendance action
// it reports on — the session row's clipboard icon, and the day band's
// "Mark day attendance" button.
//
// Data comes from /api/events/[eventId]/induction-attendance, not straight from
// the roster RPC: the report is program-wise and prints date of birth and mobile
// number, which live on learners_profiles rather than in the roster payload.
// That route re-checks the caller's own manage rights before returning anything.
//
// The event + institution letterhead fields are fetched on CLICK rather than
// threaded down as props: the schedule renders 20+ of these buttons and none of
// them should cost a query until someone actually wants a PDF.
import { useState } from 'react';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { type InductionSessionRow } from '@/lib/services/induction/induction-service';
import {
  downloadInductionAttendancePdf,
  type InductionAttendanceReportRow,
} from '@/lib/utils/induction/induction-attendance-pdf';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

const supabase = createClientSupabaseClient();

/** Safe filename fragment — "Day 2" / a session title become "Day-2". */
const slug = (s: string) =>
  s.trim().replace(/[^\w\d]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Shared by this button and the report page — one fetch contract, not two. */
export async function fetchAttendanceReportRows(
  eventId: string,
  scope: { sessionId: string } | { dayNumber: number },
): Promise<InductionAttendanceReportRow[]> {
  const qs = 'sessionId' in scope
    ? `sessionId=${encodeURIComponent(scope.sessionId)}`
    : `day=${scope.dayNumber}`;
  const res = await fetch(`/api/events/${eventId}/induction-attendance?${qs}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return (json.rows ?? []).map((r: any) => ({
    name: r.name,
    program_code: r.program_code ?? null,
    program_name: r.program_name ?? null,
    date_of_birth: r.date_of_birth ?? null,
    mobile: r.mobile ?? null,
    status: r.status ?? null,
    is_mixed: !!r.is_mixed,
    // The Feedback Report's ONLY input. Dropping it here printed "No" for every
    // fresher no matter what the API returned, and because the field is OPTIONAL
    // on InductionAttendanceReportRow, TypeScript never flagged the omission.
    // This mapper must stay in step with InductionAttendanceApiRow.
    feedback_submitted: !!r.feedback_submitted,
  }));
}

type Props =
  & { eventId: string; className?: string }
  & (
    | { session: InductionSessionRow; dayNumber?: never; dayLabel?: never }
    | { session?: never; dayNumber: number; dayLabel: string }
  );

export function AttendancePdfButton({ eventId, session, dayNumber, dayLabel, className }: Props) {
  const [busy, setBusy] = useState(false);
  const isDay = !session;
  const title = isDay ? `Download ${dayLabel} attendance PDF` : 'Download attendance PDF';

  const run = async () => {
    setBusy(true);
    try {
      const [{ data: ev }, rows] = await Promise.all([
        supabase
          .from('events')
          .select('name,institutions(name,counselling_code,logo_url)')
          .eq('id', eventId)
          .maybeSingle(),
        fetchAttendanceReportRows(
          eventId,
          isDay ? { dayNumber: dayNumber! } : { sessionId: session!.id },
        ),
      ]);

      if (rows.length === 0) {
        toast.error('Nothing to export — this roster is empty.');
        return;
      }

      const inst = (ev as any)?.institutions ?? null;
      const eventName = (ev as any)?.name ?? 'Fresher Induction';
      const scopeLabel = isDay ? dayLabel! : session!.title;

      await downloadInductionAttendancePdf(
        {
          institutionName: inst?.name ?? null,
          institutionCode: inst?.counselling_code ?? null,
          institutionLogoUrl: inst?.logo_url ?? null,
          eventName,
          scopeLabel,
          scopeDate: session
            ? `${fmtDate(session.start_at)}, ${fmtTime(session.start_at)} - ${fmtTime(session.end_at)}`
            : null,
          scopeVenue: session
            ? [session.venue_text || null, session.batch_label ? `Batch ${session.batch_label}` : null]
                .filter(Boolean).join(' | ') || null
            : null,
          rows,
        },
        `Attendance-${slug(eventName)}-${slug(scopeLabel)}.pdf`,
      );
      toast.success('Attendance report downloaded.');
    } catch (e: any) {
      toast.error(`Couldn't generate the PDF: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  // Day band: a labelled outline button matching DayAttendanceDialog's trigger.
  if (isDay) {
    return (
      <Button size="sm" variant="outline" className={`h-7 gap-1 text-xs ${className ?? ''}`}
        onClick={run} disabled={busy} title={title}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Day attendance PDF
      </Button>
    );
  }

  // Session row: a ghost icon, same size as the neighbouring action icons.
  return (
    <Button size="icon" variant="ghost" className={className} onClick={run} disabled={busy}
      title={title} aria-label={title}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </Button>
  );
}
