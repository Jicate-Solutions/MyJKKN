// app/(routes)/applications/categories/_components/category-list.tsx
'use client';

import { useState } from 'react';
import { MoreVertical, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { Category, Subcategory } from '@/types/categories';
import { CategoryService } from '@/lib/services/application/category-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { EditCategoryModal } from './edit-category-modal';
import { CreateSubcategoryModal } from './create-subcategory-modal';
import { EditSubcategoryModal } from './edit-subcategory-modal';

interface CategoryListProps {
  categories: Category[];
  onRefresh: () => void;
}

export function CategoryList({ categories, onRefresh }: CategoryListProps) {
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [editingSubcategory, setEditingSubcategory] =
    useState<Subcategory | null>(null);
  const [deletingSubcategory, setDeletingSubcategory] = useState<string | null>(
    null
  );
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewCategories =
    isSuperAdmin || canAccess('applications.categories', 'view');
  const canEditCategories =
    isSuperAdmin || canAccess('applications.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('applications.categories', 'delete');
  const canAddSubcategories =
    isSuperAdmin ||
    canAccess('applications.categories', 'create') ||
    canAccess('applications.categories', 'edit');

  const handleDelete = async () => {
    if (!deletingCategory) return;

    try {
      setIsLoading(true);
      await CategoryService.deleteCategory(deletingCategory);
      onRefresh();
    } catch (error) {
      console.error('Error deleting category:', error);
    } finally {
      setDeletingCategory(null);
      setIsLoading(false);
    }
  };

  // Add this function to handle subcategory deletion
  const handleDeleteSubcategory = async () => {
    if (!deletingSubcategory) return;

    try {
      setIsLoading(true);
      await CategoryService.deleteSubcategory(deletingSubcategory);
      onRefresh();
    } catch (error) {
      console.error('Error deleting subcategory:', error);
    } finally {
      setDeletingSubcategory(null);
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
          disabled={!canViewCategories}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[200px]'>Name</TableHead>
              <TableHead className='hidden md:table-cell'>
                Description
              </TableHead>
              <TableHead>Subcategories</TableHead>
              <TableHead className='w-[70px]'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className='h-24 text-center text-muted-foreground'
                >
                  No categories found
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className='font-medium'>{category.name}</TableCell>
                  <TableCell className='hidden md:table-cell'>
                    {category.description || '-'}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1.5'>
                      {category.subcategories.map((sub) => (
                        <Badge
                          key={sub.id}
                          variant='secondary'
                          className='group relative flex items-center gap-1.5 pr-1.5'
                        >
                          <span className='max-w-[150px] truncate'>
                            {sub.name}
                          </span>
                          <div className='flex items-center opacity-0 transition-opacity group-hover:opacity-100'>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-5 w-5 p-0 hover:bg-secondary'
                              onClick={() => setEditingSubcategory(sub)}
                              disabled={!canEditCategories}
                              style={{ opacity: canEditCategories ? 1 : 0.5 }}
                            >
                              <Edit className='h-3 w-3' />
                              <span className='sr-only'>Edit {sub.name}</span>
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-5 w-5 p-0 text-destructive hover:bg-destructive/10'
                              onClick={() => setDeletingSubcategory(sub.id)}
                              disabled={!canDeleteCategories}
                              style={{ opacity: canDeleteCategories ? 1 : 0.5 }}
                            >
                              <Trash2 className='h-3 w-3' />
                              <span className='sr-only'>Delete {sub.name}</span>
                            </Button>
                          </div>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 p-0 hover:bg-secondary'
                        >
                          <span className='sr-only'>
                            Open menu for {category.name}
                          </span>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='w-[200px]'>
                        <DropdownMenuItem
                          onClick={
                            canAddSubcategories
                              ? () => setAddingSubcategoryTo(category.id)
                              : undefined
                          }
                          disabled={!canAddSubcategories}
                          className='cursor-pointer'
                          style={{ opacity: canAddSubcategories ? 1 : 0.5 }}
                        >
                          <Plus className='mr-2 h-4 w-4' />
                          Add Subcategory
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={
                            canEditCategories
                              ? () => setEditingCategory(category)
                              : undefined
                          }
                          disabled={!canEditCategories}
                          className='cursor-pointer'
                          style={{ opacity: canEditCategories ? 1 : 0.5 }}
                        >
                          <Edit className='mr-2 h-4 w-4' />
                          Edit Category
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={
                            canDeleteCategories
                              ? () => setDeletingCategory(category.id)
                              : undefined
                          }
                          disabled={!canDeleteCategories}
                          className={
                            canDeleteCategories
                              ? 'cursor-pointer text-destructive focus:bg-destructive/10'
                              : 'cursor-pointer'
                          }
                          style={{ opacity: canDeleteCategories ? 1 : 0.5 }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Category
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditCategoryModal
        category={editingCategory}
        open={!!editingCategory && canEditCategories}
        onClose={() => setEditingCategory(null)}
        onSaved={() => {
          setEditingCategory(null);
          onRefresh();
        }}
      />

      <CreateSubcategoryModal
        categoryId={addingSubcategoryTo}
        open={!!addingSubcategoryTo && canAddSubcategories}
        onClose={() => setAddingSubcategoryTo(null)}
        onCreated={() => {
          setAddingSubcategoryTo(null);
          onRefresh();
        }}
      />

      <AlertDialog
        open={!!deletingCategory && canDeleteCategories}
        onOpenChange={() => setDeletingCategory(null)}
      >
        <AlertDialogContent className='sm:max-w-[425px]'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-xl'>
              Delete Category
            </AlertDialogTitle>
            <AlertDialogDescription className='text-muted-foreground'>
              This will permanently delete the category and all its
              subcategories. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='gap-2'>
            <AlertDialogCancel className='mt-0'>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive hover:bg-destructive/90'
              disabled={isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditSubcategoryModal
        subcategory={editingSubcategory}
        open={!!editingSubcategory && canEditCategories}
        onClose={() => setEditingSubcategory(null)}
        onSaved={() => {
          setEditingSubcategory(null);
          onRefresh();
        }}
      />

      <AlertDialog
        open={!!deletingSubcategory && canDeleteCategories}
        onOpenChange={() => setDeletingSubcategory(null)}
      >
        <AlertDialogContent className='sm:max-w-[425px]'>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-xl'>
              Delete Subcategory
            </AlertDialogTitle>
            <AlertDialogDescription className='text-muted-foreground'>
              This will permanently delete the subcategory. Applications
              assigned to this subcategory will be moved to
              &apos;Uncategorized&apos;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='gap-2'>
            <AlertDialogCancel className='mt-0'>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubcategory}
              className='bg-destructive hover:bg-destructive/90'
              disabled={isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
