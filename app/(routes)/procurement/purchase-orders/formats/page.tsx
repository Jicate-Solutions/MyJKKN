'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePoFormats, useDeletePoFormat, useSetDefaultPoFormat } from '@/hooks/procurement/use-po-formats';
import { useImsSuppliers, useUpdateImsSupplier } from '@/hooks/ims/use-ims-settings';
import { AlertBox } from '@/components/ui/alert-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { FilterBar } from '@/components/procurement/page-header';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { EmptyState } from '@/components/empty-state';
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
import { Plus, MoreHorizontal, Pencil, Trash2, Star, FileStack, Truck, Search, ChevronLeft } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import type { ProcurementPoFormat } from '@/types/procurement';
import type { ImsSupplier } from '@/types/ims/suppliers';

export default function PoFormatsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'po_create');
  // Formats and vendor assignments are per college. Multi-college admins pick one
  // (the picker only renders for them); everyone else stays on their own.
  const [pickedInstitution, setPickedInstitution] = useState<string | undefined>(undefined);
  const institutionId = pickedInstitution ?? profile?.institution_id ?? undefined;

  const { data: formats, isLoading, isError } = usePoFormats(institutionId);
  const deleteFormat = useDeletePoFormat();
  const setDefault = useSetDefaultPoFormat();

  // Vendors load 100 at a time; search reaches the rest (it used to stop silently at 100).
  const [vendorSearch, setVendorSearch] = useState('');
  const debouncedVendorSearch = useDebounceValue(vendorSearch, 300);
  const { data: suppliersList, isLoading: suppliersLoading, isError: suppliersError } = useImsSuppliers({
    institution_id: institutionId,
    is_active: true,
    search: debouncedVendorSearch.trim() || undefined,
    limit: 100,
  });
  const vendorTotal = suppliersList?.metadata?.total ?? 0;
  const vendorShown = suppliersList?.data?.length ?? 0;
  const updateSupplier = useUpdateImsSupplier();

  const handleAssignFormat = async (supplierId: string, formatId: string) => {
    try {
      await updateSupplier.mutateAsync({
        id: supplierId,
        data: { default_po_format_id: formatId === 'none' ? null : formatId },
      });
      toast.success('Vendor default format updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to update vendor default format'));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteFormat.mutateAsync(id);
      toast.success(`"${name}" deactivated`);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to deactivate format'));
    }
  };

  const handleSetDefault = async (formatId: string) => {
    if (!institutionId) return;
    try {
      await setDefault.mutateAsync({ institutionId, formatId });
      toast.success('Default format updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to set default'));
    }
  };

  const list = formats ?? [];

  const renderFormatActions = (format: ProcurementPoFormat) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={`Actions for ${format.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canManage && (
          <DropdownMenuItem
            onClick={() => router.push(`/procurement/purchase-orders/formats/${format.id}/edit`)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        )}
        {canManage && !format.is_default && (
          <DropdownMenuItem onClick={() => handleSetDefault(format.id)}>
            <Star className="h-4 w-4 mr-2" />
            Set as default
          </DropdownMenuItem>
        )}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleDelete(format.id, format.name)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Deactivate
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderFormatSelect = (supplier: ImsSupplier) =>
    canManage ? (
      <Select
        value={supplier.default_po_format_id || 'none'}
        onValueChange={(v) => handleAssignFormat(supplier.id, v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Standard (default)</SelectItem>
          {list.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <span className="text-sm text-muted-foreground">
        {list.find((f) => f.id === supplier.default_po_format_id)?.name ?? 'Standard'}
      </span>
    );

  return (
    <ContentLayout title="PO formats">
      <div className="w-full space-y-5">
        <FilterBar>
          <Button
            variant="ghost"
            className="h-9 px-2"
            onClick={() => router.push('/procurement/purchase-orders')}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Purchase orders
          </Button>
          <InstitutionFilter
            value={institutionId}
            onChange={setPickedInstitution}
            label={null}
            className="w-full sm:ml-auto sm:w-52"
          />
          {canManage && (
            <Button
              className="h-9 w-full sm:w-auto"
              onClick={() => router.push('/procurement/purchase-orders/formats/new')}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New format
            </Button>
          )}
        </FilterBar>

        <section className="overflow-hidden rounded-xl border bg-background shadow">
          <h2 className="border-b px-5 py-3 text-base font-semibold">Saved formats</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-4 sm:p-6">
                <AlertBox type="error" message="Failed to load PO formats. Please try again." />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={<FileStack className="h-10 w-10 text-muted-foreground" />}
                title="No formats yet"
                description="Orders use the standard layout until you add one."
              />
            ) : (
              <ResponsiveList
                rows={list}
                getRowKey={(format) => format.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    mobile: 'title',
                    cell: (format) => (
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{format.name}</p>
                        {format.is_default && (
                          <Badge variant="success" className="gap-1">
                            <Star className="h-3 w-3" />
                            Default
                          </Badge>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'description',
                    header: 'Description',
                    className: 'text-muted-foreground',
                    cell: (format) => format.description || '-',
                  },
                  {
                    key: 'items',
                    header: 'Item columns',
                    className: 'text-center',
                    cell: (format) => format.item_columns.length,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (format) =>
                      format.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      ),
                  },
                  // Only managers get the ⋯ menu; for anyone else it opened empty.
                  ...(canManage
                    ? [
                        {
                          key: 'actions',
                          header: 'Actions',
                          mobile: 'hidden' as const,
                          className: 'text-right',
                          cell: (format: ProcurementPoFormat) => renderFormatActions(format),
                        },
                      ]
                    : []),
                ]}
                mobileFooter={
                  canManage
                    ? (format) => <div className="flex w-full justify-end">{renderFormatActions(format)}</div>
                    : undefined
                }
              />
            )}
        </section>

        <section className="overflow-hidden rounded-xl border bg-background shadow">
          <h2 className="border-b px-5 py-3 text-base font-semibold">Format for each vendor</h2>
            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search vendor name or code"
                  aria-label="Search vendors"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              {vendorTotal > vendorShown && (
                <span className="text-xs text-muted-foreground">
                  Showing {vendorShown} of {vendorTotal}. Search to find the rest.
                </span>
              )}
            </div>
            {suppliersLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : suppliersError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load vendors. Please try again." />
              </div>
            ) : (suppliersList?.data ?? []).length === 0 ? (
              <EmptyState
                icon={<Truck className="h-10 w-10 text-muted-foreground" />}
                title={debouncedVendorSearch.trim() ? 'No vendors match this search' : 'No active vendors'}
                description="Vendors are added in IMS → Settings → Suppliers."
              />
            ) : (
              <ResponsiveList
                rows={suppliersList?.data ?? []}
                getRowKey={(supplier) => supplier.id}
                columns={[
                  {
                    key: 'vendor',
                    header: 'Vendor',
                    mobile: 'title',
                    className: 'font-medium',
                    cell: (supplier) => supplier.name,
                  },
                  {
                    key: 'code',
                    header: 'Code',
                    className: 'text-muted-foreground font-mono text-sm',
                    cell: (supplier) => supplier.code,
                  },
                  {
                    key: 'format',
                    header: 'PO format',
                    className: 'w-[240px]',
                    mobile: 'hidden',
                    cell: (supplier) => renderFormatSelect(supplier),
                  },
                ]}
                mobileFooter={(supplier) => (
                  <div className="w-full space-y-1">
                    <Label className="text-xs text-muted-foreground">PO format</Label>
                    {renderFormatSelect(supplier)}
                  </div>
                )}
              />
            )}
        </section>
      </div>
    </ContentLayout>
  );
}
