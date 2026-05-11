'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { TransferKpiCards } from './TransferKpiCards';
import { NewRequestSlideover } from './NewRequestSlideover';
import { useImsTransfers } from '@/hooks/ims/use-ims-transfers';
import { INDENT_STATUS_CONFIG } from '@/types/ims';
import type { ImsIndentStatus } from '@/types/ims';

interface CollegeRequestViewProps {
  storeId: string;
  institutionId: string;
  centralStoreId: string;
  centralInstitutionId: string;
}

export function CollegeRequestView({
  storeId,
  institutionId,
  centralStoreId,
  centralInstitutionId,
}: CollegeRequestViewProps) {
  const [statusFilter, setStatusFilter] = useState<ImsIndentStatus | undefined>();
  const [slideoverOpen, setSlideoverOpen] = useState(false);

  const { data, isLoading } = useImsTransfers({
    source_store_id: storeId,
    status: statusFilter,
  });

  const transfers = data?.data ?? [];

  const pending = transfers.filter(t => t.status === 'pending_approval' || t.status === 'pending_local_approval').length;
  const approved = transfers.filter(t => t.status === 'approved').length;
  const inTransit = transfers.filter(t => t.status === 'shipped').length;
  const fulfilled = transfers.filter(t => t.status === 'received' || t.status === 'received_with_variance').length;

  const kpiCards = [
    {
      label: 'Pending',
      value: pending,
      active: statusFilter === 'pending_approval',
      onClick: () => setStatusFilter(s => s === 'pending_approval' ? undefined : 'pending_approval'),
    },
    {
      label: 'Approved',
      value: approved,
      active: statusFilter === 'approved',
      onClick: () => setStatusFilter(s => s === 'approved' ? undefined : 'approved'),
    },
    {
      label: 'In Transit',
      value: inTransit,
      active: statusFilter === 'shipped',
      onClick: () => setStatusFilter(s => s === 'shipped' ? undefined : 'shipped'),
    },
    {
      label: 'Fulfilled',
      value: fulfilled,
      active: statusFilter === 'received',
      onClick: () => setStatusFilter(s => s === 'received' ? undefined : 'received'),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <TransferKpiCards cards={kpiCards} />
        </div>
        <Button onClick={() => setSlideoverOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          No transfer requests found. Click &quot;New Request&quot; to get started.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {transfers.map((t) => {
            const cfg = INDENT_STATUS_CONFIG[t.status];
            return (
              <Link
                key={t.id}
                href={`/ims/transfers/${t.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t.indent_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.purpose}</div>
                </div>
                <Badge variant={cfg.variant} className="shrink-0 ml-4">{cfg.label}</Badge>
              </Link>
            );
          })}
        </div>
      )}

      <NewRequestSlideover
        open={slideoverOpen}
        onClose={() => setSlideoverOpen(false)}
        storeId={storeId}
        institutionId={institutionId}
        centralStoreId={centralStoreId}
        centralInstitutionId={centralInstitutionId}
      />
    </div>
  );
}
