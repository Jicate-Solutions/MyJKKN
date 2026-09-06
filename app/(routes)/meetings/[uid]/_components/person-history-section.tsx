// app/(routes)/meetings/[uid]/_components/person-history-section.tsx
//
// "Past meetings with this person" — the relationship, made visible.
//
// A server component on purpose. Unlike its neighbours (AgendaSection,
// ActionItemsSection, CarriedOverSection) this panel has NO mutations: there is
// nothing to click except a link to another meeting, so there is no state, no
// transition and no reason to ship it to the browser.
//
// Mobile first — the Director reads this on an iPhone. Every row is a single
// full-width column with wrapping text (no table, nothing that can push the
// page wider than the viewport), and the whole row is the tap target, which
// keeps it comfortably past the 44px minimum at 390px.

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import {
  formatDayTime,
  outcomeLabel,
  summarize,
  type MeetingOutcome,
  type PersonHistory,
} from '@/lib/services/meetings/meeting-person-history-service';

interface PersonHistorySectionProps {
  history: PersonHistory;
}

// Colour carries the same meaning as the words, never instead of them — the
// label is always rendered, so this is redundant encoding rather than the only
// signal. Both themes are defined explicitly; nothing relies on inheriting a
// colour that only exists in one of them.
const OUTCOME_CLASS: Record<MeetingOutcome, string> = {
  happened:
    'border-green-300/60 bg-green-50 text-green-800 dark:border-green-800/50 dark:bg-green-950/40 dark:text-green-300',
  no_show:
    'border-orange-300/60 bg-orange-50 text-orange-800 dark:border-orange-800/50 dark:bg-orange-950/40 dark:text-orange-300',
  cancelled:
    'border-red-300/60 bg-red-50 text-red-800 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300',
  not_recorded:
    'border-muted-foreground/25 bg-muted text-muted-foreground dark:border-muted-foreground/25',
};

export function PersonHistorySection({ history }: PersonHistorySectionProps) {
  // Defence in depth: the page already declines to render this panel when
  // there is no history, and this makes it impossible to produce an empty box
  // by calling the component directly.
  if (history.meetings.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm">{summarize(history)}</p>

      <ul className="space-y-2">
        {history.meetings.map((m) => (
          <li key={m.uid}>
            <Link
              href={`/meetings/${m.uid}`}
              // min-h-11 = 44px, the floor for a thumb. Row-wide so the whole
              // card is the target, not just the text inside it.
              className="flex min-h-11 flex-col gap-1 rounded-md border bg-card p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{formatDayTime(m.startTime)}</span>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${OUTCOME_CLASS[m.outcome]}`}
                >
                  {outcomeLabel(m.outcome)}
                </span>
                <ArrowUpRight
                  className="ml-auto h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </div>

              {/* What it was booked about. The guest's note is the only account
                  of this that exists anywhere — there are no minutes. */}
              {m.note ? (
                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                  {m.note}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No note was given.</p>
              )}

              {m.typeTitle ? (
                <p className="break-words text-xs text-muted-foreground">{m.typeTitle}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* A silent cap reads as "that's all there is". Say the number. */}
      {history.hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          + {history.hiddenCount} earlier {history.hiddenCount === 1 ? 'meeting' : 'meetings'} not
          shown.
        </p>
      ) : null}
    </div>
  );
}
