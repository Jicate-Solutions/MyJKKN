'use client';

// Step 5 — dual output (PRD §3.2): PDF export through Lane P's route, one
// paper and one answer key per series (decision 16), and DIGITAL_PUBLISH to a
// cohort with an open/close window (decision 17: same test, same score list).

import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, FileDown, KeyRound, Loader2, Send, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { usePaperAction } from '@/hooks/onemark/use-paper';
import { PaperService, SERIES_LETTERS, type ExamReference, type PaperDetail } from '@/lib/services/onemark/paper-service';

interface StepOutputProps {
  paper: PaperDetail;
  reference: ExamReference;
  act: ReturnType<typeof usePaperAction>;
  disabled: boolean;
}

function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StepOutput({ paper, reference, act, disabled }: StepOutputProps) {
  const cfg = paper.config;
  const series = SERIES_LETTERS.slice(0, Math.max(1, cfg.params.series_count));
  const published = !!cfg.outputs?.published_at;

  const [cohortId, setCohortId] = useState<string>(paper.cohort_id ?? '');
  const [openAt, setOpenAt] = useState(cfg.open_at ? localInputValue(new Date(cfg.open_at)) : localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [closeAt, setCloseAt] = useState(cfg.close_at ? localInputValue(new Date(cfg.close_at)) : localInputValue(new Date(Date.now() + 25 * 60 * 60 * 1000)));
  const [duration, setDuration] = useState<number>(cfg.duration_min ?? 20);
  const [shuffle, setShuffle] = useState<boolean>(cfg.shuffle_options ?? true);
  /** null = not probed yet; false = the renderer answered (2xx); true = 404. */
  const [pdfMissing, setPdfMissing] = useState<boolean | null>(null);

  /** The anchor opens the PDF in a new tab as before; in parallel a HEAD probe
   *  asks the renderer whether it exists. The export stamp is written only on
   *  a 2xx — never against a 404 while Lane P is unmerged. */
  async function probeAndStamp(href: string) {
    try {
      const res = await fetch(href, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        setPdfMissing(false);
        await act.mutateAsync({ action: 'mark_exported' });
      } else if (res.status === 404) {
        setPdfMissing(true);
        toast.warning('The PDF renderer is not available yet — nothing was exported.');
      }
    } catch {
      /* network hiccup: no stamp, the tab the anchor opened tells the truth */
    }
  }

  async function unpublish() {
    try {
      await act.mutateAsync({ action: 'unpublish' });
      toast.success('Unpublished — it is no longer live for learners. The cohort and window are kept; correct them, then publish again.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not unpublish');
    }
  }

  async function publish() {
    try {
      await act.mutateAsync({
        action: 'publish',
        cohort_id: cohortId,
        open_at: new Date(openAt).toISOString(),
        close_at: new Date(closeAt).toISOString(),
        duration_min: duration,
        shuffle_options: shuffle,
      });
      toast.success('Published — learners in the cohort will see it in the window you set.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not publish');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileDown className="h-4 w-4 text-[#0b6d41]" />
            Print for the hall
          </h3>
          <p className="text-xs text-muted-foreground">
            Bilingual board-format PDF, Tamil block then English block. {series.length === 1 ? 'One series.' : `${series.length} series — items reordered and options re-lettered per series.`}
            {cfg.params.pdf_include_key ? ' Answer key per series.' : ''}
          </p>
        </div>
        <ul className="space-y-2">
          {series.map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-mono font-semibold text-foreground">Series {s}</span>
              <span className="ml-auto flex gap-2">
                <a
                  href={PaperService.pdfHref(paper.id, s, false)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void probeAndStamp(PaperService.pdfHref(paper.id, s, false))}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Question paper
                </a>
                {cfg.params.pdf_include_key && (
                  <a
                    href={PaperService.pdfHref(paper.id, s, true)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void probeAndStamp(PaperService.pdfHref(paper.id, s, true))}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Answer key
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {pdfMissing
            ? 'The PDF renderer answered 404 — it is a separate build (Lane P) and has not been merged yet. No export was recorded.'
            : cfg.outputs?.pdf_exported_at
              ? `Last exported ${new Date(cfg.outputs.pdf_exported_at).toLocaleString()}.`
              : 'The PDF renderer is a separate build (Lane P); if the link answers 404, it has not been merged yet.'}
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Send className="h-4 w-4 text-[#0b6d41]" />
            Publish to a cohort
          </h3>
          <p className="text-xs text-muted-foreground">
            The same paper, opened on a device inside a window — for an absentee, or a timed sitting. One attempt per learner, enforced server-side.
          </p>
        </div>

        {published ? (
          <div className="space-y-3 rounded-md border border-[#0b6d41]/40 bg-[#0b6d41]/5 p-3 text-sm">
            <div>
              <p className="font-medium text-foreground">Published {new Date(cfg.outputs!.published_at!).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                Open {cfg.open_at ? new Date(cfg.open_at).toLocaleString() : '—'} → close {cfg.close_at ? new Date(cfg.close_at).toLocaleString() : '—'} · {cfg.duration_min} min ·{' '}
                {cfg.shuffle_options ? 'options shuffled' : 'options in print order'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={unpublish} disabled={disabled}>
                {act.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1.5 h-4 w-4" />}
                Unpublish
              </Button>
              <span className="text-xs text-muted-foreground">
                Wrong cohort, window or duration? Unpublish (the paper stops being live; cohort and window are kept for you to correct), then publish again. Possible until the first learner starts — after that the paper stays as published.
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Cohort</Label>
              {reference.cohorts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  No active cohort on {reference.exam.display_name.replace('TN State Board — ', '')} yet. Create one on the console, then publish.
                </p>
              ) : (
                <Select value={cohortId} onValueChange={setCohortId} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    {reference.cohorts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.term ?? 'Cohort'}
                        {c.school_name ? ` — ${c.school_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="onemark-open">Opens</Label>
                <Input id="onemark-open" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} disabled={disabled} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onemark-close">Closes</Label>
                <Input id="onemark-close" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} disabled={disabled} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onemark-duration">Duration (minutes, 5–180)</Label>
                <Input
                  id="onemark-duration"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={180}
                  value={duration}
                  onChange={(e) => setDuration(Math.max(5, Math.min(180, Number.parseInt(e.target.value, 10) || 20)))}
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">Shuffle options on device</span>
                <Switch checked={shuffle} onCheckedChange={setShuffle} disabled={disabled} aria-label="Shuffle options" />
              </div>
            </div>
            <Button
              onClick={publish}
              disabled={disabled || !cohortId || new Date(closeAt).getTime() <= new Date(openAt).getTime()}
              className="bg-[#0b6d41] hover:bg-[#0a5c37]"
            >
              {act.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Publish to cohort
            </Button>
            <p className="text-xs text-muted-foreground">
              Publishing freezes the questions, the cohort and the window together. Until the first learner starts you can unpublish to correct any of them; after that nothing changes. Printing stays open before and after.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
