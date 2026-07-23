'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  AlertCircle,
  Pencil,
  Users,
} from 'lucide-react';
import { useSF100Enrollments, useUpdateSF100TeamDetails } from '@/hooks/startup-studio';

interface SF100EnrollmentsTableProps {
  programId: string;
}

const PHASE_CONFIG: Record<string, { label: string; className: string }> = {
  ideation: { label: 'Ideation', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  validation: { label: 'Validation', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  mvp: { label: 'MVP', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  revenue: { label: 'Revenue', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  growth: { label: 'Growth', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  graduated: { label: 'Graduated', className: 'bg-green-100 text-green-700 border-green-200' },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700 border-green-200' },
  warning: { label: 'Warning', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  probation: { label: 'Probation', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  eliminated: { label: 'Eliminated', className: 'bg-red-100 text-red-700 border-red-200' },
  graduated: { label: 'Graduated', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  withdrawn: { label: 'Withdrawn', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function SortableHeader({
  column,
  label,
}: {
  column: any;
  label: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="ml-1.5 h-3.5 w-3.5" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="ml-1.5 h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {['Team Name', 'College', 'Phase', 'Paid Users', 'Last Check-in', 'Status', 'Mentor'].map(
              (h) => (
                <TableHead key={h}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 7 }).map((_, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Row action: edit a team's NAME + PROBLEM statement in a dialog, plus a link
 * into the existing member-management surface. The write is authorized server
 * side by event_registrations RLS (team owner OR admin) — a non-owner/non-admin
 * coordinator gets a clean 403 surfaced here as an inline error.
 */
function EditTeamCell({ row }: { row: any }) {
  const router = useRouter();
  const enrollmentId = row.original.id as string;
  const currentName: string = row.original.team_name ?? '';
  const currentProblem: string = row.original.problem_idea ?? '';

  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(currentName);
  const [problem, setProblem] = useState(currentProblem);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useUpdateSF100TeamDetails(enrollmentId);

  // Re-seed the fields from the row every time the dialog opens so stale local
  // edits never linger and an untouched field is never blanked on save.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTeamName(currentName);
      setProblem(currentProblem);
      setFormError(null);
    }
    setOpen(next);
  };

  const handleSave = () => {
    const name = teamName.trim();
    if (name.length === 0) {
      setFormError('Team name is required.');
      return;
    }

    // Only send changed fields — leaves untouched values exactly as they are.
    const payload: { team_name?: string; problem_idea?: string } = {};
    if (name !== currentName) payload.team_name = name;
    if (problem.trim() !== currentProblem.trim()) payload.problem_idea = problem.trim();

    if (Object.keys(payload).length === 0) {
      setOpen(false);
      return;
    }

    setFormError(null);
    mutation.mutate(payload, {
      onSuccess: () => setOpen(false),
      onError: (err: any) =>
        setFormError(err?.message ?? 'Could not save changes. Please try again.'),
    });
  };

  return (
    // stopPropagation so acting on a row never triggers the row's navigation.
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8"
        onClick={() => handleOpenChange(true)}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit team
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
            <DialogDescription>
              Update the team name and problem statement. Only the team owner or an
              admin can save changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="sf100-edit-team-name">Team name</Label>
              <Input
                id="sf100-edit-team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf100-edit-problem">Problem statement</Label>
              <Textarea
                id="sf100-edit-problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                rows={4}
                placeholder="What problem is this team solving?"
              />
            </div>
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(`/startup-studio/solve-for-100/team/${enrollmentId}`)
              }
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Manage members
            </Button>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SF100EnrollmentsTable({ programId }: SF100EnrollmentsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const apiFilters: Record<string, any> = {};
  if (phaseFilter !== 'all') apiFilters.phase = phaseFilter;
  if (statusFilter !== 'all') apiFilters.status = statusFilter;

  const { data: raw, isLoading, error } = useSF100Enrollments(programId, apiFilters);
  const enrollments: any[] = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];

  const columns: ColumnDef<any>[] = useMemo(
    () => [
      {
        accessorKey: 'team_name',
        header: ({ column }) => <SortableHeader column={column} label="Team Name" />,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.team_name ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'college',
        header: ({ column }) => <SortableHeader column={column} label="College" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate max-w-[140px] block">
            {row.original.college ?? row.original.institution ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'current_phase',
        header: 'Phase',
        cell: ({ row }) => {
          const phase = row.original.current_phase ?? row.original.phase ?? 'ideation';
          const config = PHASE_CONFIG[phase] ?? {
            label: phase,
            className: 'bg-gray-100 text-gray-700 border-gray-200',
          };
          return (
            <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
              {config.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'paid_user_count',
        header: ({ column }) => <SortableHeader column={column} label="Paid Users" />,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">
            {row.original.paid_user_count ?? row.original.total_paid_users ?? 0}
            <span className="text-muted-foreground font-normal">/100</span>
          </span>
        ),
      },
      {
        accessorKey: 'last_checkin_at',
        header: ({ column }) => <SortableHeader column={column} label="Last Check-in" />,
        cell: ({ row }) => {
          const date = row.original.last_checkin_at ?? row.original.last_check_in_date;
          if (!date) return <span className="text-muted-foreground text-sm">Never</span>;
          return (
            <span className="text-sm">
              {new Date(date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status ?? 'active';
          const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
          return (
            <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
              {config.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'mentor_name',
        header: 'Mentor',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.mentor_name ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => <EditTeamCell row={row} />,
      },
    ],
    []
  );

  const table = useReactTable({
    data: enrollments,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  if (isLoading) return <TableSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load enrollments. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Phase" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            {Object.entries(PHASE_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No enrollments found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    // The enrollment detail lives at /team/[enrollmentId] (with
                    // check-ins/paid-users/pivots/interviews sub-pages); the
                    // /programs/[programId]/enrollments/[enrollmentId] route was
                    // never built, so the old link 404'd on every row click.
                    router.push(
                      `/startup-studio/solve-for-100/team/${row.original.id}`
                    )
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} enrollment
          {table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
