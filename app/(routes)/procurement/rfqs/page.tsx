'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { FilterBar } from '@/components/procurement/page-header';
import { useMyApprovals } from '@/hooks/procurement/use-approval-chains';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { RFQ_STATUS_CONFIG, type ProcurementRfq, type RfqStatus, type RfqFilters } from '@/types/procurement';
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
import { Plus, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

/** `Keyboard, Mouse +2 more` — enough to recognise a request without flooding the dropdown. */
function summariseItems(names: string[], shown = 2): string {
  if (names.length === 0) return 'No items';
  const head = names.slice(0, shown).join(', ');
  return names.length > shown ? `${head} +${names.length - shown} more` : head;
}

/**
 * Where a quotation is, in plain words. The stored status stays "draft" until the
 * choice goes to the Super Admin, so "has quotes" and "was sent back" come from the
 * row itself.
 */
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  ...RFQ_STATUS_CONFIG,
  comparing: { label: 'Comparing quotes', color: 'purple' },
  sent_back: { label: 'Sent back by Super Admin', color: 'red' },
};

function stageOf(rfq: ProcurementRfq): string {
  const open = ['draft', 'pending_review', 'approved', 'rejected', 'sent', 'quotations_received', 'compared'];
  if (!open.includes(rfq.status)) return rfq.status;
  if (rfq.award_rejection_reason) return 'sent_back';
  return (rfq.quote_count ?? 0) > 0 ? 'comparing' : 'draft';
}

/** "Keyboard × 5" · "Keyboard × 5, Mouse × 2" · "Keyboard × 5 + 3 more" */
function whatIsNeeded(rfq: ProcurementRfq): string {
  const items = rfq.item_preview ?? [];
  if (!items.length) return `${rfq.item_count ?? 0} item${rfq.item_count === 1 ? '' : 's'}`;
  const fmt = (i: { item_name: string; quantity: number }) => `${i.item_name} × ${Number(i.quantity)}`;
  if (items.length <= 2) return items.map(fmt).join(', ');
  return `${fmt(items[0])} + ${items.length - 1} more`;
}

/** Stage filter: one entry per plain stage (the retired statuses share labels). */
const STAGE_FILTERS: Array<{ value: RfqStatus; label: string }> = [
  { value: 'draft', label: 'Waiting for quotes / comparing' },
  { value: 'pending_award_approval', label: 'Waiting for Super Admin' },
  { value: 'awarded', label: 'Ordered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function RfqsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'rfq_manage');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const searchParams = useSearchParams();
  // The Status dropdown's first choice is "Waiting for you" (not a status — worked
  // out below from My approvals), and the page opens on it. The Overview status
  // bars link here with ?institution=<id|all>&status=<status>, which opens on that
  // status instead.
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') ?? 'waiting');
  const waitingForMe = statusFilter === 'waiting';
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    () => searchParams.get('institution') ?? undefined
  );
  // 'all' = every college the viewer may see (RLS scopes the rows). effectiveInstitution
  // stays a concrete college for anything that creates a document.
  const allColleges = institutionId === 'all';
  const effectiveInstitution =
    (institutionId && !allColleges ? institutionId : undefined) ?? profile?.institution_id ?? undefined;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPR, setSelectedPR] = useState<string>('');

  const filters: RfqFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' && !waitingForMe ? (statusFilter as RfqStatus) : undefined,
    institution_id: allColleges ? undefined : effectiveInstitution,
    all_institutions: allColleges,
    // "Waiting for you" is worked out here, so load enough rows for the counts to be true.
    limit: 200,
  };

  const { data: response, isLoading, isError } = useRfqs(filters);
  // "Waiting for you" = quotations whose final approval is this viewer's turn (same source as
  // My approvals, including the Super Admin's own final approvals).
  const { data: myApprovals = [] } = useMyApprovals();
  const finalIds = new Set(myApprovals.filter((a) => a.stage === 'final').map((a) => a.request_id));
  const isMine = (rfq: ProcurementRfq) => !!rfq.source_request_id && finalIds.has(rfq.source_request_id);
  const allRfqs = response?.data ?? [];
  // With a status picked the rows are only that status, so fall back to every
  // final approval waiting on this viewer for the dropdown's count.
  const waitingCount =
    waitingForMe || statusFilter === 'all' ? allRfqs.filter(isMine).length : finalIds.size;
  const rfqs = waitingForMe ? allRfqs.filter(isMine) : allRfqs;
  const { data: approvedPRs = [] } = useApprovedRequestsForSelect(effectiveInstitution);
  const createRfq = useCreateRfqFromPR();

  const handleCreate = async () => {
    if (!selectedPR || !profile?.id) return;
    try {
      const rfq = await createRfq.mutateAsync({ requestId: selectedPR, userId: profile.id });
      toast.success('Quotations opened for this request');
      setCreateOpen(false);
      setSelectedPR('');
      router.push(`/procurement/rfqs/${rfq.id}/quotations`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to get quotations'));
    }
  };

  return (
    <ContentLayout title="Quotations">
      <div className="w-full space-y-5">
        <FilterBar>
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search purchase no."
              aria-label="Search quotations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waiting">Waiting for you ({waitingCount})</SelectItem>
              <SelectItem value="all">All stages</SelectItem>
              {STAGE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InstitutionFilter
            value={allColleges ? 'all' : effectiveInstitution}
            onChange={setInstitutionId}
            allLabel="All colleges"
            label={null}
            className="w-full sm:w-52"
          />
          {/* The primary action ends the filter row instead of sitting alone above it. */}
          {canManage && (
            <Button className="h-9 w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Get quotations
            </Button>
          )}
        </FilterBar>

        <section className="overflow-hidden rounded-xl border bg-background shadow">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load quotations. Please try again." />
              </div>
            ) : rfqs.length === 0 ? (
              <EmptyState
                title={waitingForMe ? 'Nothing is waiting for you' : 'No quotations found'}
                description={
                  waitingForMe
                    ? 'Final approvals that need you appear here.'
                    : 'Get quotations for a request to get started.'
                }
              />
            ) : (
              <ResponsiveList
                rows={rfqs}
                getRowKey={(rfq) => rfq.id}
                onRowClick={(rfq) => router.push(`/procurement/rfqs/${rfq.id}/quotations`)}
                rowLabel={(rfq) => `View quotations for ${displayRequestNumber(rfq.source_request?.request_number) || rfq.rfq_number}`}
                columns={[
                  {
                    key: 'needed',
                    header: 'What is being bought',
                    mobile: 'title',
                    cell: (rfq) => (
                      <div className="min-w-0">
                        <p className="truncate font-medium">{whatIsNeeded(rfq)}</p>
                        <p className="text-xs text-muted-foreground">
                          {displayRequestNumber(rfq.source_request?.request_number) || rfq.rfq_number}
                        </p>
                      </div>
                    ),
                  },
                  { key: 'date', header: 'Date', cell: (rfq) => formatDateDMY(rfq.created_at) },
                  { key: 'quotes', header: 'Quotes received', cell: (rfq) => rfq.quote_count ?? 0 },
                  {
                    key: 'stage',
                    header: 'Where it is',
                    mobile: 'badge',
                    cell: (rfq) => <StatusBadge status={stageOf(rfq)} config={STAGE_CONFIG} />,
                  },
                ]}
              />
            )}
        </section>
      </div>

      {/* Create RFQ dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get quotations for a request</DialogTitle>
          </DialogHeader>
          {/* Institution chooser co-located with the PR picker: open requests are
              institution-scoped, so a multi-institution user must pick the institution
              here to see its open requests. Renders nothing for single-institution users. */}
          <InstitutionFilter
            value={effectiveInstitution}
            onChange={(id) => {
              setInstitutionId(id);
              setSelectedPR('');
            }}
            hint="Open requests are shown for this institution."
          />
          <div className="space-y-2">
            <Label>Request</Label>
            <Select value={selectedPR} onValueChange={setSelectedPR}>
              <SelectTrigger>
                <SelectValue placeholder="Select a request..." />
              </SelectTrigger>
              <SelectContent>
                {approvedPRs.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No approved requests in this institution. A request must be approved first, or
                    switch institution above.
                  </div>
                ) : (
                  approvedPRs.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id} textValue={displayRequestNumber(pr.request_number)}>
                      <span className="font-medium">{displayRequestNumber(pr.request_number)}</span>
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
              {createRfq.isPending ? 'Getting quotations...' : 'Get quotations'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
