'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { useAuth } from '@/hooks/use-auth';
import { ImsStockAdjustmentService } from '@/lib/services/ims/stock-adjustment-service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  Trash2,
  Package,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsItems,
  useCreateImsItem,
  useUpdateImsItem,
  useDeleteImsItem,
  useToggleImsItemActive,
  useImsCategoriesForSelect,
} from '@/hooks/ims/use-ims-inventory';
import { useImsUnitsForSelect } from '@/hooks/ims/use-ims-settings';
import type {
  ImsItemFilters,
  ImsItemType,
  ImsItemWithRelations,
  CreateImsItemDto,
  UpdateImsItemDto,
} from '@/types/ims';

const ITEM_TYPES: { label: string; value: ImsItemType }[] = [
  { label: 'Consumable', value: 'consumable' },
  { label: 'Equipment', value: 'equipment' },
  { label: 'Medicine', value: 'medicine' },
  { label: 'Stationery', value: 'stationery' },
  { label: 'Other', value: 'other' },
];

function itemTypeBadgeVariant(type: ImsItemType) {
  switch (type) {
    case 'consumable':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'equipment':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'medicine':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'stationery':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
}

function formatPrice(amount: number): string {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  });
}

interface ItemFormData {
  code: string;
  name: string;
  description: string;
  category_id: string;
  item_type: ImsItemType;
  base_unit_id: string;
  purchase_unit_id: string;
  sale_unit_id: string;
  indent_unit_id: string;
  cost_price: number;
  mrp: number;
  selling_price: number;
  hsn_code: string;
  gst_rate: number; // 0 | 5 | 12 | 18 | 28
  reorder_level: number;
  max_stock_level: number;
  track_batch: boolean;
  track_expiry: boolean;
  is_sellable_to_students: boolean;
  opening_stock: number; // only used on create
}

const emptyFormData: ItemFormData = {
  code: '',
  name: '',
  description: '',
  category_id: '',
  item_type: 'consumable',
  base_unit_id: '',
  purchase_unit_id: '',
  sale_unit_id: '',
  indent_unit_id: '',
  cost_price: 0,
  mrp: 0,
  selling_price: 0,
  hsn_code: '',
  gst_rate: 0,
  reorder_level: 10,
  max_stock_level: 100,
  track_batch: false,
  track_expiry: false,
  is_sellable_to_students: false,
  opening_stock: 0,
};

export default function InventoryItemsPage() {
  const { storeId, institutionId, isSuperAdmin } = useImsStoreContext();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Filters state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ImsItemWithRelations | null>(null);
  const [formData, setFormData] = useState<ItemFormData>(emptyFormData);

  // Adjust stock dialog state
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<ImsItemWithRelations | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    adjustment_type: 'correction',
    quantity: 0,
    reason: '',
  });
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build filters
  const filters: ImsItemFilters = {
    search: debouncedSearch || undefined,
    category_id: categoryFilter || undefined,
    item_type: (typeFilter as ImsItemType) || undefined,
    store_id: storeId || '',
    institution_id: institutionId,
  };

  // Queries
  const { data: items, isLoading: itemsLoading } = useImsItems(filters);
  const { data: categories } = useImsCategoriesForSelect(storeId || undefined);
  const { data: units } = useImsUnitsForSelect();

  // Mutations
  const createItem = useCreateImsItem();
  const updateItem = useUpdateImsItem();
  const deleteItem = useDeleteImsItem();
  const toggleActive = useToggleImsItemActive();

  // Open dialog for new item
  const handleAddNew = () => {
    setEditingItem(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (item: ImsItemWithRelations) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || '',
      category_id: item.category_id,
      item_type: item.item_type,
      base_unit_id: item.base_unit_id,
      purchase_unit_id: item.purchase_unit_id || '',
      sale_unit_id: item.sale_unit_id || '',
      indent_unit_id: item.indent_unit_id || '',
      cost_price: item.cost_price,
      mrp: item.mrp,
      selling_price: item.selling_price,
      hsn_code: item.hsn_code ?? '',
      gst_rate: item.gst_rate ?? 0,
      reorder_level: item.reorder_level,
      max_stock_level: item.max_stock_level,
      track_batch: item.track_batch,
      track_expiry: item.track_expiry,
      is_sellable_to_students: item.is_sellable_to_students,
      opening_stock: 0,
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!formData.code || !formData.name || !formData.category_id || !formData.base_unit_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (editingItem) {
        const updateData: UpdateImsItemDto = {
          code: formData.code,
          name: formData.name,
          description: formData.description || null,
          category_id: formData.category_id,
          item_type: formData.item_type,
          base_unit_id: formData.base_unit_id,
          purchase_unit_id: formData.purchase_unit_id || null,
          sale_unit_id: formData.sale_unit_id || null,
          indent_unit_id: formData.indent_unit_id || null,
          cost_price: formData.cost_price,
          mrp: formData.mrp,
          selling_price: formData.selling_price,
          hsn_code: formData.hsn_code || null,
          gst_rate: formData.gst_rate,
          reorder_level: formData.reorder_level,
          max_stock_level: formData.max_stock_level,
          track_batch: formData.track_batch,
          track_expiry: formData.track_expiry,
          is_sellable_to_students: formData.is_sellable_to_students,
        };
        await updateItem.mutateAsync({ id: editingItem.id, data: updateData });
        toast.success('Item updated successfully');
      } else {
        const createData: CreateImsItemDto = {
          code: formData.code,
          name: formData.name,
          description: formData.description || null,
          category_id: formData.category_id,
          item_type: formData.item_type,
          base_unit_id: formData.base_unit_id,
          purchase_unit_id: formData.purchase_unit_id || null,
          sale_unit_id: formData.sale_unit_id || null,
          indent_unit_id: formData.indent_unit_id || null,
          cost_price: formData.cost_price,
          mrp: formData.mrp,
          selling_price: formData.selling_price,
          hsn_code: formData.hsn_code || null,
          gst_rate: formData.gst_rate,
          reorder_level: formData.reorder_level,
          max_stock_level: formData.max_stock_level,
          is_active: true,
          track_batch: formData.track_batch,
          track_expiry: formData.track_expiry,
          is_sellable_to_students: formData.is_sellable_to_students,
          store_id: storeId || '',
          institution_id: institutionId || null,
        };
        const item = await createItem.mutateAsync(createData);
        // Apply opening stock if provided
        if (formData.opening_stock > 0) {
          await ImsStockAdjustmentService.createAdjustment(
            {
              item_id: item.id,
              adjustment_type: 'correction',
              quantity: formData.opening_stock,
              reason: 'Opening stock',
              institution_id: institutionId || '',
              store_id: storeId || undefined,
            },
            profile?.id || ''
          );
        }
        toast.success('Item created successfully');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Toggle active
  const handleToggleActive = async (item: ImsItemWithRelations) => {
    try {
      await toggleActive.mutateAsync({ id: item.id, isActive: !item.is_active });
      toast.success(
        `Item ${item.is_active ? 'deactivated' : 'activated'} successfully`
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to toggle item status');
    }
  };

  // Delete item
  const handleDelete = async (item: ImsItemWithRelations) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;
    try {
      await deleteItem.mutateAsync(item.id);
      toast.success('Item deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete item');
    }
  };

  // Adjust stock handler
  const handleAdjustStock = async () => {
    if (!adjustingItem || !adjustForm.adjustment_type || adjustForm.quantity <= 0 || !adjustForm.reason.trim()) {
      toast.error('Please fill all adjustment fields');
      return;
    }
    setIsAdjusting(true);
    try {
      await ImsStockAdjustmentService.createAdjustment(
        {
          item_id: adjustingItem.id,
          adjustment_type: adjustForm.adjustment_type,
          quantity: adjustForm.quantity,
          reason: adjustForm.reason,
          institution_id: institutionId || '',
          store_id: storeId || undefined,
        },
        profile?.id || ''
      );
      toast.success('Stock adjusted successfully');
      setAdjustDialogOpen(false);
      setAdjustingItem(null);
      setAdjustForm({ adjustment_type: 'correction', quantity: 0, reason: '' });
      queryClient.invalidateQueries({ queryKey: ['ims-items'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to adjust stock');
    } finally {
      setIsAdjusting(false);
    }
  };

  const isMutating =
    createItem.isPending || updateItem.isPending;

  return (
    <ContentLayout title="Inventory Items">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory Items</h1>
            <p className="text-muted-foreground mt-1">
              Manage your item catalog and pricing
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </DialogTitle>
                <DialogDescription>
                  {editingItem
                    ? 'Update the item details below.'
                    : 'Fill in the details to create a new inventory item.'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Row: Code + Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">
                      Code <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="code"
                      placeholder="e.g. ITM-001"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, code: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="Item name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={2}
                  />
                </div>

                {/* Row: Category + Item Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, category_id: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((cat: { id: string; name: string }) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Item Type <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.item_type}
                      onValueChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          item_type: val as ImsItemType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Base Unit */}
                <div className="space-y-2">
                  <Label>
                    Base Unit <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.base_unit_id}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, base_unit_id: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select base unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name} ({unit.abbreviation})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Alternate Units Section */}
                <div className="space-y-2 pt-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Alternate Units (Optional)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Define different units for purchasing, selling, and indent requests
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Purchase Unit */}
                  <div className="space-y-2">
                    <Label>Purchase Unit</Label>
                    <Select
                      value={formData.purchase_unit_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, purchase_unit_id: val === 'none' ? '' : val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Same as base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as base unit</SelectItem>
                        {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sale Unit */}
                  <div className="space-y-2">
                    <Label>Sale Unit</Label>
                    <Select
                      value={formData.sale_unit_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, sale_unit_id: val === 'none' ? '' : val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Same as base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as base unit</SelectItem>
                        {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Indent Unit */}
                  <div className="space-y-2">
                    <Label>Indent Unit</Label>
                    <Select
                      value={formData.indent_unit_id}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, indent_unit_id: val === 'none' ? '' : val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Same as base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as base unit</SelectItem>
                        {units?.map((unit: { id: string; name: string; abbreviation: string }) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row: Cost Price + MRP + Selling Price */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cost_price">Cost Price (excl. GST)</Label>
                    <Input
                      id="cost_price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.cost_price}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          cost_price: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mrp">MRP</Label>
                    <Input
                      id="mrp"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.mrp}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          mrp: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price">Selling Price</Label>
                    <Input
                      id="selling_price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.selling_price}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          selling_price: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* GST Settings */}
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm font-medium text-muted-foreground">
                    GST Settings
                  </Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hsn_code">HSN Code</Label>
                    <Input
                      id="hsn_code"
                      placeholder="e.g. 4820"
                      value={formData.hsn_code}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, hsn_code: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>GST Rate</Label>
                    <Select
                      value={String(formData.gst_rate)}
                      onValueChange={(val) =>
                        setFormData((prev) => ({ ...prev, gst_rate: Number(val) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0% (Exempt)</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                        <SelectItem value="28">28%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Auto-calculated: Cost Price with GST */}
                {formData.cost_price > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Cost Price with GST</Label>
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium">
                        {formatPrice(formData.cost_price * (1 + formData.gst_rate / 100))}
                      </div>
                      <p className="text-xs text-muted-foreground">Auto-calculated</p>
                    </div>
                  </div>
                )}

                {/* Row: Reorder Level + Max Stock Level */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level">Reorder Level</Label>
                    <Input
                      id="reorder_level"
                      type="number"
                      min={0}
                      value={formData.reorder_level}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          reorder_level: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_stock_level">Max Stock Level</Label>
                    <Input
                      id="max_stock_level"
                      type="number"
                      min={0}
                      value={formData.max_stock_level}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          max_stock_level: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track_batch"
                      checked={formData.track_batch}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          track_batch: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="track_batch" className="font-normal">
                      Track batch numbers
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track_expiry"
                      checked={formData.track_expiry}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          track_expiry: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="track_expiry" className="font-normal">
                      Track expiry dates
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_sellable_to_students"
                      checked={formData.is_sellable_to_students}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_sellable_to_students: checked === true,
                        }))
                      }
                    />
                    <Label htmlFor="is_sellable_to_students" className="font-normal">
                      Sellable to students (POS)
                    </Label>
                  </div>
                </div>

                {/* Opening Stock — only shown on create */}
                {!editingItem && (
                  <div className="space-y-2 border-t pt-4">
                    <Label htmlFor="opening_stock">Opening Stock</Label>
                    <p className="text-xs text-muted-foreground">
                      Set the initial stock quantity for this item (optional).
                    </p>
                    <Input
                      id="opening_stock"
                      type="number"
                      min={0}
                      value={formData.opening_stock}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          opening_stock: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
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
                  {isMutating && <BeatLoader color="#fff" size={8} className="mr-2" />}
                  {editingItem ? 'Update Item' : 'Create Item'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Adjust Stock Dialog */}
        <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Adjust Stock</DialogTitle>
              <DialogDescription>
                {adjustingItem?.name} — Current:{' '}
                {adjustingItem?.stock?.current_quantity ?? '—'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Adjustment Type</Label>
                <Select
                  value={adjustForm.adjustment_type}
                  onValueChange={(val) =>
                    setAdjustForm((p) => ({ ...p, adjustment_type: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="correction">Correction (add)</SelectItem>
                    <SelectItem value="physical_count">Physical Count (add)</SelectItem>
                    <SelectItem value="transfer">Transfer In (add)</SelectItem>
                    <SelectItem value="damage">Damage (remove)</SelectItem>
                    <SelectItem value="expiry">Expiry (remove)</SelectItem>
                    <SelectItem value="theft">Theft / Loss (remove)</SelectItem>
                    <SelectItem value="return_to_supplier">Return to Supplier (remove)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={adjustForm.quantity}
                  onChange={(e) =>
                    setAdjustForm((p) => ({
                      ...p,
                      quantity: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  placeholder="Explain the reason for this adjustment..."
                  value={adjustForm.reason}
                  onChange={(e) =>
                    setAdjustForm((p) => ({ ...p, reason: e.target.value }))
                  }
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAdjustDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAdjustStock} disabled={isAdjusting}>
                {isAdjusting && (
                  <BeatLoader color="#fff" size={8} className="mr-2" />
                )}
                Apply Adjustment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              <Select
                value={categoryFilter}
                onValueChange={(val) => setCategoryFilter(val === 'all' ? '' : val)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((cat: { id: string; name: string }) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(val) => setTypeFilter(val === 'all' ? '' : val)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <CardContent className="pt-6">
            {itemsLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : !items?.data || items.data.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No items found</p>
                <p className="text-sm mt-1">
                  {debouncedSearch || categoryFilter || typeFilter
                    ? 'Try adjusting your filters'
                    : 'Add your first inventory item to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name / Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Base Unit</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Cost Price</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-center">GST %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items?.data ?? []).map(
                      (item: ImsItemWithRelations) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">
                            {item.code}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.category?.name || '-'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={itemTypeBadgeVariant(item.item_type)}
                            >
                              {item.item_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {item.base_unit?.abbreviation || item.base_unit?.name || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.stock != null ? (
                              <span className={
                                item.stock.current_quantity === 0
                                  ? 'text-red-500 font-medium'
                                  : item.stock.current_quantity <= (item.reorder_level || 0)
                                  ? 'text-yellow-600 font-medium'
                                  : 'text-green-600 font-medium'
                              }>
                                {item.stock.current_quantity}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(item.cost_price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(item.mrp)}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.gst_rate > 0 ? (
                              <Badge variant="outline" className="font-mono text-xs">
                                {item.gst_rate}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.is_active ? (
                              <Badge variant="success">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
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
                                <DropdownMenuItem onClick={() => handleEdit(item)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setAdjustingItem(item);
                                  setAdjustForm({ adjustment_type: 'correction', quantity: 0, reason: '' });
                                  setAdjustDialogOpen(true);
                                }}>
                                  <Layers className="h-4 w-4 mr-2" />
                                  Adjust Stock
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleToggleActive(item)}
                                >
                                  <ToggleLeft className="h-4 w-4 mr-2" />
                                  {item.is_active ? 'Deactivate' : 'Activate'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDelete(item)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    )}
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
