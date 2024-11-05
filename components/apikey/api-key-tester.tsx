// components/api-key-tester.tsx
'use client';

import { useState } from 'react';
import { Send, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { toast } from 'react-hot-toast';

interface EndpointOption {
  value: string;
  label: string;
  method: string;
  description: string;
}

const AVAILABLE_ENDPOINTS: EndpointOption[] = [
  {
    value: '/api/users',
    label: 'Get User Profile',
    method: 'GET',
    description: 'Retrieve the user profile associated with the API key'
  }
  // Add more endpoints as they become available
];

export function APIKeyTester() {
  const [apiKey, setApiKey] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointOption>(
    AVAILABLE_ENDPOINTS[0]
  );
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      const response = await fetch(selectedEndpoint.value, {
        method: selectedEndpoint.method,
        headers: {
          'x-api-key': apiKey.trim(),
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setResponse(data);
      toast.success('API request successful');
    } catch (err) {
      console.error('API test error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      toast.error(err instanceof Error ? err.message : 'API request failed');
    } finally {
      setIsLoading(false);
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

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Test API Key</CardTitle>
          <CardDescription>
            Test your API key against available endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <label className='text-sm font-medium'>API Key</label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder='Enter your API key'
              type='password'
            />
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium'>Endpoint</label>
            <Select
              value={selectedEndpoint.value}
              onValueChange={(value) =>
                setSelectedEndpoint(
                  AVAILABLE_ENDPOINTS.find((e) => e.value === value) ||
                    AVAILABLE_ENDPOINTS[0]
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_ENDPOINTS.map((endpoint) => (
                  <SelectItem key={endpoint.value} value={endpoint.value}>
                    {endpoint.label} ({endpoint.method})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-sm text-muted-foreground'>
              {selectedEndpoint.description}
            </p>
          </div>

          <div className='pt-2'>
            <Button
              onClick={testApiKey}
              disabled={isLoading}
              className='w-full'
            >
              {isLoading ? (
                <div className='flex items-center space-x-2'>
                  <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white'></div>
                  <span>Testing...</span>
                </div>
              ) : (
                <div className='flex items-center space-x-2'>
                  <Send className='h-4 w-4' />
                  <span>Test API Key</span>
                </div>
              )}
            </Button>
          </div>

          {error && (
            <div className='mt-4 p-4 bg-destructive/10 text-destructive rounded-md'>
              <p className='text-sm font-medium'>Error</p>
              <p className='text-sm'>{error}</p>
            </div>
          )}

          {response && (
            <div className='mt-4 space-y-2'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium'>Response</p>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    copyToClipboard(JSON.stringify(response, null, 2))
                  }
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
              <pre className='p-4 bg-muted rounded-md overflow-x-auto text-xs'>
                <code>{JSON.stringify(response, null, 2)}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example Code</CardTitle>
          <CardDescription>
            Code snippets to help you integrate with the API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium mb-2'>
                  JavaScript/TypeScript
                </p>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    copyToClipboard(`fetch('${selectedEndpoint.value}', {
  method: '${selectedEndpoint.method}',
  headers: {
    'x-api-key': 'your_api_key_here'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`)
                  }
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
              <pre className='p-4 bg-muted rounded-md overflow-x-auto text-xs'>
                <code>{`fetch('${selectedEndpoint.value}', {
  method: '${selectedEndpoint.method}',
  headers: {
    'x-api-key': 'your_api_key_here'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`}</code>
              </pre>
            </div>

            <div>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium mb-2'>Python</p>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    copyToClipboard(`import requests

response = requests.${selectedEndpoint.method.toLowerCase()}('${
                      window.location.origin
                    }${selectedEndpoint.value}',
    headers={'x-api-key': 'your_api_key_here'})

print(response.json())`)
                  }
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
              <pre className='p-4 bg-muted rounded-md overflow-x-auto text-xs'>
                <code>{`import requests

response = requests.${selectedEndpoint.method.toLowerCase()}('${
                  window.location.origin
                }${selectedEndpoint.value}',
    headers={'x-api-key': 'your_api_key_here'})

print(response.json())`}</code>
              </pre>
            </div>

            <div>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium mb-2'>cURL</p>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    copyToClipboard(`curl -X ${selectedEndpoint.method} \\
  -H "x-api-key: your_api_key_here" \\
  ${window.location.origin}${selectedEndpoint.value}`)
                  }
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
              <pre className='p-4 bg-muted rounded-md overflow-x-auto text-xs'>
                <code>{`curl -X ${selectedEndpoint.method} \\
  -H "x-api-key: your_api_key_here" \\
  ${window.location.origin}${selectedEndpoint.value}`}</code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
