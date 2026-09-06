'use client';

// app/(routes)/ai-pulse/lab/[cycle]/_components/dept-evaluation-panel.tsx
// One card per department: lists that department's team submissions with
// artifact links, 1–10 score inputs (domain relevance + clarity, per the SOP
// Phase IV rubric), free-text notes, and a Gold Standard switch capped at the
// gold_standard_count policy. Save persists the whole department bucket.

import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Loader2, Medal, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useSaveDeptEvaluation,
  type DeptGoldSelection,
  type LabDeptGroup,
  type LabSubmissionScore,
} from '@/lib/services/ai-pulse/lab-evaluation-service';

interface DeptEvaluationPanelProps {
  cycleId: string;
  dept: LabDeptGroup;
  draft: DeptGoldSelection;
  serverSelection: DeptGoldSelection | null;
  goldCap: number;
  canSelectGold: boolean;
  onChange: (next: DeptGoldSelection) => void;
}

function emptyScore(): LabSubmissionScore {
  return { relevance: null, clarity: null, notes: '' };
}

/** Clamp a typed value into the 1–10 rubric range (or null when cleared). */
function clampScore(value: string): number | null {
  if (value.trim() === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, n));
}

export function DeptEvaluationPanel({
  cycleId,
  dept,
  draft,
  serverSelection,
  goldCap,
  canSelectGold,
  onChange,
}: DeptEvaluationPanelProps) {
  const saveMutation = useSaveDeptEvaluation(cycleId);

  const isDirty = useMemo(() => {
    const server = serverSelection ?? {
      submission_ids: [],
      selected_by: null,
      selected_at: null,
      scores: {},
    };
    return (
      JSON.stringify({ ids: [...draft.submission_ids].sort(), scores: draft.scores }) !==
      JSON.stringify({ ids: [...server.submission_ids].sort(), scores: server.scores })
    );
  }, [draft, serverSelection]);

  const setScore = (submissionId: string, patch: Partial<LabSubmissionScore>) => {
    const current = draft.scores[submissionId] ?? emptyScore();
    onChange({
      ...draft,
      scores: { ...draft.scores, [submissionId]: { ...current, ...patch } },
    });
  };

  const toggleGold = (submissionId: string, checked: boolean) => {
    if (checked) {
      if (draft.submission_ids.includes(submissionId)) return;
      if (draft.submission_ids.length >= goldCap) {
        toast.error(
          `Gold Standard is capped at ${goldCap} team${goldCap === 1 ? '' : 's'} per department. Unselect another team first.`,
        );
        return;
      }
      onChange({ ...draft, submission_ids: [...draft.submission_ids, submissionId] });
    } else {
      onChange({
        ...draft,
        submission_ids: draft.submission_ids.filter((id) => id !== submissionId),
      });
    }
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        departmentId: dept.department_id,
        selection: draft,
      });
      toast.success(`${dept.department_name}: evaluation saved`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{dept.department_name}</CardTitle>
            <CardDescription>
              {dept.submissions.length} submission
              {dept.submissions.length === 1 ? '' : 's'} · Gold selected:{' '}
              {draft.submission_ids.length} / {goldCap}
              {serverSelection?.selected_at && (
                <>
                  {' '}· Last saved{' '}
                  {new Date(serverSelection.selected_at).toLocaleString()}
                </>
              )}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save department
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dept.submissions.map((sub, idx) => {
          const score = draft.scores[sub.id] ?? emptyScore();
          const isGold = draft.submission_ids.includes(sub.id);
          return (
            <div key={sub.id}>
              {idx > 0 && <Separator className="mb-4" />}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                {/* Team + artifacts */}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {sub.app_name || 'Untitled project'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {sub.team_name}
                    </span>
                    {sub.tier_level >= 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        Self-reported tier {sub.tier_level}
                      </Badge>
                    )}
                    {isGold && (
                      <Badge className="gap-1 bg-amber-500 text-[10px] text-white hover:bg-amber-500">
                        <Medal className="h-3 w-3" />
                        Gold Standard
                      </Badge>
                    )}
                  </div>
                  {sub.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {sub.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {sub.github_url && (
                      <a
                        href={sub.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        GitHub <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {sub.live_app_url && (
                      <a
                        href={sub.live_app_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        Live app <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {sub.proof_urls.map((url, i) => (
                      <a
                        key={`${sub.id}-proof-${i}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        Proof {i + 1} <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                    {!sub.github_url && !sub.live_app_url && sub.proof_urls.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No artifact links submitted
                      </span>
                    )}
                  </div>
                </div>

                {/* Scores + Gold toggle */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-28">
                    <Label
                      htmlFor={`relevance-${sub.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Domain relevance (1–10)
                    </Label>
                    <Input
                      id={`relevance-${sub.id}`}
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={score.relevance ?? ''}
                      onChange={(e) =>
                        setScore(sub.id, { relevance: clampScore(e.target.value) })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="w-28">
                    <Label
                      htmlFor={`clarity-${sub.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Clarity (1–10)
                    </Label>
                    <Input
                      id={`clarity-${sub.id}`}
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={score.clarity ?? ''}
                      onChange={(e) =>
                        setScore(sub.id, { clarity: clampScore(e.target.value) })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      id={`gold-${sub.id}`}
                      checked={isGold}
                      onCheckedChange={(v) => toggleGold(sub.id, v === true)}
                      disabled={!canSelectGold}
                    />
                    <Label
                      htmlFor={`gold-${sub.id}`}
                      className={`text-xs ${canSelectGold ? 'cursor-pointer' : 'text-muted-foreground'}`}
                    >
                      Select as Gold Standard
                    </Label>
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <Textarea
                  placeholder="Evaluation notes (optional)"
                  value={score.notes}
                  onChange={(e) => setScore(sub.id, { notes: e.target.value })}
                  rows={1}
                  className="min-h-[36px] text-xs"
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
