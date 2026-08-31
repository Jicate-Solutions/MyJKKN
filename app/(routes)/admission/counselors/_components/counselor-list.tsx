'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import {
  ArrowRightCircle,
  Check,
  Eye,
  Filter,
  Loader2,
  Pencil,
  Search,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import {
  SourceMasterService,
  type SourceMaster,
} from '@/lib/services/admission/source-master-service';
import { CounselorSourceService } from '@/lib/services/admission/counselor-source-service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { CounselorDetailsDialog } from './counselor-details-dialog';

interface CounselorRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  max_leads: number;
  current_leads: number;
  assigned_lead_count: number;
  sources_count: number;
  specializations: string[] | null;
  institution_id: string;
  user_id: string | null;
  created_at: string;
  institutions: { name: string } | null;
  profile_role?: string | null;
  profile_full_name?: string | null;
}

interface CounselorListProps {
  onRefresh?: () => void;
  institutionId?: string;
  isGlobalUser?: boolean;
}

interface ImpactPreview {
  assigned_leads: number;
  call_logs: number;
  callback_queue: number;
  counselor_record_leads: number;
  counselor_full_name: string | null;
  counselor_email: string | null;
}

type GuardrailMode = 'toggle' | 'remove';
type BulkMode = 'deactivate' | 'remove';

interface GuardrailDialogState {
  open: boolean;
  mode: GuardrailMode;
  counselor: CounselorRecord | null;
}

interface BulkDialogState {
  open: boolean;
  mode: BulkMode;
  rows: CounselorRecord[];
  isRunning: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  student:             'bg-emerald-100 text-emerald-700 border-emerald-200',
  faculty:             'bg-blue-100 text-blue-700 border-blue-200',
  admission_counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  expo_counselor:      'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  learner_counselor:   'bg-teal-100 text-teal-700 border-teal-200',
  staff_counselor:     'bg-indigo-100 text-indigo-700 border-indigo-200',
  health_counselor:    'bg-rose-100 text-rose-700 border-rose-200',
  accounts:            'bg-amber-100 text-amber-700 border-amber-200',
  guest:               'bg-gray-100 text-gray-600 border-gray-200',
};

const ROLE_LABELS: Record<string, string> = {
  student:             'Student',
  faculty:             'Faculty',
  admission_counselor: 'Admission Counsellor',
  expo_counselor:      'Expo Counsellor',
  learner_counselor:   'Learner Counsellor',
  staff_counselor:     'Staff Counsellor',
  health_counselor:    'Health Counsellor',
  accounts:            'Accounts',
  guest:               'Guest',
};

function getRoleBadgeClass(role: string | null | undefined): string {
  if (!role) return 'bg-red-100 text-red-700 border-red-200';
  return ROLE_COLORS[role.toLowerCase()] || 'bg-gray-100 text-gray-600 border-gray-200';
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) return 'No Profile';
  const key = role.toLowerCase();
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

interface CounselorActionsContext {
  togglingIds: Set<string>;
  removingId: string | null;
  canDelete: boolean;
  openGuardrailDialog: (mode: GuardrailMode, counselor: CounselorRecord) => void;
  openEditDialog: (counselor: CounselorRecord) => void;
  assignToSource: (counselor: CounselorRecord) => void;
  openDetailsDialog: (counselor: CounselorRecord) => void;
}

const CounselorActionsCtx = createContext<CounselorActionsContext | null>(null);

function useCounselorActions(): CounselorActionsContext {
  const ctx = useContext(CounselorActionsCtx);
  if (!ctx) throw new Error('CounselorActionsCtx provider missing');
  return ctx;
}

function CounselorRowActions({ counselor }: { counselor: CounselorRecord }) {
  const {
    togglingIds,
    removingId,
    canDelete,
    openGuardrailDialog,
    openEditDialog,
    assignToSource,
    openDetailsDialog,
  } = useCounselorActions();
  const isToggling = togglingIds.has(counselor.id);
  const isRemoving = removingId === counselor.id;
  const busy = isToggling || isRemoving;
  const isRoleOnly = counselor.id.startsWith('role-');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <DotsHorizontalIcon className="h-4 w-4" />
          )}
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuItem
          onSelect={() => openDetailsDialog(counselor)}
          disabled={busy}
        >
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => assignToSource(counselor)}
          disabled={busy}
        >
          <ArrowRightCircle className="mr-2 h-4 w-4" />
          Assign Leads (Sources)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => openEditDialog(counselor)}
          disabled={busy || isRoleOnly}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        {canDelete && (
          <DropdownMenuItem
            onSelect={() => openGuardrailDialog('toggle', counselor)}
            disabled={busy}
          >
            {counselor.is_active ? (
              <>
                <ToggleRight className="mr-2 h-4 w-4" />
                Deactivate
              </>
            ) : (
              <>
                <ToggleLeft className="mr-2 h-4 w-4" />
                Activate
              </>
            )}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={busy}
              onSelect={() => openGuardrailDialog('remove', counselor)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Name cell renders as a button so clicking the counselor name opens the
// details modal. Placed immediately above counselorColumns (and as a const
// arrow rather than a function declaration) so Turbopack's React Refresh
// chunk transform keeps the binding visible to the columns array — matches
// the hoisting-safety pattern used in add-counselor-dialog (see memory note
// feedback_temporal_dead_zone_in_add_counselor_dialog).
const CounselorNameCell = ({ counselor }: { counselor: CounselorRecord }) => {
  const ctx = useContext(CounselorActionsCtx);
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => ctx?.openDetailsDialog(counselor)}
        className={cn(
          'text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline truncate',
          !counselor.is_active && 'text-muted-foreground',
        )}
      >
        {counselor.name || '—'}
      </button>
      {counselor.email && (
        <span className="text-xs text-muted-foreground truncate">
          {counselor.email}
        </span>
      )}
    </div>
  );
};

const counselorColumns: ColumnDef<CounselorRecord>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Counselor" />,
    cell: ({ row }) => <CounselorNameCell counselor={row.original} />,
  },
  {
    accessorKey: 'phone',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {row.original.phone || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'profile_role',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Primary Role" />,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-xs ${getRoleBadgeClass(row.original.profile_role)}`}
      >
        {getRoleLabel(row.original.profile_role)}
      </Badge>
    ),
  },
  {
    id: 'institution',
    accessorFn: (row) => row.institutions?.name ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate">
        {row.original.institutions?.name || 'Unknown'}
      </span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
          Active
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Inactive
        </Badge>
      ),
  },
  {
    accessorKey: 'assigned_lead_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned Leads" />,
    cell: ({ row }) => {
      const c = row.original;
      const isFull = c.max_leads > 0 && c.assigned_lead_count >= c.max_leads;
      return (
        <div className="flex items-baseline gap-1.5 tabular-nums">
          <span
            className={`text-sm font-semibold ${
              isFull ? 'text-orange-700' : 'text-foreground'
            }`}
          >
            {c.assigned_lead_count.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">
            / {c.max_leads.toLocaleString()} cap
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'sources_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sources" />,
    cell: ({ row }) => {
      const n = row.original.sources_count ?? 0;
      return (
        <div className="flex items-center gap-1.5 tabular-nums">
          <Tag
            className={`h-3.5 w-3.5 ${n > 0 ? 'text-primary' : 'text-muted-foreground/60'}`}
          />
          <span
            className={`text-sm font-semibold ${
              n > 0 ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {n.toLocaleString()}
          </span>
          {n === 0 && (
            <span className="text-[10px] text-muted-foreground/80">unassigned</span>
          )}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <CounselorRowActions counselor={row.original} />,
    header: 'Actions',
  },
];

const COUNSELOR_EXPORT_CONFIG = {
  entityName: 'counselors',
  columnMapping: {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    profile_role: 'Primary Role',
    institution: 'Institution',
    is_active: 'Active',
    assigned_lead_count: 'Assigned Leads',
    sources_count: 'Sources Mapped',
    max_leads: 'Max Leads',
  },
  columnWidths: [
    { wch: 28 },
    { wch: 30 },
    { wch: 16 },
    { wch: 22 },
    { wch: 28 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
  ],
  // DATA KEYS (CounselorRecord fields), not the labels above — the export
  // resolves these against each row; columnMapping supplies the heading.
  // Labels here matched nothing and downloaded a blank file.
  headers: [
    'name',
    'email',
    'phone',
    'profile_role',
    'institution',
    'is_active',
    'assigned_lead_count',
    'sources_count',
    'max_leads',
  ],
  // `institution` is not a row field — it lives on the `institutions` relation.
  transformFunction: ((row: CounselorRecord) => ({
    name: row.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    profile_role: row.profile_role ?? '',
    institution: row.institutions?.name ?? '',
    is_active: row.is_active ? 'Yes' : 'No',
    assigned_lead_count: row.assigned_lead_count ?? 0,
    sources_count: row.sources_count ?? 0,
    max_leads: row.max_leads ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any,
};

interface EditCounselorDialogProps {
  counselor: CounselorRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// Editable fields cover the production schema: id, name, email, institution_id,
// created_at, user_id, is_active, phone, designation, current_leads, max_leads.
// `specializations` column is intentionally excluded — it does not exist on the
// admission_counselors table in production (see BUG-003265 in
// add-counselor-dialog.tsx) and would 400 the update with a PGRST204 schema
// cache error.
function EditCounselorDialog({
  counselor,
  open,
  onOpenChange,
  onSaved,
}: EditCounselorDialogProps) {
  const supabase = createClientSupabaseClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [maxLeads, setMaxLeads] = useState(50);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (counselor && open) {
      setName(counselor.name || '');
      setEmail(counselor.email || '');
      setPhone(counselor.phone || '');
      setMaxLeads(counselor.max_leads || 5000);
    }
  }, [counselor, open]);

  const handleSave = async () => {
    if (!counselor) return;
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('admission_counselors')
        .update({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          max_leads: Math.max(1, maxLeads),
        })
        .eq('id', counselor.id);

      if (error) {
        toast.error(error.message || 'Failed to update counselor');
        return;
      }
      toast.success('Counselor updated');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('[admission/counselors] Edit failed:', err);
      toast.error('Failed to update counselor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Counselor</DialogTitle>
          <DialogDescription>
            Update contact details and lead capacity. Audit log records the change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-counselor-name" className="text-xs">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-counselor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-counselor-email" className="text-xs">
              Email
            </Label>
            <Input
              id="edit-counselor-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-counselor-phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="edit-counselor-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-counselor-max-leads" className="text-xs">
              Max Leads (capacity)
            </Label>
            <Input
              id="edit-counselor-max-leads"
              type="number"
              min={1}
              value={maxLeads}
              onChange={(e) => setMaxLeads(parseInt(e.target.value) || 50)}
              disabled={isSaving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StatusFilter = 'all' | 'active' | 'inactive';
type AssignmentFilter = 'all' | 'has_leads' | 'no_leads';
type SourcesFilter = 'all' | 'has_sources' | 'no_sources';

const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'admission_counselor', label: 'Admission Counsellor' },
  { value: 'expo_counselor', label: 'Expo Counsellor' },
  { value: 'learner_counselor', label: 'Learner Counsellor' },
  { value: 'staff_counselor', label: 'Staff Counsellor' },
  { value: 'health_counselor', label: 'Health Counsellor' },
  { value: 'no_profile', label: 'No Profile' },
] as const;

interface AssignToSourceDialogProps {
  counselor: CounselorRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
  isGlobalUser?: boolean;
  onSaved: () => void;
}

// Multi-source picker for the "Assign Leads (Sources)" row action. Maps the
// counselor onto admission_counselor_sources via CounselorSourceService.bulkAttach
// once per selected source (idempotent — re-mapping is a no-op). Uses
// Promise.allSettled so a single RLS denial on one source doesn't block
// the remaining attaches.
function AssignToSourceDialog({
  counselor,
  open,
  onOpenChange,
  institutionId,
  isGlobalUser,
  onSaved,
}: AssignToSourceDialogProps) {
  const supabase = createClientSupabaseClient();
  const [sources, setSources] = useState<SourceMaster[]>([]);
  const [mappedSourceIds, setMappedSourceIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !counselor) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        // Sources: same scoping as SourcesDataTable — undefined for global
        // users so they see all sources, otherwise globals + this institution's.
        const sourceList = await SourceMasterService.list({
          institution_id: isGlobalUser ? undefined : institutionId,
          sortBy: 'display_order',
          sortOrder: 'asc',
        });
        if (cancelled) return;
        setSources(sourceList.filter((s) => s.is_active));

        // Existing mappings for this counselor — avoids "already mapped"
        // surprises and lets us flip the CTA copy from "Add & Open" to
        // "Open Source" when appropriate.
        if (!counselor.id.startsWith('role-')) {
          const { data: existing } = await supabase
            .from('admission_counselor_sources')
            .select('source_id')
            .eq('counselor_id', counselor.id);
          if (cancelled) return;
          setMappedSourceIds(
            new Set((existing ?? []).map((r: any) => r.source_id as string)),
          );
        } else {
          setMappedSourceIds(new Set());
        }
      } catch (err) {
        toast.error('Failed to load sources');
        console.error('[assign-to-source] load failed', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, counselor, institutionId, isGlobalUser, supabase]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedSourceIds(new Set());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sources;
    const q = search.toLowerCase();
    return sources.filter(
      (s) => s.label.toLowerCase().includes(q) || s.key.toLowerCase().includes(q),
    );
  }, [sources, search]);

  // Only counts sources the user actually picked that aren't already mapped —
  // this is the number of INSERTs we'll attempt. Already-mapped picks are
  // treated as no-ops so the CTA stays honest.
  const newSelectionIds = useMemo(
    () => Array.from(selectedSourceIds).filter((id) => !mappedSourceIds.has(id)),
    [selectedSourceIds, mappedSourceIds],
  );

  const toggleSelection = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      for (const s of filtered) {
        if (!mappedSourceIds.has(s.id)) next.add(s.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedSourceIds(new Set());

  const handleAssign = async () => {
    if (!counselor || newSelectionIds.length === 0) return;

    if (counselor.id.startsWith('role-')) {
      toast.error('No counselor record exists for this user yet. Add them first.');
      return;
    }

    setIsSaving(true);
    try {
      // Promise.allSettled — one source's RLS denial or constraint hiccup
      // shouldn't block the rest from attaching. Mirrors the bulk-action
      // pattern used elsewhere on this page.
      const results = await Promise.allSettled(
        newSelectionIds.map((sourceId) =>
          CounselorSourceService.bulkAttach(sourceId, [counselor.id]),
        ),
      );

      let createdTotal = 0;
      let skippedTotal = 0;
      const failures: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          createdTotal += r.value.created;
          skippedTotal += r.value.skipped;
        } else {
          failures.push(newSelectionIds[idx]);
          console.error('[assign-to-source] attach failed', r.reason);
        }
      });

      if (createdTotal > 0) {
        toast.success(
          `${counselor.name} added to ${createdTotal} source${createdTotal === 1 ? '' : 's'}` +
            (skippedTotal > 0 ? ` (${skippedTotal} already mapped)` : ''),
        );
      } else if (skippedTotal > 0 && failures.length === 0) {
        toast('All selected sources were already mapped');
      }

      if (failures.length > 0) {
        toast.error(
          `Failed to map ${failures.length} source${failures.length === 1 ? '' : 's'}`,
        );
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add counselor to sources');
      console.error('[assign-to-source] insert failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const newSelectionCount = newSelectionIds.length;
  const alreadyMappedSelectedCount = selectedSourceIds.size - newSelectionCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign to Sources</DialogTitle>
          <DialogDescription>
            Select one or more sources to map{' '}
            <span className="font-medium text-foreground">
              {counselor?.name || 'this counselor'}
            </span>
            . Each selected source becomes a place where this counselor can
            receive leads.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sources by name or key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            {newSelectionCount > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {newSelectionCount}
                </span>{' '}
                new
                {alreadyMappedSelectedCount > 0 && (
                  <> · {alreadyMappedSelectedCount} already mapped</>
                )}
              </>
            ) : (
              'No sources selected'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={selectAllVisible}
              disabled={isLoading || isSaving || filtered.length === 0}
            >
              Select all visible
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearSelection}
              disabled={isSaving || selectedSourceIds.size === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading sources…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
              {search
                ? 'No sources match your search'
                : 'No active sources available for this institution'}
            </div>
          ) : (
            filtered.map((s) => {
              const isMapped = mappedSourceIds.has(s.id);
              const isSelected = selectedSourceIds.has(s.id);
              const interactive = !isMapped && !isSaving;
              const handleActivate = () => {
                if (interactive) toggleSelection(s.id);
              };
              return (
                <div
                  key={s.id}
                  role="checkbox"
                  aria-checked={isSelected || isMapped}
                  aria-disabled={!interactive}
                  aria-label={`Select ${s.label}`}
                  tabIndex={interactive ? 0 : -1}
                  onClick={handleActivate}
                  onKeyDown={(e) => {
                    if (!interactive) return;
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggleSelection(s.id);
                    }
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    interactive && 'cursor-pointer hover:bg-accent',
                    isMapped && 'opacity-70 cursor-not-allowed',
                    isSelected && !isMapped && 'bg-accent border-l-2 border-l-primary',
                  )}
                >
                  <Checkbox
                    checked={isSelected || isMapped}
                    disabled={isMapped || isSaving}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{s.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {s.key}
                    </div>
                  </div>
                  {isMapped && (
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                      Already mapped
                    </Badge>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={newSelectionCount === 0 || isSaving || isLoading}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {newSelectionCount === 0
              ? 'Assign to sources'
              : `Assign to ${newSelectionCount} source${newSelectionCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkAssignToSourcesDialogProps {
  counselors: CounselorRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
  isGlobalUser?: boolean;
  onSaved: () => void;
}

// Bulk variant of the source picker. Operates on N selected counselors at
// once and maps each chosen source to all of them via a single
// CounselorSourceService.bulkAttach call per source (the service was built
// to take counselorIds[]). Role-only rows are filtered out — they have no
// admission_counselors record yet, so a junction insert would fail FK.
function BulkAssignToSourcesDialog({
  counselors,
  open,
  onOpenChange,
  institutionId,
  isGlobalUser,
  onSaved,
}: BulkAssignToSourcesDialogProps) {
  const [sources, setSources] = useState<SourceMaster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Counselors without a real admission_counselors row can't be junctioned —
  // skipped with a banner so the user understands the effective N.
  const eligibleCounselors = useMemo(
    () => counselors.filter((c) => !c.id.startsWith('role-')),
    [counselors],
  );
  const skippedRoleOnlyCount = counselors.length - eligibleCounselors.length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const sourceList = await SourceMasterService.list({
          institution_id: isGlobalUser ? undefined : institutionId,
          sortBy: 'display_order',
          sortOrder: 'asc',
        });
        if (cancelled) return;
        setSources(sourceList.filter((s) => s.is_active));
      } catch (err) {
        toast.error('Failed to load sources');
        console.error('[bulk-assign-to-sources] load failed', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, institutionId, isGlobalUser]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedSourceIds(new Set());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sources;
    const q = search.toLowerCase();
    return sources.filter(
      (s) => s.label.toLowerCase().includes(q) || s.key.toLowerCase().includes(q),
    );
  }, [sources, search]);

  const toggleSelection = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      for (const s of filtered) next.add(s.id);
      return next;
    });
  };
  const clearSelection = () => setSelectedSourceIds(new Set());

  const handleAssign = async () => {
    if (selectedSourceIds.size === 0 || eligibleCounselors.length === 0) return;
    setIsSaving(true);
    try {
      const sourceIds = Array.from(selectedSourceIds);
      const counselorIds = eligibleCounselors.map((c) => c.id);
      const results = await Promise.allSettled(
        sourceIds.map((sid) => CounselorSourceService.bulkAttach(sid, counselorIds)),
      );

      let createdTotal = 0;
      let skippedTotal = 0;
      let failedSources = 0;
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          createdTotal += r.value.created;
          skippedTotal += r.value.skipped;
        } else {
          failedSources += 1;
          console.error(
            '[bulk-assign-to-sources] attach failed for source',
            sourceIds[idx],
            r.reason,
          );
        }
      });

      if (createdTotal > 0) {
        toast.success(
          `Created ${createdTotal} mapping${createdTotal === 1 ? '' : 's'}` +
            (skippedTotal > 0 ? ` (${skippedTotal} already mapped)` : ''),
        );
      } else if (skippedTotal > 0 && failedSources === 0) {
        toast('All selected pairings were already mapped');
      }
      if (failedSources > 0) {
        toast.error(
          `${failedSources} source${failedSources === 1 ? '' : 's'} failed — check console`,
        );
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk assignment failed');
      console.error('[bulk-assign-to-sources] unexpected failure', err);
    } finally {
      setIsSaving(false);
    }
  };

  const counselorCount = eligibleCounselors.length;
  const sourceCount = selectedSourceIds.size;
  const totalNewMappings = counselorCount * sourceCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Assign {counselorCount} counselor{counselorCount === 1 ? '' : 's'} to sources
          </DialogTitle>
          <DialogDescription>
            Pick one or more sources. Each selected source will be mapped to
            every selected counselor. Existing mappings are kept and skipped
            silently — re-running this is safe.
          </DialogDescription>
        </DialogHeader>

        {skippedRoleOnlyCount > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            {skippedRoleOnlyCount} of {counselors.length} selected row
            {counselors.length === 1 ? ' is' : 's are'} role-only (no counselor
            record yet) and will be skipped. Add them via the Add Counselor
            dialog first.
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sources by name or key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            {sourceCount > 0 ? (
              <>
                <span className="font-medium text-foreground">{sourceCount}</span>{' '}
                source{sourceCount === 1 ? '' : 's'} ·{' '}
                <span className="font-medium text-foreground">{totalNewMappings}</span>{' '}
                pairing{totalNewMappings === 1 ? '' : 's'} to attempt
              </>
            ) : (
              'No sources selected'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={selectAllVisible}
              disabled={isLoading || isSaving || filtered.length === 0}
            >
              Select all visible
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearSelection}
              disabled={isSaving || selectedSourceIds.size === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading sources…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
              {search
                ? 'No sources match your search'
                : 'No active sources available for this institution'}
            </div>
          ) : (
            filtered.map((s) => {
              const isSelected = selectedSourceIds.has(s.id);
              const interactive = !isSaving;
              return (
                <div
                  key={s.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-disabled={!interactive}
                  aria-label={`Select ${s.label}`}
                  tabIndex={interactive ? 0 : -1}
                  onClick={() => interactive && toggleSelection(s.id)}
                  onKeyDown={(e) => {
                    if (!interactive) return;
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggleSelection(s.id);
                    }
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    interactive && 'cursor-pointer hover:bg-accent',
                    isSelected && 'bg-accent border-l-2 border-l-primary',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={isSaving}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{s.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {s.key}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={
              sourceCount === 0 ||
              counselorCount === 0 ||
              isSaving ||
              isLoading
            }
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sourceCount === 0
              ? 'Assign to sources'
              : `Assign ${counselorCount} × ${sourceCount} (${totalNewMappings})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CounselorList({ onRefresh, institutionId, isGlobalUser }: CounselorListProps) {
  const supabase = createClientSupabaseClient();
  const router = useRouter();
  const { canAccess } = usePermissions();
  const canDelete = canAccess('admission', 'counselors.delete');

  const [refetchKey, setRefetchKey] = useState(0);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Advanced filter state. Filters are applied inside fetchData (closure
  // captures these), and any change bumps refetchKey so the DataTable
  // re-runs with the new filter set.
  // Default to 'active' so soft-deleted (removed) counselors disappear from
  // the Manage tab by default. Users who need to audit deactivated counselors
  // can switch the Status filter to 'inactive' or 'all'.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [sourcesFilter, setSourcesFilter] = useState<SourcesFilter>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [dialog, setDialog] = useState<GuardrailDialogState>({
    open: false,
    mode: 'toggle',
    counselor: null,
  });
  const [impact, setImpact] = useState<ImpactPreview | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const [editTarget, setEditTarget] = useState<CounselorRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [sourcePickerCounselor, setSourcePickerCounselor] =
    useState<CounselorRecord | null>(null);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  const [bulkDialog, setBulkDialog] = useState<BulkDialogState>({
    open: false,
    mode: 'deactivate',
    rows: [],
    isRunning: false,
  });

  // Separate from the destructive bulk dialog: this one is a non-destructive
  // multi-counselor × multi-source mapper. Kept distinct so the destructive
  // dialog's mode/typed-confirm logic stays simple.
  const [bulkAssignDialog, setBulkAssignDialog] = useState<{
    open: boolean;
    rows: CounselorRecord[];
  }>({ open: false, rows: [] });

  const [detailsCounselor, setDetailsCounselor] = useState<CounselorRecord | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  const openDetailsDialog = useCallback((c: CounselorRecord) => {
    setDetailsCounselor(c);
    setDetailsOpen(true);
  }, []);

  const fetchCounselors = useCallback(async (): Promise<CounselorRecord[]> => {
    let counselorQuery = supabase
      .from('admission_counselors')
      .select(`
        id, name, email, phone, is_active, max_leads, current_leads, specializations,
        institution_id, user_id, created_at,
        institutions(name)
      `)
      .order('name');

    if (!isGlobalUser && institutionId) {
      counselorQuery = counselorQuery.eq('institution_id', institutionId);
    }

    const { data, error } = await counselorQuery;
    if (error) {
      toast.error('Failed to load counselors');
      console.error('[admission/counselors] Failed to fetch counselors:', error);
      return [];
    }

    const records = (data || []) as unknown as CounselorRecord[];

    // Enrichment: surface users with a counsellor role who aren't in
    // admission_counselors yet (Add Counselor dialog can grant roles before
    // the table row exists, and v3 RPC stopped mirroring profiles.role).
    const { data: counselorRoles } = await supabase
      .from('custom_roles')
      .select('id')
      .in('role_key', [
        'admission_counselor',
        'expo_counselor',
        'learner_counselor',
        'staff_counselor',
      ]);

    if (counselorRoles && counselorRoles.length > 0) {
      const counselorRoleIds = counselorRoles.map((r: any) => r.id);
      const { data: roleAssignments } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role_id', counselorRoleIds);

      const roleUserIds = (roleAssignments || []).map((r: any) => r.user_id);
      const existingUserIds = new Set(records.filter((c) => c.user_id).map((c) => c.user_id));
      const missingUserIds = roleUserIds.filter((uid: string) => !existingUserIds.has(uid));

      if (missingUserIds.length > 0) {
        let profileQuery = supabase
          .from('profiles')
          .select('id, full_name, email, phone_number, role, institution_id')
          .in('id', missingUserIds);

        if (!isGlobalUser && institutionId) {
          profileQuery = profileQuery.eq('institution_id', institutionId);
        }

        const { data: missingProfiles } = await profileQuery;

        const instIds = [
          ...new Set((missingProfiles || []).map((p: any) => p.institution_id).filter(Boolean)),
        ];
        const instMap = new Map<string, string>();
        if (instIds.length > 0) {
          const { data: insts } = await supabase
            .from('institutions')
            .select('id, name')
            .in('id', instIds);
          if (insts) {
            for (const inst of insts as any[]) {
              instMap.set(inst.id, inst.name);
            }
          }
        }

        for (const profile of (missingProfiles || []) as any[]) {
          records.push({
            id: `role-${profile.id}`,
            name: profile.full_name || profile.email || '',
            email: profile.email,
            phone: profile.phone_number,
            is_active: true,
            max_leads: 5000,
            current_leads: 0,
            assigned_lead_count: 0,
            sources_count: 0,
            specializations: null,
            institution_id: profile.institution_id || '',
            user_id: profile.id,
            created_at: '',
            institutions: profile.institution_id
              ? { name: instMap.get(profile.institution_id) || '' }
              : null,
            profile_role: profile.role,
            profile_full_name: profile.full_name,
          });
        }
      }
    }

    // Backfill profile_role for table-based rows that haven't been enriched yet.
    const userIds = records
      .filter((c) => c.user_id && !c.profile_role)
      .map((c) => c.user_id as string);

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .in('id', userIds);

      if (profiles) {
        const profileMap = new Map<string, { role: string | null; full_name: string | null }>();
        for (const p of profiles as Array<{
          id: string;
          role: string | null;
          full_name: string | null;
        }>) {
          profileMap.set(p.id, { role: p.role, full_name: p.full_name });
        }

        for (const counselor of records) {
          if (counselor.user_id && !counselor.profile_role && profileMap.has(counselor.user_id)) {
            const prof = profileMap.get(counselor.user_id)!;
            counselor.profile_role = prof.role;
            counselor.profile_full_name = prof.full_name;
          }
        }
      }
    }

    // Live assigned-lead counts. The denormalized current_leads counter on
    // admission_counselors has a history of trigger drift — we count
    // admission_leads.assigned_counselor_id directly. Different writers populate
    // that column with either profiles.id (auth.uid()) or admission_counselors.id,
    // so each counselor contributes BOTH candidate ids and we sum the matching
    // buckets. This previously fired one HEAD COUNT per counselor (N+1 — ~100
    // serialized round-trips that left the table stuck on its loading skeleton);
    // now a single get_counselor_assigned_lead_counts RPC aggregates the counts
    // server-side in one round-trip. The RPC is SECURITY INVOKER so RLS on
    // admission_leads still applies — visible counts are identical, just faster.
    const assignedCandidateIds = Array.from(
      new Set(
        records.flatMap((c) => {
          const ids: string[] = [];
          if (c.user_id) ids.push(c.user_id);
          if (!c.id.startsWith('role-')) ids.push(c.id);
          return ids;
        }),
      ),
    );

    if (assignedCandidateIds.length > 0) {
      const { data: assignedRows, error: assignedErr } = await (supabase as any).rpc(
        'get_counselor_assigned_lead_counts',
        { p_ids: assignedCandidateIds },
      );
      if (assignedErr) {
        // Non-fatal: keep rows visible with a 0 fallback.
        console.warn('[admission/counselors] assigned-lead counts failed', assignedErr);
        for (const c of records) c.assigned_lead_count = 0;
      } else {
        const countById = new Map<string, number>();
        for (const row of (assignedRows ?? []) as Array<{
          assigned_counselor_id: string;
          lead_count: number | string;
        }>) {
          countById.set(row.assigned_counselor_id, Number(row.lead_count) || 0);
        }
        for (const c of records) {
          let total = 0;
          if (c.user_id) total += countById.get(c.user_id) ?? 0;
          if (!c.id.startsWith('role-')) total += countById.get(c.id) ?? 0;
          c.assigned_lead_count = total;
        }
      }
    } else {
      for (const c of records) c.assigned_lead_count = 0;
    }

    // Live source-mapping counts. One batched query for all counselors —
    // admission_counselor_sources keys solely on counselor_id (no dual-FK
    // ambiguity), so we fetch every row for the visible IDs in one round-
    // trip and group client-side. Role-only rows can't have mappings (no
    // admission_counselors row to FK to), so they stay at 0.
    const realCounselorIds = records
      .filter((c) => !c.id.startsWith('role-'))
      .map((c) => c.id);

    if (realCounselorIds.length > 0) {
      const { data: mappingRows, error: mapErr } = await supabase
        .from('admission_counselor_sources')
        .select('counselor_id')
        .in('counselor_id', realCounselorIds);

      if (mapErr) {
        console.warn('[admission/counselors] sources_count batch failed', mapErr);
        for (const c of records) c.sources_count = c.sources_count ?? 0;
      } else {
        const counts = new Map<string, number>();
        for (const row of (mappingRows ?? []) as Array<{ counselor_id: string }>) {
          counts.set(row.counselor_id, (counts.get(row.counselor_id) ?? 0) + 1);
        }
        for (const c of records) {
          c.sources_count = counts.get(c.id) ?? 0;
        }
      }
    } else {
      for (const c of records) c.sources_count = c.sources_count ?? 0;
    }

    records.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return records;
  }, [supabase, institutionId, isGlobalUser]);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const all = await fetchCounselors();

      let rows = all;
      if (params.search) {
        const q = params.search.toLowerCase();
        rows = rows.filter(
          (c) =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q),
        );
      }

      if (statusFilter === 'active') {
        rows = rows.filter((c) => c.is_active);
      } else if (statusFilter === 'inactive') {
        rows = rows.filter((c) => !c.is_active);
      }

      if (assignmentFilter === 'has_leads') {
        rows = rows.filter((c) => (c.assigned_lead_count ?? 0) > 0);
      } else if (assignmentFilter === 'no_leads') {
        rows = rows.filter((c) => (c.assigned_lead_count ?? 0) === 0);
      }

      if (sourcesFilter === 'has_sources') {
        rows = rows.filter((c) => (c.sources_count ?? 0) > 0);
      } else if (sourcesFilter === 'no_sources') {
        rows = rows.filter((c) => (c.sources_count ?? 0) === 0);
      }

      if (roleFilter !== 'all') {
        if (roleFilter === 'no_profile') {
          rows = rows.filter((c) => !c.profile_role);
        } else {
          rows = rows.filter(
            (c) => (c.profile_role || '').toLowerCase() === roleFilter,
          );
        }
      }

      const sortBy = params.sort_by || 'name';
      const dir = params.sort_order === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = (a as any)[sortBy];
        const bv = (b as any)[sortBy];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });

      const total = rows.length;
      const page = Math.max(params.page, 1);
      const limit = params.limit;
      const start = (page - 1) * limit;
      const paged = rows.slice(start, start + limit);

      return {
        success: true,
        data: paged,
        pagination: {
          page,
          limit,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          total_items: total,
        },
      };
    },
    [fetchCounselors, statusFilter, assignmentFilter, sourcesFilter, roleFilter],
  );

  useEffect(() => {
    setRefetchKey((k) => k + 1);
  }, [institutionId, isGlobalUser, statusFilter, assignmentFilter, sourcesFilter, roleFilter]);

  const openGuardrailDialog = useCallback(
    async (mode: GuardrailMode, counselor: CounselorRecord) => {
      if (mode === 'toggle' && counselor.id.startsWith('role-')) {
        toast.error(
          'This counselor has no table record. Add them via "Add Counselor" first to manage their status.',
        );
        return;
      }
      setDialog({ open: true, mode, counselor });
      setConfirmInput('');
      setImpact(null);

      const isActivate = mode === 'toggle' && !counselor.is_active;
      const isRoleOnly = counselor.id.startsWith('role-');
      if (isActivate) return;
      if (isRoleOnly && !counselor.user_id) return;

      setIsLoadingImpact(true);
      try {
        const url = `/api/admission/counselors/${encodeURIComponent(counselor.id)}?action=impact${
          counselor.user_id ? `&user_id=${encodeURIComponent(counselor.user_id)}` : ''
        }`;
        const res = await fetch(url);
        if (res.ok) {
          const json = (await res.json()) as ImpactPreview;
          setImpact(json);
        } else {
          setImpact({
            assigned_leads: 0,
            call_logs: 0,
            callback_queue: 0,
            counselor_record_leads: 0,
            counselor_full_name: counselor.name,
            counselor_email: counselor.email,
          });
        }
      } catch (err) {
        console.warn('[admission/counselors] impact preview failed', err);
        setImpact({
          assigned_leads: 0,
          call_logs: 0,
          callback_queue: 0,
          counselor_record_leads: 0,
          counselor_full_name: counselor.name,
          counselor_email: counselor.email,
        });
      } finally {
        setIsLoadingImpact(false);
      }
    },
    [],
  );

  const closeGuardrailDialog = useCallback(() => {
    setDialog({ open: false, mode: 'toggle', counselor: null });
    setConfirmInput('');
    setImpact(null);
  }, []);

  const openEditDialog = useCallback((counselor: CounselorRecord) => {
    if (counselor.id.startsWith('role-')) {
      toast.error('No counselor record exists yet for this user. Add them first.');
      return;
    }
    setEditTarget(counselor);
    setEditOpen(true);
  }, []);

  // Open the source-picker dialog. The dialog handles the actual mapping
  // insert via CounselorSourceService.bulkAttach, then calls onAssigned
  // with the chosen sourceId — which we use to navigate to the source
  // detail page where the admin can manually assign individual leads.
  const assignToSource = useCallback((counselor: CounselorRecord) => {
    if (counselor.id.startsWith('role-')) {
      toast.error(
        'No counselor record exists for this user yet. Add them first via "Add Counselor".',
      );
      return;
    }
    setSourcePickerCounselor(counselor);
    setSourcePickerOpen(true);
  }, []);

  const performToggle = async (counselor: CounselorRecord) => {
    setTogglingIds((prev) => new Set(prev).add(counselor.id));
    try {
      const { error } = await supabase
        .from('admission_counselors')
        .update({ is_active: !counselor.is_active })
        .eq('id', counselor.id);

      if (error) {
        toast.error('Failed to update counselor status');
        console.error('[admission/counselors] Failed to toggle active:', error);
        return;
      }

      toast.success(counselor.is_active ? 'Counselor deactivated' : 'Counselor activated');
      setRefetchKey((k) => k + 1);
      onRefresh?.();
    } catch {
      toast.error('Failed to update counselor status');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(counselor.id);
        return next;
      });
    }
  };

  const performRemove = async (counselor: CounselorRecord) => {
    setRemovingId(counselor.id);
    try {
      const isRoleOnly = counselor.id.startsWith('role-');

      let leadsUnassigned = 0;
      if (!isRoleOnly) {
        const res = await fetch(
          `/api/admission/counselors/${encodeURIComponent(counselor.id)}`,
          { method: 'DELETE' },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json?.message || 'Failed to remove counselor');
          console.error('[admission/counselors] Soft-delete failed:', json);
          return;
        }
        leadsUnassigned = Number(json?.leads_unassigned ?? 0);
      }

      if (counselor.user_id) {
        const { data: counselorRoles } = await supabase
          .from('custom_roles')
          .select('id')
          .in('role_key', ['admission_counselor', 'expo_counselor']);

        if (counselorRoles && counselorRoles.length > 0) {
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', counselor.user_id)
            .in('role_id', counselorRoles.map((r: any) => r.id));
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', counselor.user_id)
          .single();

        if (profile?.role === 'admission_counselor' || profile?.role === 'expo_counselor') {
          const { data: remainingRoles } = await supabase
            .from('user_roles')
            .select('custom_roles!inner(role_key)')
            .eq('user_id', counselor.user_id)
            .eq('is_primary', true)
            .limit(1);

          const nextRole = (remainingRoles as any)?.[0]?.custom_roles?.role_key || 'guest';

          await supabase
            .from('profiles')
            .update({ role: nextRole })
            .eq('id', counselor.user_id);
        }
      }

      toast.success(
        leadsUnassigned > 0
          ? `Counselor removed — ${leadsUnassigned} lead${
              leadsUnassigned === 1 ? '' : 's'
            } returned to the unassigned pool`
          : 'Counselor removed (no assigned leads to unlink)',
      );
      setRefetchKey((k) => k + 1);
      onRefresh?.();
    } catch {
      toast.error('Failed to remove counselor');
    } finally {
      setRemovingId(null);
    }
  };

  const handleConfirm = async () => {
    if (!dialog.counselor) return;
    const counselor = dialog.counselor;
    const mode = dialog.mode;
    closeGuardrailDialog();
    if (mode === 'toggle') {
      await performToggle(counselor);
    } else {
      await performRemove(counselor);
    }
  };

  // Bulk actions: skip the typed-confirm gate (unwieldy for N rows). Use
  // Promise.allSettled so a single RLS-denied row doesn't abort the batch.
  const runBulk = async () => {
    if (bulkDialog.rows.length === 0) return;
    setBulkDialog((prev) => ({ ...prev, isRunning: true }));
    const rows = bulkDialog.rows;
    const mode = bulkDialog.mode;

    let successCount = 0;
    let failCount = 0;

    if (mode === 'deactivate') {
      const tableRows = rows.filter((r) => !r.id.startsWith('role-'));
      const skipped = rows.length - tableRows.length;
      const results = await Promise.allSettled(
        tableRows.map((r) =>
          supabase
            .from('admission_counselors')
            .update({ is_active: false })
            .eq('id', r.id)
            .then(({ error }) => {
              if (error) throw error;
            }),
        ),
      );
      for (const res of results) {
        if (res.status === 'fulfilled') successCount += 1;
        else failCount += 1;
      }
      if (skipped > 0) {
        toast(
          `Skipped ${skipped} role-only row${skipped === 1 ? '' : 's'} (no counselor record)`,
        );
      }
    } else {
      // remove (soft-delete via DELETE endpoint) — skips role-only rows.
      const tableRows = rows.filter((r) => !r.id.startsWith('role-'));
      const skipped = rows.length - tableRows.length;
      const results = await Promise.allSettled(
        tableRows.map(async (r) => {
          const res = await fetch(
            `/api/admission/counselors/${encodeURIComponent(r.id)}`,
            { method: 'DELETE' },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),
      );
      for (const res of results) {
        if (res.status === 'fulfilled') successCount += 1;
        else failCount += 1;
      }
      if (skipped > 0) {
        toast(
          `Skipped ${skipped} role-only row${skipped === 1 ? '' : 's'} (no counselor record)`,
        );
      }
    }

    if (successCount > 0) {
      toast.success(
        `${successCount} counselor${successCount === 1 ? '' : 's'} ${
          mode === 'deactivate' ? 'deactivated' : 'removed'
        }`,
      );
    }
    if (failCount > 0) {
      toast.error(
        `${failCount} ${mode === 'deactivate' ? 'deactivation' : 'removal'} failure${
          failCount === 1 ? '' : 's'
        } — check console`,
      );
    }

    setBulkDialog({ open: false, mode: 'deactivate', rows: [], isRunning: false });
    setRefetchKey((k) => k + 1);
    onRefresh?.();
  };

  const actionsCtx = useMemo<CounselorActionsContext>(
    () => ({
      togglingIds,
      removingId,
      canDelete,
      openGuardrailDialog,
      openEditDialog,
      assignToSource,
      openDetailsDialog,
    }),
    [
      togglingIds,
      removingId,
      canDelete,
      openGuardrailDialog,
      openEditDialog,
      assignToSource,
      openDetailsDialog,
    ],
  );

  const hasActiveFilters =
    statusFilter !== 'all' ||
    assignmentFilter !== 'all' ||
    sourcesFilter !== 'all' ||
    roleFilter !== 'all';

  const clearFilters = () => {
    setStatusFilter('all');
    setAssignmentFilter('all');
    setSourcesFilter('all');
    setRoleFilter('all');
  };

  const renderToolbarContent = useCallback(
    (props: {
      selectedRows: CounselorRecord[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => {
      if (props.totalSelectedCount === 0) return null;
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {props.totalSelectedCount} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              setBulkAssignDialog({
                open: true,
                rows: props.selectedRows,
              })
            }
          >
            <ArrowRightCircle className="mr-1.5 h-3.5 w-3.5" />
            Assign to Sources
          </Button>
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() =>
                setBulkDialog({
                  open: true,
                  mode: 'deactivate',
                  rows: props.selectedRows,
                  isRunning: false,
                })
              }
            >
              <ToggleRight className="mr-1.5 h-3.5 w-3.5" />
              Deactivate
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/5"
              onClick={() =>
                setBulkDialog({
                  open: true,
                  mode: 'remove',
                  rows: props.selectedRows,
                  isRunning: false,
                })
              }
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>
      );
    },
    [canDelete],
  );

  return (
    <CounselorActionsCtx.Provider value={actionsCtx}>
      {/* Advanced filter strip — sits above the DataTable's own search/export
          toolbar so the two surfaces compose. Filter state lives in the
          parent and feeds fetchData via closure; any change bumps refetchKey
          to re-run the fetch. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground pr-1">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters</span>
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={assignmentFilter}
          onValueChange={(v) => setAssignmentFilter(v as AssignmentFilter)}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Assignment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Counselors</SelectItem>
            <SelectItem value="has_leads">Assigned (has leads)</SelectItem>
            <SelectItem value="no_leads">Unassigned (no leads)</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sourcesFilter}
          onValueChange={(v) => setSourcesFilter(v as SourcesFilter)}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="has_sources">Has sources mapped</SelectItem>
            <SelectItem value="no_sources">Unassigned (no sources)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v)}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}

        {hasActiveFilters && (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {statusFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px]">
                Status: {statusFilter}
              </Badge>
            )}
            {assignmentFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px]">
                Leads: {assignmentFilter === 'has_leads' ? 'has' : 'none'}
              </Badge>
            )}
            {sourcesFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px]">
                Sources: {sourcesFilter === 'has_sources' ? 'has' : 'none'}
              </Badge>
            )}
            {roleFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px]">
                Role:{' '}
                {ROLE_FILTER_OPTIONS.find((o) => o.value === roleFilter)?.label ??
                  roleFilter}
              </Badge>
            )}
          </div>
        )}
      </div>

      <DataTable
        fetchDataFn={fetchData as any}
        getColumns={() => counselorColumns as any}
        refetchKey={refetchKey}
        idField="id"
        exportConfig={COUNSELOR_EXPORT_CONFIG}
        renderToolbarContent={renderToolbarContent as any}
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          columnResizingTableId: 'admission-counselors-table',
        }}
      />

      <EditCounselorDialog
        counselor={editTarget}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditTarget(null);
        }}
        onSaved={() => {
          setRefetchKey((k) => k + 1);
          onRefresh?.();
        }}
      />

      <AssignToSourceDialog
        counselor={sourcePickerCounselor}
        open={sourcePickerOpen}
        onOpenChange={(open) => {
          setSourcePickerOpen(open);
          if (!open) setSourcePickerCounselor(null);
        }}
        institutionId={institutionId}
        isGlobalUser={isGlobalUser}
        onSaved={() => {
          // Multi-select makes a single-source redirect ambiguous, so we
          // stay on the counselor list and just refresh — the user can
          // open any of the mapped sources from the sources page.
          setRefetchKey((k) => k + 1);
          onRefresh?.();
        }}
      />

      <BulkAssignToSourcesDialog
        counselors={bulkAssignDialog.rows}
        open={bulkAssignDialog.open}
        onOpenChange={(open) => {
          setBulkAssignDialog((prev) =>
            open ? { ...prev, open } : { open: false, rows: [] },
          );
        }}
        institutionId={institutionId}
        isGlobalUser={isGlobalUser}
        onSaved={() => {
          setRefetchKey((k) => k + 1);
          onRefresh?.();
        }}
      />

      <CounselorDetailsDialog
        counselor={detailsCounselor}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsCounselor(null);
        }}
      />

      {/* Bulk-action confirmation dialog. Skips typed-confirm — the row count
          and explicit button label provide the gate; per-row guardrail is
          still available via the row actions menu for high-stakes single
          operations. */}
      <AlertDialog
        open={bulkDialog.open}
        onOpenChange={(open) => {
          if (!open && !bulkDialog.isRunning) {
            setBulkDialog({ open: false, mode: 'deactivate', rows: [], isRunning: false });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDialog.mode === 'deactivate'
                ? `Deactivate ${bulkDialog.rows.length} counselor${bulkDialog.rows.length === 1 ? '' : 's'}?`
                : `Remove ${bulkDialog.rows.length} counselor${bulkDialog.rows.length === 1 ? '' : 's'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  {bulkDialog.mode === 'deactivate'
                    ? 'Selected counselors will be marked inactive. They will stop receiving new lead assignments. This is reversible.'
                    : 'Selected counselors will be soft-deleted: marked inactive and audit-logged. Counselor and admission roles will be cleared. Lead history remains queryable.'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Role-only rows (users with a counsellor role but no
                  admission_counselors record) will be skipped automatically.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDialog.isRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
              disabled={bulkDialog.isRunning}
              onClick={(e) => {
                e.preventDefault();
                runBulk();
              }}
            >
              {bulkDialog.isRunning && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {bulkDialog.mode === 'deactivate' ? 'Deactivate all' : 'Remove all'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) closeGuardrailDialog();
        }}
      >
        <AlertDialogContent>
          {dialog.counselor &&
            (() => {
              const counselor = dialog.counselor;
              const mode = dialog.mode;
              const isToggleMode = mode === 'toggle';
              const willActivate = isToggleMode && !counselor.is_active;
              const requiredKeyword = isToggleMode
                ? willActivate
                  ? 'ACTIVATE'
                  : 'DEACTIVATE'
                : 'REMOVE';
              const isConfirmed = confirmInput === requiredKeyword;
              const title = isToggleMode
                ? willActivate
                  ? 'Activate Counselor'
                  : 'Deactivate Counselor'
                : 'Remove Counselor';
              const actionWord = isToggleMode
                ? willActivate
                  ? 'activate'
                  : 'deactivate'
                : 'remove';
              const showImpact = !willActivate;
              const totalImpact =
                (impact?.assigned_leads ?? 0) +
                (impact?.call_logs ?? 0) +
                (impact?.callback_queue ?? 0) +
                (impact?.counselor_record_leads ?? 0);

              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <div>
                          You are about to {actionWord}{' '}
                          <span className="font-medium text-foreground">{counselor.name}</span>
                          {counselor.email && (
                            <>
                              {' '}
                              <span className="text-muted-foreground">({counselor.email})</span>
                            </>
                          )}
                          .
                        </div>

                        {showImpact && (
                          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                            <div className="font-medium text-foreground">Impact preview</div>
                            {isLoadingImpact ? (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Calculating impact…</span>
                              </div>
                            ) : impact ? (
                              <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                                <li>
                                  <span className="text-foreground font-medium">
                                    {impact.assigned_leads}
                                  </span>{' '}
                                  assigned lead{impact.assigned_leads === 1 ? '' : 's'} will lose
                                  their counselor link
                                </li>
                                <li>
                                  <span className="text-foreground font-medium">
                                    {impact.call_logs}
                                  </span>{' '}
                                  historical call log{impact.call_logs === 1 ? '' : 's'} reference
                                  this counselor
                                </li>
                                <li>
                                  <span className="text-foreground font-medium">
                                    {impact.callback_queue}
                                  </span>{' '}
                                  callback queue item{impact.callback_queue === 1 ? '' : 's'}{' '}
                                  assigned to them
                                </li>
                                {impact.counselor_record_leads > 0 && (
                                  <li>
                                    <span className="text-foreground font-medium">
                                      {impact.counselor_record_leads}
                                    </span>{' '}
                                    lead{impact.counselor_record_leads === 1 ? '' : 's'} linked
                                    via counselor record
                                  </li>
                                )}
                                {totalImpact === 0 && (
                                  <li className="list-none text-muted-foreground italic">
                                    No active leads or recent activity will be affected.
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <div className="text-muted-foreground italic">
                                Impact data unavailable.
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          {isToggleMode
                            ? 'This change is recorded in the counselors audit log.'
                            : 'This is a soft-delete: the record is retained, marked inactive, and recorded in the counselors audit log. Lead history remains queryable.'}
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <label
                            htmlFor="counselor-guardrail-confirm"
                            className="text-sm font-medium text-foreground block"
                          >
                            Type{' '}
                            <span className="font-mono font-semibold">{requiredKeyword}</span>{' '}
                            to confirm
                          </label>
                          <Input
                            id="counselor-guardrail-confirm"
                            value={confirmInput}
                            onChange={(e) => setConfirmInput(e.target.value)}
                            placeholder={requiredKeyword}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className={
                        willActivate
                          ? ''
                          : 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
                      }
                      disabled={!isConfirmed}
                      onClick={(e) => {
                        if (!isConfirmed) {
                          e.preventDefault();
                          return;
                        }
                        handleConfirm();
                      }}
                    >
                      {isToggleMode
                        ? willActivate
                          ? 'Activate'
                          : 'Deactivate'
                        : 'Remove'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
        </AlertDialogContent>
      </AlertDialog>
    </CounselorActionsCtx.Provider>
  );
}
