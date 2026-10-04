// components/campus-walk/joined-reports-list.tsx
// ============================================================================
// The extra reports people added to an open Campus Walk job ("Add to the open
// report" on a QR sticker). Shown on the fix screen and the approvals screen,
// so the person fixing it and the person signing it off see every note and
// photo, not only the first one.
//
// D10: no names. Each entry is "Reported again" with a time, a note and an
// optional photo — never who sent it.
// ============================================================================

import { Users } from 'lucide-react';

export interface JoinedReportItem {
  note: string;
  at: string | null;
  /** Signed URL — the campus-walk bucket is private. Null when no photo, or it has been purged. */
  photoUrl: string | null;
  /** True when the report had a photo but no link could be made for it. */
  photoMissing: boolean;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function JoinedReportsList({ reports }: { reports: JoinedReportItem[] }) {
  if (reports.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Reported again by {reports.length} more {reports.length === 1 ? 'person' : 'people'}
      </p>
      <ul className="space-y-2">
        {reports.map((r, i) => (
          <li key={i} className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {r.note && <p className="whitespace-pre-wrap">{r.note}</p>}
            {r.at && <p className="mt-0.5 text-xs text-muted-foreground">{formatWhen(r.at)}</p>}
            {r.photoUrl ? (
              <a href={r.photoUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.photoUrl}
                  alt="Photo sent with this report"
                  className="max-h-64 w-full rounded-md border object-cover"
                />
              </a>
            ) : r.photoMissing ? (
              <p className="mt-1 text-xs text-muted-foreground">A photo was sent but could not be loaded.</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
