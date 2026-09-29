'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePoFormats, useDeletePoFormat, useSetDefaultPoFormat } from '@/hooks/procurement/use-po-formats';
import { useImsSuppliers, useUpdateImsSupplier } from '@/hooks/ims/use-ims-settings';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { PageHeader } from '@/components/procurement/page-header';
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
import { Plus, MoreHorizontal, Pencil, Trash2, Star, FileStack, Truck } from 'lucide-react';
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
  const institutionId = profile?.institution_id ?? undefined;

  const { data: formats, isLoading, isError } = usePoFormats(institutionId);
  const deleteFormat = useDeletePoFormat();
  const setDefault = useSetDefaultPoFormat();

  const { data: suppliersList, isLoading: suppliersLoading, isError: suppliersError } = useImsSuppliers({
    institution_id: institutionId,
    is_active: true,
    limit: 100,
  });
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
        <Button variant="ghost" size="sm" className="h-10 sm:h-8" aria-label={`Actions for ${format.name}`}>
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
            Set as Default
          </DropdownMenuItem>
        )}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
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
        <SelectTrigger>
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
    <ContentLayout title="Order Formats">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Order Formats"
          description="Configure item columns, header fields, and footer content per vendor layout."
          actions={
            canManage && (
              <Button onClick={() => router.push('/procurement/purchase-orders/formats/new')}>
                <Plus className="h-4 w-4 mr-2" />
                New Format
              </Button>
            )
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved formats</CardTitle>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Each format is a reusable print layout. One is marked the institution default and is
              used whenever a vendor has no format of its own.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-4 sm:p-6">
                <AlertBox type="error" message="Failed to load order formats. Please try again." />
              </div>
            ) : list.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground sm:px-6">
                <FileStack className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No formats yet</p>
                <p className="text-sm mt-1">
                  Orders without a format fall back to the standard layout. Create one per vendor
                  document style (e.g. GST breakup, MRP/dealer price, ISBN/author).
                </p>
              </div>
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
                    header: 'Item Columns',
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
                  {
                    key: 'actions',
                    header: 'Actions',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: (format) => renderFormatActions(format),
                  },
                ]}
                mobileFooter={(format) => (
                  <div className="flex w-full justify-end">{renderFormatActions(format)}</div>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor Format Assignments</CardTitle>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Set the default document format used when an order is generated for each
              vendor. Vendor identity details (name, contact, GSTIN) are still managed in IMS →
              Settings → Suppliers.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {suppliersLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : suppliersError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load vendors. Please try again." />
              </div>
            ) : (suppliersList?.data ?? []).length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground sm:px-6">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>No active vendors found.</p>
              </div>
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
                    header: 'Default Order Format',
                    className: 'w-[240px]',
                    mobile: 'hidden',
                    cell: (supplier) => renderFormatSelect(supplier),
                  },
                ]}
                mobileFooter={(supplier) => (
                  <div className="w-full space-y-1">
                    <Label className="text-xs text-muted-foreground">Default Order Format</Label>
                    {renderFormatSelect(supplier)}
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
