'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
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

interface SolutionDetail {
  id: string;
  title: string;
  solution_code: string;
  solution_type: 'software' | 'training' | 'content';
  status: string;
  problem_statement: string | null;
  description: string | null;
  final_price: number | null;
  partner_discount_applied: number;
  started_date: string | null;
  target_completion: string | null;
  created_at: string;
}

interface Phase {
  id: string;
  phase_number: number;
  title: string;
  description: string | null;
  status: string;
  production_url: string | null;
}

interface TrainingSession {
  id: string;
  session_number: number | null;
  title: string | null;
  status: string;
  scheduled_at: string | null;
}

interface ContentOrder {
  id: string;
  order_type: string | null;
  quantity: number;
  division: string;
  due_date: string | null;
  deliverables: {
    id: string;
    title: string;
    status: string;
  }[];
}

export default function ClientProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [solution, setSolution] = useState<SolutionDetail | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [contentOrders, setContentOrders] = useState<ContentOrder[]>([]);

  const solutionId = params.id as string;

  useEffect(() => {
    async function fetchSolution() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      const { data: client } = await (supabase as any).from('sh_clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!client) {
        router.push('/portal/client');
        return;
      }

      // Fetch solution
      const { data: solutionData } = await (supabase as any).from('sh_solutions')
        .select('*')
        .eq('id', solutionId)
        .eq('client_id', client.id)
        .single();

      if (!solutionData) {
        router.push('/portal/client/projects');
        return;
      }

      setSolution(solutionData as SolutionDetail);

      // Fetch type-specific data
      if (solutionData.solution_type === 'software') {
        const { data: phasesData } = await (supabase as any).from('sh_software_phases')
          .select('id, phase_number, title, description, status, production_url')
          .eq('solution_id', solutionId)
          .order('phase_number');
        setPhases((phasesData as Phase[]) || []);
      } else if (solutionData.solution_type === 'training') {
        const { data: programData } = await (supabase as any).from('sh_training_programs')
          .select('id')
          .eq('solution_id', solutionId)
          .single();

        if (programData) {
          const { data: sessionsData } = await (supabase as any).from('sh_training_sessions')
            .select('id, session_number, title, status, scheduled_at')
            .eq('program_id', programData.id)
            .order('session_number');
          setSessions((sessionsData as TrainingSession[]) || []);
        }
      } else if (solutionData.solution_type === 'content') {
        const { data: ordersData } = await (supabase as any).from('sh_content_orders')
          .select(`
            id, order_type, quantity, division, due_date,
            deliverables:sh_content_deliverables(id, title, status)
          `)
          .eq('solution_id', solutionId);
        setContentOrders((ordersData as ContentOrder[]) || []);
      }

      setIsLoading(false);
    }

    fetchSolution();
  }, [solutionId, router]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!solution) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Solution not found</p>
            <Button className="mt-4" onClick={() => router.push('/portal/client/projects')} variant="outline">
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
  if (solution.solution_type === 'software' && phases.length > 0) {
    const completedPhases = phases.filter(p => ['approved', 'live', 'completed', 'in_amc'].includes(p.status)).length;
    progress = Math.round((completedPhases / phases.length) * 100);
  } else if (solution.solution_type === 'training' && sessions.length > 0) {
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    progress = Math.round((completedSessions / sessions.length) * 100);
  } else if (solution.solution_type === 'content' && contentOrders.length > 0) {
    const allDeliverables = contentOrders.flatMap(o => o.deliverables || []);
    const approvedDeliverables = allDeliverables.filter(d => d.status === 'approved').length;
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
              {solution.partner_discount_applied > 0 && (
                <p className="text-xs text-emerald-600">
                  {Math.round(solution.partner_discount_applied * 100)}% partner discount applied
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
      {solution.solution_type === 'software' && phases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Development Phases</CardTitle>
            <CardDescription>Track the progress of each development phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {phases.map((phase) => (
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

      {/* Training Sessions */}
      {solution.solution_type === 'training' && sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Training Sessions</CardTitle>
            <CardDescription>View scheduled and completed sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {session.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">
                        Session {session.session_number}: {session.title || 'Untitled'}
                      </p>
                      {session.scheduled_at && (
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(session.scheduled_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      session.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-700'
                    }
                  >
                    {session.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Orders */}
      {solution.solution_type === 'content' && contentOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Orders</CardTitle>
            <CardDescription>View deliverables for each content order</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {contentOrders.map((order) => (
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
                      {order.deliverables.map((deliverable) => (
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
