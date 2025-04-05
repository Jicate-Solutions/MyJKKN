'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { ItemActions } from '@/components/example-module/item-actions';
import { PermissionGuard } from '@/components/permission-guard';

// Example data type
interface ModuleItem {
  id: string;
  name: string;
  description: string;
}

// Example data
const mockItems: ModuleItem[] = [
  { id: '1', name: 'Item 1', description: 'Description for item 1' },
  { id: '2', name: 'Item 2', description: 'Description for item 2' },
  { id: '3', name: 'Item 3', description: 'Description for item 3' }
];

export default function ExampleModulePage() {
  const router = useRouter();
  const [items, setItems] = useState<ModuleItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  const {
    isLoading: isLoadingPermissions,
    error,
    can
  } = usePermissions(['view_module', 'create_module_items']);

  // Fetch items (simulated)
  useEffect(() => {
    const fetchItems = async () => {
      // Simulate API request
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setItems(mockItems);
      setIsLoadingItems(false);
    };

    fetchItems();
  }, []);

  // Redirect if no access
  useEffect(() => {
    if (!isLoadingPermissions && !can('view_module')) {
      router.push('/unauthorized');
    }
  }, [isLoadingPermissions, can, router]);

  // Handle actions
  const handleView = (item: ModuleItem) => {
    router.push(`/example-module/${item.id}`);
  };

  const handleEdit = (item: ModuleItem) => {
    router.push(`/example-module/${item.id}/edit`);
  };

  const handleDelete = async (itemId: string) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setItems(items.filter((item) => item.id !== itemId));
    alert(`Item ${itemId} deleted`);
  };

  // Loading state
  if (isLoadingPermissions || isLoadingItems) {
    return (
      <ContentLayout title='Example Module'>
        <div className='min-h-[400px] flex items-center justify-center'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission error state
  if (error) {
    return (
      <ContentLayout title='Example Module'>
        <div className='p-4 text-destructive'>
          Unable to verify permissions. Please try again later.
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Example Module'>
      <div className='mb-6 flex justify-between items-center'>
        <p className='text-muted-foreground'>Manage your module items</p>

        {/* Only show create button if user has permission */}
        <PermissionGuard permissions={['create_module_items']}>
          <Button onClick={() => router.push('/example-module/new')}>
            <PlusCircle className='mr-2 h-4 w-4' />
            Create Item
          </Button>
        </PermissionGuard>
      </div>

      {/* Items list */}
      <div className='space-y-4'>
        {items.length === 0 ? (
          <p className='text-muted-foreground text-center py-8'>
            No items found
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className='p-4 border rounded-lg flex justify-between items-center'
            >
              <div>
                <h3 className='font-medium'>{item.name}</h3>
                <p className='text-sm text-muted-foreground'>
                  {item.description}
                </p>
              </div>

              <ItemActions
                item={item}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </div>
          ))
        )}
      </div>
    </ContentLayout>
  );
}
