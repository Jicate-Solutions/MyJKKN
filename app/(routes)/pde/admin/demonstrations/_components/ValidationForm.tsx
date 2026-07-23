'use client';

/**
 * ValidationForm
 * ============================================================================
 * Client component used by /pde/admin/demonstrations/[id] to record a
 * validator review and then trigger the scoring engine.
 *
 * Two-button UX:
 *   1) "Save validation" → POSTs notes + raw_score to /validate.
 *      State flips to 'validated'; raw_score is persisted.
 *   2) "Compute weighted score" → POSTs to /score (no body).
 *      Engine reads validator-set raw_score + weights + rubric threshold,
 *      writes weighted_score + passed + scored_at and flips to 'scored'.
 *
 * Rubric (if attached) is displayed read-only above the form so the
 * validator has the rubric criteria + scoring band in front of them while
 * picking a raw_score.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CheckCircle2, Calculator, AlertCircle, BookOpenCheck } from 'lucide-react';
import type { SyllabusCLO } from '@/lib/types/pde-curriculum';

interface ValidationFormProps {
  demonstrationId: string;
  status: string;
  rubric: Record<string, any> | null;
  rubricKey: string | null;
  existingRawScore: number | null;
  /** Curriculum connector — present only when the demo links a BoS syllabus. */
  syllabusLabel?: string | null;
  syllabusClos?: SyllabusCLO[] | null;
  /** Learner-PROPOSED CLO numbers (pre-checked; validator can uncheck/add). */
  cloProposals?: number[] | null;
  /** Previously confirmed set (re-opening a validated row). */
  existingConfirmed?: number[] | null;
}

interface ScoreResult {
  raw_score: number;
  weighted_score: number;
  passed: boolean;
  scored_at: string;
  status: string;
}

export function ValidationForm({
  demonstrationId,
  status,
  rubric,
  rubricKey,
  existingRawScore,
  syllabusLabel,
  syllabusClos,
  cloProposals,
  existingConfirmed,
}: ValidationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');
  const [rawScore, setRawScore] = useState<string>(
    existingRawScore !== null ? String(existingRawScore) : ''
  );
  const [busy, setBusy] = useState<'validate' | 'score' | null>(null);
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null);

  // CLO confirmation (spec §4.8 "learner tags, validator confirms"): start
  // from the previously confirmed set if re-opening, else pre-check the
  // learner's proposals. Attainment reads the confirmed set only.
  const hasCloPanel = Array.isArray(syllabusClos) && syllabusClos.length > 0;
  const [confirmedClos, setConfirmedClos] = useState<number[]>(
    existingConfirmed ?? cloProposals ?? []
  );
  const proposalSet = new Set(cloProposals ?? []);

  const toggleConfirmedClo = (n: number) => {
    setConfirmedClos((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)
    );
  };

  const passThreshold =
    rubric &&
    typeof rubric.scoring_band === 'object' &&
    typeof rubric.scoring_band.pass_threshold === 'number'
      ? (rubric.scoring_band.pass_threshold as number)
      : null;

  const distinctionThreshold =
    rubric &&
    typeof rubric.scoring_band === 'object' &&
    typeof rubric.scoring_band.distinction_threshold === 'number'
      ? (rubric.scoring_band.distinction_threshold as number)
      : null;

  const alreadyValidated = status === 'validated' || status === 'scored';
  const alreadyScored = status === 'scored';

  async function handleSaveValidation() {
    const scoreNum = Number(rawScore);
    if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      toast.error('Raw score must be a number between 0 and 100.');
      return;
    }

    setBusy('validate');
    try {
      const res = await fetch(`/api/pde/demonstrations/${demonstrationId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          raw_score: scoreNum,
          // Only send the confirmed set when this demo has a CLO panel —
          // omitting the key leaves clo_refs_confirmed untouched server-side.
          ...(hasCloPanel ? { clo_refs_confirmed: confirmedClos } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Validation failed');
      }
      toast.success('Validation saved. You can now compute the weighted score.');
      startTransition(() => {
        router.refresh();
      });
    } catch (e: any) {
      toast.error(e?.message || 'Validation failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleComputeScore() {
    setBusy('score');
    try {
      const res = await fetch(`/api/pde/demonstrations/${demonstrationId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Scoring failed');
      }
      setLastResult({
        raw_score: json.data.raw_score,
        weighted_score: json.data.weighted_score,
        passed: json.data.passed,
        scored_at: json.data.scored_at,
        status: json.data.status,
      });
      toast.success(
        json.data.passed
          ? `Scored: ${Number(json.data.weighted_score).toFixed(1)} — PASSED`
          : `Scored: ${Number(json.data.weighted_score).toFixed(1)} — did not pass`
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (e: any) {
      toast.error(e?.message || 'Scoring failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Rubric panel (read-only) */}
      {rubric ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span>Rubric</span>
              <Badge variant="outline" className="font-mono text-xs">
                {rubricKey}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {passThreshold !== null ? (
              <div className="flex gap-3 text-xs">
                <Badge variant="outline">
                  Pass ≥ {passThreshold}
                </Badge>
                {distinctionThreshold !== null ? (
                  <Badge variant="outline">
                    Distinction ≥ {distinctionThreshold}
                  </Badge>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                No pass threshold defined in rubric — engine will use default 60.
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Rubric content</div>
              <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto">
                {JSON.stringify(rubric, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : rubricKey ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Rubric <code className="font-mono text-xs">{rubricKey}</code> not found — the scoring
            engine will use the default pass threshold (60).
          </CardContent>
        </Card>
      ) : null}

      {/* Validation form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Validator Action
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {alreadyScored ? (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-sm">
              This demonstration has already been scored.
            </div>
          ) : alreadyValidated ? (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 text-sm">
              Validation recorded — you can now compute the weighted score.
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="raw_score">Raw score (0–100)</Label>
            <Input
              id="raw_score"
              type="number"
              min={0}
              max={100}
              step={1}
              value={rawScore}
              onChange={(e) => setRawScore(e.target.value)}
              disabled={alreadyScored}
              className="max-w-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              Your numeric assessment against the rubric criteria above.
            </p>
          </div>

          {/* CLO confirmation (curriculum connector) */}
          {hasCloPanel ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <BookOpenCheck className="h-4 w-4" />
                Confirm course outcomes{syllabusLabel ? ` — ${syllabusLabel}` : ''}
              </Label>
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <ul className="space-y-2">
                  {(syllabusClos ?? []).map((clo) => {
                    const checked = confirmedClos.includes(clo.clo_number);
                    const proposed = proposalSet.has(clo.clo_number);
                    return (
                      <li key={clo.clo_number} className="flex items-start gap-2">
                        <Checkbox
                          id={`confirm-clo-${clo.clo_number}`}
                          checked={checked}
                          disabled={alreadyScored}
                          onCheckedChange={() => toggleConfirmedClo(clo.clo_number)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={`confirm-clo-${clo.clo_number}`}
                          className="text-xs leading-snug cursor-pointer text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">CLO {clo.clo_number}.</span>{' '}
                          {clo.description}
                          {proposed ? (
                            <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 align-middle">
                              learner-proposed
                            </Badge>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Only outcomes you confirm here count toward CLO/PO attainment — uncheck
                  anything this evidence doesn&apos;t actually demonstrate.
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="notes">Validation notes</Label>
            <Textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={alreadyScored}
              placeholder="The learner reads this. Process praise lands best: name the specific strategy or effort that worked ('Your step-by-step history-taking was systematic…'), then one concrete next step."
            />
            <p className="text-xs text-muted-foreground">
              Your note is shown to the learner on their demonstrations page.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={handleSaveValidation}
              disabled={busy !== null || isPending || alreadyScored}
            >
              {busy === 'validate' ? 'Saving…' : 'Save validation'}
            </Button>

            <Button
              variant="secondary"
              onClick={handleComputeScore}
              disabled={busy !== null || isPending || !alreadyValidated}
            >
              <Calculator className="h-4 w-4 mr-2" />
              {busy === 'score' ? 'Computing…' : 'Compute weighted score'}
            </Button>
          </div>

          {lastResult ? (
            <div className="mt-4 rounded-md border border-border bg-muted/20 p-3 text-sm space-y-1">
              <div className="font-semibold">Scoring result</div>
              <div>Raw: {Number(lastResult.raw_score).toFixed(1)}</div>
              <div>Weighted: {Number(lastResult.weighted_score).toFixed(1)}</div>
              <div>
                Outcome:{' '}
                <Badge
                  variant="outline"
                  className={
                    lastResult.passed
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40'
                  }
                >
                  {lastResult.passed ? 'PASSED' : 'Did not pass'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Scored at {new Date(lastResult.scored_at).toLocaleString()}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
