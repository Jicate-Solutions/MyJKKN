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
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import {
  useImsStores,
  useCreateImsStore,
  useUpdateImsStore,
  useDeleteImsStore,
  useToggleImsStoreActive,
} from '@/hooks/ims/use-ims-stores';
import type {
  ImsStoreWithRelations,
  ImsStoreFilters,
  CreateImsStoreDto,
  UpdateImsStoreDto,
} from '@/types/ims';

interface StoreFormData {
  name: string;
  code: string;
  institution_id: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  upi_vpa: string;
  upi_merchant_name: string;
  receipt_header: string;
  receipt_footer: string;
  sale_number_prefix: string;
}

const emptyFormData: StoreFormData = {
  name: '',
  code: '',
  institution_id: '',
  description: '',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  upi_vpa: '',
  upi_merchant_name: '',
  receipt_header: '',
  receipt_footer: '',
  sale_number_prefix: 'INV',
};

export default function StoresPage() {
  const { isSuperAdmin, userProfile } = usePermissions();
  const { data: jkknInstitutionData, isLoading: institutionsLoading } = useJkknInstitutions({ limit: 100 });
  const institutions = jkknInstitutionData?.data ?? [];

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<ImsStoreWithRelations | null>(null);
  const [formData, setFormData] = useState<StoreFormData>(emptyFormData);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<ImsStoreWithRelations | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build filters
  const filters: ImsStoreFilters = {
    search: debouncedSearch || undefined,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
  };

  // Queries
  const { data: storesList, isLoading: storesLoading } = useImsStores(filters);

  // Mutations
  const createStore = useCreateImsStore();
  const updateStore = useUpdateImsStore();
  const deleteStore = useDeleteImsStore();
  const toggleActive = useToggleImsStoreActive();

  // Open dialog for new store
  const handleAddNew = () => {
    setEditingStore(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (store: ImsStoreWithRelations) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      code: store.code,
      institution_id: store.institution_id || '',
      description: store.description || '',
      address: store.address || '',
      phone: store.phone || '',
      email: store.email || '',
      gstin: store.gstin || '',
      upi_vpa: store.upi_vpa || '',
      upi_merchant_name: store.upi_merchant_name || '',
      receipt_header: store.receipt_header || '',
      receipt_footer: store.receipt_footer || '',
      sale_number_prefix: store.sale_number_prefix || 'INV',
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Please enter a store name');
      return;
    }
    if (!formData.code) {
      toast.error('Please enter a store code');
      return;
    }
    if (!formData.institution_id) {
      toast.error('Please select an institution');
      return;
    }

    try {
      const selectedInstitution = institutions.find(
        (i) => i.id === formData.institution_id
      );

      if (editingStore) {
        const updateData: UpdateImsStoreDto = {
          name: formData.name,
          code: formData.code,
          institution_id: formData.institution_id || null,
          institution_name: selectedInstitution?.name || null,
          description: formData.description || null,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          gstin: formData.gstin || null,
          upi_vpa: formData.upi_vpa || null,
          upi_merchant_name: formData.upi_merchant_name || null,
          receipt_header: formData.receipt_header || null,
          receipt_footer: formData.receipt_footer || null,
          sale_number_prefix: formData.sale_number_prefix || 'INV',
        };
        await updateStore.mutateAsync({
          id: editingStore.id,
          data: updateData,
        });
        toast.success('Store updated successfully');
      } else {
        const createData: CreateImsStoreDto = {
          name: formData.name,
          code: formData.code,
          institution_id: formData.institution_id || null,
          institution_name: selectedInstitution?.name || null,
          description: formData.description || null,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          gstin: formData.gstin || null,
          upi_vpa: formData.upi_vpa || null,
          upi_merchant_name: formData.upi_merchant_name || null,
          receipt_header: formData.receipt_header || null,
          receipt_footer: formData.receipt_footer || null,
          sale_number_prefix: formData.sale_number_prefix || 'INV',
          manager_id: null,
          is_active: true,
          created_by: userProfile?.id || null,
        };
        await createStore.mutateAsync(createData);
        toast.success('Store registered successfully');
      }
      setDialogOpen(false);
      setEditingStore(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Toggle active status
  const handleToggleActive = async (store: ImsStoreWithRelations) => {
    try {
      await toggleActive.mutateAsync({
        id: store.id,
        isActive: !store.is_active,
      });
      toast.success(
        `Store ${store.is_active ? 'deactivated' : 'activated'} successfully`
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to toggle store status');
    }
  };

  // Delete store
  const handleDeleteClick = (store: ImsStoreWithRelations) => {
    setStoreToDelete(store);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!storeToDelete) return;
    try {
      await deleteStore.mutateAsync(storeToDelete.id);
      toast.success('Store deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete store');
    } finally {
      setDeleteDialogOpen(false);
      setStoreToDelete(null);
    }
  };

  // Reset form on dialog close
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingStore(null);
      setFormData(emptyFormData);
    }
  };

  const isMutating = createStore.isPending || updateStore.isPending;

  const stores: ImsStoreWithRelations[] = storesList?.data ?? [];

  return (
    <ContentLayout title="IMS Stores">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">IMS Stores</h1>
            <p className="text-muted-foreground mt-1">
              Manage IMS stores — each institution can have multiple stores
            </p>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Register Store
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
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

        {/* Stores Table */}
        <Card>
          <CardContent className="pt-6">
            {storesLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Store className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No stores registered</p>
                <p className="text-sm mt-1">
                  {debouncedSearch || activeFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'Register your first IMS store to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{store.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {store.code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {store.institution_name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {store.manager?.full_name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {store.description || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={store.is_active}
                              onCheckedChange={() => handleToggleActive(store)}
                              disabled={toggleActive.isPending}
                            />
                            {store.is_active ? (
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
                              <DropdownMenuItem onClick={() => handleEdit(store)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteClick(store)}
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

      {/* Add/Edit Store Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStore ? 'Edit Store' : 'Register New Store'}
            </DialogTitle>
            <DialogDescription>
              {editingStore
                ? 'Update the store details below.'
                : 'Register a new IMS store for an institution.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Institution */}
            <div className="space-y-2">
              <Label htmlFor="store-institution">
                Institution <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.institution_id}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, institution_id: val }))
                }
              >
                <SelectTrigger id="store-institution">
                  <SelectValue
                    placeholder={
                      institutionsLoading
                        ? 'Loading institutions...'
                        : 'Select an institution'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name + Code row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store-name">
                  Store Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="store-name"
                  placeholder="e.g. JKKN Pharmacy"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-code">
                  Store Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="store-code"
                  placeholder="e.g. JKKN-PHR"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, code: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="store-description">Description</Label>
              <Textarea
                id="store-description"
                placeholder="Brief description of this store"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="store-address">Address</Label>
              <Textarea
                id="store-address"
                placeholder="Store address (printed on receipts)"
                value={formData.address}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, address: e.target.value }))
                }
                rows={2}
              />
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store-phone">Phone</Label>
                <Input
                  id="store-phone"
                  placeholder="e.g. 04288-234567"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-email">Email</Label>
                <Input
                  id="store-email"
                  type="email"
                  placeholder="store@jkkn.ac.in"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Tax & Invoice */}
            <div className={isSuperAdmin ? 'grid grid-cols-2 gap-3' : ''}>
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="store-gstin">GSTIN</Label>
                  <Input
                    id="store-gstin"
                    placeholder="e.g. 33AABCT1234Z1Z5"
                    value={formData.gstin}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, gstin: e.target.value }))
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="store-prefix">Sale Number Prefix</Label>
                <Input
                  id="store-prefix"
                  placeholder="INV"
                  value={formData.sale_number_prefix}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sale_number_prefix: e.target.value.toUpperCase(),
                    }))
                  }
                  maxLength={6}
                />
              </div>
            </div>

            {/* UPI Payment Settings — Super Admin Only */}
            {isSuperAdmin && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground pt-1">
                  UPI Payment Settings
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="store-upi-vpa">UPI VPA</Label>
                    <Input
                      id="store-upi-vpa"
                      placeholder="store@upi"
                      value={formData.upi_vpa}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, upi_vpa: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store-upi-name">UPI Merchant Name</Label>
                    <Input
                      id="store-upi-name"
                      placeholder="JKKN Store"
                      value={formData.upi_merchant_name}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          upi_merchant_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Receipt Branding — Super Admin Only */}
            {isSuperAdmin && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground pt-1">
                  Receipt Branding
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="store-receipt-header">Receipt Header</Label>
                    <Textarea
                      id="store-receipt-header"
                      placeholder="Text printed at the top of receipts"
                      value={formData.receipt_header}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          receipt_header: e.target.value,
                        }))
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store-receipt-footer">Receipt Footer</Label>
                    <Textarea
                      id="store-receipt-footer"
                      placeholder="e.g. Thank you for your purchase!"
                      value={formData.receipt_footer}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          receipt_footer: e.target.value,
                        }))
                      }
                      rows={2}
                    />
                  </div>
                </div>
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
              {editingStore ? 'Update Store' : 'Register Store'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{storeToDelete?.name}&quot;?
              This will remove the store registration. All inventory data linked
              to the institution will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStoreToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteStore.isPending ? (
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
