'use client';

/**
 * Record-a-placement dialog.
 *
 * The four questions are the subject of this screen, not a section of it. They
 * are asked one under the other with a worked example in each placeholder,
 * because the failure this whole feature is trying to avoid is a fluent
 * paragraph with no specifics in it — which is indistinguishable from a
 * paragraph written without going.
 *
 * `is_named_allowed` has no equivalent here on purpose. Whether an organisation
 * may be named is decided by its consent_state in the database and enforced by
 * a BEFORE trigger; the picker below simply never offers an unsigned partner,
 * because offering one would be offering a button that always fails.
 */

import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  PARTNER_KINDS,
  PARTNER_KIND_LABEL,
  PLACEMENT_QUESTIONS,
  PlacementService,
  validatePlacement,
  type PartnerKind,
  type PlacementAnswers,
  type SignedPartner,
} from '@/lib/services/improvement/placement-service';
import { createClient } from '@/lib/supabase/client';

const EMPTY: PlacementAnswers = {
  q_done_twice: '',
  q_waiting_on_one: '',
  q_workaround: '',
  q_quiet_failure: '',
};

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RecordPlacementDialog({
  open,
  onOpenChange,
  institutionId,
  signedPartners,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
  signedPartners: SignedPartner[];
  onRecorded: () => void;
}) {
  const [kind, setKind] = useState<PartnerKind>('hospital');
  const [partnerId, setPartnerId] = useState('');
  const [observedAt, setObservedAt] = useState(todayLocal());
  const [answers, setAnswers] = useState<PlacementAnswers>(EMPTY);
  const [saving, setSaving] = useState(false);

  const input = useMemo(
    () => ({
      institutionId,
      partnerKind: kind,
      observedAt,
      answers,
      partnerId: partnerId || null,
    }),
    [institutionId, kind, observedAt, answers, partnerId]
  );

  const problem = validatePlacement(input);

  function reset() {
    setKind('hospital');
    setPartnerId('');
    setObservedAt(todayLocal());
    setAnswers(EMPTY);
  }

  async function submit() {
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await PlacementService.record(createClient(), input);
      toast.success('Recorded. Thank you for going.');
      reset();
      onOpenChange(false);
      onRecorded();
    } catch (e) {
      // The database's own message, verbatim — the client mirror never
      // replaces the server check, and a paraphrase would hide which rule bit.
      toast.error(e instanceof Error ? e.message : 'Could not record that.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a placement visit</DialogTitle>
          <DialogDescription>
            Describe what you watched happen. You are not being asked to solve
            anything, and you are not marked on whether your idea is any good —
            only on whether someone could go and find what you described.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pl-kind">What kind of place was it?</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PartnerKind)}>
                <SelectTrigger id="pl-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {PARTNER_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pl-when">When you went</Label>
              <Input
                id="pl-when"
                type="date"
                value={observedAt}
                max={todayLocal()}
                onChange={(e) => setObservedAt(e.target.value)}
              />
            </div>
          </div>

          {/*
            Only rendered when at least one partner has signed. For every other
            department this control simply does not exist, which is the honest
            representation of the rule: naming is not a thing you can do yet.
          */}
          {signedPartners.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="pl-partner">
                Name the organisation{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select
                value={partnerId || 'none'}
                onValueChange={(v) => setPartnerId(v === 'none' ? '' : v)}
              >
                <SelectTrigger id="pl-partner">
                  <SelectValue placeholder="Do not name it" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Do not name it</SelectItem>
                  {signedPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Only organisations that have signed the partner agreement appear
                here. Everywhere else is recorded by kind alone, which names
                nobody and is still worth recording.
              </p>
            </div>
          )}

          <div className="bg-muted/40 rounded-md border p-3">
            <p className="text-sm font-medium">Four questions</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Answer the ones you have something for. A detail only somebody
              actually standing there could know — a time, a count, which
              register, whose signature — is what makes an answer worth having.
              &ldquo;I looked and there was nothing&rdquo; is a real answer; say
              what you looked for.
            </p>
          </div>

          {PLACEMENT_QUESTIONS.map((q, i) => (
            <div key={q.key} className="space-y-2">
              <Label htmlFor={`pl-${q.key}`}>
                <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                  {i + 1}
                </span>
                {q.label}
              </Label>
              <p className="text-muted-foreground text-xs">{q.hint}</p>
              <Textarea
                id={`pl-${q.key}`}
                rows={3}
                value={answers[q.key]}
                placeholder={q.placeholder}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          {problem && (
            <p className="text-muted-foreground mr-auto max-w-sm text-xs">{problem}</p>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !!problem}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
