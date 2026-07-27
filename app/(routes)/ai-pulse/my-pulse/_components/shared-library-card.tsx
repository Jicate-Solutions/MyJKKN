// app/(routes)/ai-pulse/my-pulse/_components/shared-library-card.tsx
// Created: 2026-07-26 — AI Pulse "Prompt library": graduated peer prompts + report.
//
// Learner-facing card on /ai-pulse/my-pulse. Shows the best GRADUATED prompts
// built by peers on the topics this learner has practised (anonymised: prompt +
// score + how many peers reused it — no author name). Each prompt carries a
// "Report" control (Radix dialog) so a learner can flag a bad prompt; a champion
// later disqualifies it via the existing fn_ai_pulse_disqualify_prompt_build.
// Learner flags, champion enforces — the two-part design from the leaderboard
// migration's own NOTE.
//
// DARK: both feeds are off in production today —
//   * fn_ai_pulse_my_prompt_builds returns nothing until prompt-build is enabled;
//   * fn_ai_pulse_topic_graduated_prompts returns nothing until graduation flips.
// So useSharedLibrary resolves to [] and this card renders null — the my-pulse
// page is byte-identical to now. It lights up on its own once graduation is on.
//
// Pattern reference: ./prompt-builder-card.tsx (client card + React Query +
// react-hot-toast) and ./domain-starter-card.tsx (learner report safety valve).

'use client';

import { useEffect, useRef, useState } from 'react';
import { Library, Flag, Loader2, Sparkles, Users, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useSharedLibrary,
  reportPromptBuild,
  reportErrorMessage,
  recordPromptCopy,
  type GraduatedPromptRow,
} from '@/lib/services/ai-pulse/shared-library-service';

// Preset report reasons. Every value is a NON-EMPTY string — Radix Select
// throws on an empty-string SelectItem value, and the pre-selected default
// means the form is always submittable.
const REPORT_REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'inaccurate', label: 'Wrong or misleading' },
  { value: 'inappropriate', label: 'Inappropriate or offensive' },
  { value: 'not_original', label: 'Copied — not their own work' },
  { value: 'low_effort', label: 'Spam or low-effort' },
  { value: 'other', label: 'Something else' },
];

function topicLabel(topicType: string): string {
  if (topicType === 'course') return 'For your subject';
  if (topicType === 'programme') return 'For your programme';
  return 'Peer prompt';
}

// ── one peer prompt + its report dialog ─────────────────────────────────────

function PeerPromptItem({ row }: { row: GraduatedPromptRow }) {
  const [open, setOpen] = useState(false);
  const [reasonKey, setReasonKey] = useState<string>(REPORT_REASONS[0].value);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [reported, setReported] = useState(false);
  const [copied, setCopied] = useState(false);
  const [usedCount, setUsedCount] = useState(row.used_count);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(row.assembled_prompt);
    } catch {
      // Clipboard can be blocked (permissions / insecure context) — the usage
      // ping still fires so the copy intent is captured.
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    const next = await recordPromptCopy(row.id);
    if (typeof next === 'number' && next > usedCount) setUsedCount(next);
  }

  async function handleSend() {
    setPending(true);
    // Compose a human-readable reason: the chosen category + optional free note.
    const label = REPORT_REASONS.find((r) => r.value === reasonKey)?.label ?? reasonKey;
    const trimmed = note.trim();
    const reason = trimmed ? `${label} — ${trimmed}` : label;
    try {
      await reportPromptBuild(row.id, reason);
      setReported(true);
      setOpen(false);
      toast.success('Thanks — we’ll review this prompt.');
    } catch (e) {
      toast.error(reportErrorMessage(e as Error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{topicLabel(row.topic_type)}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {typeof row.score === 'number' && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" aria-hidden />
              {row.score}
            </Badge>
          )}
          {usedCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" aria-hidden />
              used {usedCount} {usedCount === 1 ? 'time' : 'times'}
            </Badge>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
        {row.assembled_prompt}
      </p>

      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label="Copy this prompt"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden />
              Copy
            </>
          )}
        </Button>
        {reported ? (
          <span className="text-xs text-muted-foreground">Thanks, we’ll review it.</span>
        ) : (
          <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)}
            >
              <Flag className="h-3 w-3" aria-hidden />
              Report
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Report this prompt</DialogTitle>
                <DialogDescription>
                  Tell us what looks wrong. A reviewer will check it — the prompt’s
                  author is not told who reported it.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`reason-${row.id}`}>Reason</Label>
                  <Select value={reasonKey} onValueChange={setReasonKey}>
                    <SelectTrigger id={`reason-${row.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`note-${row.id}`}>
                    Add a note <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id={`note-${row.id}`}
                    rows={3}
                    maxLength={500}
                    placeholder="What’s the problem with this prompt?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSend} disabled={pending}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Send report
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────

export function SharedLibraryCard({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading, error } = useSharedLibrary(cycleId);
  const prompts = data ?? [];

  // Dark-substrate / empty / error → render nothing so the page stays clean and
  // byte-identical to today. The card appears only once graduated peer prompts
  // exist for the learner's topics.
  if (isLoading || error || prompts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Library className="h-4 w-4 text-primary" aria-hidden />
          Prompt library
        </CardTitle>
        <CardDescription>
          The best prompts your peers have built on your topics. See something off?
          Report it and a reviewer will take a look.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {prompts.map((row) => (
          <PeerPromptItem key={row.id} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}
