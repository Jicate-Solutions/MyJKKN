'use client';

/**
 * What's New — this week's highlights.
 *
 * The few changes someone read, wrote up in plain English, and approved. It
 * sits above the plain list because the plain list answers "what changed" and
 * this answers the two questions the Director actually asked for: what it means
 * for me, and what I can now do.
 *
 * IT IS ABSENT, NOT EMPTY, when there is nothing to show. A week nobody wrote
 * up renders no heading, no card and no "no highlights yet" placeholder — the
 * page then looks exactly as it does today, which is the whole compatibility
 * requirement. Same for a failed fetch: the plain list below is the thing
 * people came for and it is unaffected, so a highlights failure says nothing
 * rather than pushing an error card above working content. (The sibling
 * archive failure taught that lesson the other way round — see the archiveError
 * note in lib/changelog/use-changelog.ts.)
 *
 * Everything here was approved by a person. Nothing is generated at read time.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Wrench, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChangelogModule } from '@/lib/changelog/types';

/** Only the kinds selection offers — 'faster' is never a highlight. */
type HighlightKind = 'new' | 'fixed' | 'security';

interface StripItem {
  sha: string;
  date: string;
  kind: HighlightKind;
  module_key: string;
  headline: string | null;
  affects: string | null;
  action: string | null;
}

const KIND_STYLE: Record<HighlightKind, { icon: typeof Sparkles; chip: string; label: string }> = {
  new: {
    icon: Sparkles,
    label: 'New',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
  fixed: {
    icon: Wrench,
    label: 'Fixed',
    chip: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-400/20',
  },
  security: {
    icon: ShieldCheck,
    label: 'Security',
    chip: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/20',
  },
};

interface HighlightsStripProps {
  modules: Record<string, ChangelogModule>;
}

export function HighlightsStrip({ modules }: HighlightsStripProps) {
  const [items, setItems] = useState<StripItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/whats-new/highlights', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body || !Array.isArray(body.highlights)) return;
        setItems(body.highlights as StripItem[]);
      })
      .catch(() => {
        // Deliberately silent. See the header: the plain list is unaffected and
        // an error card above it would be louder than the thing that failed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Absent, not empty — while loading, on failure, and for a week nobody wrote up.
  if (!items || items.length === 0) return null;

  return (
    <section aria-labelledby="whats-new-highlights" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="whats-new-highlights" className="text-base font-semibold text-foreground">
          Worth knowing this week
        </h2>
        <p className="text-xs text-muted-foreground">
          {items.length === 1 ? 'One change' : `${items.length} changes`} that affect how you work —
          everything else is in the list below.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((h) => {
          const style = KIND_STYLE[h.kind] ?? KIND_STYLE.new;
          const Icon = style.icon;
          const label = modules[h.module_key]?.label ?? null;
          return (
            <li
              key={h.sha}
              className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
                    style.chip
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {style.label}
                </span>
                {label && (
                  <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                )}
              </div>

              {/* break-words rather than truncate: a headline is one sentence and
                  cutting it is worse than letting it wrap at 375px. */}
              <p className="mt-2 break-words text-sm font-semibold leading-snug text-foreground">
                {h.headline}
              </p>

              <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
                <div>
                  <dt className="inline font-medium text-muted-foreground">Who it affects: </dt>
                  <dd className="inline break-words text-foreground/90">{h.affects}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-muted-foreground">What you can do now: </dt>
                  <dd className="inline break-words text-foreground/90">{h.action}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
