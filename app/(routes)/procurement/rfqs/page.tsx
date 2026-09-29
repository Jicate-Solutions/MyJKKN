'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useRfqs,
  useApprovedRequestsForSelect,
  useCreateRfqFromPR,
} from '@/hooks/procurement/use-rfqs';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { PageHeader, FilterBar } from '@/components/procurement/page-header';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { RFQ_STATUS_CONFIG, type RfqStatus, type RfqFilters } from '@/types/procurement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Eye, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

/** `Keyboard, Mouse +2 more` — enough to recognise a request without flooding the dropdown. */
function summariseItems(names: string[], shown = 2): string {
  if (names.length === 0) return 'No items';
  const head = names.slice(0, shown).join(', ');
  return names.length > shown ? `${head} +${names.length - shown} more` : head;
}

export default function RfqsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'rfq_manage');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? undefined;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPR, setSelectedPR] = useState<string>('');

  const filters: RfqFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as RfqStatus) : undefined,
    institution_id: effectiveInstitution,
  };

  const { data: response, isLoading, isError } = useRfqs(filters);
  const rfqs = response?.data ?? [];
  const { data: approvedPRs = [] } = useApprovedRequestsForSelect(effectiveInstitution);
  const createRfq = useCreateRfqFromPR();

  const handleCreate = async () => {
    if (!selectedPR || !profile?.id) return;
    try {
      const rfq = await createRfq.mutateAsync({ requestId: selectedPR, userId: profile.id });
      toast.success(`RFQ ${rfq.rfq_number} created`);
      setCreateOpen(false);
      setSelectedPR('');
      router.push(`/procurement/rfqs/${rfq.id}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to create RFQ'));
    }
  };

  return (
    <ContentLayout title="RFQs">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Requests for Quotation"
          description="Convert approved requests into RFQs and issue requirement lists to vendors."
          actions={
            canManage && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New RFQ
              </Button>
            )
          }
        />

        <Card>
          <CardContent className="p-4 sm:p-6">
            <FilterBar>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by RFQ or PR number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(RFQ_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InstitutionFilter
                value={effectiveInstitution}
                onChange={setInstitutionId}
                label={null}
                className="w-full sm:w-[200px]"
              />
            </FilterBar>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load RFQs. Please try again." />
              </div>
            ) : rfqs.length === 0 ? (
              <EmptyState
                title="No RFQs found"
                description="Create an RFQ from an approved request to get started."
              />
            ) : (
              <ResponsiveList
                rows={rfqs}
                getRowKey={(rfq) => rfq.id}
                onRowClick={(rfq) => router.push(`/procurement/rfqs/${rfq.id}`)}
                rowLabel={(rfq) => `View RFQ ${rfq.rfq_number}`}
                columns={[
                  {
                    key: 'rfq',
                    header: 'RFQ #',
                    mobile: 'title',
                    className: 'font-medium',
                    cell: (rfq) => rfq.rfq_number,
                  },
                  { key: 'date', header: 'Date', cell: (rfq) => formatDateDMY(rfq.created_at) },
                  {
                    key: 'source',
                    header: 'Source Request',
                    cell: (rfq) => rfq.source_request?.request_number || '-',
                  },
                  { key: 'items', header: 'Items', cell: (rfq) => rfq.item_count ?? '-' },
                  { key: 'vendors', header: 'Vendors', cell: (rfq) => rfq.vendor_count ?? '-' },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (rfq) => <StatusBadge status={rfq.status} config={RFQ_STATUS_CONFIG} />,
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: (rfq) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`View RFQ ${rfq.rfq_number}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/procurement/rfqs/${rfq.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create RFQ dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create RFQ from approved request</DialogTitle>
          </DialogHeader>
          {/* Institution chooser co-located with the PR picker: approved requests are
              institution-scoped, so a multi-institution user must pick the institution
              here to see its approved requests. Renders nothing for single-institution users. */}
          <InstitutionFilter
            value={effectiveInstitution}
            onChange={(id) => {
              setInstitutionId(id);
              setSelectedPR('');
            }}
            hint="Approved requests are shown for this institution."
          />
          <div className="space-y-2">
            <Label>Approved purchase request</Label>
            <Select value={selectedPR} onValueChange={setSelectedPR}>
              <SelectTrigger>
                <SelectValue placeholder="Select an approved request..." />
              </SelectTrigger>
              <SelectContent>
                {approvedPRs.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No approved requests in this institution. Approve a request first, or
                    switch institution above.
                  </div>
                ) : (
                  approvedPRs.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id} textValue={pr.request_number}>
                      <span className="font-medium">{pr.request_number}</span>
                      <span className="text-muted-foreground"> · {summariseItems(pr.item_names)}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!selectedPR || createRfq.isPending}>
              {createRfq.isPending ? 'Creating...' : 'Create RFQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
