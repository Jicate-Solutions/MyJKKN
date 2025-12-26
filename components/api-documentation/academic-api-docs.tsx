// components/api-documentation/academic-api-docs.tsx
'use client';

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

const endpoints = [
  {
    method: 'GET',
    path: '/api/api-management/academic/regulations',
    description: 'Get list of academic regulations with optional filters',
    queryParams: [
      {
        name: 'regulation_year',
        type: 'number',
        description: 'Filter by regulation year (e.g., 2024)'
      },
      {
        name: 'is_active',
        type: 'boolean',
        description: 'Filter by active status (true/false)'
      },
      {
        name: 'page',
        type: 'number',
        description: 'Page number (default: 1)'
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Items per page (default: 50, max: 200)'
      }
    ],
    example: `fetch('https://myjkkn.ac.in/api/api-management/academic/regulations?regulation_year=2024&limit=10', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/academic/regulations/:id',
    description: 'Get detailed information for a specific regulation',
    queryParams: [],
    example: `fetch('https://myjkkn.ac.in/api/api-management/academic/regulations/{id}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/academic/batches',
    description: 'Get list of academic batches with optional filters',
    queryParams: [
      {
        name: 'batch_year',
        type: 'number',
        description: 'Filter by batch year (e.g., 2024)'
      },
      {
        name: 'is_active',
        type: 'boolean',
        description: 'Filter by active status (true/false)'
      },
      {
        name: 'page',
        type: 'number',
        description: 'Page number (default: 1)'
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Items per page (default: 50, max: 200)'
      }
    ],
    example: `fetch('https://myjkkn.ac.in/api/api-management/academic/batches?batch_year=2024&limit=10', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/academic/batches/:id',
    description: 'Get detailed information for a specific batch',
    queryParams: [],
    example: `fetch('https://myjkkn.ac.in/api/api-management/academic/batches/{id}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  }
];

export default function AcademicApiDocs() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Code copied to clipboard');
  };

  return (
    <div className='space-y-4'>
      <div className='px-3 sm:px-0'>
        <h2 className='text-base sm:text-lg font-semibold mb-2'>
          Academic API Endpoints
        </h2>
        <p className='text-xs sm:text-sm text-muted-foreground'>
          Access academic regulations and batch data using these endpoints
        </p>
      </div>

      <Card className='mx-0'>
        <CardHeader className='p-3 sm:p-6'>
          <CardTitle className='text-sm sm:text-base'>
            Authentication & Data Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className='p-3 sm:p-6'>
          <div className='space-y-4'>
            <div className='rounded-lg border bg-muted/50 p-4'>
              <h4 className='font-semibold mb-2 text-sm'>
                Authentication Required
              </h4>
              <p className='text-xs sm:text-sm text-muted-foreground mb-2'>
                All endpoints require authentication using Bearer token:
              </p>
              <code className='text-xs bg-background px-2 py-1 rounded block'>
                Authorization: Bearer YOUR_API_KEY
              </code>
            </div>

            <div className='rounded-lg border bg-blue-50 dark:bg-blue-950 p-4'>
              <h4 className='font-semibold mb-2 text-sm text-blue-900 dark:text-blue-100'>
                Data Privacy Notice
              </h4>
              <p className='text-xs sm:text-sm text-blue-800 dark:text-blue-200'>
                This API exposes academic regulation and batch data for authorized
                integrations. Ensure your API key is kept secure and only used
                by authorized systems. All data access is logged and restricted
                to your institution's records.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
            {endpoint.queryParams && endpoint.queryParams.length > 0 && (
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
            Response Format - List Endpoints
          </CardTitle>
          <CardDescription className='text-xs sm:text-sm'>
            Example response structure for regulations and batches list endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className='p-3 sm:p-6'>
          <pre className='bg-muted p-3 rounded-lg text-[10px] sm:text-sm overflow-x-auto'>
            <code>{`{
  "count": 25,
  "data": [
    {
      "id": "uuid",
      "institution_id": "uuid",
      "regulation_year": 2024,
      "regulation_code": "R2024",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "totalPages": 1
  }
}`}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className='mx-0'>
        <CardHeader className='p-3 sm:p-6'>
          <CardTitle className='text-sm sm:text-base'>
            Response Format - Single Record
          </CardTitle>
          <CardDescription className='text-xs sm:text-sm'>
            Example response structure for single regulation/batch endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className='p-3 sm:p-6'>
          <pre className='bg-muted p-3 rounded-lg text-[10px] sm:text-sm overflow-x-auto'>
            <code>{`{
  "data": {
    "id": "uuid",
    "institution_id": "uuid",
    "batch_year": 2024,
    "batch_code": "BATCH2024",
    "batch_name": "Batch of 2024",
    "start_date": "2024-06-01",
    "end_date": "2028-05-31",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}`}</code>
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
