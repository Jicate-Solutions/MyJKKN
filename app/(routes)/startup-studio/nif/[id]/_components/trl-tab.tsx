'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  FlaskConical,
} from 'lucide-react';
import { useTrlAssessments, useCreateTrlAssessment } from '@/hooks/startup-studio';

// TRL level labels per the spec
const TRL_LABELS: Record<number, string> = {
  1: 'Basic principles observed',
  2: 'Technology concept formulated',
  3: 'Experimental proof of concept',
  4: 'Technology validated in lab',
  5: 'Technology validated in relevant environment',
  6: 'Technology demonstrated in relevant environment',
  7: 'System prototype in operational environment',
  8: 'System complete and qualified',
  9: 'Actual system proven in operational environment',
};

// Color tiers for TRL steps
function trlStepClass(step: number, currentTrl: number) {
  if (step > currentTrl) return 'bg-muted text-muted-foreground border border-muted-foreground/20';
  if (step <= 3) return 'bg-red-100 text-red-800 border border-red-200';
  if (step <= 6) return 'bg-amber-100 text-amber-800 border border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
}

// Valley-of-death detection: TRL 4-6 and last assessment older than 6 months
function isValleyOfDeath(assessments: any[]): boolean {
  if (!assessments.length) return false;
  const latest = assessments[0];
  const trl = latest.trl_level;
  if (trl < 4 || trl > 6) return false;
  const assessmentDate = new Date(latest.assessment_date ?? latest.created_at);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return assessmentDate < sixMonthsAgo;
}

interface TrlTabProps {
  candidateId: string;
}

// Usage:
// <TrlTab candidateId="uuid-of-candidate" />

export function TrlTab({ candidateId }: TrlTabProps) {
  const { data: rawData, isLoading } = useTrlAssessments(candidateId);
  const createTrl = useCreateTrlAssessment();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [trlLevel, setTrlLevel] = useState<string>('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(['']);
  const [labValidated, setLabValidated] = useState(false);
  const [relevantEnvValidated, setRelevantEnvValidated] = useState(false);
  const [prototypeDemonstrated, setPrototypeDemonstrated] = useState(false);
  const [systemQualified, setSystemQualified] = useState(false);
  const [operationalProven, setOperationalProven] = useState(false);
  const [blockers, setBlockers] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [estimatedMonths, setEstimatedMonths] = useState('');

  const assessments: any[] = Array.isArray(rawData) ? rawData : (rawData as any)?.data ?? [];
  const latestAssessment = assessments[0] ?? null;
  const currentTrl: number = latestAssessment?.trl_level ?? 0;
  const valleyWarning = isValleyOfDeath(assessments);

  const handleAddUrl = () => setEvidenceUrls((prev) => [...prev, '']);
  const handleUrlChange = (index: number, value: string) => {
    setEvidenceUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  };
  const handleRemoveUrl = (index: number) => {
    setEvidenceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setTrlLevel('');
    setEvidenceDescription('');
    setEvidenceUrls(['']);
    setLabValidated(false);
    setRelevantEnvValidated(false);
    setPrototypeDemonstrated(false);
    setSystemQualified(false);
    setOperationalProven(false);
    setBlockers('');
    setNextSteps('');
    setEstimatedMonths('');
  };

  const handleSubmit = async () => {
    if (!trlLevel || !evidenceDescription) return;
    const filteredUrls = evidenceUrls.filter((u) => u.trim() !== '');
    const blockersArray = blockers
      ? blockers.split(',').map((b) => b.trim()).filter(Boolean)
      : [];

    await createTrl.mutateAsync({
      candidate_id: candidateId,
      trl_level: parseInt(trlLevel, 10),
      evidence_description: evidenceDescription,
      evidence_urls: filteredUrls,
      lab_validated: labValidated,
      relevant_env_validated: relevantEnvValidated,
      prototype_demonstrated: prototypeDemonstrated,
      system_qualified: systemQualified,
      operational_proven: operationalProven,
      blockers: blockersArray,
      next_steps: nextSteps || null,
      estimated_months_to_next: estimatedMonths ? parseInt(estimatedMonths, 10) : null,
    });

    resetForm();
    setDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Valley of Death Warning */}
      {valleyWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Valley of Death Warning:</strong> This startup has been at TRL {currentTrl} for
            over 6 months without advancement. Consider scheduling a review and support intervention.
          </AlertDescription>
        </Alert>
      )}

      {/* TRL decrease warning */}
      {assessments.length >= 2 &&
        assessments[0].trl_level < assessments[1].trl_level && (
          <Alert>
            <TrendingDown className="h-4 w-4 text-amber-500" />
            <AlertDescription>
              TRL decreased from{' '}
              <strong>{assessments[1].trl_level}</strong> to{' '}
              <strong>{assessments[0].trl_level}</strong>. This may indicate a
              pivot or re-evaluation.
            </AlertDescription>
          </Alert>
        )}

      {/* Current TRL Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-indigo-600" />
            Technology Readiness Level
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" />
                Assess TRL
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New TRL Assessment</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-2">
                {/* TRL Level Selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="trl-level">TRL Level *</Label>
                  <Select value={trlLevel} onValueChange={setTrlLevel}>
                    <SelectTrigger id="trl-level">
                      <SelectValue placeholder="Select TRL level (1-9)" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 9 }, (_, i) => i + 1).map((level) => (
                        <SelectItem key={level} value={String(level)}>
                          TRL {level} — {TRL_LABELS[level]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Evidence Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="evidence-desc">Evidence Description *</Label>
                  <Textarea
                    id="evidence-desc"
                    placeholder="Describe the evidence supporting this TRL level..."
                    value={evidenceDescription}
                    onChange={(e) => setEvidenceDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Evidence URLs */}
                <div className="space-y-2">
                  <Label>Evidence URLs</Label>
                  {evidenceUrls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="https://..."
                        value={url}
                        onChange={(e) => handleUrlChange(index, e.target.value)}
                        type="url"
                      />
                      {evidenceUrls.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUrl(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={handleAddUrl}>
                    + Add URL
                  </Button>
                </div>

                {/* Validation Checkboxes */}
                <div className="space-y-2">
                  <Label>Validation Checkpoints</Label>
                  <div className="space-y-2 rounded-lg border p-3">
                    {[
                      { id: 'lab', label: 'Lab validated', value: labValidated, setter: setLabValidated },
                      { id: 'env', label: 'Relevant environment validated', value: relevantEnvValidated, setter: setRelevantEnvValidated },
                      { id: 'proto', label: 'Prototype demonstrated', value: prototypeDemonstrated, setter: setPrototypeDemonstrated },
                      { id: 'sys', label: 'System complete and qualified', value: systemQualified, setter: setSystemQualified },
                      { id: 'ops', label: 'Operational environment proven', value: operationalProven, setter: setOperationalProven },
                    ].map(({ id, label, value, setter }) => (
                      <label key={id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => setter(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Blockers */}
                <div className="space-y-1.5">
                  <Label htmlFor="blockers">Blockers (comma-separated)</Label>
                  <Input
                    id="blockers"
                    placeholder="e.g. Funding needed, Partner required"
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                  />
                </div>

                {/* Next Steps */}
                <div className="space-y-1.5">
                  <Label htmlFor="next-steps">Next Steps</Label>
                  <Textarea
                    id="next-steps"
                    placeholder="What needs to happen to advance to the next TRL..."
                    value={nextSteps}
                    onChange={(e) => setNextSteps(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Estimated Months */}
                <div className="space-y-1.5">
                  <Label htmlFor="est-months">Estimated Months to Next TRL</Label>
                  <Input
                    id="est-months"
                    type="number"
                    min={1}
                    max={60}
                    placeholder="e.g. 6"
                    value={estimatedMonths}
                    onChange={(e) => setEstimatedMonths(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={createTrl.isPending || !trlLevel || !evidenceDescription}
                  >
                    {createTrl.isPending ? 'Saving...' : 'Save Assessment'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {currentTrl === 0 ? (
            <div className="text-center py-8 space-y-3">
              <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No TRL assessment recorded yet.</p>
              <p className="text-sm text-muted-foreground">
                Click &quot;Assess TRL&quot; above to record the first assessment.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current TRL display */}
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-indigo-600">{currentTrl}</span>
                <div>
                  <p className="font-semibold">{TRL_LABELS[currentTrl]}</p>
                  <p className="text-sm text-muted-foreground">Current TRL Level</p>
                </div>
              </div>

              {/* 9-step progress bar */}
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: 9 }, (_, i) => i + 1).map((step) => (
                  <div
                    key={step}
                    className={`flex-1 min-w-[2rem] h-8 rounded text-xs font-bold flex items-center justify-center transition-all ${trlStepClass(step, currentTrl)}`}
                    title={`TRL ${step}: ${TRL_LABELS[step]}`}
                  >
                    {step}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-200 inline-block" />
                  TRL 1-3: Basic
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-200 inline-block" />
                  TRL 4-6: Validation (Valley of Death)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-emerald-200 inline-block" />
                  TRL 7-9: Operational
                </span>
              </div>

              {/* Blockers from latest assessment */}
              {latestAssessment?.blockers?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1.5">Current Blockers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {latestAssessment.blockers.map((b: string, i: number) => (
                      <Badge key={i} variant="destructive" className="text-xs">
                        {b}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Next steps */}
              {latestAssessment?.next_steps && (
                <div>
                  <p className="text-sm font-medium mb-1">Next Steps</p>
                  <p className="text-sm text-muted-foreground">
                    {latestAssessment.next_steps}
                  </p>
                </div>
              )}

              {/* Estimated months */}
              {latestAssessment?.estimated_months_to_next && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  Estimated {latestAssessment.estimated_months_to_next} months to next TRL
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessment History Timeline */}
      {assessments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assessment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />
              <div className="space-y-4">
                {assessments.map((a: any, index: number) => {
                  const isPrevHigher =
                    index < assessments.length - 1 &&
                    a.trl_level < assessments[index + 1].trl_level;
                  return (
                    <div
                      key={a.id ?? index}
                      className="relative flex items-start gap-4 pl-10"
                    >
                      <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full bg-indigo-500 border-2 border-background" />
                      <div className="flex-1 p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 border">
                              TRL {a.trl_level}
                            </Badge>
                            {isPrevHigher && (
                              <span className="flex items-center gap-1 text-xs text-amber-600">
                                <TrendingDown className="h-3 w-3" />
                                Decreased
                              </span>
                            )}
                            {!isPrevHigher && index < assessments.length - 1 && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <TrendingUp className="h-3 w-3" />
                                +{a.trl_level - assessments[index + 1].trl_level}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {a.assessment_date
                              ? new Date(a.assessment_date).toLocaleDateString()
                              : new Date(a.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm">{a.evidence_description}</p>
                        {/* Validation flags */}
                        <div className="flex flex-wrap gap-2">
                          {a.lab_validated && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle className="h-3 w-3" /> Lab validated
                            </span>
                          )}
                          {a.relevant_env_validated && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle className="h-3 w-3" /> Env validated
                            </span>
                          )}
                          {a.prototype_demonstrated && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle className="h-3 w-3" /> Prototype shown
                            </span>
                          )}
                          {a.system_qualified && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle className="h-3 w-3" /> System qualified
                            </span>
                          )}
                          {a.operational_proven && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle className="h-3 w-3" /> Operational
                            </span>
                          )}
                        </div>
                        {a.evidence_urls?.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {a.evidence_urls.map((url: string, ui: number) => (
                              <a
                                key={ui}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                Evidence {ui + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
