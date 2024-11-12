// app/(routes)/system/api-management/_components/test-api-key-modal.tsx
'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Code2, Copy, Check, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TestEndpoint } from './test-endpoint';
import { OrganizationApiDocs } from './organization-api-docs';

interface TestResponse {
  status: string;
  keyInfo: {
    name: string;
    permissions: {
      read: boolean;
      write: boolean;
    };
    expires_at: string | null;
    created_at: string;
  };
}

interface TestApiKeyModalProps {
  open: boolean;
  onClose: () => void;
}

export function TestApiKeyModal({ open, onClose }: TestApiKeyModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('test-endpoint');

  const resetState = () => {
    setApiKey('');
    setTestResult(null);
    setError(null);
    setHasCopied(false);
    setSearchQuery('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const testApiKey = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setTestResult(null);
      setHasCopied(false);

      const response = await fetch('/api/system/api-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to test API key');
      }

      setTestResult(data);
      toast.success('API key tested successfully');
    } catch (error) {
      console.error('Error testing API key:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to test API key';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    toast.success('Response copied to clipboard');
    setTimeout(() => setHasCopied(false), 2000);
  };

  const formatJSON = (obj: any): string => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        aria-describedby={undefined}
        className='max-w-[95vw] w-full h-[95vh] overflow-y-auto sm:max-w-[1200px] p-0'
      >
        <div className='flex h-full flex-col md:flex-row'>
          {/* Mobile Navigation Bar */}
          <div className='block md:hidden border-b bg-background sticky top-0 z-10'>
            <div className='p-3'>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className='grid w-full grid-cols-2'>
                  <TabsTrigger
                    value='test-endpoint'
                    className='text-xs sm:text-sm py-2'
                  >
                    Test API Key
                  </TabsTrigger>
                  <TabsTrigger
                    value='organization-api'
                    className='text-xs sm:text-sm py-2'
                  >
                    API Docs
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Sidebar - Hidden on Mobile */}
          <div className='hidden md:flex flex-col w-64 border-r bg-muted/20'>
            <div className='p-4 border-b sticky top-0 bg-background z-10'>
              <div className='relative'>
                <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search...'
                  className='pl-8 text-sm'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className='flex-1 p-4 overflow-y-auto'>
              <nav className='space-y-2'>
                <Button
                  variant={
                    activeTab === 'test-endpoint' ? 'secondary' : 'ghost'
                  }
                  className='w-full justify-start text-sm'
                  onClick={() => setActiveTab('test-endpoint')}
                >
                  Test Endpoint
                </Button>
                <Button
                  variant={
                    activeTab === 'organization-api' ? 'secondary' : 'ghost'
                  }
                  className='w-full justify-start text-sm'
                  onClick={() => setActiveTab('organization-api')}
                >
                  Organization API
                </Button>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className='flex-1 flex flex-col min-h-0'>
            <DialogHeader className='px-4 py-3 sm:p-6 border-b sticky top-0 bg-background z-10'>
              <div className='flex items-center justify-between'>
                <div>
                  <DialogTitle>Test API Key</DialogTitle>
                  <DialogDescription className='text-xs sm:text-sm mt-1'>
                    Test your API key and explore our API documentation
                  </DialogDescription>
                </div>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={handleClose}
                  className='h-8 w-8'
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </DialogHeader>

            {/* Content Area with Native Scrolling */}
            <div className='flex-1 overflow-y-auto'>
              <div className='p-3 sm:p-6'>
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className='w-full'
                >
                  <TabsContent value='test-endpoint' className='m-0 space-y-3'>
                    <TestEndpoint />

                    {testResult && (
                      <Card className='overflow-hidden'>
                        <CardHeader className='flex flex-row items-center justify-between p-3'>
                          <CardTitle className='text-sm'>Response</CardTitle>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() =>
                              copyToClipboard(formatJSON(testResult))
                            }
                            className='h-8 w-8 p-0'
                          >
                            {hasCopied ? (
                              <Check className='h-3 w-3 sm:h-4 sm:w-4 text-green-500' />
                            ) : (
                              <Copy className='h-3 w-3 sm:h-4 sm:w-4' />
                            )}
                          </Button>
                        </CardHeader>
                        <CardContent className='p-3'>
                          <div className='max-h-[200px] sm:max-h-[300px] overflow-y-auto'>
                            <pre className='bg-muted p-2 sm:p-4 rounded-lg text-xs sm:text-sm whitespace-pre-wrap'>
                              <code>{formatJSON(testResult)}</code>
                            </pre>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {error && (
                      <Alert variant='destructive' className='p-3'>
                        <AlertTitle className='text-xs sm:text-sm'>
                          Error
                        </AlertTitle>
                        <AlertDescription className='text-xs'>
                          {error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>

                  <TabsContent value='organization-api' className='m-0'>
                    <OrganizationApiDocs />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
