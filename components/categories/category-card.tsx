import { memo, useState } from 'react';
import { MoreVertical, Pencil, Trash2, Plus, Eye } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { CategoryWithSubcategories } from '@/types/categories';

interface CategoryCardProps {
  category: CategoryWithSubcategories;
  onDelete: (id: string) => Promise<void>;
}

export const CategoryCard = memo(function CategoryCard({ 
  category, 
  onDelete 
}: CategoryCardProps) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(category.id);
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    } finally {
      setIsDeleting(false);
      setShowDeleteAlert(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-start justify-between'>
            <div className='space-y-1'>
              <CardTitle className='flex items-center'>
                {category.name}
                {!category.is_active && (
                  <Badge variant='secondary' className='ml-2'>
                    Inactive
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/applications/categories/${category.id}`}
                    className='cursor-pointer'
                  >
                    <Eye className='mr-2 h-4 w-4' />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/applications/categories/${category.id}/edit`}
                    className='cursor-pointer'
                  >
                    <Pencil className='mr-2 h-4 w-4' />
                    Edit Category
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='text-destructive focus:text-destructive'
                  onSelect={() => setShowDeleteAlert(true)}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-2'>
            <div className='text-sm font-medium'>Subcategories:</div>
            <div className='flex flex-wrap gap-2'>
              {category.subcategories && category.subcategories.length > 0 ? (
                category.subcategories.map((subcategory) => (
                  <Badge
                    key={subcategory.id}
                    variant={subcategory.is_active ? 'default' : 'secondary'}
                  >
                    {subcategory.name}
                  </Badge>
                ))
              ) : (
                <span className='text-sm text-muted-foreground'>
                  No subcategories
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              category and all its subcategories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
})
