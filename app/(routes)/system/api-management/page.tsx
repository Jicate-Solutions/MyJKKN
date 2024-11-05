'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
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
import { ApiKeyList } from './_components/api-key-list';
import { CreateApiKeyModal } from './_components/create-api-key-modal';

export default function ApiKeysPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

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

      <div className='space-y-4 p-4 md:p-6'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>API Keys</h1>
            <p className='text-sm text-muted-foreground'>
              Manage API keys for external access to your data
            </p>
          </div>
          <div className='flex gap-4'>
            <Button variant='outline' onClick={handleGenerateTestKey}>
              Generate Test Key
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className='mr-2 h-4 w-4' />
              Create API Key
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              View and manage your API keys. Keep these secure - they provide
              access to your data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='flex justify-center items-center h-32'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ApiKeyList
                apiKeys={apiKeys}
                onDelete={handleDeleteKey}
                onToggle={handleToggleKey}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <CreateApiKeyModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateKey}
      />
    </ContentLayout>
  );
}
