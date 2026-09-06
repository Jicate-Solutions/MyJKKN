'use client';

/**
 * ARPS Phase 2C — Log Action Dialog
 *
 * Captures Director-initiated lever pulls. Auto-snapshots trigger context
 * (fill %, expected %, gap) server-side via fn_arps_log_director_action.
 * director_confirmed = true (Director-initiated).
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useLogDirectorAction } from '@/hooks/admission/use-arps-action-log';

interface InstitutionOption {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleYear: number;
  institutionOptions: InstitutionOption[];
}

const LEVER_TYPES_BY_TIER: Record<number, string[]> = {
  1: ['counselor_reallocation', 'school_partnership_push', 'alumni_outreach'],
  2: ['alumni_referral_activation', 'parent_referral_activation', 'sibling_discount'],
  3: ['whatsapp_campaign', 'meta_lead_ads', 'consultant_lead_buy', 'agent_commission_boost'],
  4: ['scholarship_negotiated', 'fee_waiver_negotiated', 'hostel_transport_waiver', 'payment_plan_extension'],
};

export function LogActionDialog({
  open,
  onOpenChange,
  cycleYear,
  institutionOptions,
}: Props) {
  const [institutionId, setInstitutionId] = useState('');
  const [leverTier, setLeverTier] = useState<string>('1');
  const [leverType, setLeverType] = useState('');
  const [magnitudeText, setMagnitudeText] = useState('');
  const [reasoning, setReasoning] = useState('');
  const log = useLogDirectorAction();

  const reset = () => {
    setInstitutionId('');
    setLeverTier('1');
    setLeverType('');
    setMagnitudeText('');
    setReasoning('');
  };

  const handleSubmit = async () => {
    if (!institutionId || !leverType) return;
    try {
      await log.mutateAsync({
        institution_id: institutionId,
        cycle_year: cycleYear,
        lever_tier: Number(leverTier),
        lever_type: leverType,
        lever_magnitude_text: magnitudeText || null,
        decision_reasoning: reasoning || null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error('Log failed:', err);
    }
  };

  const tierTypes = LEVER_TYPES_BY_TIER[Number(leverTier)] ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) reset();
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log lever pull</DialogTitle>
          <DialogDescription>
            Capture the receipt — pace context auto-snapshots from current
            state. Outcome (+14d) auto-captures later via cron.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="institution">Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select institution" />
              </SelectTrigger>
              <SelectContent>
                {institutionOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tier">Lever tier</Label>
              <Select value={leverTier} onValueChange={(v) => {
                setLeverTier(v);
                setLeverType('');
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">T1 — Outreach (free + safe)</SelectItem>
                  <SelectItem value="2">T2 — Incentive (variable + safe)</SelectItem>
                  <SelectItem value="3">T3 — Paid acquisition</SelectItem>
                  <SelectItem value="4">T4 — Price-side (last resort)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Lever type</Label>
              <Select value={leverType} onValueChange={setLeverType} disabled={!leverTier}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick type" />
                </SelectTrigger>
                <SelectContent>
                  {tierTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="magnitude">Magnitude (free text)</Label>
            <Input
              id="magnitude"
              placeholder='e.g. "₹10K/student waiver for 5 students" or "2 counselors reassigned"'
              value={magnitudeText}
              onChange={(e) => setMagnitudeText(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasoning">Your reasoning (optional but valuable)</Label>
            <Textarea
              id="reasoning"
              placeholder='e.g. "principal Y suggested" or "saw the deposits worklist and noticed 38 leads stuck at reserved"'
              rows={3}
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!institutionId || !leverType || log.isPending}
          >
            {log.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Logging…
              </>
            ) : (
              'Log receipt'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
