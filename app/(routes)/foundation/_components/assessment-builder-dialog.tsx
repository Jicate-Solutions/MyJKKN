'use client';

// Foundation — Assessment Builder dialog. Faculty assemble a diagnostic /
// practice / mock from the cohort's exam question bank. Selected items are
// linked into fp_assessment_items in pick order (position 1..n).

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ListPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateAssessment,
  useItems,
} from '@/hooks/foundation/use-foundation';
import type { AssessmentKind } from '@/lib/services/foundation/foundation-service';

const KINDS: { value: AssessmentKind; label: string; hint: string }[] = [
  { value: 'diagnostic', label: 'Diagnostic', hint: 'Baseline the weak spots' },
  { value: 'practice', label: 'Practice', hint: 'Drill a topic' },
  { value: 'mock', label: 'Mock', hint: 'Full exam simulation' },
];

interface AssessmentBuilderDialogProps {
  cohortId: string;
  examDefinitionId: string;
  examName?: string;
}

export function AssessmentBuilderDialog({
  cohortId,
  examDefinitionId,
  examName,
}: AssessmentBuilderDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AssessmentKind>('diagnostic');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: items, isLoading } = useItems(open ? examDefinitionId : null);
  const createAssessment = useCreateAssessment();

  const orderedIds = useMemo(() => Array.from(selected), [selected]);
  const canSubmit =
    title.trim().length > 0 && selected.size > 0 && !createAssessment.isPending;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setTitle('');
    setKind('diagnostic');
    setSelected(new Set());
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await createAssessment.mutateAsync({
        exam_definition_id: examDefinitionId,
        cohort_id: cohortId,
        title: title.trim(),
        kind,
        config: {},
        item_ids: orderedIds,
      });
      toast.success(`${KINDS.find((k) => k.value === kind)?.label} built`);
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not build the assessment');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ListPlus className="mr-1.5 h-4 w-4" />
          Build assessment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build an assessment</DialogTitle>
          <DialogDescription>
            Assemble questions from the {examName ?? 'exam'} bank. Pick order sets
            question order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Unit 1 diagnostic — Kinematics"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as AssessmentKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label} — {k.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Questions</Label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {selected.size} selected
              </span>
            </div>

            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {isLoading ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Loading question bank…
                </p>
              ) : (items ?? []).length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No questions yet. Author some first.
                </p>
              ) : (
                (items ?? []).map((it) => {
                  const isOn = selected.has(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggle(it.id)}
                      className={[
                        'flex w-full items-start gap-3 rounded-md border p-2.5 text-left transition-colors',
                        isOn
                          ? 'border-[#0b6d41] bg-[#0b6d41]/5'
                          : 'border-transparent hover:bg-muted',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[10px] font-bold',
                          isOn
                            ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                            : 'border-muted-foreground/40 text-transparent',
                        ].join(' ')}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm text-foreground">
                          {it.stem}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            D{it.difficulty ?? '?'}
                          </Badge>
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {it.q_type ?? 'mcq'}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={createAssessment.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[#0b6d41] hover:bg-[#0a5c37]"
          >
            {createAssessment.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Build assessment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
