'use client';

/**
 * Proof-of-done panel for one HR duty (HR staff harness).
 *
 *   second_check duties (L4 encashment, G6 final settlement): a summary of the
 *     decided items still missing a second check, and a check dialog — confirm
 *     the amount, or correct it with the right amount and a note.
 *   file duties (G5 termination order): the same summary and a file upload.
 *
 * Shown, never enforced: nothing waits on this. Renders nothing for a viewer
 * who may not see the duty. Pass itemId to scope the panel to one item (a
 * termination case); leave it out to list this month's decided items.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  startOfThisMonth,
  useAttachDutyProofFile,
  useDutyProofs,
  useRecordSecondCheck,
} from '@/hooks/hr/use-duty-proofs';
import {
  DUTY_PROOF_KIND,
  DUTY_PROOF_LABEL,
  validateSecondCheck,
  type DutyProofCheckResult,
  type DutyProofCode,
  type DutyProofGap,
} from '@/types/hr-duty-proof';

const money = (n: number | null) =>
  n === null ? 'amount not recorded' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN');

export function DutyProofPanel({ duty, itemId }: { duty: DutyProofCode; itemId?: string }) {
  const kind = DUTY_PROOF_KIND[duty];
  const { data } = useDutyProofs(duty, itemId ? { itemIds: [itemId] } : { since: startOfThisMonth() });
  const [checking, setChecking] = useState<DutyProofGap | null>(null);

  if (!data) return null;

  const gaps = itemId ? data.gaps.filter((g) => g.item_id === itemId) : data.gaps;
  const missing = kind === 'second_check' ? 'a second check' : 'the signed order';

  // Scoped to one item that already has its proof: say so, briefly.
  if (itemId && gaps.length === 0) {
    const proof = data.proofs.find((p) => p.item_id === itemId && p.kind === kind);
    if (!proof) return null; // not at the done step yet
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        {DUTY_PROOF_LABEL[duty]}: {kind === 'second_check' ? 'checked' : 'order filed'} by{' '}
        {proof.recorded_by_name || 'a team member'} on {day(proof.recorded_at)}
      </p>
    );
  }

  const summary = itemId
    ? `${DUTY_PROOF_LABEL[duty]} is decided and still needs ${missing}`
    : `${gaps.length} decided this month without ${missing}`;

  return (
    <Card data-testid={`duty-proof-panel-${duty}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardCheck className="h-4 w-4" />
          {summary}
        </CardTitle>
        <CardDescription className="text-xs">
          {kind === 'second_check'
            ? 'A second team member confirms the amount: anyone with this duty in the college, except whoever decided it. Nothing is held up while it waits.'
            : 'Attach the signed order as a PDF or a photo. Nothing is held up while it waits.'}
        </CardDescription>
      </CardHeader>
      {gaps.length > 0 && (
        <CardContent className="space-y-2">
          {gaps.map((g) => (
            <div key={g.item_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>
                {kind === 'second_check' ? money(g.amount) : 'Signed off'} · decided {day(g.done_at)}
              </span>
              {kind === 'file' ? (
                <FileProofUpload duty={duty} itemId={g.item_id} />
              ) : g.caller_is_doer ? (
                <span className="text-xs text-muted-foreground">You decided this one; another team member checks it</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setChecking(g)}>
                  Check amount
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      )}
      {checking && (
        <SecondCheckDialog duty={duty} gap={checking} onClose={() => setChecking(null)} />
      )}
    </Card>
  );
}

function SecondCheckDialog({ duty, gap, onClose }: { duty: DutyProofCode; gap: DutyProofGap; onClose: () => void }) {
  const record = useRecordSecondCheck();
  const [result, setResult] = useState<DutyProofCheckResult | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const problem = validateSecondCheck({ result, correctedAmount: amount, note });

  const submit = async () => {
    if (problem || result === '') return;
    try {
      await record.mutateAsync({
        duty,
        itemId: gap.item_id,
        result,
        correctedAmount: result === 'corrected' ? Number(amount) : null,
        note: note.trim() || null,
      });
      toast.success(result === 'confirmed' ? 'Amount confirmed' : 'Correction recorded; HR will fix the amount by hand');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the check');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Second check: {DUTY_PROOF_LABEL[duty]}</DialogTitle>
          <DialogDescription>
            Decided {day(gap.done_at)} for {money(gap.amount)}. Is this amount right?
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="sr-only">Check result</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="duty-proof-result" value="confirmed"
              checked={result === 'confirmed'} onChange={() => setResult('confirmed')} />
            The amount is right
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="duty-proof-result" value="corrected"
              checked={result === 'corrected'} onChange={() => setResult('corrected')} />
            The amount is wrong
          </label>
        </fieldset>

        {result === 'corrected' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="duty-proof-amount">The right amount (₹)</Label>
              <Input id="duty-proof-amount" type="number" min="0" step="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="duty-proof-note">What is wrong</Label>
              <Textarea id="duty-proof-note" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="For example: the per-day rate should be the basic pay, not the gross" />
            </div>
            <p className="text-xs text-muted-foreground">
              This records the disagreement. The amount itself is not changed; HR corrects it by hand.
            </p>
          </div>
        )}

        {result !== '' && problem && (
          <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">{problem}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!!problem || record.isPending}>
            {record.isPending ? 'Saving…' : 'Record check'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileProofUpload({ duty, itemId }: { duty: DutyProofCode; itemId: string }) {
  const attach = useAttachDutyProofFile();
  const inputId = `duty-proof-file-${itemId}`;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('The file is larger than 10 MB');
      return;
    }
    try {
      await attach.mutateAsync({ duty, itemId, file });
      toast.success('Signed order attached');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach the file');
    }
  };

  return (
    <span>
      <input id={inputId} type="file" className="sr-only"
        accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onPick} />
      <Button size="sm" variant="outline" asChild disabled={attach.isPending}>
        <label htmlFor={inputId} className="cursor-pointer">
          <Upload className="mr-1 h-3 w-3" />
          {attach.isPending ? 'Uploading…' : 'Attach signed order'}
        </label>
      </Button>
    </span>
  );
}
