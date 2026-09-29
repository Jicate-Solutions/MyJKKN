'use client';

// components/dashboard/campus-drives-student-card.tsx — open campus drives the
// learner qualifies for, on their own dashboard.
//
// Why: the notification dropped when a drive opens was the ONLY route to the
// willingness page. /cdc/drives is coordinator surface gated on cdc.drives.view,
// which learners do not hold, so a missed or dismissed notification meant the
// learner never learned a recruiter was coming. This is the second door.
//
// Self-hides when the learner has no open drive, so it never occupies space on
// the dashboard of someone with nothing to respond to — same discipline as the
// UDYOG card it sits beside. Shared by the v2 dashboard and the classic one.

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Calendar, MapPin, IndianRupee, CheckCircle2 } from 'lucide-react';
import { useMyCdcDrives, type MyCdcDrive } from '@/hooks/cdc/use-my-cdc-drives';

function formatDate(d: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Days until the willingness window shuts, when that is known and imminent. */
function closingIn(iso: string | null): string | null {
  if (!iso) return null;
  const close = new Date(iso).getTime();
  if (Number.isNaN(close)) return null;
  const days = Math.ceil((close - Date.now()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'closes today';
  if (days === 1) return 'closes tomorrow';
  if (days <= 7) return `closes in ${days} days`;
  return null;
}

function DriveRow({ drive }: { drive: MyCdcDrive }) {
  const date = formatDate(drive.drive_date);
  const closing = closingIn(drive.willingness_window_close_at);
  const declared = drive.willingness_status;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight">{drive.recruiter_name ?? drive.title}</p>
          {drive.job_role_title ? (
            <p className="text-sm text-muted-foreground">{drive.job_role_title}</p>
          ) : null}
        </div>
        {declared === 'willing' || declared === 'confirmed' ? (
          <Badge
            variant="outline"
            className="shrink-0 bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {declared === 'confirmed' ? 'Confirmed' : "You're in"}
          </Badge>
        ) : declared === 'withdrawn' ? (
          <Badge variant="outline" className="shrink-0">
            Declined
          </Badge>
        ) : !drive.is_open ? (
          <Badge variant="outline" className="shrink-0 text-muted-foreground">
            Closed
          </Badge>
        ) : closing ? (
          <Badge
            variant="outline"
            className="shrink-0 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40"
          >
            {closing}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {date ? (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {date}
          </span>
        ) : null}
        {drive.job_location ? (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {drive.job_location}
          </span>
        ) : null}
        {drive.expected_package_lpa ? (
          <span className="flex items-center gap-1">
            <IndianRupee className="h-3 w-3" />
            {drive.expected_package_lpa} LPA
          </span>
        ) : null}
      </div>

      {/* A shut window offers no button. The willingness page refuses once the
          window closes, so a link here would be an invitation to be turned
          away. The row stays visible on purpose: a learner who missed a drive
          should be able to see that it happened, not have it vanish. */}
      {drive.is_open ? (
        <Button asChild size="sm" variant={declared ? 'outline' : 'default'} className="w-full">
          <Link href={`/cdc/drives/${drive.id}/willingness`}>
            {declared ? 'Change your answer' : "Tell them you're interested"}
          </Link>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {declared
            ? 'This drive has closed. Your answer is with the Career Development Centre.'
            : 'This drive has closed, so it can no longer be answered.'}
        </p>
      )}
    </div>
  );
}

export function CampusDrivesStudentCard() {
  const { data, isLoading, error } = useMyCdcDrives();

  // Nothing to respond to, or we cannot tell yet — show nothing at all.
  if (isLoading || error || !data || data.length === 0) return null;

  // The self-hiding discipline this card shipped with, kept now that closed
  // drives are listed too: a learner with nothing open and nothing declared has
  // nothing to do here, so the card takes no space on their dashboard. A closed
  // drive they DID answer keeps the card, because their answer is a thing they
  // may want to see.
  if (!data.some((d) => d.is_open || d.willingness_status)) return null;

  // Only a drive that can still be answered counts as something to answer.
  // Until 16 Sep this counted closed ones too, so the badge asked the learner
  // for answers the willingness page would then refuse to take.
  const undecided = data.filter((d) => d.is_open && !d.willingness_status).length;

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-emerald-600" />
            Your campus drives
          </CardTitle>
          {undecided > 0 ? (
            <Badge
              variant="outline"
              className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40"
            >
              {undecided} to answer
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {undecided > 0
            ? 'Let the Career Development Centre know whether you want to take part.'
            : 'Nothing is waiting on you. Drives that have closed are shown for your record.'}
        </p>
        {data.map((drive) => (
          <DriveRow key={drive.id} drive={drive} />
        ))}
      </CardContent>
    </Card>
  );
}
