// app/(routes)/system/api-management/_components/test-api-key-modal.tsx
'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Code2, Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { TestEndpoint } from './test-endpoint';

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

  const resetState = () => {
    setApiKey('');
    setTestResult(null);
    setError(null);
    setHasCopied(false);
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
        headers: {
          'Content-Type': 'application/json'
        },
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
      <DialogContent className='max-w-[95vw] w-full sm:max-w-[800px] p-4 sm:p-6 max-h-[90vh]'>
        <div className='h-[calc(90vh-2rem)] overflow-y-auto'>
          <DialogHeader className='space-y-2'>
            <DialogTitle className='text-xl sm:text-2xl'>
              Test API Key
            </DialogTitle>
            <DialogDescription className='text-sm sm:text-base'>
              Test your API key and see detailed information about its
              permissions and status.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue='test' className='w-full'>
            <TabsList className='grid w-full grid-cols-2 mb-4'>
              <TabsTrigger
                value='test-endpoint'
                className='text-sm sm:text-base'
              >
                Test Endpoint
              </TabsTrigger>
              <TabsTrigger value='guide' className='text-sm sm:text-base'>
                Usage Guide
              </TabsTrigger>
            </TabsList>

            <TabsContent value='test-endpoint' className='space-y-4'>
              <div className='flex flex-col space-y-4'>
                <TestEndpoint />

                {/* Response Section */}
                {testResult && (
                  <Card className='w-full'>
                    <CardHeader className='flex flex-row items-center justify-between space-y-0 p-4'>
                      <CardTitle className='text-base sm:text-lg'>
                        Response
                      </CardTitle>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => copyToClipboard(formatJSON(testResult))}
                        className='h-8 w-8 p-0'
                      >
                        {hasCopied ? (
                          <Check className='h-4 w-4 text-green-500' />
                        ) : (
                          <Copy className='h-4 w-4' />
                        )}
                      </Button>
                    </CardHeader>
                    <CardContent className='p-4'>
                      <div className='relative'>
                        <pre className='bg-white p-3 rounded-lg overflow-x-auto text-xs sm:text-sm max-h-[300px] scrollbar-thin'>
                          <code className='block whitespace-pre-wrap break-words'>
                            {formatJSON(testResult)}
                          </code>
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {error && (
                  <Alert variant='destructive'>
                    <AlertTitle className='text-sm font-semibold'>
                      Error
                    </AlertTitle>
                    <AlertDescription className='text-xs sm:text-sm mt-1'>
                      {error}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            <TabsContent value='guide' className='space-y-4'>
              <div className='space-y-4'>
                <Alert>
                  <AlertTitle className='text-sm sm:text-base'>
                    Test Endpoint
                  </AlertTitle>
                  <AlertDescription className='text-xs sm:text-sm break-words'>
                    Send a POST request to{' '}
                    <code className='bg-white px-1 rounded'>
                      /api/system/api-keys/test
                    </code>
                  </AlertDescription>
                </Alert>

                <Card>
                  <CardHeader className='p-3 sm:p-4'>
                    <CardTitle className='text-base sm:text-lg'>
                      Example Request
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='p-3 sm:p-4'>
                    <pre className='bg-white p-2 sm:p-3 rounded-lg overflow-x-auto text-xs sm:text-sm'>
                      <code className='block whitespace-pre-wrap break-words'>
                        {`fetch('/api/system/api-keys/test', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    apiKey: 'your-api-key'
  })
})`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
