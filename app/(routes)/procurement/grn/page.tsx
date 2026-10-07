'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useGrns } from '@/hooks/procurement/use-grns';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { FilterBar } from '@/components/procurement/page-header';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { GRN_STATUS_CONFIG, type GrnStatus, type GrnFilters } from '@/types/procurement';
import { ReceiveSwitcher } from '@/components/procurement/receive-switcher';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function GrnListPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const searchParams = useSearchParams();
  // The Overview status bars link here with ?institution=<id|all>&status=<status>.
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') ?? 'all');
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    // Opens on every college the viewer may see (RLS scopes the rows), as Requests
    // does: store staff often handle orders for a college other than their profile's.
    () => searchParams.get('institution') ?? 'all'
  );
  // 'all' = every college the viewer may see (RLS scopes the rows). effectiveInstitution
  // stays a concrete college for anything that creates a document.
  const allColleges = institutionId === 'all';
  const effectiveInstitution =
    (institutionId && !allColleges ? institutionId : undefined) ?? profile?.institution_id ?? undefined;

  const filters: GrnFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as GrnStatus) : undefined,
    institution_id: allColleges ? undefined : effectiveInstitution,
    all_institutions: allColleges,
  };

  const { data: response, isLoading, isError } = useGrns(filters);
  const grns = response?.data ?? [];

  // Request numbers restart per college, so "All colleges" also names the college.
  const { institutions } = useUserInstitutionAccess();
  const collegeName = (id: string) =>
    institutions.find((i) => i.institution_id === id)?.institution_name ?? '-';

  return (
    <ContentLayout title="Deliveries">
      <div className="w-full space-y-5">
        {/* One toolbar row: which list · search · status · college. */}
        <FilterBar>
          <ReceiveSwitcher active="receipts" />
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search purchase no., delivery or PO number"
              aria-label="Search deliveries"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(GRN_STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
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
        </FilterBar>

        <section className="overflow-hidden rounded-xl border bg-background shadow">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load delivery records. Please try again." />
              </div>
            ) : grns.length === 0 ? (
              <EmptyState
                title="No delivery records found"
                description="Open an approved purchase order to record a delivery."
              />
            ) : (
              <ResponsiveList
                rows={grns}
                getRowKey={(grn) => grn.id}
                onRowClick={(grn) => router.push(`/procurement/grn/${grn.id}`)}
                rowLabel={(grn) => `View ${grn.grn_number}`}
                columns={[
                  {
                    key: 'purchase',
                    header: 'Purchase no.',
                    mobile: 'title',
                    cell: (grn) => (
                      <div className="min-w-0">
                        <div className="font-medium">
                          {grn.purchase_request
                            ? displayRequestNumber(grn.purchase_request.request_number)
                            : grn.grn_number}
                        </div>
                        {(grn.purchase_request || grn.purchase_order) && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {grn.purchase_request ? `Delivery ${grn.grn_number}` : ''}
                            {grn.purchase_request && grn.purchase_order ? ' · ' : ''}
                            {grn.purchase_order ? `Order ${grn.purchase_order.po_number}` : ''}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  ...(allColleges
                    ? [{ key: 'college', header: 'College', cell: (grn: (typeof grns)[number]) => collegeName(grn.institution_id) }]
                    : []),
                  { key: 'date', header: 'Date', cell: (grn) => formatDateDMY(grn.created_at) },
                  { key: 'vendor', header: 'Vendor', cell: (grn) => grn.supplier?.name || '-' },
                  { key: 'invoice', header: 'Invoice', cell: (grn) => grn.invoice_number || '-' },
                  { key: 'items', header: 'Items', cell: (grn) => grn.item_count ?? '-' },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (grn) => <StatusBadge status={grn.status} config={GRN_STATUS_CONFIG} />,
                  },
                  // The whole row opens the delivery; this just says so.
                  {
                    key: 'open',
                    header: '',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: () => <span className="text-xs font-medium text-muted-foreground">Open ›</span>,
                  },
                ]}
              />
            )}
        </section>
      </div>
    </ContentLayout>
  );
}
