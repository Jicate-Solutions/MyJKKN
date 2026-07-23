'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export interface StaffOption {
  id: string;
  name: string;
}

export interface MemoOption {
  id: string;
  staff_id: string;
  reason: string;
  issued_at: string;
  status: string;
}

export function InitiateCaseForm({
  staff,
  memosByStaff,
}: {
  staff: StaffOption[];
  memosByStaff: Record<string, MemoOption[]>;
}) {
  const router = useRouter();
  const [staffId, setStaffId] = useState<string>('');
  const [allegedMisconduct, setAllegedMisconduct] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [selectedMemoIds, setSelectedMemoIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const memosForSelectedStaff: MemoOption[] = staffId
    ? memosByStaff[staffId] ?? []
    : [];

  const toggleMemo = (id: string) => {
    setSelectedMemoIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  const submit = () => {
    if (!staffId) {
      toast.error('Select a staff member.');
      return;
    }
    if (allegedMisconduct.trim().length < 10) {
      toast.error('Describe the alleged misconduct (min 10 chars).');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/hr/disciplinary/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            staff_id: staffId,
            alleged_misconduct: allegedMisconduct,
            evidence_memo_ids: selectedMemoIds,
            evidence_notes: evidenceNotes,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const j = await res.json();
        toast.success(`Case ${j.case_number} initiated.`);
        router.push(`/hr/admin/disciplinary/${j.id}`);
        router.refresh();
      } catch (e) {
        toast.error(
          `Initiate failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="staff" className="text-sm">
          Staff member
        </Label>
        <select
          id="staff"
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            setSelectedMemoIds([]);
          }}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">— Select staff —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="alleged" className="text-sm">
          Alleged misconduct (plain English)
        </Label>
        <Textarea
          id="alleged"
          value={allegedMisconduct}
          onChange={(e) => setAllegedMisconduct(e.target.value)}
          placeholder="Describe what is alleged. This will appear on the case record and audit trail."
          rows={4}
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-sm">Evidence — link existing memos</Label>
        <p className="text-xs text-muted-foreground">
          Memos issued to this staff member (T6.1). Selected memos are
          cross-referenced; they remain managed by the memo module.
        </p>
        {!staffId && (
          <div className="mt-2 text-xs text-muted-foreground">
            Select a staff member to see their memos.
          </div>
        )}
        {staffId && memosForSelectedStaff.length === 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            No memos on record for this staff member.
          </div>
        )}
        {staffId && memosForSelectedStaff.length > 0 && (
          <div className="mt-2 space-y-2 rounded-md border border-border p-3 max-h-64 overflow-y-auto">
            {memosForSelectedStaff.map((m) => (
              <label
                key={m.id}
                className="flex items-start gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={selectedMemoIds.includes(m.id)}
                  onCheckedChange={() => toggleMemo(m.id)}
                />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">
                    {new Date(m.issued_at).toLocaleDateString()} —{' '}
                    <span className="capitalize">{m.status}</span>
                  </div>
                  <div className="line-clamp-2">{m.reason}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="evidence-notes" className="text-sm">
          Evidence notes (optional)
        </Label>
        <Textarea
          id="evidence-notes"
          value={evidenceNotes}
          onChange={(e) => setEvidenceNotes(e.target.value)}
          placeholder="Any additional context not captured in linked memos..."
          rows={3}
          className="mt-1"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? 'Initiating...' : 'Initiate case'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Case starts at stage <strong>Initiated</strong>. You can advance to
          Enquiry → Hearing → Decision from the case detail page.
        </span>
      </div>
    </div>
  );
}
