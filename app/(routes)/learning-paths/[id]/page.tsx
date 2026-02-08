'use client';

// ============================================================================
// Learning Path - Detail View
// Shows path details with step timeline, progress, and management
// ============================================================================

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Archive,
  Trash2,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  SkipForward,
  PlayCircle,
  AlertCircle,
  Route,
  Target,
  Calendar,
  Briefcase,
  Tag,
  Loader2,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useLearningPath,
  useDeleteLearningPath,
  useArchiveLearningPath,
  useCreateLearningPathStep,
  useUpdateLearningPathStep,
  useDeleteLearningPathStep,
} from '@/hooks/learning-path';
import { toast } from 'sonner';

import type {
  LearningPathStep,
  LearningPathStepType,
  LearningPathStepStatus,
} from '@/types/learning-path';
import {
  PATH_STATUS_LABELS,
  PATH_STATUS_COLORS,
  STEP_TYPE_LABELS,
  STEP_TYPE_COLORS,
  STEP_STATUS_LABELS,
  STEP_STATUS_COLORS,
} from '@/types/learning-path';

// Step status icons
const STEP_STATUS_ICONS: Record<LearningPathStepStatus, React.ElementType> = {
  pending: Circle,
  in_progress: PlayCircle,
  completed: CheckCircle2,
  skipped: SkipForward,
};

export default function LearningPathDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: path, isLoading, error } = useLearningPath(id);
  const deleteMutation = useDeleteLearningPath();
  const archiveMutation = useArchiveLearningPath();
  const createStepMutation = useCreateLearningPathStep();
  const updateStepMutation = useUpdateLearningPathStep(id);
  const deleteStepMutation = useDeleteLearningPathStep(id);

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepDescription, setNewStepDescription] = useState('');
  const [newStepType, setNewStepType] = useState<LearningPathStepType>('course');
  const [newStepHours, setNewStepHours] = useState('');

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Learning path deleted');
      router.push('/learning-paths');
    } catch {
      toast.error('Failed to delete learning path');
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success('Learning path archived');
    } catch {
      toast.error('Failed to archive learning path');
    }
  };

  const handleAddStep = async () => {
    if (!newStepTitle.trim()) return;
    try {
      const nextStepNumber = (path?.steps?.length || 0) + 1;
      await createStepMutation.mutateAsync({
        path_id: id,
        step_number: nextStepNumber,
        title: newStepTitle.trim(),
        description: newStepDescription.trim() || undefined,
        step_type: newStepType,
        estimated_hours: newStepHours ? parseInt(newStepHours, 10) : undefined,
      });
      setNewStepTitle('');
      setNewStepDescription('');
      setNewStepType('course');
      setNewStepHours('');
      setAddStepOpen(false);
    } catch {
      toast.error('Failed to add step');
    }
  };

  const handleUpdateStepStatus = async (
    stepId: string,
    newStatus: LearningPathStepStatus
  ) => {
    try {
      await updateStepMutation.mutateAsync({
        id: stepId,
        data: { status: newStatus },
      });
    } catch {
      toast.error('Failed to update step status');
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      await deleteStepMutation.mutateAsync(stepId);
    } catch {
      toast.error('Failed to delete step');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Learning Path">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error || !path) {
    return (
      <ContentLayout title="Learning Path">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Learning Path Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The learning path you are looking for does not exist.'}
            </p>
            <Button onClick={() => router.push('/learning-paths')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Learning Paths
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const steps = path.steps || [];

  // Memoize step statistics to avoid recalculating on every render
  const stepStats = useMemo(() => {
    const pending = steps.filter((s) => s.status === 'pending').length;
    const inProgress = steps.filter((s) => s.status === 'in_progress').length;
    const completed = steps.filter((s) => s.status === 'completed').length;
    const skipped = steps.filter((s) => s.status === 'skipped').length;
    const totalHours = steps.reduce((sum, s) => sum + (s.estimated_hours || 0), 0);

    return {
      pending,
      inProgress,
      completed,
      skipped,
      totalHours,
      total: steps.length,
    };
  }, [steps]);

  const completedSteps = stepStats.completed;
  const totalSteps = stepStats.total;

  return (
    <ContentLayout title={path.title}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/learning-paths">Learning Paths</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{path.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/learning-paths">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className={PATH_STATUS_COLORS[path.status]}>
                  {PATH_STATUS_LABELS[path.status]}
                </Badge>
                {path.is_ai_generated && (
                  <Badge variant="outline" className="text-xs">
                    AI Generated
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold">{path.title}</h1>
              {path.description && (
                <p className="text-muted-foreground mt-1 max-w-2xl">{path.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/learning-paths/${id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            {path.status !== 'archived' && (
              <Button variant="outline" onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Learning Path</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this learning path and all its steps. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Progress Summary */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm font-medium">
                {completedSteps}/{totalSteps} steps ({Math.round(path.current_progress ?? 0)}%)
              </span>
            </div>
            <Progress value={path.current_progress || 0} className="h-3" />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Steps Timeline (Main Content) */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Route className="h-5 w-5" />
                    Learning Steps
                  </CardTitle>
                  <CardDescription>
                    {totalSteps} steps in this learning path
                  </CardDescription>
                </div>
                <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Step
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Step</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div className="space-y-2">
                        <Label>Title *</Label>
                        <Input
                          value={newStepTitle}
                          onChange={(e) => setNewStepTitle(e.target.value)}
                          placeholder="e.g., Complete Python Fundamentals"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={newStepDescription}
                          onChange={(e) => setNewStepDescription(e.target.value)}
                          placeholder="What should be accomplished in this step..."
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Step Type</Label>
                          <Select
                            value={newStepType}
                            onValueChange={(val) =>
                              setNewStepType(val as LearningPathStepType)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STEP_TYPE_LABELS).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Est. Hours</Label>
                          <Input
                            type="number"
                            min="1"
                            value={newStepHours}
                            onChange={(e) => setNewStepHours(e.target.value)}
                            placeholder="e.g., 40"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setAddStepOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddStep}
                          disabled={!newStepTitle.trim() || createStepMutation.isPending}
                        >
                          {createStepMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Add Step
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {steps.length === 0 ? (
                  <div className="text-center py-8">
                    <Route className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground mb-3">No steps yet</p>
                    <Button size="sm" onClick={() => setAddStepOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add First Step
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

                    <div className="space-y-0">
                      {steps.map((step, index) => {
                        const StatusIcon = STEP_STATUS_ICONS[step.status];
                        const isLast = index === steps.length - 1;

                        return (
                          <div key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
                            {/* Timeline dot */}
                            <div className="relative z-10 flex-shrink-0">
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                                  step.status === 'completed'
                                    ? 'bg-emerald-100 border-emerald-500 text-emerald-600'
                                    : step.status === 'in_progress'
                                    ? 'bg-blue-100 border-blue-500 text-blue-600'
                                    : step.status === 'skipped'
                                    ? 'bg-amber-100 border-amber-500 text-amber-600'
                                    : 'bg-white border-muted-foreground/30 text-muted-foreground'
                                }`}
                              >
                                <StatusIcon className="h-5 w-5" />
                              </div>
                            </div>

                            {/* Step Content */}
                            <div className="flex-1 pb-2">
                              <div className="border rounded-lg p-4 bg-card hover:border-primary/30 transition-colors">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <span className="text-xs text-muted-foreground font-mono">
                                        Step {step.step_number}
                                      </span>
                                      <Badge
                                        className={`text-xs ${STEP_TYPE_COLORS[step.step_type]}`}
                                      >
                                        {STEP_TYPE_LABELS[step.step_type]}
                                      </Badge>
                                      <Badge
                                        className={`text-xs ${STEP_STATUS_COLORS[step.status]}`}
                                      >
                                        {STEP_STATUS_LABELS[step.status]}
                                      </Badge>
                                      {!step.is_required && (
                                        <Badge variant="outline" className="text-xs">
                                          Optional
                                        </Badge>
                                      )}
                                    </div>
                                    <h4 className="font-medium">{step.title}</h4>
                                    {step.description && (
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {step.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                                      {step.estimated_hours && (
                                        <span className="flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {step.estimated_hours}h estimated
                                        </span>
                                      )}
                                      {step.score !== null && step.score !== undefined && (
                                        <span>Score: {step.score}</span>
                                      )}
                                      {step.completed_at && (
                                        <span>
                                          Completed{' '}
                                          {format(new Date(step.completed_at), 'MMM d, yyyy')}
                                        </span>
                                      )}
                                    </div>
                                    {step.target_competencies &&
                                      step.target_competencies.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {step.target_competencies.map((comp) => (
                                            <Badge
                                              key={comp}
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {comp}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                  </div>

                                  {/* Step Actions */}
                                  <div className="flex flex-col gap-1">
                                    {step.status === 'pending' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        onClick={() =>
                                          handleUpdateStepStatus(step.id, 'in_progress')
                                        }
                                      >
                                        Start
                                      </Button>
                                    )}
                                    {step.status === 'in_progress' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        onClick={() =>
                                          handleUpdateStepStatus(step.id, 'completed')
                                        }
                                      >
                                        Complete
                                      </Button>
                                    )}
                                    {(step.status === 'pending' ||
                                      step.status === 'in_progress') && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-xs text-muted-foreground"
                                        onClick={() =>
                                          handleUpdateStepStatus(step.id, 'skipped')
                                        }
                                      >
                                        Skip
                                      </Button>
                                    )}
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-xs text-destructive"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Step</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete &quot;{step.title}
                                            &quot;? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteStep(step.id)}
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Path Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Path Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {path.target_role && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                      <Briefcase className="h-3 w-3" />
                      Target Role
                    </p>
                    <p className="text-sm font-medium">{path.target_role}</p>
                  </div>
                )}

                {path.target_industry && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                      <Target className="h-3 w-3" />
                      Target Industry
                    </p>
                    <p className="text-sm font-medium">{path.target_industry}</p>
                  </div>
                )}

                {path.estimated_duration_weeks && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                      <Clock className="h-3 w-3" />
                      Estimated Duration
                    </p>
                    <p className="text-sm font-medium">{path.estimated_duration_weeks} weeks</p>
                  </div>
                )}

                <Separator />

                {path.target_competencies && path.target_competencies.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                      <Tag className="h-3 w-3" />
                      Target Competencies
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {path.target_competencies.map((comp) => (
                        <Badge key={comp} variant="secondary" className="text-xs">
                          {comp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="text-sm space-y-2">
                  {path.start_date && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Start: {format(new Date(path.start_date), 'PPP')}
                    </div>
                  )}
                  {path.target_completion_date && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Target: {format(new Date(path.target_completion_date), 'PPP')}
                    </div>
                  )}
                  {path.completed_at && (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Completed: {format(new Date(path.completed_at), 'PPP')}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Created: {format(new Date(path.created_at), 'PPP')}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Circle className="h-4 w-4 text-muted-foreground" />
                    Pending
                  </span>
                  <span className="font-medium">
                    {steps.filter((s) => s.status === 'pending').length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <PlayCircle className="h-4 w-4 text-blue-500" />
                    In Progress
                  </span>
                  <span className="font-medium">
                    {steps.filter((s) => s.status === 'in_progress').length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Completed
                  </span>
                  <span className="font-medium">
                    {steps.filter((s) => s.status === 'completed').length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <SkipForward className="h-4 w-4 text-amber-500" />
                    Skipped
                  </span>
                  <span className="font-medium">
                    {steps.filter((s) => s.status === 'skipped').length}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Total Hours</span>
                  <span>
                    {steps.reduce((sum, s) => sum + (s.estimated_hours || 0), 0)}h
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
