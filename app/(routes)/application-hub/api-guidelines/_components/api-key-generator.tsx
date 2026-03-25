'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { generateTestApiKey } from '../_actions/generate-test-key';
import { CopyIcon, CheckIcon } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';

export const ApiKeyGenerator = () => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateTestKey = async () => {
    setIsLoading(true);
    try {
      const result = await generateTestApiKey();
      if (result?.plainTextKey) {
        setApiKey(result.plainTextKey);
        toast({
          title: 'Success',
          description:
            'Test API key has been generated. This key will expire in 24 hours.'
        });
      }
    } catch (error) {
      console.error('Error generating key:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate API key. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast({
      title: 'Copied!',
      description: 'API key has been copied to clipboard'
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Test API Key</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Generate a temporary API key for testing purposes. This key will
          expire in 24 hours.
        </p>
        <div className='flex items-center space-x-2'>
          <Input
            value={apiKey}
            readOnly
            placeholder='Your API key will appear here'
            className='font-mono'
          />
          <Button
            size='icon'
            variant='outline'
            onClick={copyToClipboard}
            disabled={!apiKey}
          >
            {copied ? (
              <CheckIcon className='h-4 w-4' />
            ) : (
              <CopyIcon className='h-4 w-4' />
            )}
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={generateTestKey}
          disabled={isLoading}
          className='w-full'
        >
          {isLoading ? 'Generating...' : 'Generate Test Key'}
        </Button>
      </CardFooter>
    </Card>
  );
};
