// components/api-documentation/learners-api-docs.tsx
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
    path: '/api/api-management/learners/profiles',
    description: 'Get list of active learner profiles with optional filters',
    queryParams: [
      {
        name: 'lifecycle_status',
        type: 'string',
        description: 'Comma-separated lifecycle statuses (default: active)'
      },
      {
        name: 'program_id',
        type: 'UUID',
        description: 'Filter by program ID'
      },
      {
        name: 'semester_id',
        type: 'UUID',
        description: 'Filter by semester ID'
      },
      {
        name: 'section_id',
        type: 'UUID',
        description: 'Filter by section ID'
      },
      {
        name: 'admission_year',
        type: 'number',
        description: 'Filter by admission year (e.g., 2024)'
      },
      { name: 'gender', type: 'string', description: 'Filter by gender' },
      { name: 'quota', type: 'string', description: 'Filter by admission quota' },
      {
        name: 'expand',
        type: 'string',
        description: 'Include related data (program,semester,section)'
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
    example: `fetch('https://www.jkkn.ai/api/api-management/learners/profiles?limit=10&expand=program', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/learners/profiles/:id',
    description: 'Get detailed information for a specific learner profile',
    queryParams: [
      {
        name: 'expand',
        type: 'string',
        description: 'Include related data (program,semester,section)'
      }
    ],
    example: `fetch('https://www.jkkn.ai/api/api-management/learners/profiles/{id}?expand=program,section', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/learners/enquiries',
    description: 'Get list of learner enquiries with optional date filters',
    queryParams: [
      {
        name: 'program_id',
        type: 'UUID',
        description: 'Filter by program ID'
      },
      {
        name: 'enquiry_date_from',
        type: 'date',
        description: 'Filter enquiries from date (YYYY-MM-DD)'
      },
      {
        name: 'enquiry_date_to',
        type: 'date',
        description: 'Filter enquiries to date (YYYY-MM-DD)'
      },
      {
        name: 'expand',
        type: 'string',
        description: 'Include related data (program)'
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
    example: `fetch('https://www.jkkn.ai/api/api-management/learners/enquiries?enquiry_date_from=2024-01-01', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/learners/enquiries/:id',
    description: 'Get detailed information for a specific enquiry',
    queryParams: [
      {
        name: 'expand',
        type: 'string',
        description: 'Include related data (program)'
      }
    ],
    example: `fetch('https://www.jkkn.ai/api/api-management/learners/enquiries/{id}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  },
  {
    method: 'GET',
    path: '/api/api-management/learners/alumni',
    description: 'Get list of alumni and graduated learners',
    queryParams: [
      {
        name: 'program_id',
        type: 'UUID',
        description: 'Filter by program ID'
      },
      {
        name: 'admission_year',
        type: 'number',
        description: 'Filter by admission year (e.g., 2020)'
      },
      {
        name: 'expand',
        type: 'string',
        description: 'Include related data (program,semester)'
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
    example: `fetch('https://www.jkkn.ai/api/api-management/learners/alumni?admission_year=2020&limit=50', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));`
  }
];

export default function LearnersApiDocs() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Code copied to clipboard');
  };

  return (
    <div className='space-y-4'>
      <div className='px-3 sm:px-0'>
        <h2 className='text-base sm:text-lg font-semibold mb-2'>
          Learners API Endpoints
        </h2>
        <p className='text-xs sm:text-sm text-muted-foreground'>
          Access learner profiles, enquiries, and alumni data using these
          endpoints
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
                This API exposes comprehensive learner data for authorized
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
            Response Format
          </CardTitle>
          <CardDescription className='text-xs sm:text-sm'>
            Example response structure for list endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className='p-3 sm:p-6'>
          <pre className='bg-muted p-3 rounded-lg text-[10px] sm:text-sm overflow-x-auto'>
            <code>{`{
  "data": [
    {
      "id": "uuid",
      "institution_id": "uuid",
      "roll_number": "2024-CS-001",
      "first_name": "John",
      "last_name": "Doe",
      "lifecycle_status": "active",
      "program_id": "uuid",
      // ... all other fields from learners_profiles
      "program": {
        "id": "uuid",
        "program_name": "Computer Science Engineering",
        "program_code": "CSE"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 245,
    "totalPages": 5
  }
}`}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className='mx-0'>
        <CardHeader className='p-3 sm:p-6'>
          <CardTitle className='text-sm sm:text-base'>
            Single Record Response
          </CardTitle>
          <CardDescription className='text-xs sm:text-sm'>
            Example response structure for single learner/enquiry endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className='p-3 sm:p-6'>
          <pre className='bg-muted p-3 rounded-lg text-[10px] sm:text-sm overflow-x-auto'>
            <code>{`{
  "data": {
    "id": "uuid",
    "institution_id": "uuid",
    "roll_number": "2024-CS-001",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "2005-05-15",
    "gender": "Male",
    "lifecycle_status": "active",
    // ... all other fields
    "program": {
      "id": "uuid",
      "program_name": "Computer Science Engineering",
      "program_code": "CSE",
      "degree_id": "uuid"
    },
    "section": {
      "id": "uuid",
      "section_name": "Section A",
      "section_code": "A"
    }
  }
}`}</code>
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
