// app/(routes)/system/api-management/_components/organization-api-docs.tsx

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

const endpoints = [
  {
    method: 'GET',
    path: '/api/api-management/organizations/institutions',
    description: 'Get list of institutions',
    queryParams: [
      { name: 'page', type: 'number', description: 'Page number (default: 1)' },
      {
        name: 'limit',
        type: 'number',
        description: 'Items per page (default: 10)'
      },
      { name: 'search', type: 'string', description: 'Search by name or code' },
      {
        name: 'isActive',
        type: 'boolean',
        description: 'Filter by active status'
      }
    ],
    example: `fetch('https://myjkkn.ac.in/api/api-management/organizations/institutions', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/organizations/institutions/:id',
    description: 'Get institution details with departments',
    example: `fetch('https://myjkkn.ac.in/api/api-management/organizations/institutions/123', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/organizations/departments',
    description: 'Get list of departments',
    queryParams: [
      { name: 'page', type: 'number', description: 'Page number (default: 1)' },
      {
        name: 'limit',
        type: 'number',
        description: 'Items per page (default: 10)'
      },
      { name: 'search', type: 'string', description: 'Search by name or code' },
      {
        name: 'institutionId',
        type: 'string',
        description: 'Filter by institution'
      },
      {
        name: 'isActive',
        type: 'boolean',
        description: 'Filter by active status'
      }
    ],
    example: `fetch('https://myjkkn.ac.in/api/api-management/organizations/departments', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/organizations/departments/:id',
    description: 'Get department details with institution info',
    example: `fetch('https://myjkkn.ac.in/api/api-management/organizations/departments/123', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  }
];

export function OrganizationApiDocs() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Code copied to clipboard');
  };

  return (
    <div className='space-y-4'>
      <div className='px-3 sm:px-0'>
        <h2 className='text-base sm:text-lg font-semibold mb-2'>
          Organization API Endpoints
        </h2>
        <p className='text-xs sm:text-sm text-muted-foreground'>
          Access institution and department data using these endpoints
        </p>
      </div>

      {endpoints.map((endpoint, index) => (
        <Card key={index} className='mx-0'>
          <CardHeader className='p-3 sm:p-6'>
            <CardTitle className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <span className='text-xs sm:text-sm font-mono bg-secondary px-2 py-1 rounded w-fit'>
                {endpoint.method}
              </span>
              <span className='font-mono text-xs sm:text-sm break-all'>
                {endpoint.path}
              </span>
            </CardTitle>
            <CardDescription className='text-xs sm:text-sm mt-2'>
              {endpoint.description}
            </CardDescription>
          </CardHeader>
          <CardContent className='p-3 sm:p-6 space-y-4'>
            {endpoint.queryParams && (
              <div>
                <h4 className='text-xs sm:text-sm font-semibold mb-2'>
                  Query Parameters
                </h4>
                <div className='grid gap-2 sm:gap-4'>
                  {endpoint.queryParams.map((param, pIndex) => (
                    <div
                      key={pIndex}
                      className='p-2 rounded-lg bg-muted/50 space-y-1'
                    >
                      <p className='font-mono text-xs sm:text-sm text-primary'>
                        {param.name}
                      </p>
                      <p className='text-[10px] sm:text-xs text-muted-foreground'>
                        {param.type}
                      </p>
                      <p className='text-[10px] sm:text-xs'>
                        {param.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className='relative'>
              <div className='max-h-[200px] overflow-y-auto'>
                <pre className='bg-muted p-3 rounded-lg text-[10px] sm:text-sm'>
                  <code className='block whitespace-pre-wrap'>
                    {endpoint.example}
                  </code>
                </pre>
              </div>
              <Button
                variant='ghost'
                size='sm'
                className='absolute top-2 right-2 h-6 w-6 sm:h-8 sm:w-8 p-0'
                onClick={() => copyToClipboard(endpoint.example)}
              >
                <Copy className='h-3 w-3 sm:h-4 sm:w-4' />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className='mx-0'>
        <CardHeader className='p-3 sm:p-6'>
          <CardTitle className='text-sm sm:text-base'>
            Response Format
          </CardTitle>
          <CardDescription className='text-xs sm:text-sm'>
            Example response structure for list endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className='p-3 sm:p-6'>
          <pre className='bg-muted p-3 rounded-lg text-[10px] sm:text-sm overflow-x-auto'>
            <code>{`{
"data": [...],
"metadata": {
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
}`}</code>
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
