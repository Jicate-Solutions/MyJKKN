// app/(routes)/applications/categories/_components/category-list.tsx
'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { MoreVertical, Plus, Trash2, Edit2 } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Category } from '@/types/categories';
import { EditCategoryModal } from './edit-category-modal';
import { CreateSubcategoryModal } from './create-subcategory-modal';
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

interface CategoryListProps {
  categories: Category[];
  onUpdate: () => void;
}

export function CategoryList({ categories, onUpdate }: CategoryListProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    type: 'category' | 'subcategory';
    name: string;
  } | null>(null);
  const supabase = createClientComponentClient();

  const handleDeleteClick = (
    id: string,
    type: 'category' | 'subcategory',
    name: string
  ) => {
    setItemToDelete({ id, type, name });
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from(itemToDelete.type === 'category' ? 'categories' : 'subcategories')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;

      toast.success(
        `${
          itemToDelete.type === 'category' ? 'Category' : 'Subcategory'
        } deleted successfully`
      );
      onUpdate();
    } catch (error) {
      console.error(`Error deleting ${itemToDelete.type}:`, error);
      toast.error(`Failed to delete ${itemToDelete.type}`);
    } finally {
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  return (
    <div className='w-full overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='min-w-[120px]'>Category</TableHead>
            <TableHead className='hidden md:table-cell'>Description</TableHead>
            <TableHead className='min-w-[150px]'>Subcategories</TableHead>
            <TableHead className='w-[50px]'></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className='text-center text-muted-foreground py-8'
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
                  <div className='space-y-1.5'>
                    {category.subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        className='flex items-center justify-between bg-secondary/20 rounded-md px-2 py-1'
                      >
                        <span className='text-sm'>{sub.name}</span>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            handleDeleteClick(sub.id, 'subcategory', sub.name)
                          }
                          className='h-6 w-6 p-0 hover:bg-destructive/20 hover:text-destructive'
                          aria-label={`Delete ${sub.name} subcategory`}
                        >
                          <Trash2 className='h-3 w-3' />
                        </Button>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='ghost'
                        className='h-8 w-8 p-0 hover:bg-secondary'
                        aria-label='Open category actions'
                      >
                        <MoreVertical className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='w-[200px]'>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedCategory(category);
                          setShowSubcategoryModal(true);
                        }}
                        className='flex items-center gap-2'
                      >
                        <Plus className='h-4 w-4' />
                        Add Subcategory
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedCategory(category);
                          setShowEditModal(true);
                        }}
                        className='flex items-center gap-2'
                      >
                        <Edit2 className='h-4 w-4' />
                        Edit Category
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          handleDeleteClick(
                            category.id,
                            'category',
                            category.name
                          )
                        }
                        className='flex items-center gap-2 text-destructive focus:text-destructive'
                      >
                        <Trash2 className='h-4 w-4' />
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

      {selectedCategory && (
        <>
          <EditCategoryModal
            open={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedCategory(null);
            }}
            onSuccess={() => {
              setShowEditModal(false);
              setSelectedCategory(null);
              onUpdate();
            }}
            category={selectedCategory}
          />

          <CreateSubcategoryModal
            open={showSubcategoryModal}
            onClose={() => {
              setShowSubcategoryModal(false);
              setSelectedCategory(null);
            }}
            onSuccess={() => {
              setShowSubcategoryModal(false);
              setSelectedCategory(null);
              onUpdate();
            }}
            parentCategory={selectedCategory}
          />
        </>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              {itemToDelete?.type === 'category'
                ? 'the category'
                : 'the subcategory'}{' '}
              &quot;
              {itemToDelete?.name}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className='bg-destructive hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
