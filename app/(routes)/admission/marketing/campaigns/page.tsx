'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useCampaigns,
  useArchiveCampaign,
} from '@/hooks/admission/use-campaigns';
import { CampaignService } from '@/lib/services/admission/campaign-service';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useActiveLeadSources,
  FALLBACK_LEAD_SOURCE_LABELS,
} from '@/hooks/admission/use-active-lead-sources';
import {
  CampaignsFilterBar,
  EMPTY_FILTERS,
  type CampaignsFilterState,
} from './_components/campaigns-filter-bar';
import type {
  Campaign,
  CampaignStatus,
} from '@/types/admission/campaign';
import type { LeadSource } from '@/types/admission';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Eye,
  Pencil,
  Archive,
  MoreHorizontal,
  Link2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const navMeta = {
  invokedFrom: '/admission/marketing',
} as const;

// Status badge colors — mirror the detail page hero so users see the
// same color story everywhere.
const STATUS_PILL: Record<CampaignStatus, string> = {
  draft:
    'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  active:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  paused:
    'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900',
  completed:
    'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800',
  archived:
    'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800',
};

// ─── Actions cell — own component so it can call mutation hooks ─────
//
// The row's actions cell needs the campaign id to bind useArchiveCampaign,
// and we want permission gates rendered conditionally rather than always
// mounted. Each menu item is wrapped in <PermissionGuard> with the exact
// (module, action) pair the dynamic permission system catalogs:
//   admission.marketing.view    — implicit (column visible to viewers)
//   admission.marketing.edit    — Edit campaign + Manage links + Attributed leads
//   (migrated 2026-05-13 from admission.campaigns.* dead namespace)
//   admission.marketing.delete  — Archive

function CampaignActionsCell({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const archive = useArchiveCampaign(campaign.id);

  async function handleArchive() {
    try {
      await archive.mutateAsync();
      toast.success(`Campaign "${campaign.name}" archived`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to archive campaign');
    }
    setConfirmOpen(false);
  }

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Open campaign actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Campaign actions</DropdownMenuLabel>
            {/* View — always available to anyone who can see the row */}
            <DropdownMenuItem
              onClick={() =>
                router.push(
                  `/admission/marketing/campaigns/${campaign.id}`,
                )
              }
            >
              <Eye className="mr-2 size-4" />
              View details
            </DropdownMenuItem>

            {/* Edit — gated by admission.marketing.edit.
                PermissionGuard's internal super_admin / admin /
                admission_global_user / counselor bypass means the items
                appear automatically for those roles without us needing
                to enumerate role keys here. */}
            <PermissionGuard
              module="admission.marketing"
              action="edit"
              fallback={null}
            >
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/admission/marketing/campaigns/${campaign.id}/edit`,
                  )
                }
              >
                <Pencil className="mr-2 size-4" />
                Edit campaign
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/admission/marketing/campaigns/${campaign.id}/links`,
                  )
                }
              >
                <Link2 className="mr-2 size-4" />
                Manage share links
              </DropdownMenuItem>
            </PermissionGuard>

            <PermissionGuard module="admission.marketing" action="view" fallback={null}>
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/admission/marketing/campaigns/${campaign.id}/leads`,
                  )
                }
              >
                <Users className="mr-2 size-4" />
                Attributed leads
              </DropdownMenuItem>
            </PermissionGuard>

            {/* Archive — gated by admission.marketing.delete.
                Hidden once the campaign is already archived. */}
            {campaign.status !== 'archived' && (
              <PermissionGuard
                module="admission.marketing"
                action="delete"
                fallback={null}
              >
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setConfirmOpen(true)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Archive className="mr-2 size-4" />
                  Archive campaign
                </DropdownMenuItem>
              </PermissionGuard>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this campaign?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  <strong>{campaign.name}</strong> will be hidden from
                  active lists. All attribution history is preserved.
                </p>
                <p className="mt-2 text-xs">
                  Active share links keep redirecting until you also
                  pause/deactivate them. Recommend pausing the campaign
                  first if you want clicks to stop being tracked.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={archive.isPending}
            >
              {archive.isPending ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Columns — declared inside the component so the Actions cell can
// close over hooks/router. (Static const at module-scope is fine for
// columns that never depend on React state, but the action column
// needs the per-row child component.)

function buildColumns(): ColumnDef<Campaign>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link
          href={`/admission/marketing/campaigns/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'scope',
      header: 'Scope',
      cell: ({ row }) =>
        row.original.scope === 'global' ? (
          <Badge variant="secondary">🌐 Global</Badge>
        ) : (
          <Badge variant="outline">Institution</Badge>
        ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => (
        <Badge variant="outline">
          {FALLBACK_LEAD_SOURCE_LABELS[row.original.source as LeadSource] ??
            row.original.source}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_PILL[row.original.status as CampaignStatus] ?? ''
          }`}
        >
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: 'starts_at',
      header: 'Start',
      cell: ({ row }) =>
        row.original.starts_at
          ? new Date(row.original.starts_at).toLocaleDateString()
          : '—',
    },
    {
      accessorKey: 'budget_inr',
      header: 'Budget',
      cell: ({ row }) =>
        row.original.budget_inr
          ? `₹${row.original.budget_inr.toLocaleString()}`
          : '—',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => <CampaignActionsCell campaign={row.original} />,
      enableSorting: false,
      enableHiding: false,
      size: 48,
    },
  ];
}

export default function CampaignsListPage() {
  const [filters, setFilters] =
    useState<CampaignsFilterState>(EMPTY_FILTERS);

  // Fetch from the server with only the archived toggle applied; every
  // other dimension is applied client-side over the resulting array
  // (admission campaign counts stay well under a paginated server query).
  const { data: campaignsRaw = [] } = useCampaigns({
    includeArchived: filters.includeArchived,
  });

  // Admin-curated source labels for the multi-select. Falls back to the
  // static label table when the master is empty.
  const { options: sourceOptionsLive } = useActiveLeadSources();
  const sourceOptions = useMemo(() => {
    if (sourceOptionsLive.length > 0) {
      return sourceOptionsLive.map((o) => ({
        value: o.value as LeadSource,
        label: o.label,
      }));
    }
    return (
      Object.keys(FALLBACK_LEAD_SOURCE_LABELS) as LeadSource[]
    ).map((v) => ({ value: v, label: FALLBACK_LEAD_SOURCE_LABELS[v] }));
  }, [sourceOptionsLive]);

  // Client-side multi-dimension filter (matches CampaignsFilterBar state).
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return campaignsRaw.filter((c) => {
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(c.status)
      ) {
        return false;
      }
      if (filters.scope !== 'all' && c.scope !== filters.scope) {
        return false;
      }
      if (
        filters.sources.length > 0 &&
        !filters.sources.includes(c.source as LeadSource)
      ) {
        return false;
      }
      if (q) {
        const hay = `${c.name} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [campaignsRaw, filters]);

  const columns = buildColumns();

  // ─── Bulk actions ───
  async function bulkArchive(rows: Campaign[]) {
    const archivable = rows.filter((r) => r.status !== 'archived');
    if (archivable.length === 0) {
      toast.error('No archivable campaigns in selection');
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const row of archivable) {
      try {
        await CampaignService.archive(row.id);
        ok++;
      } catch {
        fail++;
      }
    }
    if (ok) toast.success(`Archived ${ok} campaign${ok === 1 ? '' : 's'}`);
    if (fail) toast.error(`${fail} archive${fail === 1 ? '' : 's'} failed`);
  }

  async function bulkPause(rows: Campaign[]) {
    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      try {
        await CampaignService.update(row.id, { status: 'paused' });
        ok++;
      } catch {
        fail++;
      }
    }
    if (ok) toast.success(`Paused ${ok} campaign${ok === 1 ? '' : 's'}`);
    if (fail) toast.error(`${fail} update${fail === 1 ? '' : 's'} failed`);
  }

  return (
    <PermissionGuard module="admission.marketing" action="view">
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">
              Acquisition campaigns with per-link attribution ·{' '}
              <strong>{filtered.length}</strong> showing
              {filtered.length !== campaignsRaw.length && (
                <> of {campaignsRaw.length}</>
              )}
            </p>
          </div>
          <PermissionGuard
            module="admission.marketing"
            action="create"
            fallback={null}
          >
            <Link href="/admission/marketing/campaigns/new">
              <Button>+ Create Campaign</Button>
            </Link>
          </PermissionGuard>
        </div>

        <CampaignsFilterBar
          value={filters}
          onChange={setFilters}
          sourceOptions={sourceOptions}
        />

        <DataTable
          columns={columns}
          data={filtered}
          permissions={{ module: 'admission.marketing' }}
          searchPlaceholder="Quick filter by name…"
          filterColumn="name"
          onBulkAction={bulkArchive}
          bulkActionConfig={{
            label: 'Archive',
            variant: 'destructive',
            confirmTitle: 'Archive selected campaigns?',
            confirmDescription:
              'Selected campaigns will be hidden from active lists. Attribution history is preserved. Already-archived rows are skipped.',
            successMessage: 'Archived {count} campaign(s)',
            loadingText: 'Archiving…',
          }}
          secondaryBulkAction={{
            label: 'Pause selected',
            onClick: bulkPause,
          }}
        />
      </div>
    </PermissionGuard>
  );
}
