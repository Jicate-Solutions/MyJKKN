'use client';

/**
 * DriveReportsCard — the drive page's one place for Excel reports.
 *
 * The workbooks themselves already exist on their own pages (willingness
 * tracker, attendance); this card only puts the downloads where the CDC team
 * looks first. Downloads go through fetch so a "nothing to export" or
 * permission answer shows as a toast instead of a raw JSON page.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Award, ClipboardCheck, FileSpreadsheet, Loader2, UserCheck, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cdcDriveAssignedExportUrl, cdcDriveResponsesExportUrl } from '@/hooks/cdc/use-cdc-drives';
import { cdcDriveAttendanceExportUrl } from '@/hooks/cdc/use-cdc-drive-day';

interface Report {
  key: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
  fallbackName: string;
}

function fileNameFrom(res: Response, fallback: string): string {
  const header = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

export function DriveReportsCard({ driveId }: { driveId: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  const reports: Report[] = [
    {
      key: 'willingness',
      label: 'Willingness report',
      hint: 'Every assigned learner — willing, not willing or pending.',
      icon: Users,
      url: cdcDriveAssignedExportUrl(driveId),
      fallbackName: 'willingness_report.xlsx',
    },
    {
      key: 'responses',
      label: 'Willingness responses',
      hint: 'Only learners who answered, with contact, CGPA and arrears.',
      icon: UserCheck,
      url: cdcDriveResponsesExportUrl(driveId),
      fallbackName: 'willingness_responses.xlsx',
    },
    {
      key: 'attendance',
      label: 'Attendance report',
      hint: 'Participants with present / absent / late, plus a summary sheet.',
      icon: ClipboardCheck,
      url: cdcDriveAttendanceExportUrl(driveId),
      fallbackName: 'attendance_report.xlsx',
    },
    {
      key: 'selection',
      label: 'Selection report',
      hint: 'Selected learners on one sheet, not selected on another, plus a summary.',
      icon: Award,
      url: `/api/cdc/drives/${driveId}/selection?format=xlsx&sheets=split`,
      fallbackName: 'selection_report.xlsx',
    },
  ];

  async function download(report: Report) {
    setBusy(report.key);
    try {
      const res = await fetch(report.url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || `${report.label} could not be downloaded.`);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = fileNameFrom(res, report.fallbackName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      toast.error('Network error — the report could not be downloaded.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          Excel reports
        </CardTitle>
        <CardDescription>Download this drive&apos;s reports as Excel files.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {reports.map((r) => (
          <Button
            key={r.key}
            type="button"
            variant="outline"
            className="h-auto justify-start py-2 text-left"
            disabled={busy !== null}
            onClick={() => download(r)}
          >
            {busy === r.key ? (
              <Loader2 className="h-4 w-4 mr-3 shrink-0 animate-spin" />
            ) : (
              <r.icon className="h-4 w-4 mr-3 shrink-0 text-emerald-700" />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-medium">{r.label}</span>
              <span className="block whitespace-normal text-xs font-normal text-muted-foreground">{r.hint}</span>
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
