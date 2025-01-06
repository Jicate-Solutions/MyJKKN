'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { CodeBlock } from '@/components/code-block';
import { Card, CardContent } from '@/components/ui/card';

export default function ApiGuidelinesContent() {
  return (
    <div className='py-4 space-y-6'>
      <div className='space-y-4'>
        <h1 className='text-2xl font-bold'>API Documentation</h1>
        <p className='text-muted-foreground'>
          Complete guide for accessing organization data through our APIs
        </p>
      </div>

      {/* Getting Started Section */}
      <Card>
        <CardContent className='p-6 space-y-4'>
          <h2 className='text-xl font-semibold'>Getting Started</h2>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>
              1. Create a API Fetcher Component{' '}
            </h3>
            <p>
              Import and use our reusable ApiFetcher component for easy API
              integration:
            </p>
            <div>
              <CodeBlock
                language='typescript'
                code={`
import React, { useEffect, useState } from 'react';
import { useToast } from "@/components/ui/use-toast";

interface ApiFetcherProps {
  endpoint: string;
  onDataReceived: (data: any) => void;
  apiKey?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
}

const DEFAULT_API_KEY = 'jk_11644c4e5143c0aff198cc19b26cb3f8_m50nz55a';
const BASE_URL = 'https://my-jkkn-nine.vercel.app/api';

export const ApiFetcher: React.FC<ApiFetcherProps> = ({
  endpoint,
  onDataReceived,
  apiKey = DEFAULT_API_KEY,
  method = 'GET',
  body
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(\`\${BASE_URL}\${endpoint}\`, {
          method,
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          ...(body && { body: JSON.stringify(body) }),
          mode: 'cors',
        });

        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }

        const result = await response.json();
        onDataReceived(result);
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Failed to fetch data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [endpoint, apiKey, method, body, onDataReceived, toast]);

  return isLoading ? <div>Loading...</div> : null;
};
            `}
              />
            </div>
            <CodeBlock
              language='typescript'
              code={`
// Example API Key
const API_KEY = 'jk_11644c4e5143c0aff198cc19b26cb3f8_m50nz55a';
              `}
            />
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>2. Base URL</h3>
            <CodeBlock
              language='bash'
              code={`
BASE_URL = 'https://my-jkkn-nine.vercel.app/api'
              `}
            />
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>
              3. Using the API Fetcher Component
            </h3>
            <p>
              Import and use our reusable ApiFetcher component for easy API
              integration:
            </p>
            <CodeBlock
              language='typescript'
              code={`
import { ApiFetcher } from '@/components/ApiFetcher';

// Basic Usage
function MyComponent() {
  const handleData = (data) => {
    console.log('Received data:', data);
  };

  return (
    <ApiFetcher 
      endpoint="/api-management/organizations/institutions"
      apiKey="your_api_key"
      onDataReceived={handleData}
    />
  );
}
              `}
            />
          </div>
        </CardContent>
      </Card>

      {/* API Fetcher Implementation */}
      <Card>
        <CardContent className='p-6 space-y-4'>
          <h2 className='text-xl font-semibold'>API Fetcher Implementation</h2>
          <CodeBlock
            language='typescript'
            code={`
import React, { useEffect, useState } from 'react';
import { useToast } from "@/components/ui/use-toast";

interface ApiFetcherProps {
  endpoint: string;
  onDataReceived: (data: any) => void;
  apiKey?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
}

const DEFAULT_API_KEY = 'jk_11644c4e5143c0aff198cc19b26cb3f8_m50nz55a';
const BASE_URL = 'https://my-jkkn-nine.vercel.app/api';

export const ApiFetcher: React.FC<ApiFetcherProps> = ({
  endpoint,
  onDataReceived,
  apiKey = DEFAULT_API_KEY,
  method = 'GET',
  body
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(\`\${BASE_URL}\${endpoint}\`, {
          method,
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          ...(body && { body: JSON.stringify(body) }),
          mode: 'cors',
        });

        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }

        const result = await response.json();
        onDataReceived(result);
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Failed to fetch data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [endpoint, apiKey, method, body, onDataReceived, toast]);

  return isLoading ? <div>Loading...</div> : null;
};
            `}
          />
        </CardContent>
      </Card>

      {/* Example Usage Section */}
      <Card>
        <CardContent className='p-6 space-y-4'>
          <h2 className='text-xl font-semibold'>Example Usage</h2>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>
              Filter by Type and Category
            </h3>
            <CodeBlock
              language='typescript'
              code={`
<ApiFetcher 
  endpoint="/api-management/organizations/institutions?type=university&category=ug"
  apiKey={apiKey}
  onDataReceived={handleData}
/>
              `}
            />
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>Search by Name</h3>
            <CodeBlock
              language='typescript'
              code={`
<ApiFetcher 
  endpoint="/api-management/organizations/institutions?search=engineering"
  apiKey={apiKey}
  onDataReceived={handleData}
/>
              `}
            />
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>Pagination</h3>
            <CodeBlock
              language='typescript'
              code={`
<ApiFetcher 
  endpoint="/api-management/organizations/institutions?page=1&limit=5"
  apiKey={apiKey}
  onDataReceived={handleData}
/>
              `}
            />
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          For security reasons, make sure to keep your API key confidential and
          never expose it in client-side code. Contact the administrator if you
          need a new API key or have any questions.
        </AlertDescription>
      </Alert>
    </div>
  );
}
