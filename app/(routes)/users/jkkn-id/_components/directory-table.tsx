'use client';

/**
 * JKKN ID directory — the default view of /users/jkkn-id.
 *
 * A browsable, server-paginated table of every person the caller may see,
 * one kind at a time (Learners by default), with advanced filters rendered
 * into the shared DataTable's toolbar. All filtering/sorting/paging happens
 * in fn_jkkn_directory: viewers hold users.jkkn_id.view but not necessarily
 * learners/staff row access under RLS, so rows must come from the gated RPC,
 * never a client-side table query.
 *
 * The DataTable re-runs fetchDataFn whenever its identity changes (its fetch
 * effect lists fetchDataFn as a dependency), so the filter state simply lives
 * in this component and flows in through useCallback deps — same pattern as
 * app/(routes)/hr/leave/_components/approvals-data-table.tsx.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgePlus, Loader2, QrCode, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { JkknQrDialog } from '@/components/identity/jkkn-qr-dialog';
import {
  JkknIdentityService,
  type DirectoryKind,
  type DirectoryRow
} from '@/lib/services/users/jkkn-identity-service';

const KIND_OPTIONS: { value: DirectoryKind; label: string }[] = [
  { value: 'learner', label: 'Learners' },
  { value: 'team_member', label: 'Team members' },
  { value: 'associate', label: 'Associates' }
];

// The live lifecycle_status enum labels, ordered for a human: on the
// register first, then the pre-admission pipeline, then the exits.
const LEARNER_STATUSES = [
  'active', 'admitted',
  'enquiry', 'enquiry_submitted', 'reserved', 'pending', 'approved',
  'account', 'waitlisted', 'rejected',
  'inactive', 'withdrawal_pending', 'exited', 'graduated', 'alumni'
] as const;

const TEAM_STATUSES = ['active', 'inactive'] as const;

const CURRENT_YEAR = new Date().getFullYear();
const ADMISSION_YEARS = Array.from({ length: CURRENT_YEAR - 2009 }, (_, i) => CURRENT_YEAR - i);

const KIND_BADGE: Record<string, string> = {
  learner: 'Learner',
  team_member: 'Team member',
  both: 'Learner & Team member',
  associate: 'Associate',
  external_participant: 'External participant'
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}

function nameCell(r: DirectoryRow) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="h-8 w-8 shrink-0">
        {r.photo_url ? <AvatarImage src={r.photo_url} alt="" /> : null}
        <AvatarFallback className="text-xs">{initials(r.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <span className="block truncate font-medium">{r.name}</span>
        {r.email ? (
          <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
        ) : null}
      </div>
    </div>
  );
}

/** Everything the JKKN ID cell needs beyond the row itself. */
interface IssueContext {
  /** users.jkkn_id.issue — the server re-checks regardless. */
  canIssue: boolean;
  /** Bumped after any successful issuance so table + stats refresh together. */
  onIssued: () => void;
}

/**
 * JKKN ID + its QR in one cell; "not issued" + a permission-gated Issue
 * button until the register has them. Issuance goes through
 * fn_jkkn_issue_manual, which carries the trigger's email guard — a
 * graduate-turned-staff gets LINKED to their existing number, never a
 * duplicate — so this button is also how the withheld phone-overlap people
 * are resolved once a human has decided they are two people.
 */
function JkknIdCell({
  row,
  kind,
  ctx
}: {
  row: DirectoryRow;
  kind: DirectoryKind;
  ctx: IssueContext;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doIssue = async () => {
    setBusy(true);
    try {
      const res = await JkknIdentityService.issueManual(kind, row.id);
      if (res.action === 'linked_existing') {
        toast.success(
          `${row.name} already held ${res.jkkn_id} in their other capacity — linked as one person.`
        );
      } else if (res.action === 'already_held') {
        toast.info(`${row.name} already holds ${res.jkkn_id}.`);
      } else {
        toast.success(`Issued ${res.jkkn_id} to ${row.name}.`);
      }
      ctx.onIssued();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Issue failed');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (!row.jkkn_id) {
    // Associate rows always carry an ID (the register IS their directory
    // membership), so the button only ever renders for learner/team kinds.
    if (!ctx.canIssue || (kind !== 'learner' && kind !== 'team_member')) {
      return <Badge variant="outline" className="text-muted-foreground">not issued</Badge>;
    }
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-muted-foreground">not issued</Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          {busy
            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            : <BadgePlus className="mr-1 h-3.5 w-3.5" />}
          Issue
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Issue a permanent JKKN ID?</AlertDialogTitle>
              <AlertDialogDescription>
                {row.name} will receive one permanent number, kept for life. A number can be
                retired but never deleted or reused. If their email matches an existing identity
                of the other kind, that identity is linked instead of a new number being minted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); doIssue(); }}>
                Issue ID
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="font-mono tracking-wide">{row.jkkn_id}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        aria-label={`Show QR for ${row.name}`}
      >
        <QrCode className="h-4 w-4" />
      </Button>
      <JkknQrDialog open={open} onOpenChange={setOpen} jkknId={row.jkkn_id} personName={row.name} />
    </div>
  );
}

// Column ids double as fn_jkkn_directory sort keys ('name' | 'jkkn_id' |
// 'code' | 'status' | 'admission_year'); anything else falls back to name
// server-side, so unsortable columns simply disable sorting.
function buildColumns(kind: DirectoryKind, ctx: IssueContext): ColumnDef<DirectoryRow, unknown>[] {
  const name: ColumnDef<DirectoryRow, unknown> = {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => nameCell(row.original),
    size: 240,
    minSize: 180,
    enableHiding: false
  };
  const jkknId: ColumnDef<DirectoryRow, unknown> = {
    id: 'jkkn_id',
    accessorKey: 'jkkn_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="JKKN ID" />,
    cell: ({ row }) => <JkknIdCell row={row.original} kind={kind} ctx={ctx} />,
    size: 190,
    minSize: 150
  };
  const institution: ColumnDef<DirectoryRow, unknown> = {
    accessorKey: 'institution_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.institution_name ?? '—'}</span>
    ),
    size: 200,
    minSize: 140,
    enableSorting: false
  };
  const status: ColumnDef<DirectoryRow, unknown> = {
    id: 'status',
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) =>
      row.original.status ? (
        <Badge variant="outline" className="capitalize">{statusLabel(row.original.status)}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    size: 130,
    minSize: 100
  };

  if (kind === 'learner') {
    return [
      name,
      jkknId,
      {
        id: 'code',
        accessorKey: 'roll_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roll number" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.roll_number ?? '—'}</span>
        ),
        size: 130,
        minSize: 100
      },
      {
        accessorKey: 'register_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Register number" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.register_number ?? '—'}</span>
        ),
        size: 150,
        minSize: 110,
        enableSorting: false
      },
      {
        accessorKey: 'program',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Programme" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.program ?? '—'}</span>
        ),
        size: 200,
        minSize: 140,
        enableSorting: false
      },
      institution,
      {
        id: 'admission_year',
        accessorKey: 'admission_year',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Adm. year" />,
        cell: ({ row }) => row.original.admission_year ?? '—',
        size: 110,
        minSize: 90
      },
      status
    ];
  }

  if (kind === 'team_member') {
    return [
      name,
      jkknId,
      {
        id: 'code',
        accessorKey: 'team_code',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Team code" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.team_code ?? '—'}</span>
        ),
        size: 130,
        minSize: 100
      },
      {
        accessorKey: 'designation',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.designation ?? '—'}</span>
        ),
        size: 180,
        minSize: 120,
        enableSorting: false
      },
      institution,
      status
    ];
  }

  return [
    name,
    jkknId,
    {
      accessorKey: 'kind',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
      cell: ({ row }) => (
        <Badge variant="outline">{KIND_BADGE[row.original.kind] ?? row.original.kind}</Badge>
      ),
      size: 160,
      minSize: 120,
      enableSorting: false
    },
    institution
  ];
}

interface DirectoryFilterState {
  kind: DirectoryKind;
  institutionId: string;   // 'any' | uuid
  status: string;          // 'any' | value
  issued: string;          // 'any' | 'issued' | 'not_issued'
  admissionYear: string;   // 'any' | 'YYYY'
}

const DEFAULT_FILTERS: DirectoryFilterState = {
  kind: 'learner',
  institutionId: 'any',
  status: 'any',
  issued: 'any',
  admissionYear: 'any'
};

interface JkknDirectoryTableProps {
  /** Bump to force a server refetch (e.g. after a manual issuance elsewhere). */
  refetchKey?: number;
  /** Fired after this table successfully issues an ID, so siblings (stats
   *  cards) can refresh in step. */
  onChanged?: () => void;
}

export function JkknDirectoryTable({ refetchKey = 0, onChanged }: JkknDirectoryTableProps) {
  const [filters, setFilters] = useState<DirectoryFilterState>(DEFAULT_FILTERS);
  const [issueBump, setIssueBump] = useState(0);
  const { institutions } = useInstitutionsWithAccess();
  const { canAccess } = usePermissions();
  const canIssue = canAccess('users.jkkn_id', 'issue');

  const issueCtx = useMemo<IssueContext>(
    () => ({
      canIssue,
      onIssued: () => {
        setIssueBump((n) => n + 1); // refresh this table's page
        onChanged?.();              // and let the page refresh the stats cards
      }
    }),
    [canIssue, onChanged]
  );

  const columns = useMemo(() => buildColumns(filters.kind, issueCtx), [filters.kind, issueCtx]);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const result = await JkknIdentityService.listDirectory({
        kind: filters.kind,
        institutionId: filters.institutionId === 'any' ? null : filters.institutionId,
        status: filters.status === 'any' ? null : filters.status,
        issued:
          filters.issued === 'any' ? null : (filters.issued as 'issued' | 'not_issued'),
        admissionYear:
          filters.admissionYear === 'any' ? null : Number(filters.admissionYear),
        search: params.search,
        sortBy: params.sort_by,
        sortOrder: params.sort_order === 'desc' ? 'desc' : 'asc',
        page: params.page,
        limit: params.limit
      });
      return {
        success: true,
        data: result.rows,
        pagination: {
          page: result.page,
          limit: result.limit,
          total_pages: result.total_pages,
          total_items: result.total
        }
      };
    },
    [filters]
  );

  const set = (patch: Partial<DirectoryFilterState>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const statusOptions = filters.kind === 'learner' ? LEARNER_STATUSES : TEAM_STATUSES;
  const isDefault =
    filters.institutionId === 'any' && filters.status === 'any' &&
    filters.issued === 'any' && filters.admissionYear === 'any';

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.kind}
        onValueChange={(v) =>
          // Kind-specific filters reset with the kind — a learner lifecycle
          // status filter silently applied to team members would show an
          // empty table with no visible reason.
          set({ kind: v as DirectoryKind, status: 'any', admissionYear: 'any' })
        }
      >
        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {KIND_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.institutionId} onValueChange={(v) => set({ institutionId: v })}>
        <SelectTrigger className="h-8 w-[190px]"><SelectValue placeholder="Institution" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">All institutions</SelectItem>
          {institutions.map((i) => (
            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.kind !== 'associate' ? (
        <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
          <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={filters.issued} onValueChange={(v) => set({ issued: v })}>
        <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="JKKN ID" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">ID: any</SelectItem>
          <SelectItem value="issued">ID issued</SelectItem>
          <SelectItem value="not_issued">ID not issued</SelectItem>
        </SelectContent>
      </Select>

      {filters.kind === 'learner' ? (
        <Select value={filters.admissionYear} onValueChange={(v) => set({ admissionYear: v })}>
          <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Adm. year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any year</SelectItem>
            {ADMISSION_YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {!isDefault ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => set({ institutionId: 'any', status: 'any', issued: 'any', admissionYear: 'any' })}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
      ) : null}
    </div>
  );

  const renderMobileRow = useCallback(
    (r: DirectoryRow) => (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          {nameCell(r)}
          <JkknIdCell row={r} kind={filters.kind} ctx={issueCtx} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[r.roll_number ?? r.team_code, r.program ?? r.designation, r.institution_name]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
        {r.status ? (
          <Badge variant="outline" className="capitalize">{statusLabel(r.status)}</Badge>
        ) : null}
      </div>
    ),
    [filters.kind, issueCtx]
  );

  return (
    <DataTable<DirectoryRow, unknown>
      // Kind switch remounts the table so column sizing/visibility state from
      // one shape never bleeds into another.
      key={filters.kind}
      fetchDataFn={fetchData}
      refetchKey={refetchKey + issueBump}
      getColumns={() => columns}
      renderMobileRow={renderMobileRow}
      renderToolbarContent={() => toolbar}
      idField="id"
      exportConfig={{
        entityName: `jkkn-id-directory-${filters.kind}`,
        columnMapping: {
          name: 'Name',
          jkkn_id: 'JKKN ID',
          roll_number: 'Roll Number',
          register_number: 'Register Number',
          team_code: 'Team Code',
          designation: 'Designation',
          program: 'Programme',
          institution_name: 'Institution',
          admission_year: 'Admission Year',
          status: 'Status',
          email: 'Email'
        },
        columnWidths: [],
        headers: []
      }}
      config={{
        enableUrlState: false,
        enableSearch: true,
        searchPlaceholder:
          filters.kind === 'learner'
            ? 'Search name, roll, register or JKKN ID…'
            : filters.kind === 'team_member'
              ? 'Search name, team code, email or JKKN ID…'
              : 'Search name, email or JKKN ID…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: false,
        enableExport: true,
        columnResizingTableId: `jkkn-id-directory-${filters.kind}`
      }}
    />
  );
}
