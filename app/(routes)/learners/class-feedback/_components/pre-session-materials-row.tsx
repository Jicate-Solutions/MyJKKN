'use client';

// Pre-session materials — learner view (Rank 3a). For one pending session, lists
// the materials a Senior Learner posted; tapping one logs the open (the objective
// "was it actually used" trace that pairs with the Rank 2 self-report) and opens
// the link in a new tab. Renders nothing when the session has no materials — so
// most pending rows are unaffected. The open-log is fire-and-forget: the link
// still opens even if the log call fails (the <a> navigates natively).

import { BookOpen, CheckCircle2, ExternalLink } from 'lucide-react';
import { useSessionResources, useLogResourceOpen } from '@/hooks/use-session-feedback';
import type { PendingSession } from '@/types/session-feedback';

const BRAND = '#0b6d41';

export function PreSessionMaterialsRow({ session }: { session: PendingSession }) {
  const { data } = useSessionResources(
    session.timetable_id,
    session.attendance_date,
    session.period_id,
  );
  const logOpen = useLogResourceOpen();

  const list = data ?? [];
  if (list.length === 0) return null;

  return (
    <div className="border-t bg-muted/20 px-4 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" style={{ color: BRAND }} />
        Study materials for this class
      </div>
      <ul className="space-y-1">
        {list.map((r) => (
          <li key={r.id}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logOpen.mutate(r.id)}
              className="inline-flex items-center gap-1.5 text-sm hover:underline"
              style={{ color: BRAND }}
            >
              <span className="truncate">{r.title}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
              {r.opened && (
                <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" /> opened
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
