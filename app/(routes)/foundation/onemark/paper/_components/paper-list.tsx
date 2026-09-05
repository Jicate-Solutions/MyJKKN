'use client';

// OneMark paper wizard — the landing list. One column per subject: its papers
// (drafts and finalized), and a "New paper" control that creates the draft row
// first so the wizard always has something to persist into.

import { useState } from 'react';
import { toast } from 'sonner';
import { FilePlus2, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OneMarkPolicyDefaults } from '@/types/onemark';
import {
  defaultParams,
  newConfig,
  type PaperExam,
  type PaperRow,
  type PaperState,
} from '@/lib/services/onemark/paper-service';
import { useCreatePaper, useDeletePaper, useOneMarkExams, usePapers } from '@/hooks/onemark/use-paper';

const STATE_LABEL: Record<PaperState, string> = {
  DRAFT: 'Draft',
  PREVIEW: 'Previewed',
  EDITED: 'Edited',
  FINALIZED: 'Finalized',
};

const STATE_CLASS: Record<PaperState, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PREVIEW: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  EDITED: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  FINALIZED: 'bg-[#0b6d41]/10 text-[#0b6d41] dark:text-emerald-300',
};

function subjectShortName(exam: PaperExam): string {
  return exam.config_key === 'tn_hsc_english' ? 'English' : 'Physics';
}

interface PaperListProps {
  onOpen: (id: string) => void;
}

export function PaperList({ onOpen }: PaperListProps) {
  const exams = useOneMarkExams();
  const papers = usePapers();
  const createPaper = useCreatePaper();
  const deletePaper = useDeletePaper();
  const [newFor, setNewFor] = useState<PaperExam | null>(null);
  const [title, setTitle] = useState('');

  async function handleCreate() {
    if (!newFor || !title.trim()) return;
    try {
      const policies = {
        question_count: OneMarkPolicyDefaults['onemark.paper.question_count'],
        max_series: OneMarkPolicyDefaults['onemark.paper.max_series'],
        timed_default_minutes: OneMarkPolicyDefaults['onemark.timed.default_minutes'],
      };
      const { paper } = await createPaper.mutateAsync({
        exam_definition_id: newFor.id,
        title: title.trim(),
        config: newConfig(defaultParams(newFor.config_key, policies)),
      });
      setNewFor(null);
      setTitle('');
      onOpen(paper.id);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not start the paper');
    }
  }

  async function handleDiscard(paper: PaperRow) {
    if (!window.confirm(`Discard "${paper.title}"? This cannot be undone.`)) return;
    try {
      await deletePaper.mutateAsync(paper.id);
      toast.success('Draft discarded');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not discard the draft');
    }
  }

  if (exams.isLoading || papers.isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (exams.isError || papers.isError) {
    const err = (exams.error ?? papers.error) as Error | null;
    return (
      <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
        {err?.message ?? 'The paper list could not be loaded.'}
      </p>
    );
  }

  const examList = exams.data?.exams ?? [];
  const paperList = papers.data?.papers ?? [];

  if (examList.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-foreground">No OneMark subject is switched on yet.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The Physics and English exam rows come with the Wave 1 migration. Once they are active, they appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {examList.map((exam) => {
          const mine = paperList.filter((p) => p.exam_definition_id === exam.id);
          return (
            <section key={exam.id} className="rounded-xl border border-border bg-card">
              <header className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Class 12 · Part I
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">{subjectShortName(exam)}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{exam.display_name}</p>
                </div>
                <Button
                  size="sm"
                  className="bg-[#0b6d41] hover:bg-[#0a5c37]"
                  onClick={() => {
                    setNewFor(exam);
                    setTitle('');
                  }}
                >
                  <FilePlus2 className="mr-1.5 h-4 w-4" />
                  New paper
                </Button>
              </header>

              {mine.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No {subjectShortName(exam)} paper yet. Start one — the draft is saved at every step.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {mine.map((paper) => {
                    const state = paper.config?.state ?? 'DRAFT';
                    return (
                      <li key={paper.id} className="flex items-center gap-3 p-4">
                        <button
                          type="button"
                          onClick={() => onOpen(paper.id)}
                          className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block truncate text-sm font-medium text-foreground">{paper.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {paper.item_count} question{paper.item_count === 1 ? '' : 's'} · step {paper.config?.step ?? 1} of 5 ·
                            updated {new Date(paper.updated_at).toLocaleDateString()}
                          </span>
                        </button>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATE_CLASS[state]}`}>
                          {STATE_LABEL[state]}
                        </span>
                        {state !== 'FINALIZED' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Discard ${paper.title}`}
                            onClick={() => handleDiscard(paper)}
                            disabled={deletePaper.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={Boolean(newFor)} onOpenChange={(v) => !v && setNewFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New {newFor ? subjectShortName(newFor) : ''} paper</DialogTitle>
            <DialogDescription>
              Give the paper a name your learners will recognise. Everything else is set in the wizard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="paper-title">Title</Label>
            <Input
              id="paper-title"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={newFor?.config_key === 'tn_hsc_english' ? 'e.g. Unit 1–3 revision, Part I' : 'e.g. Electrostatics one-mark test'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFor(null)} disabled={createPaper.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || createPaper.isPending}
              className="bg-[#0b6d41] hover:bg-[#0a5c37]"
            >
              {createPaper.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Start the wizard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
