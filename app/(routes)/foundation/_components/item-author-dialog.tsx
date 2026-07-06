'use client';

// Foundation — Item Author dialog. Faculty add a question to the bank for an
// exam definition. MCQ is the default authoring path; the stored shape is the
// cross-section contract documented in ITEM_SHAPE_CONTRACT.md:
//   options : [{ key: 'A', text: '...' }, ...]
//   answer  : { correct: 'A' }
// The grading RPC (fn_fp_record_attempt) compares fp_responses.chosen.key
// against fp_items.answer.correct. Keep the two in lockstep.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateItem, useTopics } from '@/hooks/foundation/use-foundation';

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
const DIFFICULTIES = [
  { value: '1', label: '1 · Recall' },
  { value: '2', label: '2 · Easy' },
  { value: '3', label: '3 · Moderate' },
  { value: '4', label: '4 · Hard' },
  { value: '5', label: '5 · Exam-grade' },
];

interface ItemAuthorDialogProps {
  examDefinitionId: string;
  examName?: string;
}

export function ItemAuthorDialog({
  examDefinitionId,
  examName,
}: ItemAuthorDialogProps) {
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('3');
  const [stem, setStem] = useState('');
  const [options, setOptions] = useState<Record<string, string>>({
    A: '',
    B: '',
    C: '',
    D: '',
  });
  const [correct, setCorrect] = useState<string>('A');
  const [explanation, setExplanation] = useState('');
  const [source, setSource] = useState('');

  const { data: topics } = useTopics();
  const createItem = useCreateItem();

  const filledOptions = useMemo(
    () => OPTION_KEYS.filter((k) => options[k].trim().length > 0),
    [options],
  );

  const canSubmit =
    stem.trim().length > 0 &&
    filledOptions.length >= 2 &&
    options[correct].trim().length > 0 &&
    !createItem.isPending;

  function reset() {
    setTopicId('');
    setDifficulty('3');
    setStem('');
    setOptions({ A: '', B: '', C: '', D: '' });
    setCorrect('A');
    setExplanation('');
    setSource('');
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await createItem.mutateAsync({
        exam_definition_id: examDefinitionId,
        topic_id: topicId || null,
        difficulty: Number(difficulty),
        q_type: 'mcq',
        stem: stem.trim(),
        options: filledOptions.map((k) => ({ key: k, text: options[k].trim() })),
        answer: { correct },
        explanation: explanation.trim() || null,
        source: source.trim() || null,
      });
      toast.success('Question added to the bank');
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save the question');
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
        <Button size="sm" className="bg-[#0b6d41] hover:bg-[#0a5c37]">
          <Plus className="mr-1.5 h-4 w-4" />
          Author question
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Author a question</DialogTitle>
          <DialogDescription>
            Adds one MCQ to the {examName ?? 'exam'} question bank. At least two
            options and a marked answer are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Select value={topicId} onValueChange={setTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {(topics ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Question stem</Label>
            <Textarea
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              placeholder="Type the question exactly as the student will see it…"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Options — select the correct one</Label>
            {OPTION_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrect(k)}
                  aria-pressed={correct === k}
                  className={[
                    'grid h-8 w-8 shrink-0 place-items-center rounded-md border text-sm font-semibold transition-colors',
                    correct === k
                      ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                      : 'border-border text-muted-foreground hover:border-[#0b6d41]/50',
                  ].join(' ')}
                >
                  {k}
                </button>
                <Input
                  value={options[k]}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, [k]: e.target.value }))
                  }
                  placeholder={`Option ${k}`}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Explanation (optional)</Label>
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Why the answer is correct — shown after the attempt."
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Source (optional)</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. NEET 2023 · Q42"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={createItem.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[#0b6d41] hover:bg-[#0a5c37]"
          >
            {createItem.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Save question
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
