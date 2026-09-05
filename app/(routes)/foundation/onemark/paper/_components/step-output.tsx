'use client';

// Step 5 — Output. Two doors out of a finalized paper: the printed board-format
// PDF per series (the PDF lane's route, `/pdf?series=A&key=0|1`), and a
// digital sitting for a cohort (open / close window, clock, option shuffle —
// stored in config.output; cohort_id on the row).

import { useState } from 'react';
import { CalendarClock, FileText, KeyRound, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  seriesLetters,
  type PaperBank,
  type PaperConfig,
  type PaperOutput,
  type PaperRow,
} from '@/lib/services/onemark/paper-service';

interface StepOutputProps {
  paper: PaperRow;
  bank: PaperBank;
  config: PaperConfig;
  onPublish: (output: PaperOutput, cohortId: string | null) => void;
  publishing: boolean;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function StepOutput({ paper, bank, config, onPublish, publishing }: StepOutputProps) {
  const finalized = config.state === 'FINALIZED';
  const letters = seriesLetters(config.params.series_count, bank.policies.max_series);
  const pdfBase = `/api/foundation/onemark/paper/${paper.id}/pdf`;

  const [cohortId, setCohortId] = useState<string | null>(paper.cohort_id ?? null);
  const [openAt, setOpenAt] = useState(toLocalInput(config.output?.open_at ?? null));
  const [closeAt, setCloseAt] = useState(toLocalInput(config.output?.close_at ?? null));
  const [duration, setDuration] = useState<number>(config.output?.duration_min ?? bank.policies.timed_default_minutes);
  const [shuffle, setShuffle] = useState<boolean>(config.output?.shuffle_options ?? true);

  const windowValid = Boolean(openAt) && Boolean(closeAt) && new Date(closeAt) > new Date(openAt);
  const published = Boolean(config.output?.published_at);

  function submit(publish: boolean) {
    onPublish(
      {
        open_at: fromLocalInput(openAt),
        close_at: fromLocalInput(closeAt),
        duration_min: Math.max(5, Math.min(180, duration || bank.policies.timed_default_minutes)),
        shuffle_options: shuffle,
        published_at: publish ? new Date().toISOString() : config.output?.published_at ?? null,
      },
      cohortId,
    );
  }

  if (!finalized) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Finalize the paper in the Review step first. Output is only for a frozen question list.
      </p>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-[#0b6d41]" />
            Printed paper
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Board format, Tamil block then English block on every question. One question paper and one answer key per series.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {letters.map((s) => (
            <li key={s} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-mono text-sm text-foreground">Series {s}</span>
              <span className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`${pdfBase}?series=${s}`} target="_blank" rel="noreferrer">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    Paper
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`${pdfBase}?series=${s}&key=1`} target="_blank" rel="noreferrer">
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                    Answer key
                  </a>
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          The PDF renderer ships in its own change; until it is live these links answer with a not-found page.
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-[#0b6d41]" />
            Digital sitting
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Open the same paper to a cohort on their devices. One submission per learner; the score list is the same one the hall paper feeds.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cohort">Cohort</Label>
          {bank.cohorts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              No cohort is open on this subject yet. Create one from the Foundation console, then publish here.
            </p>
          ) : (
            <Select value={cohortId ?? undefined} onValueChange={(v) => setCohortId(v)}>
              <SelectTrigger id="cohort">
                <SelectValue placeholder="Choose a cohort" />
              </SelectTrigger>
              <SelectContent>
                {bank.cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.school_name ?? 'Cohort'}
                    {c.term ? ` · ${c.term}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="open-at">Opens</Label>
            <Input id="open-at" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="close-at">Closes</Label>
            <Input id="close-at" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
          </div>
        </div>
        {openAt && closeAt && !windowValid && (
          <p className="text-xs text-amber-700 dark:text-amber-300">The close time must be after the open time.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="duration">Clock (minutes)</Label>
            <Input
              id="duration"
              type="number"
              inputMode="numeric"
              min={5}
              max={180}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
            <p className="text-[11px] text-muted-foreground">Default {bank.policies.timed_default_minutes}; 5–180.</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="shuffle" className="text-sm">
              Shuffle options per learner
            </Label>
            <Switch id="shuffle" checked={shuffle} onCheckedChange={setShuffle} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {published
              ? `Published ${new Date(config.output!.published_at as string).toLocaleString()}.`
              : 'Not published yet.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={publishing} onClick={() => submit(false)}>
              Save settings
            </Button>
            <Button
              size="sm"
              className="bg-[#0b6d41] hover:bg-[#0a5c37]"
              disabled={publishing || !cohortId || !windowValid}
              onClick={() => submit(true)}
            >
              {publishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              {published ? 'Publish again' : 'Publish to cohort'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
