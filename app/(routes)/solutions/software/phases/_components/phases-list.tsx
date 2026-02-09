'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Filter, MoreHorizontal, Users, Calendar, GitBranch, AlertCircle, Pencil, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { usePhases, useUpdatePhase, type PhaseFilters, PHASE_STATUSES } from '@/hooks/solutions/use-phases';
import { useAvailableBuildersForPhase, useRequestAssignment, useWithdrawAssignment } from '@/hooks/solutions/use-builders';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import type { PhaseStatus } from '@/lib/services/solutions/types';
import type { PhaseWithDetails } from '@/lib/services/solutions/phases-service';
import type { BuilderRole } from '@/lib/services/solutions/types';
import type { BuilderWithDetails } from '@/lib/services/solutions/builders-service';

function formatCurrency(amount: number | null): string {
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
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-800' },
  on_hold: { label: 'On Hold', color: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

// ============================================
// EDIT PHASE DIALOG
// ============================================

function EditPhaseDialog({
  phase,
  open,
  onOpenChange,
}: {
  phase: PhaseWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updatePhase = useUpdatePhase();

  const [title, setTitle] = useState(phase.title);
  const [description, setDescription] = useState(phase.description || '');
  const [status, setStatus] = useState<string>(phase.status);
  const [estimatedValue, setEstimatedValue] = useState(
    phase.estimated_value?.toString() || ''
  );
  const [startDate, setStartDate] = useState(phase.start_date || '');
  const [dueDate, setDueDate] = useState(phase.due_date || '');

  // Reset form when phase changes
  useEffect(() => {
    setTitle(phase.title);
    setDescription(phase.description || '');
    setStatus(phase.status);
    setEstimatedValue(phase.estimated_value?.toString() || '');
    setStartDate(phase.start_date || '');
    setDueDate(phase.due_date || '');
  }, [phase]);

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Phase title is required');
      return;
    }

    updatePhase.mutate(
      {
        id: phase.id,
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          status: status as PhaseStatus,
          estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
          start_date: startDate || undefined,
          due_date: dueDate || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Phase updated successfully');
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(`Failed to update phase: ${err.message}`);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Phase {phase.phase_number}
          </DialogTitle>
          <DialogDescription>
            Update the details for this phase.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Phase title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Phase description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="edit-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {PHASE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-value">Estimated Value (INR)</Label>
            <Input
              id="edit-value"
              type="number"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="e.g. 100000"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-start-date">Start Date</Label>
              <Input
                id="edit-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updatePhase.isPending}>
            {updatePhase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MANAGE BUILDERS DIALOG
// ============================================

function ManageBuildersDialog({
  phase,
  open,
  onOpenChange,
}: {
  phase: PhaseWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: availableBuilders, isLoading: loadingBuilders } =
    useAvailableBuildersForPhase(open ? phase.id : '');
  const requestAssignment = useRequestAssignment();
  const withdrawAssignment = useWithdrawAssignment();
  const [assignRole, setAssignRole] = useState<BuilderRole>('contributor');
  const [assigningBuilderId, setAssigningBuilderId] = useState<string | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);

  const currentAssignments = phase.assignments || [];

  const handleAssign = (builderId: string) => {
    setAssigningBuilderId(builderId);
    requestAssignment.mutate(
      {
        phase_id: phase.id,
        builder_id: builderId,
        role: assignRole,
      },
      {
        onSuccess: () => {
          toast.success('Builder assigned successfully');
          setAssigningBuilderId(null);
        },
        onError: (err) => {
          toast.error(`Failed to assign builder: ${err.message}`);
          setAssigningBuilderId(null);
        },
      }
    );
  };

  const handleRemove = (assignmentId: string) => {
    setRemovingAssignmentId(assignmentId);
    withdrawAssignment.mutate(assignmentId, {
      onSuccess: () => {
        toast.success('Builder removed from phase');
        setRemovingAssignmentId(null);
      },
      onError: (err) => {
        toast.error(`Failed to remove builder: ${err.message}`);
        setRemovingAssignmentId(null);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Manage Builders - Phase {phase.phase_number}
          </DialogTitle>
          <DialogDescription>
            Assign or remove builders for &quot;{phase.title}&quot;.
          </DialogDescription>
        </DialogHeader>

        {/* Current Assignments */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">
            Assigned Builders ({currentAssignments.length})
          </h4>
          {currentAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              No builders assigned yet.
            </p>
          ) : (
            <div className="space-y-2">
              {currentAssignments.map((assignment) => (
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
                      <p className="text-sm font-medium">
                        {assignment.builder?.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {assignment.role} - {assignment.status}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(assignment.id)}
                    disabled={removingAssignmentId === assignment.id}
                  >
                    {removingAssignmentId === assignment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Builder Section */}
        <div className="space-y-3 border-t pt-4">
          <h4 className="text-sm font-semibold">Add Builder</h4>
          <div className="space-y-2">
            <Label htmlFor="assign-role">Assignment Role</Label>
            <Select
              value={assignRole}
              onValueChange={(v) => setAssignRole(v as BuilderRole)}
            >
              <SelectTrigger id="assign-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="contributor">Contributor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingBuilders ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !availableBuilders || availableBuilders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              No available builders to assign.
            </p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {availableBuilders.map((builder) => (
                <div
                  key={builder.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {builder.name
                          ?.split(' ')
                          .map((n: string) => n[0])
                          .join('') || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{builder.name}</p>
                      {builder.email && (
                        <p className="text-xs text-muted-foreground">
                          {builder.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAssign(builder.id)}
                    disabled={assigningBuilderId === builder.id}
                  >
                    {assigningBuilderId === builder.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <UserPlus className="mr-1 h-3 w-3" />
                    )}
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// PHASES LIST
// ============================================

export function PhasesList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const debouncedSearch = useDebounceValue(searchQuery, 300);

  // Dialog state
  const [editPhase, setEditPhase] = useState<PhaseWithDetails | null>(null);
  const [buildersPhase, setBuildersPhase] = useState<PhaseWithDetails | null>(null);

  // Build filters for API call
  const filters: PhaseFilters = {
    limit: 50,
  };

  if (statusFilter !== 'all') {
    filters.status = statusFilter as PhaseStatus;
  }

  if (debouncedSearch) {
    filters.search = debouncedSearch;
  }

  // Fetch phases from database
  const { data: phasesData, isLoading, error } = usePhases(filters);

  const phases = phasesData?.data || [];

  return (
    <div className="space-y-4">
      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load phases. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search phases..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {PHASE_STATUSES.map((status) => {
                  const config = statusConfig[status.value];
                  return (
                    <SelectItem key={status.value} value={status.value}>
                      {config?.label || status.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Solution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Builders</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <GitBranch className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">
                        {searchQuery || statusFilter !== 'all'
                          ? 'No phases match your filters'
                          : 'No phases found'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  phases.map((phase) => {
                    const status = statusConfig[phase.status] || statusConfig.prospecting;
                    return (
                      <TableRow key={phase.id}>
                        <TableCell>
                          <Link
                            href={`/solutions/software/phases/${phase.id}`}
                            className="font-medium hover:underline"
                          >
                            Phase {phase.phase_number}: {phase.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div>
                            <Link
                              href={`/solutions/${phase.solution_id}`}
                              className="text-sm hover:underline"
                            >
                              {phase.solution?.solution_code || 'N/A'}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {phase.solution?.title || 'Unknown Solution'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Users className="h-3 w-3" />
                            {phase.assignments?.length || 0}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(phase.estimated_value)}
                        </TableCell>
                        <TableCell>
                          {phase.due_date ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(phase.due_date), 'dd MMM yyyy')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/solutions/software/phases/${phase.id}`}>
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setEditPhase(phase)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit Phase
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setBuildersPhase(phase)}>
                                <Users className="mr-2 h-4 w-4" />
                                Manage Builders
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Phase Dialog */}
      {editPhase && (
        <EditPhaseDialog
          phase={editPhase}
          open={!!editPhase}
          onOpenChange={(open) => {
            if (!open) setEditPhase(null);
          }}
        />
      )}

      {/* Manage Builders Dialog */}
      {buildersPhase && (
        <ManageBuildersDialog
          phase={buildersPhase}
          open={!!buildersPhase}
          onOpenChange={(open) => {
            if (!open) setBuildersPhase(null);
          }}
        />
      )}
    </div>
  );
}
