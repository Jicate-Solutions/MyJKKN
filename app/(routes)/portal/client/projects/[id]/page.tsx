'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Hammer,
  BookOpen,
  Video,
  Calendar,
  Clock,
  CheckCircle,
  ExternalLink,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { useCurrentClient, useClientSolution } from '@/hooks/solutions';
import { format, formatDistanceToNow } from 'date-fns';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const typeConfig: Record<string, { icon: typeof Hammer; color: string; label: string }> = {
  software: { icon: Hammer, color: 'text-blue-600 bg-blue-50', label: 'Software' },
  training: { icon: BookOpen, color: 'text-green-600 bg-green-50', label: 'Training' },
  content: { icon: Video, color: 'text-purple-600 bg-purple-50', label: 'Content' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-emerald-100 text-emerald-700', label: 'Active' },
  on_hold: { color: 'bg-amber-100 text-amber-700', label: 'On Hold' },
  completed: { color: 'bg-blue-100 text-blue-700', label: 'Completed' },
  cancelled: { color: 'bg-red-100 text-red-700', label: 'Cancelled' },
  in_amc: { color: 'bg-indigo-100 text-indigo-700', label: 'In AMC' },
};

const phaseStatusColors: Record<string, string> = {
  prospecting: 'bg-gray-100 text-gray-700',
  discovery: 'bg-gray-100 text-gray-700',
  prd_writing: 'bg-blue-100 text-blue-700',
  prototype_building: 'bg-blue-100 text-blue-700',
  client_demo: 'bg-amber-100 text-amber-700',
  revisions: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-700',
  deploying: 'bg-indigo-100 text-indigo-700',
  training: 'bg-purple-100 text-purple-700',
  live: 'bg-emerald-100 text-emerald-700',
  in_amc: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function ClientProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const solutionId = params.id as string;

  const { data: client, isLoading: clientLoading, error: clientError } = useCurrentClient();
  const clientId = client?.id || '';

  const { data: solution, isLoading: solutionLoading, error: solutionError } = useClientSolution(solutionId, clientId);

  const isLoading = clientLoading || solutionLoading;
  const error = clientError || solutionError;

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error Loading Project</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Failed to load project data'}
            </p>
            <Button onClick={() => router.push('/portal/client/projects')} variant="outline">
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-4">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Not found state
  if (!solution) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Solution Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The solution you are looking for does not exist or you do not have access to it.
            </p>
            <Button onClick={() => router.push('/portal/client/projects')} variant="outline">
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = typeConfig[solution.solution_type] || typeConfig.software;
  const status = statusConfig[solution.status] || statusConfig.active;
  const Icon = config.icon;

  // Calculate progress
  let progress = 0;
  if (solution.solution_type === 'software' && solution.phases && solution.phases.length > 0) {
    const completedPhases = solution.phases.filter(p => ['approved', 'live', 'completed', 'in_amc'].includes(p.status)).length;
    progress = Math.round((completedPhases / solution.phases.length) * 100);
  } else if (solution.solution_type === 'training' && solution.training_program) {
    // Get sessions from the training_program relation if available
    const sessions = (solution.training_program as any).sessions || [];
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s: any) => s.status === 'completed').length;
    progress = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  } else if (solution.solution_type === 'content' && solution.content_orders && solution.content_orders.length > 0) {
    const allDeliverables = solution.content_orders.flatMap(o => (o as any).deliverables || []);
    const approvedDeliverables = allDeliverables.filter((d: any) => d.status === 'approved').length;
    progress = allDeliverables.length > 0 ? Math.round((approvedDeliverables / allDeliverables.length) * 100) : 0;
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push('/portal/client/projects')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Projects
      </Button>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${config.color.split(' ')[1]}`}>
            <Icon className={`h-8 w-8 ${config.color.split(' ')[0]}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline">{config.label}</Badge>
              <Badge className={status.color} variant="secondary">
                {status.label}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold">{solution.title}</h1>
            <p className="text-sm text-muted-foreground font-mono">{solution.solution_code}</p>
          </div>
        </div>

        {solution.final_price && (
          <Card className="md:min-w-[200px]">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Solution Value</p>
              <p className="text-2xl font-bold">{formatCurrency(solution.final_price)}</p>
              {solution.discount_percentage && solution.discount_percentage > 0 && (
                <p className="text-xs text-emerald-600">
                  {solution.discount_percentage}% discount applied
                  {solution.discount_reason && ` (${solution.discount_reason})`}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-lg font-bold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {solution.started_date
                ? `Started ${format(new Date(solution.started_date), 'MMM d, yyyy')}`
                : solution.created_at
                  ? `Created ${formatDistanceToNow(new Date(solution.created_at), { addSuffix: true })}`
                  : 'No start date'}
            </div>
            {solution.target_completion && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Target: {format(new Date(solution.target_completion), 'MMM d, yyyy')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {(solution.problem_statement || solution.description) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About This Solution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {solution.problem_statement && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Problem Statement</p>
                <p className="text-sm">{solution.problem_statement}</p>
              </div>
            )}
            {solution.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{solution.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Software Phases */}
      {solution.solution_type === 'software' && solution.phases && solution.phases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Development Phases</CardTitle>
            <CardDescription>Track the progress of each development phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {solution.phases.map((phase) => (
                <div
                  key={phase.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-sm font-medium">
                      {phase.phase_number}
                    </div>
                    <div>
                      <p className="font-medium">{phase.title}</p>
                      {phase.description && (
                        <p className="text-sm text-muted-foreground">{phase.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {phase.production_url && (
                      <a
                        href={phase.production_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm flex items-center gap-1"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Live
                      </a>
                    )}
                    <Badge className={phaseStatusColors[phase.status] || 'bg-gray-100 text-gray-700'} variant="secondary">
                      {phase.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Training Program Info */}
      {solution.solution_type === 'training' && solution.training_program && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Training Program</CardTitle>
            <CardDescription>View your training program progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground">Program Type</p>
                <p className="font-medium capitalize">{solution.training_program.program_type?.replace(/_/g, ' ') || 'N/A'}</p>
              </div>
              <div className="p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground">Track</p>
                <p className="font-medium capitalize">{solution.training_program.track?.replace(/_/g, ' ') || 'N/A'}</p>
              </div>
              <div className="p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground">Sessions</p>
                <p className="font-medium">
                  {((solution.training_program as any).sessions || []).filter((s: any) => s.status === 'completed').length} / {((solution.training_program as any).sessions || []).length} completed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Orders */}
      {solution.solution_type === 'content' && solution.content_orders && solution.content_orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Orders</CardTitle>
            <CardDescription>View deliverables for each content order</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {solution.content_orders.map((order: any) => (
                <div key={order.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {order.order_type?.replace(/_/g, ' ')} Order
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.quantity} items | {order.division} division
                      </p>
                    </div>
                    {order.due_date && (
                      <p className="text-sm text-muted-foreground">
                        Due: {format(new Date(order.due_date), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  {order.deliverables && order.deliverables.length > 0 ? (
                    <div className="space-y-2 pl-4 border-l-2">
                      {order.deliverables.map((deliverable: any) => (
                        <div
                          key={deliverable.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{deliverable.title}</span>
                          </div>
                          <Badge
                            className={
                              deliverable.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : deliverable.status === 'review'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-700'
                            }
                            variant="secondary"
                          >
                            {deliverable.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground pl-4">
                      No deliverables yet
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Card */}
      <Card className="bg-muted/50">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-medium">Need assistance?</p>
              <p className="text-sm text-muted-foreground">
                Contact your account manager for any questions about this solution.
              </p>
            </div>
            <Link href="/portal/client/deliverables">
              <Button>
                <FileText className="h-4 w-4 mr-2" />
                View Deliverables
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
