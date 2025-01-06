'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { CodeBlock } from '@/components/code-block';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

export default function ApiGuidelinesContent() {
  const exampleCode = `'use client';

import { ApiFetcher } from '@/components/institution';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface Institution {
  id: string;
  name: string;
  counselling_code: string;
  category: string;
  institution_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiResponse {
  data: Institution[];
  metadata: {
    page: number;
    totalPages: number;
    total: number;
  };
}

export default function Home() {
  const [institutions, setInstitutions] = useState<ApiResponse | null>(null);

  const handleData = (data: unknown) => {
    setInstitutions(data as ApiResponse);
  };

  return (
    <main className="container mx-auto p-6 space-y-6">
      <ApiFetcher
        endpoint="/api-management/organizations/institutions"
        apiKey="your_api_key_here"
        onDataReceived={handleData}
      />

      {institutions?.data.map((institution) => (
        <Card key={institution.id} className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{institution.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Code: {institution.counselling_code}
                </p>
              </div>
              <Badge variant={institution.is_active ? 'default' : 'secondary'}>
                {institution.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}`;

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
  onDataReceived: (data: unknown) => void;
  apiKey?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

const BASE_URL = 'https://my-jkkn-nine.vercel.app/api';

export const ApiFetcher: React.FC<ApiFetcherProps> = ({
  endpoint,
  onDataReceived,
  apiKey,
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

   return isLoading ? (
    <div className='flex justify-center items-center'>
      <div className='animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900'></div>
    </div>
  ) : null;
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

      {/* Example Usage Section */}
      <Card>
        <CardContent className='p-6 space-y-4'>
          <h2 className='text-xl font-semibold'>Example Usage</h2>
          <p className='text-muted-foreground'>
            Here is an example of how to fetch and display institution data
            using the API:
          </p>
          <CodeBlock language='typescript' code={exampleCode} />

          <div className='bg-muted p-4 rounded-lg'>
            <h3 className='font-medium mb-2'>Key Points:</h3>
            <ul className='list-disc list-inside space-y-1 text-sm text-muted-foreground'>
              <li>Use the ApiFetcher component to handle API requests</li>
              <li>Include your API key in the request</li>
              <li>Type your response data for better TypeScript support</li>
              <li>Handle the paginated response data appropriately</li>
            </ul>
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
