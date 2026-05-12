'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCampaigns } from '@/hooks/admission/use-campaigns';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FALLBACK_LEAD_SOURCE_LABELS } from '@/hooks/admission/use-active-lead-sources';
import type { Campaign, CampaignFilters } from '@/types/admission/campaign';
import type { LeadSource } from '@/types/admission';
import type { ColumnDef } from '@tanstack/react-table';

export const navMeta = {
  invokedFrom: '/admission/marketing',
} as const;

const columns: ColumnDef<Campaign>[] = [
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
    cell: ({ row }) => <Badge>{row.original.status}</Badge>,
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
];

export default function CampaignsListPage() {
  const [filters] = useState<CampaignFilters>({});
  const { data } = useCampaigns(filters);

  return (
    <PermissionGuard module="admission.campaigns" action="view">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">
              Acquisition campaigns with per-link attribution
            </p>
          </div>
          <PermissionGuard
            module="admission.campaigns"
            action="create"
          >
            <Link href="/admission/marketing/campaigns/new">
              <Button>+ Create Campaign</Button>
            </Link>
          </PermissionGuard>
        </div>
        <DataTable
          columns={columns}
          data={data ?? []}
          permissions={{ module: 'admission.campaigns' }}
          searchPlaceholder="Search campaigns..."
          filterColumn="name"
        />
      </div>
    </PermissionGuard>
  );
}
