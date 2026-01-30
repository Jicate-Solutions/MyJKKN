'use client';

import { useState, useEffect, use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../../../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Target,
  Save,
  Loader2,
  AlertCircle,
  Building2,
  Users,
  User,
  Plus,
  Trash2,
  Sparkles
} from 'lucide-react';
import { useObjective, useUpdateObjective } from '@/hooks/okr/use-objectives';
import { useCreateKeyResult } from '@/hooks/okr/use-key-results';
import { OKRKeyResultService } from '@/lib/services/okr';
import type {
  OKRTier,
  OKRLevel,
  OKRStatus,
  UpdateOKRObjectiveDTO,
  CreateOKRKeyResultDTO,
  UpdateOKRKeyResultDTO
} from '@/types/okr';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface KeyResultForm {
  id: string;
  isNew: boolean;
  title: string;
  description: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  unit: string;
  deadline: string;
}

// ============================================================================
// TIER CONFIGURATIONS
// ============================================================================

const TIER_CONFIG: Record<OKRTier, { label: string; color: string }> = {
  tier_1: { label: 'TIER 1 (Full)', color: '#0b6d41' },
  tier_2: { label: 'TIER 2 (Core)', color: '#2563eb' },
  tier_3: { label: 'TIER 3 (Simple)', color: '#7c3aed' }
};

const LEVEL_CONFIG: Record<string, { label: string; icon: typeof Building2 }> = {
  institution: { label: 'Institution', icon: Building2 },
  organization: { label: 'Organization', icon: Building2 },
  department: { label: 'Department', icon: Users },
  individual: { label: 'Individual', icon: User }
};

const STATUS_OPTIONS: { value: OKRStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `new_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EditObjectivePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const objectiveId = resolvedParams.id;
  const router = useRouter();

  // Fetch existing objective data
  const { data: objective, isLoading, error } = useObjective(objectiveId);
  const updateObjective = useUpdateObjective(objectiveId);
  const createKeyResult = useCreateKeyResult();

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  const [status, setStatus] = useState<OKRStatus>('draft');
  const [aiIntegrationNotes, setAiIntegrationNotes] = useState('');
  const [keyResults, setKeyResults] = useState<KeyResultForm[]>([]);
  const [deletedKeyResultIds, setDeletedKeyResultIds] = useState<string[]>([]);

  // Initialize form when objective loads
  useEffect(() => {
    if (objective) {
      setTitle(objective.title || '');
      setDescription(objective.description || '');
      setRationale(objective.rationale || '');
      setStatus(objective.status || 'draft');
      setAiIntegrationNotes(objective.ai_integration_notes || '');

      // Initialize key results
      if (objective.key_results && objective.key_results.length > 0) {
        setKeyResults(
          objective.key_results.map((kr) => ({
            id: kr.id,
            isNew: false,
            title: kr.title || '',
            description: kr.description || '',
            startValue: kr.start_value || 0,
            currentValue: kr.current_value || 0,
            targetValue: kr.target_value || 100,
            unit: kr.unit || '%',
            deadline: kr.deadline ? format(new Date(kr.deadline), 'yyyy-MM-dd') : ''
          }))
        );
      }
    }
  }, [objective]);

  // ============================================================================
  // KEY RESULTS HANDLERS
  // ============================================================================

  const addKeyResult = () => {
    setKeyResults([
      ...keyResults,
      {
        id: generateId(),
        isNew: true,
        title: '',
        description: '',
        startValue: 0,
        currentValue: 0,
        targetValue: 100,
        unit: '%',
        deadline: objective?.end_date ? format(new Date(objective.end_date), 'yyyy-MM-dd') : ''
      }
    ]);
  };

  const updateKeyResultField = (id: string, field: keyof KeyResultForm, value: unknown) => {
    setKeyResults(
      keyResults.map((kr) => (kr.id === id ? { ...kr, [field]: value } : kr))
    );
  };

  const removeKeyResult = (id: string) => {
    const kr = keyResults.find((k) => k.id === id);
    if (kr && !kr.isNew) {
      // Mark existing KR for deletion
      setDeletedKeyResultIds([...deletedKeyResultIds, id]);
    }
    setKeyResults(keyResults.filter((k) => k.id !== id));
  };

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const isFormValid = title.trim().length >= 5;

  // ============================================================================
  // SUBMIT HANDLER
  // ============================================================================

  const handleSubmit = async () => {
    if (!isFormValid) {
      toast.error('Title must be at least 5 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      // Update objective
      const objectiveData: UpdateOKRObjectiveDTO = {
        title: title.trim(),
        description: description.trim() || undefined,
        rationale: rationale.trim() || undefined,
        status,
        ai_integration_notes: objective?.tier === 'tier_1' ? aiIntegrationNotes.trim() || undefined : undefined
      };

      await updateObjective.mutateAsync(objectiveData);

      // Handle key results
      for (const kr of keyResults) {
        if (kr.isNew && kr.title.trim()) {
          // Create new key result
          const krData: CreateOKRKeyResultDTO = {
            objective_id: objectiveId,
            title: kr.title.trim(),
            description: kr.description.trim() || undefined,
            start_value: kr.startValue,
            target_value: kr.targetValue,
            unit: kr.unit || '%',
            deadline: kr.deadline,
            data_source: 'manual'
          };
          await createKeyResult.mutateAsync(krData);
        } else if (!kr.isNew && kr.title.trim()) {
          // Update existing key result using service directly
          // Note: UpdateOKRKeyResultDTO only allows title, description, current_value, target_value, deadline
          const krData: UpdateOKRKeyResultDTO = {
            title: kr.title.trim(),
            description: kr.description.trim() || undefined,
            current_value: kr.currentValue,
            target_value: kr.targetValue,
            deadline: kr.deadline || undefined
          };
          await OKRKeyResultService.updateKeyResult(kr.id, krData);
        }
      }

      // Delete removed key results using service directly
      for (const krId of deletedKeyResultIds) {
        await OKRKeyResultService.deleteKeyResult(krId);
      }

      toast.success('Objective updated successfully!');
      router.push(`/okr/objectives/${objectiveId}`);
    } catch (error) {
      console.error('Error updating objective:', error);
      toast.error('Failed to update objective');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (isLoading) {
    return (
      <ContentLayout title="Edit Objective">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-40" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================

  if (error || !objective) {
    return (
      <ContentLayout title="Edit Objective">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/okr/objectives">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Objectives
            </Link>
          </Button>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error?.message || 'Failed to load objective. It may not exist or you may not have permission to edit it.'}
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const tierConfig = TIER_CONFIG[objective.tier as OKRTier];
  const levelConfig = LEVEL_CONFIG[objective.level as OKRLevel];
  const LevelIcon = levelConfig?.icon || Building2;
  const showAiIntegration = objective.tier === 'tier_1';

  return (
    <ContentLayout title="Edit Objective">
      <OKRErrorBoundary>
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Link */}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/okr/objectives/${objectiveId}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Objective
            </Link>
          </Button>

          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: tierConfig?.color || '#0b6d41' }}>
                  <Target className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle>Edit Objective</CardTitle>
                  <CardDescription>
                    Update your objective details and key results
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    style={{ borderColor: tierConfig?.color, color: tierConfig?.color }}
                  >
                    {tierConfig?.label}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <LevelIcon className="h-3 w-3" />
                    {levelConfig?.label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Main Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Objective Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as OKRStatus)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Objective Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Achieve 500 daily OPD visits at Dental Hospital"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg"
                />
                {title.length > 0 && title.length < 5 && (
                  <p className="text-xs text-destructive">Title must be at least 5 characters</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what success looks like..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Rationale */}
              <div className="space-y-2">
                <Label htmlFor="rationale">Strategic Rationale (WHY)</Label>
                <Textarea
                  id="rationale"
                  placeholder="Why is this objective important? How does it align with institutional goals?"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  rows={3}
                />
              </div>

              {/* AI Integration Notes (TIER 1 only) */}
              {showAiIntegration && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="aiIntegration" className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      AI Integration Notes (Optional)
                    </Label>
                    <Textarea
                      id="aiIntegration"
                      placeholder="How will AI tools assist in achieving this objective?"
                      value={aiIntegrationNotes}
                      onChange={(e) => setAiIntegrationNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Key Results */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Key Results</CardTitle>
                  <CardDescription>
                    Measurable outcomes for this objective
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addKeyResult}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Key Result
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {keyResults.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No key results yet</p>
                  <p className="text-sm">Add key results to measure progress</p>
                </div>
              ) : (
                keyResults.map((kr, index) => (
                  <div
                    key={kr.id}
                    className="p-4 border rounded-lg space-y-4 bg-muted/30"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant={kr.isNew ? 'default' : 'outline'}>
                        KR {index + 1} {kr.isNew && '(New)'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeKeyResult(kr.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Key Result Title *</Label>
                      <Input
                        placeholder="e.g., Increase daily OPD from 250 to 500"
                        value={kr.title}
                        onChange={(e) => updateKeyResultField(kr.id, 'title', e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label>Start</Label>
                        <Input
                          type="number"
                          value={kr.startValue}
                          onChange={(e) =>
                            updateKeyResultField(kr.id, 'startValue', parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Current</Label>
                        <Input
                          type="number"
                          value={kr.currentValue}
                          onChange={(e) =>
                            updateKeyResultField(kr.id, 'currentValue', parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Target *</Label>
                        <Input
                          type="number"
                          value={kr.targetValue}
                          onChange={(e) =>
                            updateKeyResultField(kr.id, 'targetValue', parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit</Label>
                        <Input
                          placeholder="%"
                          value={kr.unit}
                          onChange={(e) => updateKeyResultField(kr.id, 'unit', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Deadline</Label>
                        <Input
                          type="date"
                          value={kr.deadline}
                          onChange={(e) => updateKeyResultField(kr.id, 'deadline', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Progress indicator */}
                    {!kr.isNew && kr.targetValue > 0 && (
                      <div className="pt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>
                            {Math.round(((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(0, ((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100))}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button variant="outline" asChild>
              <Link href={`/okr/objectives/${objectiveId}`}>
                Cancel
              </Link>
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              style={{ backgroundColor: isFormValid ? '#0b6d41' : undefined }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
