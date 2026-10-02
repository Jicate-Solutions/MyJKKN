'use client';

// Moved verbatim in behaviour from the old leadership page.
//
// An unrecorded basis says "not recorded" in those words. It is never rendered
// as ex officio: for appointments nobody has discussed, "it comes with the other
// post" is a guess — the exact guess the Director ruled out for the one
// appointment we do know about (personal to the individual, does not pass to a
// successor). A column nobody can see does not prevent that misunderstanding.

import { useState } from 'react';
import { HelpCircle, Lock, UserX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import type { AppointmentBasis } from '@/hooks/use-leadership';
import type { LeaderPerson } from '@/lib/organizations/leadership-stats';

/** An unfilled post. Deliberately loud: this is the finding, not an empty cell. */
export function NotAssigned() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
      <UserX className="h-4 w-4 shrink-0" aria-hidden />
      Not assigned
    </span>
  );
}

function recordedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function BasisLine({ holder }: { holder: LeaderPerson }) {
  const recorded = holder.basis_code != null;
  const personal = holder.basis_passes_to_successor === false;
  const when = recordedOn(holder.assigned_at);

  if (!recorded) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Why this post was given is not recorded.
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-1">
      <Badge
        variant="outline"
        className={
          personal
            ? 'border-violet-500 text-violet-700 dark:text-violet-400'
            : 'border-border text-muted-foreground'
        }
      >
        {personal && <Lock className="mr-1 h-3 w-3" aria-hidden />}
        {holder.basis_label ?? holder.basis_code}
      </Badge>
      {personal && (
        <p className="text-xs font-medium text-violet-700 dark:text-violet-400">
          Does not pass to a successor.
        </p>
      )}
      {holder.basis_note && (
        <p className="max-w-prose text-xs text-muted-foreground">{holder.basis_note}</p>
      )}
      {(holder.assigned_by_name || when) && (
        <p className="text-xs text-muted-foreground">
          Recorded
          {holder.assigned_by_name ? ` by ${holder.assigned_by_name}` : ''}
          {when ? ` on ${when}` : ''}.
        </p>
      )}
    </div>
  );
}

export function BasisEditor({
  holder,
  options,
  busy,
  onCancel,
  onSave,
}: {
  holder: LeaderPerson;
  options: AppointmentBasis[];
  busy: boolean;
  onCancel: () => void;
  onSave: (basisCode: string, basisNote: string) => void;
}) {
  const [code, setCode] = useState<string>(holder.basis_code ?? '');
  const [note, setNote] = useState<string>(holder.basis_note ?? '');
  const chosen = options.find((o) => o.code === code);

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Why was this post given?
        </label>
        <SearchableSelect
          value={code}
          onValueChange={setCode}
          options={options.map((o) => ({ value: o.code, label: o.label }))}
          placeholder="Choose a reason…"
          searchPlaceholder="Search reasons…"
          disabled={busy}
          className="w-full"
        />
        {chosen && (
          <p className="mt-1.5 max-w-prose text-xs text-muted-foreground">{chosen.description}</p>
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Conditions, in your own words — including when it ends
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="e.g. Personal to this individual, until they leave JKKN. Does not pass to whoever succeeds them as CAO."
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !code} onClick={() => onSave(code, note)}>
          Save reason
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
