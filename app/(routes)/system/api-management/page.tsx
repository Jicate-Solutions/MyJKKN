// app/(routes)/api-keys/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlusCircle, Trash2, Copy } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ContentLayout } from '@/components/layout/content-layout';
import { APIKeyWithoutValue } from '@/types/api-keys';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { APIKeyTester } from '@/components/apikey/api-key-tester';

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Skeleton className='h-8 w-1/3' />
        <Skeleton className='h-4 w-1/4' />
      </div>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className='p-6'>
              <Skeleton className='h-8 w-20 mb-2' />
              <Skeleton className='h-6 w-16' />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-4'>
            {[...Array(3)].map((_, i) => (
              <div key={i} className='flex items-center justify-between'>
                <Skeleton className='h-6 w-1/4' />
                <Skeleton className='h-6 w-1/4' />
                <Skeleton className='h-6 w-1/4' />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// API Keys list component
const APIKeysList = ({
  apiKeys,
  onDeactivate,
  onRefresh
}: {
  apiKeys: APIKeyWithoutValue[];
  onDeactivate: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) => {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const calculateStatus = (key: APIKeyWithoutValue) => {
    if (!key.is_active) return 'inactive';
    if (key.expires_at && new Date(key.expires_at) < new Date())
      return 'expired';
    return 'active';
  };

  return (
    <div className='space-y-4'>
      {apiKeys.length === 0 ? (
        <Card>
          <CardContent className='p-6 text-center'>
            <p className='text-muted-foreground'>No API keys found</p>
          </CardContent>
        </Card>
      ) : (
        apiKeys.map((key) => (
          <Card key={key.id}>
            <CardContent className='p-4'>
              <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
                <div>
                  <h3 className='font-medium'>{key.name}</h3>
                  <p className='text-sm text-muted-foreground'>
                    Created: {formatDate(key.created_at)}
                  </p>
                </div>
                <div className='flex items-center gap-4'>
                  <Badge
                    variant={
                      calculateStatus(key) === 'active'
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {calculateStatus(key)}
                  </Badge>
                  {key.is_active && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => onDeactivate(key.id)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default function APIKeysPage() {
  const [apiKeys, setApiKeys] = useState<APIKeyWithoutValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [expiryDays, setExpiryDays] = useState('never');
  const supabase = createClientComponentClient();

  const fetchAPIKeys = async () => {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { data: keys, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(keys || []);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAPIKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createNewKey = async () => {
    try {
      setIsLoading(true);
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      let expiresAt: string | null = null;
      if (expiryDays !== 'never') {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(expiryDays));
        expiresAt = date.toISOString();
      }

      // Generate key value
      const keyBytes = new Uint8Array(32);
      crypto.getRandomValues(keyBytes);
      const keyValue = `myjkkn_${Array.from(keyBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;

      const { data: newKey, error } = await supabase
        .from('api_keys')
        .insert({
          name: newKeyName,
          key_value: keyValue,
          user_id: user.id,
          created_by: user.id,
          permissions: { read: true, write: false },
          scope: [],
          expires_at: expiresAt,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setNewKeyValue(keyValue);
      await fetchAPIKeys();
      toast.success('API key created successfully');
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setIsLoading(false);
    }
  };

  const deactivateKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId);

      if (error) throw error;

      await fetchAPIKeys();
      toast.success('API key deactivated successfully');
    } catch (error) {
      console.error('Error deactivating API key:', error);
      toast.error('Failed to deactivate API key');
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a key name');
      return;
    }
    await createNewKey();
  };

  return (
    <ContentLayout title='API Keys'>
      <div className='space-y-6'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>API Keys</h1>
            <p className='text-muted-foreground'>
              Manage and test your API keys
            </p>
          </div>
          <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                Create New Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key to access your data programmatically
                </DialogDescription>
              </DialogHeader>
              {!newKeyValue ? (
                // Create Key Form
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium'>Key Name</label>
                    <Input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder='Enter a name for your API key'
                    />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium'>Expiration</label>
                    <Select value={expiryDays} onValueChange={setExpiryDays}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='never'>Never</SelectItem>
                        <SelectItem value='30'>30 days</SelectItem>
                        <SelectItem value='60'>60 days</SelectItem>
                        <SelectItem value='90'>90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button
                      variant='outline'
                      onClick={() => setShowNewKeyDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreateKey}>Create Key</Button>
                  </DialogFooter>
                </div>
              ) : (
                // Show New Key
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium'>
                      Your New API Key
                    </label>
                    <div className='flex items-center space-x-2'>
                      <code className='flex-1 p-2 bg-muted rounded-md break-all text-xs'>
                        {newKeyValue}
                      </code>
                      <Button
                        size='icon'
                        variant='outline'
                        onClick={() => {
                          navigator.clipboard.writeText(newKeyValue);
                          toast.success('Copied to clipboard');
                        }}
                      >
                        <Copy className='h-4 w-4' />
                      </Button>
                    </div>
                    <p className='text-sm text-muted-foreground mt-2'>
                      Make sure to copy your API key now. You won&apos;t be able
                      to see it again!
                    </p>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        setShowNewKeyDialog(false);
                        setNewKeyValue('');
                        setNewKeyName('');
                      }}
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <Suspense fallback={<LoadingSkeleton />}>
          <Tabs defaultValue='keys' className='space-y-6'>
            <TabsList>
              <TabsTrigger value='keys'>API Keys</TabsTrigger>
              <TabsTrigger value='test'>Test API Key</TabsTrigger>
            </TabsList>

            <TabsContent value='keys'>
              {isLoading ? (
                <LoadingSkeleton />
              ) : (
                <APIKeysList
                  apiKeys={apiKeys}
                  onDeactivate={deactivateKey}
                  onRefresh={fetchAPIKeys}
                />
              )}
            </TabsContent>

            <TabsContent value='test'>
              <APIKeyTester />
            </TabsContent>
          </Tabs>
        </Suspense>
      </div>
    </ContentLayout>
  );
}
