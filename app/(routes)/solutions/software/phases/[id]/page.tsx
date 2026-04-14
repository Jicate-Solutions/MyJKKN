'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  GitBranch,
  Users,
  Calendar,
  DollarSign,
  Plus,
  ExternalLink,
  Bug,
  Rocket,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { usePhase } from '@/hooks/solutions/use-phases';

interface PhaseDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusConfig: Record<string, { label: string; color: string }> = {
  prospecting: { label: 'Prospecting', color: 'bg-gray-100 text-gray-800' },
  discovery: { label: 'Discovery', color: 'bg-blue-100 text-blue-800' },
  prd_writing: { label: 'PRD Writing', color: 'bg-indigo-100 text-indigo-800' },
  prototype_building: { label: 'Building', color: 'bg-yellow-100 text-yellow-800' },
  client_demo: { label: 'Demo', color: 'bg-orange-100 text-orange-800' },
  revisions: { label: 'Revisions', color: 'bg-pink-100 text-pink-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  deploying: { label: 'Deploying', color: 'bg-purple-100 text-purple-800' },
  training: { label: 'Training', color: 'bg-teal-100 text-teal-800' },
  live: { label: 'Live', color: 'bg-emerald-100 text-emerald-800' },
  in_amc: { label: 'In AMC', color: 'bg-cyan-100 text-cyan-800' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-800' },
  on_hold: { label: 'On Hold', color: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

const bugSeverityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

const bugStatusIcons: Record<string, React.ReactNode> = {
  open: <AlertCircle className="h-3 w-3 text-red-500" />,
  in_progress: <Clock className="h-3 w-3 text-yellow-500" />,
  resolved: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  closed: <XCircle className="h-3 w-3 text-gray-400" />,
};

const deploymentStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
  rolling_back: 'bg-yellow-100 text-yellow-800',
};

export default function PhaseDetailPage({ params }: PhaseDetailPageProps) {
  const { id } = use(params);
  const { data: phase, isLoading, error } = usePhase(id);

  if (isLoading) {
    return (
      <ContentLayout title="Phase Details">
        <div className="space-y-6 mt-4">
          <Skeleton className="h-12 w-96" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-48" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !phase) {
    return (
      <ContentLayout title="Phase Details">
        <div className="space-y-6 mt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error ? `Failed to load phase: ${error.message}` : 'Phase not found.'}
            </AlertDescription>
          </Alert>
          <Button variant="outline" asChild>
            <Link href="/solutions/software/phases">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Phases
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const status = statusConfig[phase.status] || { label: phase.status, color: 'bg-gray-100' };
  const assignments = phase.assignments || [];
  const iterations = phase.iterations || [];
  const deployments = phase.deployments || [];

  return (
    <ContentLayout title="Phase Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Phases', href: '/solutions/software/phases' },
          { label: `Phase ${phase.phase_number}: ${phase.title}` },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/solutions/software/phases">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="h-5 w-5 text-blue-600" />
                <Badge className={status.color}>{status.label}</Badge>
              </div>
              <h1 className="text-2xl font-bold">
                Phase {phase.phase_number}: {phase.title}
              </h1>
              {phase.solution && (
                <Link
                  href={`/solutions/${phase.solution.id}`}
                  className="text-muted-foreground hover:underline"
                >
                  {phase.solution.solution_code} - {phase.solution.title}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Phase Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {phase.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{phase.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Estimated Value
                  </p>
                  <p className="text-lg font-semibold">{formatCurrency(phase.estimated_value)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                  <Badge className={status.color}>{status.label}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Start Date
                  </p>
                  <p>{phase.start_date ? format(new Date(phase.start_date), 'PPP') : '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Due Date
                  </p>
                  <p>{phase.due_date ? format(new Date(phase.due_date), 'PPP') : '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Builders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Assigned Builders
                </CardTitle>
                <CardDescription>{assignments.length} builder{assignments.length !== 1 ? 's' : ''} assigned</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">No builders assigned yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {assignment.builder?.name
                              ?.split(' ')
                              .map((n: string) => n[0])
                              .join('') || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{assignment.builder?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground capitalize">{assignment.role}</p>
                        </div>
                      </div>
                      <Badge variant={assignment.status === 'active' ? 'default' : 'secondary'}>
                        {assignment.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Prototype Iterations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Prototype Iterations
              </CardTitle>
              <CardDescription>Version history and client feedback</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {iterations.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <GitBranch className="mx-auto h-8 w-8 mb-2" />
                <p className="text-sm">No iterations yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {iterations.map((iteration) => (
                  <div
                    key={iteration.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">Version {iteration.version}</p>
                        {iteration.demo_date && (
                          <span className="text-xs text-muted-foreground">
                            Demo: {format(new Date(iteration.demo_date), 'dd MMM yyyy')}
                          </span>
                        )}
                      </div>
                      {iteration.prototype_url && (
                        <a
                          href={iteration.prototype_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          {iteration.prototype_url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {iteration.changes_made && (
                        <p className="text-xs text-muted-foreground mt-1">{iteration.changes_made}</p>
                      )}
                      {iteration.feedback && (
                        <p className="text-xs mt-1 bg-muted p-2 rounded">
                          <span className="font-medium">Feedback:</span> {iteration.feedback}
                        </p>
                      )}
                    </div>
                    <Badge variant={iteration.client_approved ? 'default' : 'secondary'}>
                      {iteration.client_approved ? 'Approved' : 'Pending Review'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bug Reports - show bugs across all iterations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5" />
                Bug Reports
              </CardTitle>
              <CardDescription>Issues reported across all iterations</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              // Collect bugs from iterations (if loaded inline) - for now show summary
              const iterationCount = iterations.length;
              if (iterationCount === 0) {
                return (
                  <div className="text-center py-6 text-muted-foreground">
                    <Bug className="mx-auto h-8 w-8 mb-2" />
                    <p className="text-sm">No iterations to report bugs against</p>
                  </div>
                );
              }
              return (
                <div className="text-center py-6 text-muted-foreground">
                  <Bug className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">
                    Bug reports are tracked per iteration. Click an iteration to view its bugs.
                  </p>
                  <p className="text-xs mt-1">
                    {iterationCount} iteration{iterationCount !== 1 ? 's' : ''} available
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Deployments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Deployments
              </CardTitle>
              <CardDescription>Staging and production deployment history</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {deployments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Rocket className="mx-auto h-8 w-8 mb-2" />
                <p className="text-sm">No deployments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deployments.map((deployment) => (
                  <div
                    key={deployment.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {deployment.environment}
                        </Badge>
                        {deployment.version && (
                          <span className="text-sm font-medium">v{deployment.version}</span>
                        )}
                        <Badge className={deploymentStatusColors[deployment.status] || 'bg-gray-100'}>
                          {deployment.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        {deployment.deployed_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(deployment.deployed_date), 'dd MMM yyyy')}
                          </span>
                        )}
                        {deployment.deployed_by && (
                          <span>by {deployment.deployed_by}</span>
                        )}
                      </div>
                      {(deployment.custom_domain || deployment.vercel_url) && (
                        <a
                          href={deployment.custom_domain || deployment.vercel_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          {deployment.custom_domain || deployment.vercel_url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
