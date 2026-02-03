'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FolderKanban,
  MoreHorizontal,
  Play,
  CheckCircle,
  XCircle,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-800">Ready to Start</Badge>;
    case 'requested':
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Pending Approval</Badge>;
    case 'completed':
      return <Badge variant="secondary">Completed</Badge>;
    case 'withdrawn':
      return <Badge variant="destructive">Withdrawn</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getRoleBadge(role: string) {
  return role === 'lead' ? (
    <Badge variant="default">Lead</Badge>
  ) : (
    <Badge variant="outline">Contributor</Badge>
  );
}

interface Assignment {
  id: string;
  status: string;
  role: string;
  requested_at: string;
  phase?: {
    id: string;
    title: string;
    estimated_value: number;
    prototype_url?: string;
    solution?: {
      solution_code: string;
      title: string;
      client?: {
        name: string;
      };
    };
  };
}

export default function AssignmentsPage() {
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedTab, setSelectedTab] = useState('active');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'start' | 'complete' | 'withdraw';
    assignmentId: string;
    phaseTitle: string;
  } | null>(null);

  useEffect(() => {
    async function fetchAssignments() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: builder } = await (supabase as any).from('sh_builders')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!builder) {
        setIsLoading(false);
        return;
      }

      setBuilderId(builder.id);

      const { data } = await (supabase as any).from('sh_builder_assignments')
        .select(`
          id, status, role, requested_at,
          phase:sh_solution_phases(
            id, title, estimated_value, prototype_url,
            solution:sh_solutions(
              solution_code, title,
              client:sh_clients(name)
            )
          )
        `)
        .eq('builder_id', builder.id)
        .order('requested_at', { ascending: false });

      setAssignments((data as Assignment[]) || []);
      setIsLoading(false);
    }

    fetchAssignments();
  }, []);

  const handleAction = async () => {
    if (!confirmAction || !builderId) return;

    const supabase = createClient();
    let newStatus: string;

    switch (confirmAction.type) {
      case 'start':
        newStatus = 'active';
        break;
      case 'complete':
        newStatus = 'completed';
        break;
      case 'withdraw':
        newStatus = 'withdrawn';
        break;
      default:
        return;
    }

    const { error } = await (supabase as any).from('sh_builder_assignments')
      .update({ status: newStatus })
      .eq('id', confirmAction.assignmentId);

    if (error) {
      toast.error('Action failed. Please try again.');
    } else {
      toast.success(`Assignment ${confirmAction.type === 'start' ? 'started' : confirmAction.type === 'complete' ? 'completed' : 'withdrawn'}`);
      // Refresh assignments
      setAssignments(prev =>
        prev.map(a =>
          a.id === confirmAction.assignmentId ? { ...a, status: newStatus } : a
        )
      );
    }

    setConfirmAction(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const activeAssignments = assignments.filter(
    (a) => a.status === 'active' || a.status === 'approved'
  );
  const pendingAssignments = assignments.filter((a) => a.status === 'requested');
  const completedAssignments = assignments.filter((a) => a.status === 'completed');

  const getFilteredAssignments = () => {
    switch (selectedTab) {
      case 'active':
        return activeAssignments;
      case 'pending':
        return pendingAssignments;
      case 'completed':
        return completedAssignments;
      default:
        return assignments;
    }
  };

  const renderAssignmentTable = (items: Assignment[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No assignments in this category</p>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phase</TableHead>
            <TableHead>Solution</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((assignment) => (
            <TableRow key={assignment.id}>
              <TableCell className="font-medium">
                {assignment.phase?.title || 'Untitled Phase'}
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{assignment.phase?.solution?.solution_code}</p>
                  <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {assignment.phase?.solution?.title}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                {assignment.phase?.solution?.client?.name || 'No Client'}
              </TableCell>
              <TableCell>
                {assignment.phase?.estimated_value
                  ? formatCurrency(assignment.phase.estimated_value)
                  : '-'}
              </TableCell>
              <TableCell>{getRoleBadge(assignment.role)}</TableCell>
              <TableCell>{getStatusBadge(assignment.status)}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {assignment.phase?.prototype_url && (
                      <DropdownMenuItem asChild>
                        <a
                          href={assignment.phase.prototype_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Prototype
                        </a>
                      </DropdownMenuItem>
                    )}
                    {assignment.status === 'approved' && (
                      <DropdownMenuItem
                        onClick={() =>
                          setConfirmAction({
                            type: 'start',
                            assignmentId: assignment.id,
                            phaseTitle: assignment.phase?.title || 'this phase',
                          })
                        }
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start Working
                      </DropdownMenuItem>
                    )}
                    {assignment.status === 'active' && (
                      <DropdownMenuItem
                        onClick={() =>
                          setConfirmAction({
                            type: 'complete',
                            assignmentId: assignment.id,
                            phaseTitle: assignment.phase?.title || 'this phase',
                          })
                        }
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark Complete
                      </DropdownMenuItem>
                    )}
                    {(assignment.status === 'requested' ||
                      assignment.status === 'approved' ||
                      assignment.status === 'active') && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() =>
                          setConfirmAction({
                            type: 'withdraw',
                            assignmentId: assignment.id,
                            phaseTitle: assignment.phase?.title || 'this phase',
                          })
                        }
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Withdraw
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Assignments</h1>
        <p className="text-muted-foreground">
          View and manage your phase assignments
        </p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            Active
            {activeAssignments.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeAssignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pendingAssignments.length > 0 && (
              <Badge variant="outline" className="ml-1 border-yellow-500">
                {pendingAssignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed
            {completedAssignments.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {completedAssignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            {renderAssignmentTable(getFilteredAssignments())}
          </CardContent>
        </Card>
      </Tabs>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'start' && 'Start Working?'}
              {confirmAction?.type === 'complete' && 'Mark as Completed?'}
              {confirmAction?.type === 'withdraw' && 'Withdraw from Assignment?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'start' &&
                `You are about to start working on "${confirmAction.phaseTitle}". This will change the status to Active.`}
              {confirmAction?.type === 'complete' &&
                `You are about to mark "${confirmAction.phaseTitle}" as completed. Make sure all work is done.`}
              {confirmAction?.type === 'withdraw' &&
                `You are about to withdraw from "${confirmAction.phaseTitle}". This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              className={confirmAction?.type === 'withdraw' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {confirmAction?.type === 'start' && 'Start Working'}
              {confirmAction?.type === 'complete' && 'Mark Complete'}
              {confirmAction?.type === 'withdraw' && 'Withdraw'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
