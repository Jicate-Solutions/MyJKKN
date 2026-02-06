'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Plus,
  Phone,
  Mail,
  MessageSquare,
  ClipboardList,
  StickyNote,
} from 'lucide-react';
import { format } from 'date-fns';

import { useSolution, useUpdateSolution, useDeleteSolution } from '@/hooks/solutions/use-solutions';
import { useSolutionPhases, useCreatePhase } from '@/hooks/solutions/use-phases';
import { usePaymentsBySolution } from '@/hooks/solutions/use-payments';
import {
  useSolutionCommunications,
  useCreateCommunication,
  COMMUNICATION_TYPE_LABELS,
} from '@/hooks/solutions/use-discovery';
import type { SolutionType, SolutionStatus, CommunicationType } from '@/lib/services/solutions/types';

interface SolutionDetailProps {
  solutionId: string;
}

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

const phaseStatusLabels: Record<string, string> = {
  prospecting: 'Prospecting',
  discovery: 'Discovery',
  prd_writing: 'PRD Writing',
  prototype_building: 'Prototype Building',
  client_demo: 'Client Demo',
  revisions: 'Revisions',
  approved: 'Approved',
  deploying: 'Deploying',
  training: 'Training',
  live: 'Live',
  in_amc: 'In AMC',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

const commTypeIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  meeting: ClipboardList,
  note: StickyNote,
};

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SolutionDetail({ solutionId }: SolutionDetailProps) {
  const router = useRouter();

  // Real data hooks
  const { data: solution, isLoading, error } = useSolution(solutionId);
  const { data: phasesData } = useSolutionPhases(solutionId);
  const { data: payments } = usePaymentsBySolution(solutionId);
  const { data: communications } = useSolutionCommunications(solutionId);

  // Mutation hooks
  const updateSolution = useUpdateSolution();
  const deleteSolution = useDeleteSolution();
  const createPhase = useCreatePhase();
  const createCommunication = useCreateCommunication();

  // Dialog states
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [commDialogOpen, setCommDialogOpen] = useState(false);

  // Phase form state
  const [phaseTitle, setPhaseTitle] = useState('');
  const [phaseDescription, setPhaseDescription] = useState('');

  // Communication form state
  const [commType, setCommType] = useState<CommunicationType>('note');
  const [commSubject, setCommSubject] = useState('');
  const [commSummary, setCommSummary] = useState('');

  const handleStatusChange = async (newStatus: SolutionStatus) => {
    try {
      await updateSolution.mutateAsync({
        id: solutionId,
        input: { status: newStatus },
      });
      toast.success(`Status updated to ${statusConfig[newStatus].label}`);
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this solution? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteSolution.mutateAsync(solutionId);
      toast.success('Solution deleted');
      router.push('/solutions/list');
    } catch (err) {
      toast.error('Failed to delete solution');
    }
  };

  const handleCreatePhase = async () => {
    if (!phaseTitle.trim()) {
      toast.error('Phase title is required');
      return;
    }
    try {
      await createPhase.mutateAsync({
        solution_id: solutionId,
        title: phaseTitle,
        description: phaseDescription || undefined,
      } as any);
      toast.success('Phase created');
      setPhaseTitle('');
      setPhaseDescription('');
      setPhaseDialogOpen(false);
    } catch (err) {
      toast.error('Failed to create phase');
    }
  };

  const handleLogCommunication = async () => {
    if (!commSummary.trim()) {
      toast.error('Summary is required');
      return;
    }
    if (!solution?.client_id) {
      toast.error('No client linked to this solution');
      return;
    }
    try {
      await createCommunication.mutateAsync({
        client_id: solution.client_id,
        solution_id: solutionId,
        communication_type: commType,
        subject: commSubject || undefined,
        summary: commSummary,
      });
      toast.success('Communication logged');
      setCommType('note');
      setCommSubject('');
      setCommSummary('');
      setCommDialogOpen(false);
    } catch (err) {
      toast.error('Failed to log communication');
    }
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
              The solution you&apos;re looking for doesn&apos;t exist or has been deleted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const solutionType = solution.solution_type as SolutionType;
  const solutionStatus = solution.status as SolutionStatus;
  const config = typeConfig[solutionType] || typeConfig.software;
  const Icon = config.icon;
  const status = statusConfig[solutionStatus] || statusConfig.active;

  const phases = phasesData?.data || [];
  const paymentsList = payments || [];
  const commsList = communications || [];

  const totalPaymentsReceived = paymentsList
    .filter((p: any) => p.status === 'completed')
    .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

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
          <Select value={solutionStatus} onValueChange={(v) => handleStatusChange(v as SolutionStatus)}>
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
          {solutionType === 'software' && (
            <TabsTrigger value="phases">Phases ({phases.length})</TabsTrigger>
          )}
          {solutionType === 'training' && (
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          )}
          {solutionType === 'content' && (
            <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
          )}
          <TabsTrigger value="payments">Payments ({paymentsList.length})</TabsTrigger>
          <TabsTrigger value="communications">Comms ({commsList.length})</TabsTrigger>
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

                {!solution.problem_statement && !solution.description && (
                  <p className="text-sm text-muted-foreground italic">
                    No description provided yet.
                  </p>
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

                {(solution as any).department && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Lead Department
                    </p>
                    <Badge variant="outline">{(solution as any).department.name}</Badge>
                  </div>
                )}
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
                  {(solution as any).client ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/solutions/clients/${(solution as any).client.id}`}
                          className="font-medium hover:underline"
                        >
                          {(solution as any).client.name}
                        </Link>
                        {(solution as any).client.partner_status !== 'standard' && (
                          <Badge variant="secondary" className="text-xs">
                            {(solution as any).client.partner_status?.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      {(solution as any).client.contact_person && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-3 w-3" /> {(solution as any).client.contact_person}
                        </p>
                      )}
                      {(solution as any).client.city && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(solution as any).client.city}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No client linked</p>
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
                  {solution.partner_discount_applied && solution.partner_discount_applied > 0 && (
                    <Badge variant="outline" className="mt-2 text-green-600">
                      {Math.round(solution.partner_discount_applied * 100)}% Partner Discount
                    </Badge>
                  )}
                  {solution.hod_discount && solution.hod_discount > 0 && (
                    <Badge variant="outline" className="mt-2 ml-1 text-blue-600">
                      {solution.hod_discount}% HoD Discount
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
                  {solutionType === 'software' ? 'Phases' :
                   solutionType === 'training' ? 'Sessions' : 'Deliverables'}
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{phases.length}</p>
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
                <p className="text-xl font-bold">{formatCurrency(totalPaymentsReceived)}</p>
                <p className="text-xs text-muted-foreground">Received</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Phases Tab (Software) */}
        {solutionType === 'software' && (
          <TabsContent value="phases">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Development Phases</CardTitle>
                  <CardDescription>Manage phases for this software solution</CardDescription>
                </div>
                <Dialog open={phaseDialogOpen} onOpenChange={setPhaseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Phase
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Phase</DialogTitle>
                      <DialogDescription>
                        Create a new development phase for this solution.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="phase-title">Phase Title</Label>
                        <Input
                          id="phase-title"
                          placeholder="e.g., Phase 1 - Discovery & PRD"
                          value={phaseTitle}
                          onChange={(e) => setPhaseTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phase-desc">Description (optional)</Label>
                        <Textarea
                          id="phase-desc"
                          placeholder="What this phase covers..."
                          value={phaseDescription}
                          onChange={(e) => setPhaseDescription(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPhaseDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreatePhase} disabled={createPhase.isPending}>
                        {createPhase.isPending ? 'Creating...' : 'Create Phase'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {phases.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      No phases created yet. Add your first phase to start tracking progress.
                    </p>
                    <Button onClick={() => setPhaseDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add First Phase
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {phases.map((phase: any) => (
                      <Link
                        key={phase.id}
                        href={`/solutions/software/phases/${phase.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium">
                              {phase.phase_number || '?'}
                            </div>
                            <div>
                              <p className="font-medium">{phase.title}</p>
                              {phase.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  {phase.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {phaseStatusLabels[phase.status] || phase.status}
                            </Badge>
                            {phase.estimated_value && (
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(phase.estimated_value)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Sessions Tab (Training) */}
        {solutionType === 'training' && (
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
        {solutionType === 'content' && (
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>Track payments for this solution</CardDescription>
              </div>
              <Button size="sm" asChild>
                <Link href={`/solutions/payments/new?solution=${solutionId}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Record Payment
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {paymentsList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No payments recorded yet.
                  </p>
                  <Button asChild>
                    <Link href={`/solutions/payments/new?solution=${solutionId}`}>
                      Record Payment
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentsList.map((payment: any) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">{formatCurrency(payment.amount)}</p>
                        <p className="text-sm text-muted-foreground">
                          {payment.payment_type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          {payment.reference_number && ` - ${payment.reference_number}`}
                        </p>
                        {payment.paid_at && (
                          <p className="text-xs text-muted-foreground">
                            Paid on {format(new Date(payment.paid_at), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          payment.status === 'completed' ? 'default' :
                          payment.status === 'failed' ? 'destructive' :
                          'secondary'
                        }
                      >
                        {payment.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Communications</CardTitle>
                <CardDescription>Client communication history</CardDescription>
              </div>
              <Dialog open={commDialogOpen} onOpenChange={setCommDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Communication
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Communication</DialogTitle>
                    <DialogDescription>
                      Record a client communication for this solution.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="comm-type">Type</Label>
                      <Select value={commType} onValueChange={(v) => setCommType(v as CommunicationType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(COMMUNICATION_TYPE_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="comm-subject">Subject (optional)</Label>
                      <Input
                        id="comm-subject"
                        placeholder="e.g., Follow-up on prototype review"
                        value={commSubject}
                        onChange={(e) => setCommSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="comm-summary">Summary</Label>
                      <Textarea
                        id="comm-summary"
                        placeholder="What was discussed or communicated..."
                        value={commSummary}
                        onChange={(e) => setCommSummary(e.target.value)}
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCommDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleLogCommunication} disabled={createCommunication.isPending}>
                      {createCommunication.isPending ? 'Saving...' : 'Save Communication'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {commsList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No communications logged yet.
                  </p>
                  <Button onClick={() => setCommDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Log Communication
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {commsList.map((comm: any) => {
                    const CommIcon = commTypeIcons[comm.communication_type] || StickyNote;
                    return (
                      <div
                        key={comm.id}
                        className="flex items-start gap-3 p-4 rounded-lg border"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <CommIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {COMMUNICATION_TYPE_LABELS[comm.communication_type as CommunicationType] || comm.communication_type}
                            </Badge>
                            {comm.direction && (
                              <Badge variant="secondary" className="text-xs">
                                {comm.direction}
                              </Badge>
                            )}
                          </div>
                          {comm.subject && (
                            <p className="font-medium text-sm">{comm.subject}</p>
                          )}
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {comm.summary}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {comm.communication_date
                              ? format(new Date(comm.communication_date), 'dd MMM yyyy, h:mm a')
                              : format(new Date(comm.created_at), 'dd MMM yyyy, h:mm a')
                            }
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
