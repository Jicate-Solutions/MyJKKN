'use client';

/**
 * Per-item proof badge (HR staff harness, proof of done).
 * Shows who checked or filed the proof, or that it is still needed. Renders
 * nothing when the viewer may not see the duty, or the item is not done yet.
 */
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleAlert, FileCheck2 } from 'lucide-react';
import { useDutyProofs } from '@/hooks/hr/use-duty-proofs';
import { DUTY_PROOF_KIND, type DutyProofCode } from '@/types/hr-duty-proof';

export function DutyProofBadge({ duty, itemId }: { duty: DutyProofCode; itemId: string }) {
  const { data } = useDutyProofs(duty, { itemIds: [itemId] });
  if (!data) return null;

  const kind = DUTY_PROOF_KIND[duty];
  const proof = data.proofs.find((p) => p.item_id === itemId && p.kind === kind);
  const when = proof ? new Date(proof.recorded_at).toLocaleDateString('en-IN') : '';
  const who = proof?.recorded_by_name || 'a team member';
  // The database lists an item as a gap while its proof is missing OR stale (a
  // second check whose amount or decider no longer matches the item), so a gap
  // wins over an active proof: never say "Checked by" for an amount nobody checked.
  const needed = data.gaps.some((g) => g.item_id === itemId);

  if (needed) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300"
        title={proof ? `The amount or the approver changed after ${who} checked it on ${when}` : undefined}
      >
        <CircleAlert className="h-3 w-3" />
        {kind === 'second_check'
          ? (proof ? 'Second check needed again' : 'Second check needed')
          : 'Signed order needed'}
      </Badge>
    );
  }

  if (proof && kind === 'second_check') {
    const corrected = proof.check_result === 'corrected';
    return (
      <Badge
        variant="outline"
        className={corrected
          ? 'gap-1 border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300'
          : 'gap-1 border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-300'}
        title={corrected
          ? `Says the right amount is ₹${Number(proof.corrected_amount).toLocaleString('en-IN')}: ${proof.check_note ?? ''}`
          : `Checked on ${when}`}
      >
        {corrected ? <CircleAlert className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        {corrected ? `Corrected by ${who}` : `Checked by ${who}`}
      </Badge>
    );
  }

  if (proof) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-300" title={`Filed on ${when}`}>
        <FileCheck2 className="h-3 w-3" />
        Order filed by {who}
      </Badge>
    );
  }

  return null;
}
