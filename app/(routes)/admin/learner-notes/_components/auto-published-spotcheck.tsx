'use client';

// ============================================================================
// Auto-Published Spot-Check — the human safety net over the enforcing judge.
// ============================================================================
// The grounded note-safety judge auto-publishes 'auto_safe' notes to learners
// with NO human in the loop. Its auto_safe precision is unmeasured (0 human
// labels), so a super admin periodically eyeballs a RANDOM sample of what the
// judge let through — this panel. It is read-only: it does not approve, reject,
// or pull anything. If a sampled note looks wrong, the reviewer acts from the
// approval queue above; the enforce loop handles pull-backs.
//
// A note auto-published at LOWER confidence is exactly what deserves a second
// look, so those are visually flagged ("scrutinise") even though the sample
// itself is unbiased (server-side random).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { RefreshCw, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface SpotCheckNote {
  note_id: string;
  note: string;
  course_code: string;
  course_name: string | null;
  confidence: number | null;
  published_at: string | null;
}

// Below this the judge wasn't very sure — worth a closer read.
const SCRUTINISE_BELOW = 0.85;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

function confidencePct(c: number | null): string {
  if (c === null || Number.isNaN(c)) return '—';
  return `${Math.round(c * 100)}%`;
}

export function AutoPublishedSpotCheck() {
  const [notes, setNotes] = useState<SpotCheckNote[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  const loadSample = useCallback(async (sampleSize: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/learner-notes/spotcheck?limit=${sampleSize}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setNotes((json.notes ?? []) as SpotCheckNote[]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load the spot-check sample. Try again.",
      );
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSample(limit);
  }, [loadSample, limit]);

  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Auto-Published Spot-Check
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A random sample of notes the safety judge published to learners
            without human review. Read a few each visit — this is the safety net
            over the auto-publish decision. It is read-only; if one looks wrong,
            act from the approval queue above. Lower-confidence notes are flagged
            to scrutinise.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(limit)}
            onValueChange={(v) => setLimit(Number(v))}
            disabled={loading}
          >
            <SelectTrigger className="w-[130px]" aria-label="Sample size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Sample of 10</SelectItem>
              <SelectItem value="25">Sample of 25</SelectItem>
              <SelectItem value="50">Sample of 50</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSample(limit)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            New sample
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
      ) : !notes || notes.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          No auto-published notes yet. Once the judge publishes an{' '}
          <code className="rounded bg-muted px-1">auto_safe</code> note, a random
          sample will appear here to review.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => {
            const low = n.confidence !== null && n.confidence < SCRUTINISE_BELOW;
            return (
              <div
                key={n.note_id}
                className="rounded-md border border-border bg-card p-4 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {n.course_code}
                  </Badge>
                  {n.course_name ? (
                    <span className="text-sm text-muted-foreground">{n.course_name}</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2">
                    <Badge variant={low ? 'destructive' : 'secondary'} className="text-xs">
                      {low ? 'scrutinise · ' : ''}
                      confidence {confidencePct(n.confidence)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      published {formatDate(n.published_at)}
                    </span>
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {n.note}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
