'use client';

// ============================================================================
// Elective OKR Detail View
// Simple detail view for learner's self-set elective OKRs
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Target,
  Calendar,
  Edit2,
  Trash2,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

// Hooks
import { useElectiveOKR, useDeleteElectiveOKR } from '@/hooks/okr';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

// ============================================================================
// STATUS CONFIG
// ============================================================================

const statusConfig: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'bg-gray-100 text-gray-800' },
  on_track: { label: 'On Track', color: 'bg-green-100 text-green-800' },
  at_risk: { label: 'At Risk', color: 'bg-yellow-100 text-yellow-800' },
  behind: { label: 'Behind', color: 'bg-red-100 text-red-800' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-800' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800' }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getProgressColor(progress: number): string {
  if (progress >= 70) return 'bg-green-500';
  if (progress >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ElectiveOKRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: okr, isLoading, error } = useElectiveOKR(id);
  const deleteMutation = useDeleteElectiveOKR();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('OKR deleted successfully');
      router.push('/okr/objectives');
    } catch (err) {
      toast.error('Failed to delete OKR');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !okr) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">OKR Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The elective OKR you are looking for does not exist or you do not have permission to view it.'}
            </p>
            <Button onClick={() => router.push('/okr/objectives')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Objectives
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = statusConfig[okr.status] || statusConfig.not_started;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/okr/objectives')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                Elective
              </Badge>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            </div>
            <h1 className="text-2xl font-bold mt-1">{okr.title}</h1>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/okr/elective/${id}/edit`)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Elective OKR</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this OKR? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{okr.progress}%</span>
            </div>
            <Progress
              value={okr.progress}
              className={`h-3 ${getProgressColor(okr.progress)}`}
            />

            <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{okr.baseline_value || 0}</p>
                <p className="text-xs text-muted-foreground">Baseline</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-2xl font-bold text-primary">{okr.current_value}</p>
                <p className="text-xs text-muted-foreground">Current</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{okr.target_value || 100}</p>
                <p className="text-xs text-muted-foreground">Target</p>
              </div>
            </div>

            {okr.unit && (
              <p className="text-sm text-muted-foreground text-center">
                Unit: {okr.unit}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {okr.description && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
              <p className="text-sm">{okr.description}</p>
            </div>
          )}

          {okr.why_matters && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Why It Matters</h3>
                <p className="text-sm">{okr.why_matters}</p>
              </div>
            </>
          )}

          <Separator />

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Deadline:</span>
            <span className="font-medium">
              {format(new Date(okr.deadline), 'PPP')}
            </span>
            {new Date(okr.deadline) < new Date() && okr.status !== 'completed' && (
              <Badge variant="destructive" className="ml-2">Overdue</Badge>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Created: {format(new Date(okr.created_at), 'PPP')}
            {okr.updated_at !== okr.created_at && (
              <span className="ml-4">Last updated: {format(new Date(okr.updated_at), 'PPP')}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
