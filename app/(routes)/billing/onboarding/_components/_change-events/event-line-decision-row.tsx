'use client';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { AdmissionFeeChangeEventLine, AdmissionFeeChangeEventLineDecision } from '@/types/admission';

interface Props {
  line: AdmissionFeeChangeEventLine;
  categoryName: string;
  decision: AdmissionFeeChangeEventLineDecision | null;
  notes: string;
  onDecisionChange: (decision: AdmissionFeeChangeEventLineDecision) => void;
  onNotesChange: (notes: string) => void;
}

const DECISION_OPTIONS: { value: AdmissionFeeChangeEventLineDecision; label: string }[] = [
  { value: 'apply_supplemental', label: 'Apply supplemental bill' },
  { value: 'issue_credit_note',  label: 'Issue credit note' },
  { value: 'refund_payment',     label: 'Refund payment' },
  { value: 'reallocate_payment', label: 'Reallocate payment to new bill' },
  { value: 'waive_delta',        label: 'Waive delta' },
  { value: 'do_nothing',         label: 'Do nothing' },
];

export function EventLineDecisionRow(props: Props) {
  const { line, categoryName, decision, notes, onDecisionChange, onNotesChange } = props;
  const delta = (Number(line.new_amount ?? 0) - Number(line.old_amount ?? 0));
  return (
    <tr className="border-b">
      <td className="py-2 pr-2">{categoryName}</td>
      <td className="py-2 pr-2 text-right">{line.old_amount != null ? `₹${Number(line.old_amount).toLocaleString()}` : '—'}</td>
      <td className="py-2 pr-2 text-right">₹{Number(line.paid_amount_so_far).toLocaleString()}</td>
      <td className="py-2 pr-2 text-right">{line.new_amount != null ? `₹${Number(line.new_amount).toLocaleString()}` : '—'}</td>
      <td className={`py-2 pr-2 text-right ${delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-emerald-600' : ''}`}>
        {delta > 0 ? '+' : ''}₹{Math.abs(delta).toLocaleString()}
      </td>
      <td className="py-2 pr-2">
        <Select value={decision ?? undefined} onValueChange={(v) => onDecisionChange(v as AdmissionFeeChangeEventLineDecision)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Pick decision" /></SelectTrigger>
          <SelectContent>
            {DECISION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2">
        <Input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </td>
    </tr>
  );
}
