'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Star,
} from 'lucide-react';
import { useAddJudgeScore, useUpdateJudgeScore } from '@/hooks/startup-studio';

/**
 * The 5 judging criteria with weights matching the ops plan.
 * Each criterion is scored 1-5, and the system calculates a weighted total.
 */
const JUDGING_CRITERIA = [
  {
    key: 'real_problem',
    label: 'Real Problem (25%)',
    weight: 0.25,
    description: 'Is the problem backed by discovery interviews? Evidence of real pain.',
  },
  {
    key: 'working_app',
    label: 'Working App (25%)',
    weight: 0.25,
    description: 'Does the app actually function? Can the judge use it live?',
  },
  {
    key: 'user_tested',
    label: 'User Tested (20%)',
    weight: 0.20,
    description: 'Have real people tried the app? Evidence of user feedback.',
  },
  {
    key: 'completeness',
    label: 'Completeness (15%)',
    weight: 0.15,
    description: 'Is the app usable today? Not just a prototype or demo.',
  },
  {
    key: 'presentation',
    label: 'Presentation (15%)',
    weight: 0.15,
    description: 'Clear, confident delivery within the time limit.',
  },
] as const;

type CriterionKey = (typeof JUDGING_CRITERIA)[number]['key'];

interface ScoringFormProps {
  submissionId: string;
  judgeId: string;
  /** If provided, the form is in edit mode for this existing score */
  existingScore?: {
    id: string;
    real_problem: number | null;
    working_app: number | null;
    user_tested: number | null;
    completeness: number | null;
    presentation: number | null;
    notes: string | null;
    strengths: string | null;
    improvements: string | null;
  };
  trackId?: string;
  onSuccess?: () => void;
}

export function ScoringForm({
  submissionId,
  judgeId,
  existingScore,
  trackId,
  onSuccess,
}: ScoringFormProps) {
  const addScore = useAddJudgeScore();
  const updateScore = useUpdateJudgeScore();

  const isEditing = !!existingScore;

  const [scores, setScores] = useState<Record<CriterionKey, number | null>>({
    real_problem: existingScore?.real_problem ?? null,
    working_app: existingScore?.working_app ?? null,
    user_tested: existingScore?.user_tested ?? null,
    completeness: existingScore?.completeness ?? null,
    presentation: existingScore?.presentation ?? null,
  });

  const [notes, setNotes] = useState(existingScore?.notes ?? '');
  const [strengths, setStrengths] = useState(existingScore?.strengths ?? '');
  const [improvements, setImprovements] = useState(existingScore?.improvements ?? '');
  const [validationError, setValidationError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const setScore = (key: CriterionKey, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
    setValidationError('');
  };

  // Calculate weighted total live (out of 100)
  const weightedTotal = JUDGING_CRITERIA.reduce((sum, c) => {
    const val = scores[c.key] || 0;
    return sum + val * c.weight;
  }, 0);
  const percentScore = Math.round(weightedTotal * 20);

  // How many criteria are filled
  const filledCount = Object.values(scores).filter((v) => v !== null).length;
  const allFilled = filledCount === JUDGING_CRITERIA.length;

  const handleSubmit = async () => {
    // Validate all criteria are scored
    const missing = JUDGING_CRITERIA.filter((c) => !scores[c.key]);
    if (missing.length > 0) {
      setValidationError(
        `Please score all criteria. Missing: ${missing.map((c) => c.label).join(', ')}`
      );
      return;
    }

    setValidationError('');

    try {
      if (isEditing && existingScore) {
        await updateScore.mutateAsync({
          scoreId: existingScore.id,
          data: {
            ...scores,
            notes: notes.trim() || null,
            strengths: strengths.trim() || null,
            improvements: improvements.trim() || null,
          },
        });
      } else {
        await addScore.mutateAsync({
          id: submissionId,
          data: {
            judge_id: judgeId,
            track_id: trackId || null,
            ...scores,
            notes: notes.trim() || null,
            strengths: strengths.trim() || null,
            improvements: improvements.trim() || null,
          },
        });
      }
      setShowSuccess(true);
      onSuccess?.();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save score. Please try again.');
    }
  };

  const isPending = addScore.isPending || updateScore.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-600" />
          {isEditing ? 'Update Score' : 'Judge Scoring'}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Rate each criterion from 1 (poor) to 5 (excellent). The weighted total is calculated automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {showSuccess && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Score {isEditing ? 'updated' : 'submitted'} successfully!
            </AlertDescription>
          </Alert>
        )}

        {/* Criteria scoring */}
        <div className="space-y-5">
          {JUDGING_CRITERIA.map((criterion) => (
            <div key={criterion.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  {criterion.label}
                </Label>
                {scores[criterion.key] !== null && (
                  <span className="text-sm font-medium text-primary">
                    {scores[criterion.key]} / 5
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {criterion.description}
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const isSelected = scores[criterion.key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScore(criterion.key, value)}
                      className={`
                        flex items-center justify-center w-12 h-10 rounded-md border text-sm font-medium transition-colors
                        ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-input'
                        }
                      `}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Weighted total display */}
        <div className="rounded-lg bg-muted p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Weighted Total</span>
            <span className="text-2xl font-bold text-primary">
              {allFilled ? `${percentScore}/100` : `${filledCount}/${JUDGING_CRITERIA.length} scored`}
            </span>
          </div>
          {allFilled && (
            <div className="mt-2 w-full bg-background rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${percentScore}%` }}
              />
            </div>
          )}
        </div>

        {/* Qualitative feedback */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="strengths">Strengths</Label>
            <Textarea
              id="strengths"
              placeholder="What did this team do well?"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="improvements">Areas for Improvement</Label>
            <Textarea
              id="improvements"
              placeholder="What could be improved?"
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any other observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isPending || !allFilled}
            size="lg"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              'Update Score'
            ) : (
              'Submit Score'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
