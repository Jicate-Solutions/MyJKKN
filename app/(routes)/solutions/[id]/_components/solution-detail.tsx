'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Hammer,
  BookOpen,
  Video,
  User,
  FileText,
  CreditCard,
  Trash2,
  PenSquare,
  ScrollText,
} from 'lucide-react';
import { format } from 'date-fns';

// TODO: Replace with real hooks after service migration
// import { useSolution, useUpdateSolution, useDeleteSolution } from '@/hooks/solutions/use-solutions';

interface SolutionDetailProps {
  solutionId: string;
}

type SolutionType = 'software' | 'training' | 'content';
type SolutionStatus = 'active' | 'on_hold' | 'completed' | 'cancelled' | 'in_amc';

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string; label: string }> = {
  software: { icon: Hammer, color: 'text-blue-600', label: 'Software Solution' },
  training: { icon: BookOpen, color: 'text-green-600', label: 'Training Program' },
  content: { icon: Video, color: 'text-purple-600', label: 'Content Production' },
};

const statusConfig: Record<SolutionStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active: { label: 'Active', variant: 'default' },
  on_hold: { label: 'On Hold', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  in_amc: { label: 'In AMC', variant: 'secondary' },
};

function formatCurrency(amount: number | null): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SolutionDetail({ solutionId }: SolutionDetailProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<SolutionStatus>('active');

  // Placeholder data until hooks are migrated
  const solution = {
    id: solutionId,
    solution_code: 'JKKN-SOL-2026-001',
    title: 'Student Portal Enhancement',
    solution_type: 'software' as SolutionType,
    status: 'active' as SolutionStatus,
    problem_statement: 'Current student portal lacks modern features and mobile support.',
    description: 'Complete overhaul of the student portal with modern UI, mobile-first design, and enhanced features.',
    client: { id: '1', name: 'ABC University', contact_person: 'Dr. Smith', partner_status: 'yi' },
    department: { id: '1', name: 'Computer Science' },
    base_price: 500000,
    final_price: 450000,
    partner_discount_applied: 0.1,
    started_date: '2026-01-15',
    target_completion: '2026-06-15',
    created_at: '2026-01-10',
  };
  const isLoading = false;
  const error = null;

  const handleStatusChange = async (newStatus: SolutionStatus) => {
    setCurrentStatus(newStatus);
    // TODO: Implement with actual mutation
    console.log('Status changed to:', newStatus);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this solution? This action cannot be undone.')) {
      return;
    }
    // TODO: Implement with actual mutation
    console.log('Delete solution:', solutionId);
    router.push('/solutions/list');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (error || !solution) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/solutions/list">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Solution Not Found</h1>
            <p className="text-muted-foreground">
              The solution you're looking for doesn't exist or has been deleted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const config = typeConfig[solution.solution_type];
  const Icon = config.icon;
  const status = statusConfig[currentStatus];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/solutions/list">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <Badge variant="outline">{config.label}</Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <h1 className="text-2xl font-bold">{solution.title}</h1>
            <p className="text-muted-foreground font-mono">{solution.solution_code}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={currentStatus} onValueChange={(v) => handleStatusChange(v as SolutionStatus)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="in_amc">In AMC</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" asChild>
            <Link href={`/solutions/${solutionId}/edit`}>
              <PenSquare className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>

          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {solution.solution_type === 'software' && (
            <TabsTrigger value="phases">Phases</TabsTrigger>
          )}
          {solution.solution_type === 'training' && (
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          )}
          {solution.solution_type === 'content' && (
            <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
          )}
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Solution Details */}
            <Card>
              <CardHeader>
                <CardTitle>Solution Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {solution.problem_statement && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Problem Statement
                    </p>
                    <p className="text-sm">{solution.problem_statement}</p>
                  </div>
                )}

                {solution.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Description
                    </p>
                    <p className="text-sm">{solution.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Started
                    </p>
                    <p className="text-sm">
                      {solution.started_date
                        ? format(new Date(solution.started_date), 'PPP')
                        : 'Not started'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Target
                    </p>
                    <p className="text-sm">
                      {solution.target_completion
                        ? format(new Date(solution.target_completion), 'PPP')
                        : 'Not set'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Client & Pricing */}
            <Card>
              <CardHeader>
                <CardTitle>Client & Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Client
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{solution.client.name}</p>
                    {solution.client.partner_status !== 'standard' && (
                      <Badge variant="secondary" className="text-xs">
                        {solution.client.partner_status.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  {solution.client.contact_person && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <User className="h-3 w-3" /> {solution.client.contact_person}
                    </p>
                  )}
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Pricing
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Base Price</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(solution.base_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Final Price</p>
                      <p className="text-lg font-semibold text-green-600">
                        {formatCurrency(solution.final_price)}
                      </p>
                    </div>
                  </div>
                  {solution.partner_discount_applied > 0 && (
                    <Badge variant="outline" className="mt-2 text-green-600">
                      {Math.round(solution.partner_discount_applied * 100)}% Partner Discount
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Created</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">
                  {format(new Date(solution.created_at), 'dd MMM yyyy')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {solution.solution_type === 'software' ? 'Phases' :
                   solution.solution_type === 'training' ? 'Sessions' : 'Deliverables'}
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">0</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MoU</CardTitle>
                <ScrollText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge variant="outline">Not Created</Badge>
                <Button variant="link" size="sm" className="p-0 h-auto mt-1" asChild>
                  <Link href={`/solutions/${solutionId}/mou`}>Create MoU</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Payments</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{formatCurrency(0)}</p>
                <p className="text-xs text-muted-foreground">Received</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Phases Tab (Software) */}
        {solution.solution_type === 'software' && (
          <TabsContent value="phases">
            <Card>
              <CardHeader>
                <CardTitle>Development Phases</CardTitle>
                <CardDescription>Manage phases for this software solution</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  No phases created yet. Add your first phase to start tracking progress.
                </p>
                <div className="flex justify-center">
                  <Button>Add First Phase</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Sessions Tab (Training) */}
        {solution.solution_type === 'training' && (
          <TabsContent value="sessions">
            <Card>
              <CardHeader>
                <CardTitle>Training Sessions</CardTitle>
                <CardDescription>Schedule and manage training sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  No sessions scheduled yet.
                </p>
                <div className="flex justify-center">
                  <Button>Schedule Session</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Deliverables Tab (Content) */}
        {solution.solution_type === 'content' && (
          <TabsContent value="deliverables">
            <Card>
              <CardHeader>
                <CardTitle>Content Deliverables</CardTitle>
                <CardDescription>Manage deliverables for this content order</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center py-8 text-muted-foreground">
                  No deliverables added yet.
                </p>
                <div className="flex justify-center">
                  <Button>Add Deliverable</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>Track payments for this solution</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center py-8 text-muted-foreground">
                No payments recorded yet.
              </p>
              <div className="flex justify-center">
                <Button asChild>
                  <Link href={`/solutions/payments/new?solution=${solutionId}`}>
                    Record Payment
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <CardTitle>Communications</CardTitle>
              <CardDescription>Client communication history</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center py-8 text-muted-foreground">
                No communications logged yet.
              </p>
              <div className="flex justify-center">
                <Button>Log Communication</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
