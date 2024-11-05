// app/(routes)/api-keys/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlusCircle, Trash2, Copy, CheckCircle } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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
import { APIKeyTester } from '@/components/apikey/api-key-tester';
import { debugLog, logError } from '@/lib/api/debug-logger';

export default function APIKeysPage() {
  const [apiKeys, setApiKeys] = useState<APIKeyWithoutValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [expiryDays, setExpiryDays] = useState('never');
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchAPIKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const createNewKey = async () => {
    try {
      setIsLoading(true);

      // 1. Get current user
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Authentication required');
      }

      // 2. Generate key value
      const keyBytes = new Uint8Array(32);
      crypto.getRandomValues(keyBytes);
      const keyValue = `myjkkn_${Array.from(keyBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;

      // 3. Calculate expiration date if needed
      let expiresAt: string | null = null;
      if (expiryDays !== 'never') {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(expiryDays));
        expiresAt = date.toISOString();
      }

      console.log('Creating API key with params:', {
        name: newKeyName,
        userId: user.id,
        expiresAt
      });

      // 4. Insert new API key
      const { data: newKey, error: insertError } = await supabase
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

      if (insertError) {
        console.error('Insert Error:', insertError);
        throw new Error(insertError.message);
      }

      if (!newKey) {
        throw new Error('Failed to create API key - no data returned');
      }

      // 5. Update state and show success message
      setNewKeyValue(keyValue);
      await fetchAPIKeys();
      toast.success('API key created successfully');
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create API key'
      );
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleCreateKey = async () => {
    try {
      if (!newKeyName.trim()) {
        toast.error('Please enter a key name');
        return;
      }

      setIsLoading(true);
      debugLog('Creating API Key', {
        name: newKeyName,
        expiryDays
      });

      await createNewKey();
    } catch (error) {
      logError('handleCreateKey', error);
      toast.error('Failed to create API key');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const calculateStatus = (key: APIKeyWithoutValue) => {
    if (!key.is_active) return 'inactive';
    if (key.expires_at && new Date(key.expires_at) < new Date())
      return 'expired';
    return 'active';
  };

  if (isLoading) {
    return (
      <ContentLayout title='API Keys'>
        <div className='flex items-center justify-center h-screen'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='API Keys'>
      <div className='space-y-6'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>API Keys</h1>
            <p className='text-muted-foreground'>
              Manage your API keys for external access
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
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <label htmlFor='keyName' className='text-sm font-medium'>
                      Key Name
                    </label>
                    <Input
                      id='keyName'
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder='Enter a name for your API key'
                    />
                  </div>
                  <div className='space-y-2'>
                    <label htmlFor='expiry' className='text-sm font-medium'>
                      Expiration
                    </label>
                    <Select value={expiryDays} onValueChange={setExpiryDays}>
                      <SelectTrigger>
                        <SelectValue placeholder='Select expiration period' />
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
                        onClick={() => copyToClipboard(newKeyValue)}
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

        <Tabs defaultValue='keys' className='space-y-6'>
          <TabsList>
            <TabsTrigger value='keys'>API Keys</TabsTrigger>
            <TabsTrigger value='test'>Test API Key</TabsTrigger>
          </TabsList>

          <TabsContent value='keys'>
            <Card>
              <CardContent className='p-0'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className='w-[100px]'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className='font-medium'>
                          {key.name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              calculateStatus(key) === 'active'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {calculateStatus(key)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(key.created_at)}</TableCell>
                        <TableCell>
                          {key.expires_at
                            ? formatDate(key.expires_at)
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          {key.last_used_at
                            ? formatDate(key.last_used_at)
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => deactivateKey(key.id)}
                            disabled={!key.is_active}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {apiKeys.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className='text-center'>
                          No API keys found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='test'>
            <APIKeyTester />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
