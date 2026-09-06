'use client';

// OneMark paper wizard — start a new paper, or resume one of your own.

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreatePaper, usePaperReference } from '@/hooks/onemark/use-paper';

interface PaperPickerProps {
  onOpen: (paperId: string) => void;
}

export function PaperPicker({ onOpen }: PaperPickerProps) {
  const { data, isLoading, error } = usePaperReference(null);
  const create = useCreatePaper();
  const [examId, setExamId] = useState<string>('');
  const [title, setTitle] = useState('');

  const chosenExam = examId || data?.exams[0]?.id || '';

  async function start() {
    if (!chosenExam || title.trim().length === 0) return;
    try {
      const paper = await create.mutateAsync({ exam_definition_id: chosenExam, title: title.trim() });
      toast.success('Draft created');
      onOpen(paper.id);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not create the paper');
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {(error as Error | null)?.message ?? 'Could not load the wizard.'}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Start a new paper</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the subject, name the paper. Every setting is saved as you go, so you can leave and come back.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Subject</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.exams.map((e) => {
              const on = e.id === chosenExam;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setExamId(e.id)}
                  className={[
                    'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    on ? 'border-[#0b6d41] bg-[#0b6d41]/5 text-foreground' : 'border-border hover:bg-muted',
                  ].join(' ')}
                >
                  <span className="block font-medium">{e.display_name.replace('TN State Board — ', '')}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{e.config_key}</span>
                </button>
              );
            })}
            {data.exams.length === 0 && (
              <p className="col-span-2 text-sm text-muted-foreground">
                No OneMark subject is active yet — Wave 1 seeds tn_hsc_physics and tn_hsc_english.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="onemark-paper-title">Paper title</Label>
          <Input
            id="onemark-paper-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Unit 1–3 revision, Part-I"
            maxLength={200}
          />
        </div>

        <Button
          onClick={start}
          disabled={!chosenExam || title.trim().length === 0 || create.isPending}
          className="bg-[#0b6d41] hover:bg-[#0a5c37]"
        >
          {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
          Create draft
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Your papers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Drafts, previews and finalised papers you built.</p>
        </div>
        {data.papers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Your first paper will appear here.
          </p>
        ) : (
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {data.papers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6d41]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{p.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.exam_key.replace('tn_hsc_', '').toUpperCase()} · {p.selected}/{p.question_count} questions ·{' '}
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {p.state}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
