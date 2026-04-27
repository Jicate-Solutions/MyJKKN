'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsUnitConversions,
  useCreateImsUnitConversion,
  useUpdateImsUnitConversion,
  useDeleteImsUnitConversion,
  useImsUnitsForSelect,
} from '@/hooks/ims/use-ims-settings';
import type {
  ImsUnit,
  ImsUnitConversionWithRelations,
  ImsUnitConversionFilters,
  CreateImsUnitConversionDto,
  UpdateImsUnitConversionDto,
} from '@/types/ims';

interface ConversionFormData {
  from_unit_id: string;
  to_unit_id: string;
  item_id: string;
  conversion_factor: string;
}

const emptyFormData: ConversionFormData = {
  from_unit_id: '',
  to_unit_id: '',
  item_id: '',
  conversion_factor: '',
};

export default function UnitConversionsPage() {
  const { isSuperAdmin } = usePermissions();
  const { storeId } = useImsStoreContext();

  // Filter state
  const [filterSearch, setFilterSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConversion, setEditingConversion] =
    useState<ImsUnitConversionWithRelations | null>(null);
  const [formData, setFormData] = useState<ConversionFormData>(emptyFormData);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversionToDelete, setConversionToDelete] =
    useState<ImsUnitConversionWithRelations | null>(null);

  // Build filters
  const filters: ImsUnitConversionFilters = {
    search: filterSearch || undefined,
    store_id: storeId || undefined,
  };

  // Queries
  const { data: conversionsList, isLoading: conversionsLoading } =
    useImsUnitConversions(filters);
  const { data: unitsForSelect } = useImsUnitsForSelect();

  // Mutations
  const createConversion = useCreateImsUnitConversion();
  const updateConversion = useUpdateImsUnitConversion();
  const deleteConversion = useDeleteImsUnitConversion();

  // Get unit by id
  const getUnit = (unitId: string) => {
    if (!unitsForSelect || !Array.isArray(unitsForSelect)) return undefined;
    return unitsForSelect.find(u => u.id === unitId);
  };

  // Get unit display name
  const getUnitDisplay = (unitId: string): string => {
    const unit = getUnit(unitId);
    return unit ? `${unit.name} (${unit.abbreviation})` : '-';
  };

  // Open dialog for new conversion
  const handleAddNew = () => {
    setEditingConversion(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (conversion: ImsUnitConversionWithRelations) => {
    setEditingConversion(conversion);
    setFormData({
      from_unit_id: conversion.from_unit_id,
      to_unit_id: conversion.to_unit_id,
      item_id: conversion.item_id || '',
      conversion_factor: String(conversion.conversion_factor),
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!formData.from_unit_id) {
      toast.error('Please select a "From" unit');
      return;
    }
    if (!formData.to_unit_id) {
      toast.error('Please select a "To" unit');
      return;
    }
    if (formData.from_unit_id === formData.to_unit_id) {
      toast.error('"From" and "To" units must be different');
      return;
    }
    const factor = parseFloat(formData.conversion_factor);
    if (!formData.conversion_factor || isNaN(factor) || factor <= 0) {
      toast.error('Please enter a valid conversion factor greater than 0');
      return;
    }

    try {
      if (editingConversion) {
        const updateData: UpdateImsUnitConversionDto = {
          from_unit_id: formData.from_unit_id,
          to_unit_id: formData.to_unit_id,
          item_id: formData.item_id || null,
          conversion_factor: factor,
        };
        await updateConversion.mutateAsync({
          id: editingConversion.id,
          data: updateData,
        });
        toast.success('Unit conversion updated successfully');
      } else {
        const createData: CreateImsUnitConversionDto = {
          from_unit_id: formData.from_unit_id,
          to_unit_id: formData.to_unit_id,
          item_id: formData.item_id || null,
          conversion_factor: factor,
          store_id: storeId || null,
        };
        await createConversion.mutateAsync(createData);
        toast.success('Unit conversion created successfully');
      }
      setDialogOpen(false);
      setEditingConversion(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Delete conversion
  const handleDeleteClick = (conversion: ImsUnitConversionWithRelations) => {
    setConversionToDelete(conversion);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!conversionToDelete) return;
    try {
      await deleteConversion.mutateAsync(conversionToDelete.id);
      toast.success('Unit conversion deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete unit conversion');
    } finally {
      setDeleteDialogOpen(false);
      setConversionToDelete(null);
    }
  };

  // Reset form on dialog close
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingConversion(null);
      setFormData(emptyFormData);
    }
  };

  const isMutating = createConversion.isPending || updateConversion.isPending;

  const conversions: ImsUnitConversionWithRelations[] =
    conversionsList?.data ?? [];

  // Get selected unit names for preview
  const selectedFromUnit = getUnit(formData.from_unit_id);
  const selectedToUnit = getUnit(formData.to_unit_id);
  const previewFactor = parseFloat(formData.conversion_factor);

  return (
    <ContentLayout title="Unit Conversions">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Unit Conversions
            </h1>
            <p className="text-muted-foreground mt-1">
              Define conversion factors between units of measurement
            </p>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Conversion
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversions..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Conversions Table */}
        <Card>
          <CardContent className="pt-6">
            {conversionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : conversions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No unit conversions found</p>
                <p className="text-sm mt-1">
                  {filterSearch
                    ? 'Try adjusting your search'
                    : 'Add your first unit conversion rule'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From Unit</TableHead>
                      <TableHead className="text-center">
                        Conversion Factor
                      </TableHead>
                      <TableHead>To Unit</TableHead>
                      <TableHead>Conversion Rule</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversions.map((conversion) => {
                      const fromUnit = conversion.from_unit;
                      const toUnit = conversion.to_unit;
                      return (
                        <TableRow key={conversion.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {fromUnit?.name || '-'}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {fromUnit?.abbreviation || ''}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-lg font-bold tabular-nums">
                              {conversion.conversion_factor}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {toUnit?.name || '-'}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {toUnit?.abbreviation || ''}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                              1 {fromUnit?.abbreviation || '?'} ={' '}
                              {conversion.conversion_factor}{' '}
                              {toUnit?.abbreviation || '?'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleEdit(conversion)}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteClick(conversion)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Conversion Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConversion
                ? 'Edit Unit Conversion'
                : 'Add New Unit Conversion'}
            </DialogTitle>
            <DialogDescription>
              {editingConversion
                ? 'Update the conversion details below.'
                : 'Define a conversion factor between two units.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* From Unit */}
            <div className="space-y-2">
              <Label>
                From Unit <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.from_unit_id}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, from_unit_id: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source unit" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(unitsForSelect) ? unitsForSelect : []).map(
                    (unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name} ({unit.abbreviation})
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* To Unit */}
            <div className="space-y-2">
              <Label>
                To Unit <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.to_unit_id}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, to_unit_id: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target unit" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(unitsForSelect) ? unitsForSelect : [])
                    .filter((unit) => unit.id !== formData.from_unit_id)
                    .map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name} ({unit.abbreviation})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conversion Factor */}
            <div className="space-y-2">
              <Label htmlFor="conversion-factor">
                Conversion Factor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="conversion-factor"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 1000"
                value={formData.conversion_factor}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    conversion_factor: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                How many of the target unit equals 1 of the source unit
              </p>
            </div>

            {/* Preview */}
            {selectedFromUnit &&
              selectedToUnit &&
              !isNaN(previewFactor) &&
              previewFactor > 0 && (
                <div className="rounded-lg border bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    Conversion Preview
                  </p>
                  <p className="text-lg font-semibold">
                    1 {selectedFromUnit.name} ({selectedFromUnit.abbreviation}) ={' '}
                    {previewFactor} {selectedToUnit.name} (
                    {selectedToUnit.abbreviation})
                  </p>
                </div>
              )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isMutating}>
              {isMutating && (
                <BeatLoader color="#fff" size={8} className="mr-2" />
              )}
              {editingConversion ? 'Update Conversion' : 'Create Conversion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit Conversion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the conversion from{' '}
              &quot;{conversionToDelete?.from_unit?.name}&quot; to{' '}
              &quot;{conversionToDelete?.to_unit?.name}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConversionToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteConversion.isPending ? (
                <BeatLoader color="#fff" size={8} />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
