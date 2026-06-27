'use client';

// "AI suggested fix" affordance for the teacher's "topics to revisit" card (B1).
// Lazily POSTs { course_code } to /api/academic/session-feedback/ai-suggest-improvement
// when opened. The route self-scopes a plain faculty caller to their OWN sessions
// (by email) and returns ONLY the synthesized suggestion — never any raw comment.
//
// AI PROPOSES, the lift VERIFIES: this surfaces a concrete next-session action; the
// card's own Follow-up column (the lift) is what judges whether it worked. The AI is
// never the verifier and never acts on anyone.

import { useState } from 'react';
import { Sparkles, AlertTriangle, Lightbulb, Eye, Zap } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
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

const BRAND_GREEN = '#0b6d41';

interface AiSuggestion {
  summary: string;
  likelyCauses: string[];
  suggestedAdjustments: { title: string; how: string }[];
  quickWin: string;
  whatToWatchNext: string;
}

type AiResponse =
  | { ok: true; suggestion: AiSuggestion; meta?: unknown }
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

  async function load() {
    setLoading(true);
    setError(null);
    setNotEnough(false);
    setSuggestion(null);
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
      }
    } catch {
      setError('Could not reach the suggestion service. Please try again.');
    } finally {
      setLoading(false);
      setFetched(true);
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
