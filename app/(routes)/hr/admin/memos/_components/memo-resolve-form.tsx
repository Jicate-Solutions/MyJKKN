'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';

export function MemoResolveForm({ memoId }: { memoId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'uphold' | 'invalidate'>('uphold');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (note.trim().length < 5) {
      toast.error('Add a short resolution note (min 5 chars).');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/memos/${memoId}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resolution_note: note,
            counts_toward_termination: decision === 'uphold',
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success('Memo resolved.');
        router.refresh();
      } catch (e) {
        toast.error(
          `Resolve failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  return (
    <div className="space-y-3">
      <RadioGroup
        value={decision}
        onValueChange={(v) => setDecision(v as 'uphold' | 'invalidate')}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="uphold" id="r-uphold" />
          <Label htmlFor="r-uphold" className="text-sm">
            Uphold — keep counting toward termination threshold
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="invalidate" id="r-invalidate" />
          <Label htmlFor="r-invalidate" className="text-sm">
            Invalidate — exclude from termination count (dispute upheld)
          </Label>
        </div>
      </RadioGroup>

      <div>
        <Label htmlFor="resolution-note" className="text-sm">
          Resolution note
        </Label>
        <Textarea
          id="resolution-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Short explanation for the audit trail..."
          className="mt-1"
          rows={3}
        />
      </div>

      <Button onClick={submit} disabled={pending}>
        {pending ? 'Resolving...' : 'Resolve memo'}
      </Button>
    </div>
  );
}
