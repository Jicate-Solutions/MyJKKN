'use client';

// ============================================================================
// The activity trail for one handover — "what has happened".
//
// Extracted from my-desk/page.tsx unchanged so BOTH halves of the desk can use
// it: the receiving half (what was handed to me) and the sending half (what I
// handed out). The sending half needs exactly this and nothing different, so
// copying it would have been a second thing to keep in step — and the one line
// that matters most here is the `unavailable` branch, which is easy to drop in
// a copy and impossible to notice once dropped.
//
// WHY `unavailable` IS NOT COSMETIC
//   The audit read is chunked, and a chunk can fail. Rendering an empty trail
//   after a failed read is the page ASSERTING, from a request that never
//   arrived, that nothing ever happened — about somebody else's work. That is a
//   claim the page cannot support, so a failed read says so out loud instead.
// ============================================================================

import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { describeAudit, personName, type AuditRow, type DeskPerson } from '../_lib/desk';

export function Trail({
  entries,
  people,
  unavailable,
}: {
  entries: AuditRow[];
  people: Record<string, DeskPerson> | undefined;
  /** The audit read failed. An empty trail here would be a claim, not a fact. */
  unavailable: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (unavailable) {
    return (
      <span className="text-xs text-muted-foreground">
        The history could not be loaded — this does not mean nothing happened.
      </span>
    );
  }
  if (entries.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <History className="mr-1 h-3.5 w-3.5" />
          What has happened ({entries.length})
          <ChevronDown
            className={`ml-1 h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-2 border-l pl-4">
          {entries.map((entry) => {
            const { headline, body } = describeAudit(entry);
            const who = personName(people, entry.actor_user_id);
            return (
              <li key={entry.id} className="text-xs">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{headline}</span>
                  <span className="text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                    {who ? ` · ${who}` : ''}
                  </span>
                </div>
                {body && <p className="mt-0.5 text-muted-foreground">{body}</p>}
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
