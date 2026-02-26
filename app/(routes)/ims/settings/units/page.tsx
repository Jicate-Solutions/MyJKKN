'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Ruler,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useImsUnits,
  useCreateImsUnit,
  useUpdateImsUnit,
  useDeleteImsUnit,
} from '@/hooks/ims/use-ims-settings';
import type {
  ImsUnit,
  ImsUnitFilters,
  CreateImsUnitDto,
  UpdateImsUnitDto,
} from '@/types/ims';

interface UnitFormData {
  name: string;
  abbreviation: string;
  is_base_unit: boolean;
}

const emptyFormData: UnitFormData = {
  name: '',
  abbreviation: '',
  is_base_unit: false,
};

export default function UnitsPage() {
  const { isSuperAdmin } = usePermissions();

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<ImsUnit | null>(null);
  const [formData, setFormData] = useState<UnitFormData>(emptyFormData);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<ImsUnit | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build filters
  const filters: ImsUnitFilters = {
    search: debouncedSearch || undefined,
  };

  // Queries
  const { data: unitsList, isLoading: unitsLoading } = useImsUnits(filters);

  // Mutations
  const createUnit = useCreateImsUnit();
  const updateUnit = useUpdateImsUnit();
  const deleteUnit = useDeleteImsUnit();

  // Open dialog for new unit
  const handleAddNew = () => {
    setEditingUnit(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (unit: ImsUnit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      abbreviation: unit.abbreviation,
      is_base_unit: unit.is_base_unit,
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Please enter a unit name');
      return;
    }
    if (!formData.abbreviation) {
      toast.error('Please enter an abbreviation');
      return;
    }

    try {
      if (editingUnit) {
        const updateData: UpdateImsUnitDto = {
          name: formData.name,
          abbreviation: formData.abbreviation,
          is_base_unit: formData.is_base_unit,
        };
        await updateUnit.mutateAsync({
          id: editingUnit.id,
          data: updateData,
        });
        toast.success('Unit updated successfully');
      } else {
        const createData: CreateImsUnitDto = {
          name: formData.name,
          abbreviation: formData.abbreviation,
          is_base_unit: formData.is_base_unit,
        };
        await createUnit.mutateAsync(createData);
        toast.success('Unit created successfully');
      }
      setDialogOpen(false);
      setEditingUnit(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Delete unit
  const handleDeleteClick = (unit: ImsUnit) => {
    setUnitToDelete(unit);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!unitToDelete) return;
    try {
      await deleteUnit.mutateAsync(unitToDelete.id);
      toast.success('Unit deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete unit');
    } finally {
      setDeleteDialogOpen(false);
      setUnitToDelete(null);
    }
  };

  // Reset form on dialog close
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingUnit(null);
      setFormData(emptyFormData);
    }
  };

  const isMutating = createUnit.isPending || updateUnit.isPending;

  const units: ImsUnit[] = unitsList?.data ?? [];

  return (
    <ContentLayout title="Units of Measurement">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Units of Measurement
            </h1>
            <p className="text-muted-foreground mt-1">
              Define measurement units for inventory items
            </p>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Unit
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or abbreviation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Units Table */}
        <Card>
          <CardContent className="pt-6">
            {unitsLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : units.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Ruler className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No units found</p>
                <p className="text-sm mt-1">
                  {debouncedSearch
                    ? 'Try adjusting your search'
                    : 'Add your first unit of measurement'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Abbreviation</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">
                          {unit.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {unit.abbreviation}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {unit.is_base_unit ? (
                            <Badge variant="success">Base Unit</Badge>
                          ) : (
                            <Badge variant="secondary">Derived</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(unit)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteClick(unit)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
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
      </div>

      {/* Add/Edit Unit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUnit ? 'Edit Unit' : 'Add New Unit'}
            </DialogTitle>
            <DialogDescription>
              {editingUnit
                ? 'Update the unit details below.'
                : 'Fill in the details to create a new unit of measurement.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="unit-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="unit-name"
                placeholder="e.g. Kilogram"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            {/* Abbreviation */}
            <div className="space-y-2">
              <Label htmlFor="unit-abbreviation">
                Abbreviation <span className="text-red-500">*</span>
              </Label>
              <Input
                id="unit-abbreviation"
                placeholder="e.g. kg"
                value={formData.abbreviation}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    abbreviation: e.target.value,
                  }))
                }
              />
            </div>

            {/* Is Base Unit */}
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="unit-is-base"
                checked={formData.is_base_unit}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    is_base_unit: checked === true,
                  }))
                }
              />
              <Label htmlFor="unit-is-base" className="font-normal">
                This is a base unit (e.g. Piece, Kilogram, Litre)
              </Label>
            </div>
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
              {editingUnit ? 'Update Unit' : 'Create Unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{unitToDelete?.name} ({unitToDelete?.abbreviation})&quot;?
              This action cannot be undone and may affect items using this unit
              and any related unit conversions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnitToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteUnit.isPending ? (
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
