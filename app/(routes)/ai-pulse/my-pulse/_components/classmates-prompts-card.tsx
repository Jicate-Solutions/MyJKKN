// app/(routes)/ai-pulse/my-pulse/_components/classmates-prompts-card.tsx
// Created: 2026-07-26 — AI Pulse Star-Library v2, PR B: the "classmates' prompts" feed.
// Spec: specs/ai-pulse-star-library-v2-2026-07-26.md (decisions #5, #6)
//
// Learner-facing card on /ai-pulse/my-pulse. Shows NON-star peer prompts (AI score
// 60–79 — decent, not yet a library star) built by classmates on the learner's own
// topics, matched by subject NAME across ALL JKKN colleges. Each carries a Copy
// button: copying puts the text on the clipboard AND pings
// fn_ai_pulse_record_prompt_build_use(p_build_id, 'copy'), which counts distinct
// copiers. Three distinct copiers is the popularity signal that can promote a
// not-yet-star prompt into the library — the path that was structurally dead while
// the copy recorder only accepted already-graduated, same-college targets.
//
// 2026-07-30 — Director decision #4: "SHOW AUTHOR = show the author's name". Each
// item is now BYLINED with the author's real display name (fallback "A classmate"
// when the RPC returns no name). PRIVACY, stated not hidden: this feed matches by
// subject NAME across ALL JKKN colleges, so a name here is campus-wide, and the
// platform serves school learners — some of these names are MINORS'. The Director
// chose this after being shown the tradeoff. The kill switch
// (prompt_classmates_feed_enabled) is still OFF, so nothing is exposed today.
//
// 2026-07-30 — Director decision: "Yes — add a report button to the feed." Each
// item now also carries a "Report" control, mirroring ./shared-library-card.tsx
// (same Radix dialog, same reason presets, same copy, same Flag icon, same toast).
// This is what gives moderation decision #3 an entry point: PR2
// (20260804120000) removed the automatic hide, so a REPORT is now the only way a
// learner can ask for a human decision on a feed prompt — and before this card
// had one, that decision had no way to be triggered from the feed at all.
// The companion migration (20260804150000) drops the RPC's cross-institution
// refusal, without which this button would have thrown on most feed items: the
// feed matches subjects BY NAME across ALL colleges and everyone sees the shared
// 'global' shelf, so most items are authored outside the viewer's institution.
//
// DARK-SAFE: usePeerPrompts resolves to [] while there are no 60–79 non-graduated
// builds for the learner's topics (true today), so this card renders null and the
// page is byte-identical to now. It lights up on its own once such prompts exist.
//
// Pattern reference: ./shared-library-card.tsx (client card + React Query +
// react-hot-toast + report dialog) and ./domain-starter-card.tsx (clipboard copy
// + best-effort usage ping).

'use client';

import { useEffect, useRef, useState } from 'react';
import { Users2, Copy, Check, Sparkles, Users, UserRound, Flag, Loader2 } from 'lucide-react';
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
  usePeerPrompts,
  recordPromptCopy,
  reportPromptBuild,
  reportErrorMessage,
  type PeerPromptRow,
} from '@/lib/services/ai-pulse/shared-library-service';

// Same presets as the library card, deliberately verbatim so a learner meets ONE
// report vocabulary across both surfaces. Every value is a NON-EMPTY string —
// Radix Select throws on an empty-string SelectItem value, and the pre-selected
// default keeps the form always submittable.
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
  return 'From your classmates';
}

// ── one classmate prompt + its copy / report controls ───────────────────────

function PeerPromptItem({ row }: { row: PeerPromptRow }) {
  const [copied, setCopied] = useState(false);
  const [usedCount, setUsedCount] = useState(row.used_count);
  const [open, setOpen] = useState(false);
  const [reasonKey, setReasonKey] = useState<string>(REPORT_REASONS[0].value);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [reported, setReported] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorLabel = row.author_name?.trim() ? row.author_name.trim() : 'A classmate';

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(row.assembled_prompt);
    } catch {
      // Clipboard can be blocked (permissions / insecure context). The usage
      // ping still fires so the copy intent is captured.
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    // Best-effort popularity ping; returns the new distinct-copier count (or null
    // when the ping was a no-op). Reflect the fresh count when we get one.
    const next = await recordPromptCopy(row.id);
    if (typeof next === 'number' && next > usedCount) setUsedCount(next);
  }

  async function handleSend() {
    setPending(true);
    // Same composition as the library card: the chosen category + optional note.
    const label = REPORT_REASONS.find((r) => r.value === reasonKey)?.label ?? reasonKey;
    const trimmed = note.trim();
    const reason = trimmed ? `${label} — ${trimmed}` : label;
    try {
      await reportPromptBuild(row.id, reason);
      // ALREADY-REPORTED IS NOT A FAILURE: the RPC dedups with ON CONFLICT DO
      // NOTHING and returns void either way, so a learner who reports the same
      // prompt again (e.g. after a page refresh, which resets `reported`) lands
      // here, not in the catch. Confirm success both times — never imply the
      // second tap went wrong.
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

      <div className="flex items-center justify-between gap-2">
        {/* Director decision #4: the author is named. Blank/missing name → a
            neutral fallback, never "null"/"undefined" or an empty gap.
            `min-w-0 flex-1` + `truncate` so a long name shortens with an ellipsis
            instead of pushing the Copy/Report controls out of the row. */}
        <p className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground">
          <UserRound className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{authorLabel}</span>
        </p>
        {/* Controls stay pinned right and never shrink, so the byline is the only
            thing that gives way on a narrow screen. */}
        <div className="flex shrink-0 items-center gap-1">
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
            // Shorter than the library card's inline "Thanks, we'll review it."
            // on purpose: this row already carries the author byline, and the
            // full sentence is delivered by the toast. Same Flag icon, so the
            // state still reads as "reported".
            <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
              <Flag className="h-3 w-3" aria-hidden />
              Reported
            </span>
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
                    <Label htmlFor={`peer-reason-${row.id}`}>Reason</Label>
                    <Select value={reasonKey} onValueChange={setReasonKey}>
                      <SelectTrigger id={`peer-reason-${row.id}`}>
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
                    <Label htmlFor={`peer-note-${row.id}`}>
                      Add a note <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id={`peer-note-${row.id}`}
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
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────

export function ClassmatesPromptsCard({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading, error } = usePeerPrompts(cycleId);
  const prompts = data ?? [];

  // Empty / loading / error → render nothing so the page stays clean and
  // byte-identical to today. The card appears only once classmates have decent
  // (score 60–79) prompts on the learner's topics.
  if (isLoading || error || prompts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" aria-hidden />
          Classmates’ prompts
        </CardTitle>
        <CardDescription>
          Promising prompts your classmates built on your topics — copy one to reuse it,
          and the ones people copy most rise into the library. See something off? Report
          it and a reviewer will take a look.
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
