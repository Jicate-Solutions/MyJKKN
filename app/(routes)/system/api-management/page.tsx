'use client';

import { useState, useEffect } from 'react';
import { Code2, Plus, Trash2 } from 'lucide-react';
import toast  from 'react-hot-toast';
import Link from 'next/link';
import { BeatLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import { ApiKey } from '@/types/api-keys';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
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
import { ApiKeyList } from './_components/api-key-list';
import { CreateApiKeyModal } from './_components/create-api-key-modal';
import { TestApiKeyModal } from './_components/test-api-key-modal';

export default function ApiKeysPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/system/api-keys');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch API keys');
      }
      const data = await response.json();
      setApiKeys(data);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to load API keys'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateKey = async () => {
    await fetchApiKeys();
    setShowCreateModal(false);
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const response = await fetch(`/api/system/api-keys/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete API key');
      }

      toast.success('API key deleted successfully');
      await fetchApiKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete API key'
      );
    }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/system/api-keys/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !isActive })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update API key');
      }

      toast.success('API key updated successfully');
      await fetchApiKeys();
    } catch (error) {
      console.error('Error updating API key:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update API key'
      );
    }
  };

  const handleGenerateTestKey = async () => {
    try {
      const response = await fetch('/api/system/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test API Key',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate test key');
      }

      const data = await response.json();
      toast.success('Test API key generated successfully');

      // Show the API key to the user
      toast.success(
        'Copy your API key (shown only once): ' + data.plainTextKey,
        { duration: 10000 }
      );

      await fetchApiKeys();
    } catch (error) {
      console.error('Error generating test key:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate test key'
      );
    }
  };

  const handleSelectKey = (id: string) => {
    setSelectedKeys((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedKeys(selected ? apiKeys.map((key) => key.id) : []);
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.length === 0) return;

    setIsBulkDeleting(true);
    try {
      const response = await fetch('/api/system/api-keys/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedKeys })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete API keys');
      }

      toast.success(`Successfully deleted ${selectedKeys.length} API key(s)`);
      setSelectedKeys([]);
      setShowBulkDeleteDialog(false);
      await fetchApiKeys();
    } catch (error) {
      console.error('Error bulk deleting API keys:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete API keys'
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <ContentLayout title='API Management'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/system'>System</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>API Management</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 p-4 md:p-6'>
        <div className='space-y-4 md:space-y-0 md:flex md:justify-between md:items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight py-1'>API Keys</h1>
            <p className='text-sm text-muted-foreground'>
              Manage API keys for external access to your data
            </p>
          </div>

          <div className='flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4'>
            {selectedKeys.length > 0 && (
              <Button
                variant='destructive'
                onClick={() => setShowBulkDeleteDialog(true)}
                className='w-full sm:w-auto'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete Selected ({selectedKeys.length})
              </Button>
            )}
            <Button
              variant='outline'
              onClick={() => setShowTestModal(true)}
              className='w-full sm:w-auto'
            >
              <Code2 className='mr-2 h-4 w-4' />
              Test API Key
            </Button>
            <Button
              variant='outline'
              onClick={handleGenerateTestKey}
              className='w-full sm:w-auto'
            >
              Generate Test Key
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className='w-full sm:w-auto'
            >
              <Plus className='mr-2 h-4 w-4' />
              Create API Key
            </Button>
          </div>
        </div>

        <Card className='overflow-hidden'>
          <CardHeader className='p-4 md:p-6'>
            <CardTitle>API Keys</CardTitle>
            <CardDescription className='text-sm'>
              View and manage your API keys. Keep these secure - they provide
              access to your data.
            </CardDescription>
          </CardHeader>
          <CardContent className='p-4 md:p-6'>
            {isLoading ? (
              <div className='flex justify-center items-center h-32'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <ApiKeyList
                  apiKeys={apiKeys}
                  onDelete={handleDeleteKey}
                  onToggle={handleToggleKey}
                  selectedKeys={selectedKeys}
                  onSelectKey={handleSelectKey}
                  onSelectAll={handleSelectAll}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TestApiKeyModal
        open={showTestModal}
        onClose={() => setShowTestModal(false)}
      />
      <CreateApiKeyModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateKey}
      />

      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Keys</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedKeys.length} API key(s)?
              This action cannot be undone. Applications using these keys will
              lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
