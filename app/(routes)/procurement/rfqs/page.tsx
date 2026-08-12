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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Requests for Quotation</h2>
            <p className="text-muted-foreground">
              Convert approved requests into RFQs and issue requirement lists to vendors.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New RFQ
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
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
            </div>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RFQ #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Source Request</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Vendors</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rfqs.map((rfq) => (
                    <TableRow key={rfq.id}>
                      <TableCell className="font-medium">{rfq.rfq_number}</TableCell>
                      <TableCell>{formatDateDMY(rfq.created_at)}</TableCell>
                      <TableCell>{rfq.source_request?.request_number || '-'}</TableCell>
                      <TableCell>{rfq.item_count ?? '-'}</TableCell>
                      <TableCell>{rfq.vendor_count ?? '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={rfq.status} config={RFQ_STATUS_CONFIG} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View RFQ ${rfq.rfq_number}`}
                          onClick={() => router.push(`/procurement/rfqs/${rfq.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                    <SelectItem key={pr.id} value={pr.id}>
                      {pr.request_number}
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
