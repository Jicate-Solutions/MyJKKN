'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsSuppliers,
  useCreateImsSupplier,
  useUpdateImsSupplier,
  useDeleteImsSupplier,
  useToggleImsSupplierActive,
} from '@/hooks/ims/use-ims-settings';
import type {
  ImsSupplier,
  ImsSupplierFilters,
  CreateImsSupplierDto,
  UpdateImsSupplierDto,
} from '@/types/ims';

interface SupplierFormData {
  name: string;
  code: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
}

const emptyFormData: SupplierFormData = {
  name: '',
  code: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  gstin: '',
};

export default function SuppliersPage() {
  const { storeId, institutionId, isSuperAdmin } = useImsStoreContext();

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<ImsSupplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(emptyFormData);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<ImsSupplier | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build filters
  const filters: ImsSupplierFilters = {
    search: debouncedSearch || undefined,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
    institution_id: institutionId || undefined,
    store_id: storeId || undefined,
  };

  // Queries
  const { data: suppliersList, isLoading: suppliersLoading } = useImsSuppliers(filters);

  // Mutations
  const createSupplier = useCreateImsSupplier();
  const updateSupplier = useUpdateImsSupplier();
  const deleteSupplier = useDeleteImsSupplier();
  const toggleActive = useToggleImsSupplierActive();

  // Open dialog for new supplier
  const handleAddNew = () => {
    setEditingSupplier(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (supplier: ImsSupplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      code: supplier.code,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      gstin: supplier.gstin || '',
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Please enter a supplier name');
      return;
    }
    if (!formData.code) {
      toast.error('Please enter a supplier code');
      return;
    }

    try {
      if (editingSupplier) {
        const updateData: UpdateImsSupplierDto = {
          name: formData.name,
          code: formData.code,
          contact_person: formData.contact_person || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          gstin: formData.gstin || null,
        };
        await updateSupplier.mutateAsync({
          id: editingSupplier.id,
          data: updateData,
        });
        toast.success('Supplier updated successfully');
      } else {
        const createData: CreateImsSupplierDto = {
          name: formData.name,
          code: formData.code,
          contact_person: formData.contact_person || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          gstin: formData.gstin || null,
          is_active: true,
          institution_id: institutionId || null,
          store_id: storeId || null,
        };
        await createSupplier.mutateAsync(createData);
        toast.success('Supplier created successfully');
      }
      setDialogOpen(false);
      setEditingSupplier(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Toggle active status
  const handleToggleActive = async (supplier: ImsSupplier) => {
    try {
      await toggleActive.mutateAsync({
        id: supplier.id,
        isActive: !supplier.is_active,
      });
      toast.success(
        `Supplier ${supplier.is_active ? 'deactivated' : 'activated'} successfully`
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to toggle supplier status');
    }
  };

  // Delete supplier
  const handleDeleteClick = (supplier: ImsSupplier) => {
    setSupplierToDelete(supplier);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!supplierToDelete) return;
    try {
      await deleteSupplier.mutateAsync(supplierToDelete.id);
      toast.success('Supplier deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete supplier');
    } finally {
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    }
  };

  // Reset form on dialog close
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingSupplier(null);
      setFormData(emptyFormData);
    }
  };

  const isMutating = createSupplier.isPending || updateSupplier.isPending;

  const suppliers: ImsSupplier[] = suppliersList?.data ?? [];

  return (
    <ContentLayout title="Suppliers">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
            <p className="text-muted-foreground mt-1">
              Manage your inventory suppliers and vendors
            </p>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, contact, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={activeFilter}
                onValueChange={setActiveFilter}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Suppliers Table */}
        <Card>
          <CardContent className="pt-6">
            {suppliersLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No suppliers found</p>
                <p className="text-sm mt-1">
                  {debouncedSearch || activeFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'Add your first supplier to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{supplier.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {supplier.code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {supplier.contact_person || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {supplier.email || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {supplier.phone || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {supplier.gstin || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={supplier.is_active}
                              onCheckedChange={() => handleToggleActive(supplier)}
                              disabled={toggleActive.isPending}
                            />
                            {supplier.is_active ? (
                              <Badge variant="success">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(supplier)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteClick(supplier)}
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

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Update the supplier details below.'
                : 'Fill in the details to add a new supplier.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="supplier-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="supplier-name"
                placeholder="Supplier name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="supplier-code">
                Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="supplier-code"
                placeholder="e.g. SUP-001"
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, code: e.target.value }))
                }
              />
            </div>

            {/* Contact Person */}
            <div className="space-y-2">
              <Label htmlFor="supplier-contact">Contact Person</Label>
              <Input
                id="supplier-contact"
                placeholder="Contact person name"
                value={formData.contact_person}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, contact_person: e.target.value }))
                }
              />
            </div>

            {/* Email & Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier-email">Email</Label>
                <Input
                  id="supplier-email"
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-phone">Phone</Label>
                <Input
                  id="supplier-phone"
                  placeholder="+91 XXXXX XXXXX"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="supplier-address">Address</Label>
              <Textarea
                id="supplier-address"
                placeholder="Full address"
                value={formData.address}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, address: e.target.value }))
                }
                rows={2}
              />
            </div>

            {/* GSTIN */}
            <div className="space-y-2">
              <Label htmlFor="supplier-gstin">GSTIN</Label>
              <Input
                id="supplier-gstin"
                placeholder="e.g. 22AAAAA0000A1Z5"
                value={formData.gstin}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, gstin: e.target.value }))
                }
              />
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
              {editingSupplier ? 'Update Supplier' : 'Create Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{supplierToDelete?.name}&quot;?
              This action cannot be undone and may affect related purchase orders
              and goods received notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSupplierToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteSupplier.isPending ? (
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
