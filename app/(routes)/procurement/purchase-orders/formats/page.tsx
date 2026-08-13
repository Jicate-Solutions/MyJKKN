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

  return (
    <ContentLayout title="PO Document Formats">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">PO Document Formats</h2>
            <p className="text-muted-foreground mt-1">
              Configure item columns, header fields, and footer content per vendor layout.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => router.push('/procurement/purchase-orders/formats/new')}>
              <Plus className="h-4 w-4 mr-2" />
              New Format
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved formats</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each format is a reusable print layout. One is marked the institution default and is
              used whenever a vendor has no format of its own.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <AlertBox type="error" message="Failed to load PO formats. Please try again." />
            ) : list.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileStack className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No formats yet</p>
                <p className="text-sm mt-1">
                  POs without a format fall back to the standard layout. Create one per vendor
                  document style (e.g. GST breakup, MRP/dealer price, ISBN/author).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Item Columns</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((format) => (
                      <TableRow key={format.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{format.name}</p>
                            {format.is_default && (
                              <Badge variant="success" className="gap-1">
                                <Star className="h-3 w-3" />
                                Default
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format.description || '-'}
                        </TableCell>
                        <TableCell className="text-center">{format.item_columns.length}</TableCell>
                        <TableCell>
                          {format.is_active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" aria-label={`Actions for ${format.name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canManage && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(`/procurement/purchase-orders/formats/${format.id}/edit`)
                                  }
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor Format Assignments</CardTitle>
            <p className="text-sm text-muted-foreground">
              Set the default document format used when a Purchase Order is generated for each
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
              <div className="text-center py-12 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>No active vendors found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="w-[240px]">Default PO Format</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(suppliersList?.data ?? []).map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {supplier.code}
                        </TableCell>
                        <TableCell>
                          {canManage ? (
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
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
