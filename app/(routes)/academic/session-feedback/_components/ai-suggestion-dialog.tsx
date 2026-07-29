'use client';

// "AI suggested fix" affordance for the teacher's "topics to revisit" card (B1).
// Lazily POSTs { course_code } to /api/academic/session-feedback/ai-suggest-improvement
// when opened. The route self-scopes a plain faculty caller to their OWN sessions
// (by email) and returns ONLY the synthesized suggestion — never any raw comment.
//
// AI PROPOSES, the lift VERIFIES: this surfaces a concrete next-session action; the
// card's own Follow-up column (the lift) is what judges whether it worked. The AI is
// never the verifier and never acts on anyone.

import { useEffect, useState } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Eye,
  Zap,
  ThumbsUp,
  MinusCircle,
  XCircle,
  Check,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';

const BRAND_GREEN = '#0b6d41';

type Verdict = 'tried_helped' | 'tried_no_change' | 'not_tried';

// The three human-feedback options shown under a suggestion. Order = best→neutral.
const VERDICT_OPTIONS: {
  value: Verdict;
  label: string;
  Icon: typeof ThumbsUp;
}[] = [
  { value: 'tried_helped', label: 'I tried this — it helped', Icon: ThumbsUp },
  { value: 'tried_no_change', label: 'Tried — no change', Icon: MinusCircle },
  { value: 'not_tried', label: "Didn't try", Icon: XCircle },
];

interface AiSuggestion {
  summary: string;
  likelyCauses: string[];
  suggestedAdjustments: { title: string; how: string }[];
  quickWin: string;
  whatToWatchNext: string;
}

type AiResponse =
  | { ok: true; suggestion: AiSuggestion; suggestion_id?: string | null; meta?: unknown }
  | { ok: true; suggestion: null; reason?: string; meta?: unknown }
  | { ok: false; error: string };

export function AiSuggestionDialog({
  courseCode,
  courseName,
  from,
  to,
}: {
  courseCode: string;
  courseName?: string | null;
  from: string;
  to: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [notEnough, setNotEnough] = useState(false);
  const [fetched, setFetched] = useState(false);
  // Loop-memory row id for THIS suggestion — present only when recording succeeded.
  // Gates the human-verdict buttons (no id → can't attach a verdict).
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [savingVerdict, setSavingVerdict] = useState<Verdict | null>(null);
  // Elapsed-seconds counter shown while the answer is computed on the Max lane
  // (the seat/Windows drain claims ~every minute), so a longer-than-instant wait
  // reads as steady progress, not a hang.
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [loading]);

  async function load() {
    setLoading(true);
    setError(null);
    setNotEnough(false);
    setSuggestion(null);
    setSuggestionId(null);
    setVerdict(null);
    try {
      const res = await fetch(
        '/api/academic/session-feedback/ai-suggest-improvement',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ course_code: courseCode, from, to }),
        },
      );
      const data: AiResponse = await res.json();
      if (!res.ok || data.ok === false) {
        setError(
          (data as { error?: string }).error ?? 'Could not generate a suggestion.',
        );
      } else if (data.suggestion == null) {
        setNotEnough(true);
      } else {
        setSuggestion(data.suggestion);
        setSuggestionId(data.suggestion_id ?? null);
      }
    } catch {
      setError('Could not reach the suggestion service. Please try again.');
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  // Records the teacher's read on whether this advice helped — the human signal
  // the loop feeds back into its next suggestion for this class.
  async function saveVerdict(next: Verdict) {
    if (!suggestionId || savingVerdict) return;
    setSavingVerdict(next);
    try {
      const applied = await SessionFeedbackService.setSuggestionVerdict(
        suggestionId,
        next,
      );
      if (applied) {
        setVerdict(next);
        toast.success('Thanks — your feedback helps improve the next suggestion.');
      } else {
        toast.error("Couldn't save your feedback. Please try again.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't save your feedback. Please try again.",
      );
    } finally {
      setSavingVerdict(null);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Fetch the first time the dialog is opened (lazy — no cost until asked).
    if (next && !fetched && !loading) void load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" style={{ color: BRAND_GREEN }} />
          AI suggested fix
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Suggested fix — {courseCode}
          </DialogTitle>
          <DialogDescription>
            {courseName ? `${courseName}. ` : ''}A concrete next-session action drawn
            from your class&apos;s anonymous feedback. Your next session&apos;s
            understanding score is what confirms it worked.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <BeatLoader color={BRAND_GREEN} size={9} />
            <p className="text-sm text-muted-foreground">
              Reading the feedback and drafting a fix…
            </p>
            <p className="text-xs text-muted-foreground">
              {elapsed}s elapsed · this usually takes under a minute
            </p>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : notEnough ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertTriangle className="h-9 w-9 text-amber-500" />
            <p className="text-sm font-medium">Not enough feedback yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              This course needs at least 3 responses in the window before a grounded
              suggestion can be made. Encourage the class to give feedback, then check
              back.
            </p>
          </div>
        ) : suggestion ? (
          <div className="space-y-4 text-sm">
            <p className="rounded-md bg-muted/50 p-3 leading-relaxed">
              {suggestion.summary}
            </p>

            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Likely causes
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {suggestion.likelyCauses.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>

            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold">
                <Lightbulb className="h-4 w-4" style={{ color: BRAND_GREEN }} />
                Suggested adjustments
              </h4>
              <ul className="space-y-2">
                {suggestion.suggestedAdjustments.map((a, i) => (
                  <li key={i} className="rounded-md border p-2.5">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-muted-foreground">{a.how}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md border border-green-200 bg-green-50 p-3">
              <h4 className="mb-1 flex items-center gap-1.5 font-semibold text-green-900">
                <Zap className="h-4 w-4" />
                5-minute quick win
              </h4>
              <p className="text-green-900">{suggestion.quickWin}</p>
            </section>

            <section>
              <h4 className="mb-1 flex items-center gap-1.5 font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" />
                What to watch next
              </h4>
              <p className="text-muted-foreground">{suggestion.whatToWatchNext}</p>
            </section>

            {/* Human verdict — the teacher tells the loop whether this worked, so the
                next suggestion learns from it. Shown only when the suggestion was
                recorded (suggestionId present). */}
            {suggestionId ? (
              <section className="rounded-md border bg-muted/30 p-3">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                  Did this help? Your answer trains the next suggestion.
                </h4>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {VERDICT_OPTIONS.map(({ value, label, Icon }) => {
                    const chosen = verdict === value;
                    const isSaving = savingVerdict === value;
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={chosen ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start gap-1.5"
                        style={chosen ? { backgroundColor: BRAND_GREEN } : undefined}
                        // After a verdict is saved, lock the row — the chosen one
                        // stays highlighted, the others disable.
                        disabled={
                          savingVerdict !== null || (verdict !== null && !chosen)
                        }
                        aria-pressed={chosen}
                        onClick={() => saveVerdict(value)}
                      >
                        {isSaving ? (
                          <BeatLoader color="#ffffff" size={5} />
                        ) : chosen ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Icon className="h-3.5 w-3.5" />
                        )}
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <p className="border-t pt-3 text-[11px] text-muted-foreground">
              AI-generated from anonymized, aggregate feedback — no individual response
              is shown or quoted. Treat it as a prompt, not a prescription.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
