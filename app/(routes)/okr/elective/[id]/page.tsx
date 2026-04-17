'use client';

// ============================================================================
// Elective OKR Detail View - DEPRECATED
//
// DEPRECATION NOTICE (2026-02-01):
// Learner-specific elective OKRs have been replaced by the Competency module.
// - For learners: Show deprecation notice with redirect
// - For managers/admins: Allow view-only access to historical data
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Target,
  Calendar,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Eye
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

// Hooks
import { useElectiveOKR } from '@/hooks/okr';
import { useAuth } from '@/hooks/use-auth';

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
// DEPRECATION NOTICE COMPONENT (for learners)
// ============================================================================

function DeprecationNotice() {
  const router = useRouter();

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/okr/objectives');
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="container mx-auto py-6 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <CardTitle>Feature Moved</CardTitle>
              <CardDescription>
                Personal OKRs are now tracked differently
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Competency Module</AlertTitle>
            <AlertDescription className="text-amber-700">
              As of February 2026, personal goals and skill development are now tracked via the
              <strong> Competency Module</strong>. This provides better tracking of skills,
              competencies, and learning outcomes aligned with industry standards.
            </AlertDescription>
          </Alert>

          <div className="p-4 bg-muted/50 rounded-lg">
            <h3 className="font-medium mb-2">What changed?</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Personal goals are now tracked via Competency profiles</li>
              <li>Skills are mapped to industry requirements</li>
              <li>Your historical data is preserved</li>
            </ul>
          </div>

          <p className="text-sm text-muted-foreground">
            Redirecting to objectives page in 5 seconds...
          </p>

          <div className="flex gap-3">
            <Button asChild>
              <Link href="/okr/objectives">
                Go to Objectives
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/competency-catalog">
                View Competencies
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// HISTORICAL DATA VIEW (for managers/admins)
// ============================================================================

function HistoricalDataView({ id }: { id: string }) {
  const router = useRouter();
  const { data: okr, isLoading, error } = useElectiveOKR(id);

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
              {error?.message || 'The elective OKR you are looking for does not exist.'}
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
      {/* Deprecation Banner */}
      <Alert variant="default" className="border-amber-200 bg-amber-50">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Historical Data - View Only</AlertTitle>
        <AlertDescription className="text-amber-700">
          This elective OKR was created before the Competency module. Data is preserved for reference
          but editing is disabled. New personal goals should be tracked via Competencies.
        </AlertDescription>
      </Alert>

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
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                Elective (Archived)
              </Badge>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            </div>
            <h1 className="text-2xl font-bold mt-1">{okr.title}</h1>
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Progress (Final)
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
                <p className="text-xs text-muted-foreground">Final Value</p>
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
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Why It Mattered</h3>
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ElectiveOKRDetailPage() {
  const params = useParams();
  const { profile, isLoading: authLoading } = useAuth();
  const id = params.id as string;

  // Determine if user is a manager/admin (not a learner)
  const isManagerOrAdmin = profile?.role && ['admin', 'super_admin', 'manager', 'staff', 'faculty'].includes(profile.role);

  // Loading state while checking auth
  if (authLoading) {
    return (
      <div className="container mx-auto py-6">
        <Skeleton className="h-8 w-48" />
        <Card className="mt-6">
          <CardContent className="py-12">
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // For managers/admins: Show historical data view
  if (isManagerOrAdmin) {
    return <HistoricalDataView id={id} />;
  }

  // For learners: Show deprecation notice with redirect
  return <DeprecationNotice />;
}
