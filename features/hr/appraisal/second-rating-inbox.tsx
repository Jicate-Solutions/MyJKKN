'use client';

/**
 * Second ratings HR has asked this person to give.
 *
 * The rater reads the same evidence the first head reads — the person's own
 * self-appraisal — and rates the four areas without seeing what the first
 * head said. Only once both are in are the two shown side by side. The second
 * rating does not change the appraisal; it tells HR whether two heads reading
 * the same evidence agree.
 *
 * Renders nothing when nobody has asked this person for one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { AlertCircle, ArrowLeft, Save, Scale, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RatingBadge, RatingPicker } from '@/features/hr/appraisal/rating-picker';
import {
  AREA_LABELS,
  parseCollegialityExample,
  parseRatings,
  resolveAreas,
  type AppraisalRatingMap,
} from '@/lib/hr/appraisal-ratings';
import {
  parseConditions,
  parseTickedStatements,
  type ConditionAnswers,
  type TickedStatements,
} from '@/lib/hr/appraisal-harness';
import {
  PerformanceReviewService,
  type HRPerformanceReviewPolicy,
} from '@/lib/services/hr/performance-review-service';
import {
  AppraisalSecondRatingService,
  type HRSecondRating,
  type SecondRatingEvidence,
} from '@/lib/services/hr/appraisal-second-rating-service';

interface SecondRatingForm {
  ratings: AppraisalRatingMap;
  collegiality_example: string;
  statements: TickedStatements;
  conditions: ConditionAnswers;
  notes: string;
}

function formFrom(raw: Record<string, unknown> | null): SecondRatingForm {
  return {
    ratings: parseRatings(raw, resolveAreas()),
    collegiality_example: parseCollegialityExample(raw),
    statements: parseTickedStatements(raw),
    conditions: parseConditions(raw),
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
  };
}

export function SecondRatingInbox({ supabase }: { supabase: SupabaseClient }) {
  const areas = useMemo(() => resolveAreas(), []);
  const [rows, setRows] = useState<HRSecondRating[]>([]);
  const [evidence, setEvidence] = useState<Record<string, SecondRatingEvidence>>({});
  const [policy, setPolicy] = useState<HRPerformanceReviewPolicy | null>(null);
  const policyFor = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<SecondRatingForm>(formFrom(null));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const mine = await AppraisalSecondRatingService.listMine(supabase, auth.user.id);
      setRows(mine);
      if (mine.length === 0) return;
      const evs = await Promise.all(
        mine.map((r) => AppraisalSecondRatingService.getEvidence(supabase, r.id)),
      );
      const map: Record<string, SecondRatingEvidence> = {};
      evs.forEach((e) => {
        map[e.secondRatingId] = e;
      });
      setEvidence(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load second-rating requests.');
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = rows.find((r) => r.id === openId) ?? null;
  const openEvidence = open ? evidence[open.id] : undefined;
  const locked = !!open?.submitted_at;

  function openRow(r: HRSecondRating) {
    setOpenId(r.id);
    setForm(formFrom(r.rating_jsonb));
    // The settings of the appraised person's college (conditions-first,
    // Collegiality example, statements) — the same read the database makes.
    // Cleared first so one request's settings never apply to another.
    setPolicy(null);
    policyFor.current = r.id;
    PerformanceReviewService.getPolicy(supabase, evidence[r.id]?.institutionId ?? null)
      .then((pol) => {
        if (policyFor.current === r.id) setPolicy(pol);
      })
      .catch(() => {
        // Left null: both safeguards stay on, the stricter default.
      });
  }

  async function save(submit: boolean) {
    if (!open) return;
    setBusy(true);
    try {
      const updated = await AppraisalSecondRatingService.save(supabase, {
        secondRatingId: open.id,
        payload: form as unknown as Record<string, unknown>,
        submit,
        policy,
      });
      setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(submit ? 'Second rating submitted.' : 'Saved.');
      if (submit) {
        // Re-read the evidence: the first head's ratings may now be shown.
        const ev = await AppraisalSecondRatingService.getEvidence(supabase, updated.id);
        setEvidence((m) => ({ ...m, [updated.id]: ev }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Second-rating requests could not be loaded</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (rows.length === 0) return null;

  if (open) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            Second rating: {openEvidence?.personName ?? 'appraisal'}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-2">Back</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            HR asked you to rate this appraisal from the same evidence the person&rsquo;s own
            head of department sees. You will not see that head&rsquo;s ratings until you have
            both finished. Your rating does not change the appraisal; it shows HR whether two
            heads reading the same evidence agree.
          </p>

          <div>
            <h4 className="mb-2 text-sm font-semibold">The self-appraisal (read-only)</h4>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-3 text-xs">
              {JSON.stringify(openEvidence?.selfAppraisal ?? {}, null, 2)}
            </pre>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold">Your rating</h4>
            <div className="mt-3">
              <RatingPicker
                idPrefix={`second-${open.id.slice(0, 8)}`}
                areas={areas}
                value={form.ratings}
                onChange={(ratings) => setForm((f) => ({ ...f, ratings }))}
                collegialityExample={form.collegiality_example}
                onCollegialityExampleChange={(collegiality_example) =>
                  setForm((f) => ({ ...f, collegiality_example }))
                }
                policy={policy}
                disabled={locked}
                tickedStatements={form.statements}
                onTickedStatementsChange={(statements) => setForm((f) => ({ ...f, statements }))}
                conditions={form.conditions}
                onConditionsChange={(conditions) => setForm((f) => ({ ...f, conditions }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`second-notes-${open.id}`}>Notes (optional)</Label>
            <Textarea
              id={`second-notes-${open.id}`}
              rows={2}
              className="mt-1"
              disabled={locked}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="What in the evidence decided it for you."
            />
          </div>

          {locked && openEvidence?.bothIn && openEvidence.firstHeadRatings && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold">Both ratings are in</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Area</th>
                      <th className="py-2 pr-4">You</th>
                      <th className="py-2 pr-4">Their head</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((a) => (
                      <tr key={a} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-medium">{AREA_LABELS[a]}</td>
                        <td className="py-2 pr-4">
                          <RatingBadge rating={form.ratings[a]} />
                        </td>
                        <td className="py-2 pr-4">
                          <RatingBadge rating={openEvidence.firstHeadRatings?.[a]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {locked && !openEvidence?.bothIn && (
            <p className="text-xs text-muted-foreground">
              Submitted. The head&rsquo;s ratings will show here once they have finished too.
            </p>
          )}

          {!locked && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => save(false)} disabled={busy}>
                <Save className="h-4 w-4" />
                <span className="ml-2">Save</span>
              </Button>
              <Button onClick={() => save(true)} disabled={busy}>
                <Send className="h-4 w-4" />
                <span className="ml-2">{busy ? 'Working…' : 'Submit second rating'}</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const waiting = rows.filter((r) => !r.submitted_at).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          Second ratings HR asked you for ({waiting} waiting)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm">
                <span className="font-medium">{evidence[r.id]?.personName ?? 'Appraisal'}</span>
                {evidence[r.id]?.designation && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {evidence[r.id]?.designation}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{r.submitted_at ? 'Submitted' : 'Waiting for you'}</Badge>
                <Button size="sm" variant="outline" onClick={() => openRow(r)}>
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
