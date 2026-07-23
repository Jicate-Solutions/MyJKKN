'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Stage = 'initiated' | 'enquiry' | 'hearing' | 'decision' | 'closed';
type Outcome = 'warning' | 'suspension' | 'termination' | 'exonerated';

const NEXT_STAGE_LABEL: Record<Stage, string | null> = {
  initiated: 'Start enquiry',
  enquiry: 'Schedule hearing',
  hearing: 'Move to decision',
  decision: null,
  closed: null,
};

export function AdvanceStageButton({
  caseId,
  currentStage,
}: {
  caseId: string;
  currentStage: Stage;
}) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const label = NEXT_STAGE_LABEL[currentStage];
  if (!label) return null;

  const submit = () => {
    if (description.trim().length < 5) {
      toast.error('Add a short description (min 5 chars).');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/disciplinary/cases/${caseId}/advance`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ description }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success('Stage advanced.');
        setOpen(false);
        setDescription('');
        router.refresh();
      } catch (e) {
        toast.error(
          `Advance failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label htmlFor="advance-desc" className="text-sm">
        {label} — description
      </Label>
      <Textarea
        id="advance-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder={
          currentStage === 'initiated'
            ? 'Who is conducting the enquiry, scope, expected dates...'
            : currentStage === 'enquiry'
              ? 'Enquiry findings summary + hearing schedule...'
              : 'Hearing notes + transition to decision...'
        }
      />
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} size="sm">
          {pending ? 'Saving...' : 'Confirm advance'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setDescription('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AddNoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (description.trim().length < 3) {
      toast.error('Note too short.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/disciplinary/cases/${caseId}/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ description }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success('Note added.');
        setDescription('');
        router.refresh();
      } catch (e) {
        toast.error(
          `Add note failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="note-desc" className="text-sm">
        Add a note (e.g. enquiry finding, hearing transcript summary)
      </Label>
      <Textarea
        id="note-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />
      <Button onClick={submit} disabled={pending} size="sm" variant="outline">
        {pending ? 'Adding...' : 'Add note'}
      </Button>
    </div>
  );
}

export function AddWitnessForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [statement, setStatement] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (name.trim().length < 2) {
      toast.error('Witness name required.');
      return;
    }
    if (statement.trim().length < 5) {
      toast.error('Witness statement required (min 5 chars).');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/hr/disciplinary/cases/${caseId}/witnesses`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, role, statement }),
          },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success('Witness added.');
        setOpen(false);
        setName('');
        setRole('');
        setStatement('');
        router.refresh();
      } catch (e) {
        toast.error(
          `Add witness failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add witness
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <Label htmlFor="witness-name" className="text-sm">
          Witness name
        </Label>
        <Input
          id="witness-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="witness-role" className="text-sm">
          Role (optional)
        </Label>
        <Input
          id="witness-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="colleague / supervisor / external / ..."
        />
      </div>
      <div>
        <Label htmlFor="witness-statement" className="text-sm">
          Statement
        </Label>
        <Textarea
          id="witness-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={4}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} size="sm">
          {pending ? 'Saving...' : 'Save witness'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setName('');
            setRole('');
            setStatement('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function DecisionForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [note, setNote] = useState('');
  const [suspStart, setSuspStart] = useState('');
  const [suspEnd, setSuspEnd] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!outcome) {
      toast.error('Select an outcome.');
      return;
    }
    if (note.trim().length < 10) {
      toast.error('Decision rationale required (min 10 chars).');
      return;
    }
    if (outcome === 'suspension' && (!suspStart || !suspEnd)) {
      toast.error('Suspension start and end dates required.');
      return;
    }

    if (outcome === 'termination') {
      const proceed = window.confirm(
        'Termination is final. This will close the case AND auto-create an offboarding case (separation_type=termination). Continue?',
      );
      if (!proceed) return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/disciplinary/cases/${caseId}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            outcome,
            outcome_note: note,
            suspension_start_date:
              outcome === 'suspension' ? suspStart : undefined,
            suspension_end_date: outcome === 'suspension' ? suspEnd : undefined,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const j = await res.json();
        if (j.offboarding_case_id) {
          toast.success(
            `Decision recorded. Offboarding case ${j.offboarding_case_id.slice(0, 8)}... auto-created.`,
          );
        } else {
          toast.success('Decision recorded.');
        }
        router.refresh();
      } catch (e) {
        toast.error(
          `Record decision failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="text-sm font-medium">Record decision (closes case)</div>

      <div>
        <Label htmlFor="outcome" className="text-sm">
          Outcome
        </Label>
        <select
          id="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as Outcome | '')}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">— Select outcome —</option>
          <option value="warning">Warning (formal)</option>
          <option value="suspension">Suspension</option>
          <option value="termination">Termination</option>
          <option value="exonerated">Exonerated</option>
        </select>
      </div>

      {outcome === 'suspension' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="susp-start" className="text-sm">
              Suspension start
            </Label>
            <Input
              id="susp-start"
              type="date"
              value={suspStart}
              onChange={(e) => setSuspStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="susp-end" className="text-sm">
              Suspension end
            </Label>
            <Input
              id="susp-end"
              type="date"
              value={suspEnd}
              onChange={(e) => setSuspEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="decision-note" className="text-sm">
          Rationale (English explanation for the record)
        </Label>
        <Textarea
          id="decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Summarise findings, hearing conclusions, and why this outcome was chosen..."
        />
      </div>

      {outcome === 'termination' && (
        <div className="rounded-md border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-100">
          <strong>Termination</strong> will additionally open an offboarding
          case (separation_type=termination) in
          /hr/admin/offboarding for F&F + paperwork. Disciplinary case will be
          marked closed.
        </div>
      )}

      <Button
        onClick={submit}
        disabled={pending || !outcome}
        variant={outcome === 'termination' ? 'destructive' : 'default'}
      >
        {pending ? 'Recording...' : 'Record decision & close case'}
      </Button>
    </div>
  );
}
