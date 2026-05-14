'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import {
  Card,
  CardContent,
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
  Trash2,
  FolderTree,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsCategories,
  useImsCategoriesForSelect,
  useCreateImsCategory,
  useUpdateImsCategory,
  useDeleteImsCategory,
} from '@/hooks/ims/use-ims-inventory';
import type {
  ImsCategoryFilters,
  ImsItemCategory,
  CreateImsCategoryDto,
  UpdateImsCategoryDto,
} from '@/types/ims';

interface CategoryFormData {
  code: string;
  name: string;
  description: string;
  parent_id: string;
  is_active: boolean;
}

const emptyFormData: CategoryFormData = {
  code: '',
  name: '',
  description: '',
  parent_id: '',
  is_active: true,
};

export default function ItemCategoriesPage() {
  const { isSuperAdmin } = usePermissions();
  const { storeId } = useImsStoreContext();

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ImsItemCategory | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(emptyFormData);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build filters
  const filters: ImsCategoryFilters = {
    search: debouncedSearch || undefined,
    store_id: storeId || undefined,
  };

  // Queries
  const { data: categoriesList, isLoading: categoriesLoading } =
    useImsCategories(filters);
  const { data: categoriesForSelect } = useImsCategoriesForSelect(storeId || undefined);

  // Mutations
  const createCategory = useCreateImsCategory();
  const updateCategory = useUpdateImsCategory();
  const deleteCategory = useDeleteImsCategory();

  // Open dialog for new category
  const handleAddNew = () => {
    setEditingCategory(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (category: ImsItemCategory) => {
    setEditingCategory(category);
    setFormData({
      code: category.code,
      name: category.name,
      description: category.description || '',
      parent_id: category.parent_id || '',
      is_active: category.is_active,
    });
    setDialogOpen(true);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!formData.code || !formData.name) {
      toast.error('Please fill in code and name');
      return;
    }

    try {
      if (editingCategory) {
        const updateData: UpdateImsCategoryDto = {
          code: formData.code,
          name: formData.name,
          description: formData.description || null,
          parent_id: formData.parent_id || null,
          is_active: formData.is_active,
        };
        await updateCategory.mutateAsync({
          id: editingCategory.id,
          data: updateData,
        });
        toast.success('Category updated successfully');
      } else {
        const createData: CreateImsCategoryDto = {
          code: formData.code,
          name: formData.name,
          description: formData.description || null,
          parent_id: formData.parent_id || null,
          is_active: formData.is_active,
          store_id: storeId || null,
        };
        await createCategory.mutateAsync(createData);
        toast.success('Category created successfully');
      }
      setDialogOpen(false);
      setEditingCategory(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    }
  };

  // Delete category
  const handleDelete = async (category: ImsItemCategory) => {
    if (
      !confirm(
        `Are you sure you want to delete "${category.name}"? This may affect items assigned to this category.`
      )
    ) {
      return;
    }
    try {
      await deleteCategory.mutateAsync(category.id);
      toast.success('Category deleted successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete category');
    }
  };

  const isMutating = createCategory.isPending || updateCategory.isPending;

  // Find parent name helper
  const getParentName = (parentId: string | null): string => {
    if (!parentId || !categoriesForSelect) return '-';
    const parent = categoriesForSelect.find(
      (c: { id: string; name: string }) => c.id === parentId
    );
    return parent ? parent.name : '-';
  };

  return (
    <ContentLayout title="Item Categories">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Item Categories</h1>
            <p className="text-muted-foreground mt-1">
              Organize inventory items into categories
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </DialogTitle>
                <DialogDescription>
                  {editingCategory
                    ? 'Update the category details below.'
                    : 'Fill in the details to create a new item category.'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Code */}
                <div className="space-y-2">
                  <Label htmlFor="cat-code">
                    Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cat-code"
                    placeholder="e.g. CAT-MED"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, code: e.target.value }))
                    }
                  />
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="cat-name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cat-name"
                    placeholder="Category name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="cat-description">Description</Label>
                  <Textarea
                    id="cat-description"
                    placeholder="Optional description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={2}
                  />
                </div>

                {/* Parent Category */}
                <div className="space-y-2">
                  <Label>Parent Category</Label>
                  <Select
                    value={formData.parent_id}
                    onValueChange={(val) =>
                      setFormData((prev) => ({
                        ...prev,
                        parent_id: val === 'none' ? '' : val,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None (top-level)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (top-level)</SelectItem>
                      {categoriesForSelect
                        ?.filter(
                          (c: { id: string }) => c.id !== editingCategory?.id
                        )
                        .map((cat: { id: string; name: string }) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Is Active */}
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="cat-is-active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        is_active: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="cat-is-active" className="font-normal">
                    Active
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
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Categories Table */}
        <Card>
          <CardContent className="pt-6">
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : !categoriesList?.data || categoriesList.data.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No categories found</p>
                <p className="text-sm mt-1">
                  {debouncedSearch
                    ? 'Try adjusting your search'
                    : 'Add your first category to organize items'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Parent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(categoriesList?.data ?? []).map(
                      (category: ImsItemCategory) => (
                        <TableRow key={category.id}>
                          <TableCell className="font-mono text-sm">
                            {category.code}
                          </TableCell>
                          <TableCell className="font-medium">
                            {category.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {category.description || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {getParentName(category.parent_id)}
                          </TableCell>
                          <TableCell>
                            {category.is_active ? (
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
                                <DropdownMenuItem
                                  onClick={() => handleEdit(category)}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDelete(category)}
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
