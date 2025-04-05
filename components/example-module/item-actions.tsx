'use client';

import { Pencil, Trash, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

interface ItemType {
  id: string;
  name: string;
  description: string;
  // Add other fields as needed
}

interface ItemActionsProps {
  item: ItemType;
  onView: (item: ItemType) => void;
  onEdit: (item: ItemType) => void;
  onDelete: (itemId: string) => void;
}

export function ItemActions({
  item,
  onView,
  onEdit,
  onDelete
}: ItemActionsProps) {
  const { isLoading, error, can } = usePermissions([
    'view_module_items',
    'edit_module_items',
    'delete_module_items'
  ]);

  if (isLoading) {
    return <Skeleton className='h-9 w-36' />;
  }

  if (error) {
    return (
      <p className='text-destructive text-xs'>Error loading permissions</p>
    );
  }

  return (
    <div className='flex space-x-2'>
      {can('view_module_items') && (
        <Button variant='ghost' size='sm' onClick={() => onView(item)}>
          <Eye className='h-4 w-4 mr-1' />
          View
        </Button>
      )}

      {can('edit_module_items') && (
        <Button variant='ghost' size='sm' onClick={() => onEdit(item)}>
          <Pencil className='h-4 w-4 mr-1' />
          Edit
        </Button>
      )}

      {can('delete_module_items') && (
        <Button
          variant='ghost'
          size='sm'
          className='text-destructive hover:text-destructive'
          onClick={() => onDelete(item.id)}
        >
          <Trash className='h-4 w-4 mr-1' />
          Delete
        </Button>
      )}
    </div>
  );
}
