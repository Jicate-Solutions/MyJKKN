'use client';

/**
 * Notes tab — job-level discussion thread (hr_recruitment_job_notes).
 * Separate from the per-candidate thread on the candidate detail page.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Send, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useJobNotes, useAddJobNote } from '@/hooks/hr/use-recruitment';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function WorkspaceNotesTab({ jobId }: { jobId: string }) {
  const { data: notes, isLoading, error } = useJobNotes(jobId);
  const addNote = useAddJobNote();
  const [draft, setDraft] = useState('');

  const submit = () => {
    const note = draft.trim();
    if (!note) return;
    addNote.mutate(
      { job_id: jobId, note },
      {
        onSuccess: () => setDraft(''),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted/60 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 rounded bg-muted/50 animate-pulse" />
                  <div className="h-4 w-full max-w-md rounded bg-muted/40 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && (notes ?? []).length === 0 && (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <StickyNote className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No notes yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Use this thread for job-level context — sourcing status, panel decisions,
              budget notes. Candidate-specific discussion lives on each candidate&rsquo;s page.
            </p>
          </div>
        )}

        {!isLoading && (notes ?? []).length > 0 && (
          <ul className="space-y-4">
            {(notes ?? []).map((n) => (
              <li key={n.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {initials(n.author?.full_name ?? '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {n.author?.full_name ?? 'Unknown'}
                    </span>{' '}
                    &middot; {fmtWhen(n.created_at)}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground/90 whitespace-pre-wrap">{n.note}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Composer */}
        <div className="border-t border-border pt-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Add a note for this job…"
            aria-label="New job note"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!draft.trim() || addNote.isPending}
              onClick={submit}
            >
              <Send className="h-3.5 w-3.5" />
              {addNote.isPending ? 'Posting…' : 'Post note'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
