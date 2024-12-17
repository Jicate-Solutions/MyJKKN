'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/code-block';

export default function ApiGuidelinesContent() {
  return (
    <div className='container mx-auto py-4 space-y-6'>
      <div className='space-y-4'>
        <h1 className='text-2xl font-bold'>API Documentation</h1>
        <p className='text-muted-foreground'>
          Complete documentation for accessing organization data through our
          APIs
        </p>
      </div>

      <Alert>
        <AlertDescription>
          To use these APIs, you need an API key. Contact the administrator to
          get your API key.
        </AlertDescription>
      </Alert>

      <Accordion type='single' collapsible className='space-y-4'>
        <AccordionItem value='institutions' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Institutions API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Institutions */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Institutions</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/api-management/organizations/institutions

# Query Parameters
?search=string    # Search by name
?isActive=boolean # Filter by status
?page=number     # Page number
?limit=number    # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "counselling_code": "string",
      "institution_type": "string",
      "category": "string",
      "is_active": boolean
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>

            {/* Get Institution */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>
                  Get Institution Details
                </h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/institutions/:id

# Response
{
  "data": {
    "id": "string",
    "name": "string",
    "counselling_code": "string",
    "institution_type": "string",
    "category": "string",
    "is_active": boolean,
    "created_at": "string",
    "updated_at": "string"
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='degrees' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Degrees API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Degrees */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Degrees</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/degrees

# Query Parameters
?search=string         # Search by name
?institution_id=string # Filter by institution
?isActive=boolean     # Filter by status
?page=number          # Page number
?limit=number         # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "degree_name": "string",
      "degree_type": "ug" | "pg",
      "institution_id": "string",
      "is_active": boolean,
      "institution": {
        "name": "string",
        "counselling_code": "string"
      }
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>

            {/* Get Degree */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>Get Degree Details</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/degrees/:id

# Response
{
  "data": {
    "id": "string",
    "degree_name": "string",
    "degree_type": "ug" | "pg",
    "institution_id": "string",
    "is_active": boolean,
    "created_at": "string",
    "updated_at": "string",
    "institution": {
      "id": "string",
      "name": "string",
      "counselling_code": "string"
    }
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='departments' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Departments API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Departments */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Departments</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/departments

# Query Parameters
?search=string         # Search by name
?institution_id=string # Filter by institution
?degree_id=string     # Filter by degree
?isActive=boolean     # Filter by status
?page=number          # Page number
?limit=number         # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "department_name": "string",
      "department_code": "string",
      "institution_id": "string",
      "degree_id": "string",
      "is_active": boolean,
      "institution": {
        "name": "string"
      },
      "degree": {
        "degree_name": "string"
      }
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='programs' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Programs API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Programs */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Programs</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/programs

# Query Parameters
?search=string         # Search by name
?institution_id=string # Filter by institution
?degree_id=string     # Filter by degree
?department_id=string # Filter by department
?isActive=boolean     # Filter by status
?page=number          # Page number
?limit=number         # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "program_name": "string",
      "program_id": "string",
      "institution_id": "string",
      "degree_id": "string",
      "department_id": "string",
      "is_active": boolean,
      "institution": {
        "name": "string"
      },
      "degree": {
        "degree_name": "string"
      },
      "department": {
        "department_name": "string"
      }
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='courses' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Courses API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Courses */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Courses</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/courses

# Query Parameters
?search=string         # Search by name or code
?institution_id=string # Filter by institution
?degree_id=string     # Filter by degree
?department_id=string # Filter by department
?program_id=string    # Filter by program
?isActive=boolean     # Filter by status
?page=number          # Page number
?limit=number         # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "course_name": "string",
      "course_code": "string",
      "institution_id": "string",
      "degree_id": "string",
      "department_id": "string",
      "program_id": "string",
      "is_active": boolean,
      "institution": {
        "name": "string"
      },
      "degree": {
        "degree_name": "string"
      },
      "department": {
        "department_name": "string"
      },
      "program": {
        "program_name": "string"
      }
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='semesters' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Semesters API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Semesters */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Semesters</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/semesters

# Query Parameters
?search=string         # Search by name or code
?institution_id=string # Filter by institution
?degree_id=string     # Filter by degree
?department_id=string # Filter by department
?program_id=string    # Filter by program
?course_id=string     # Filter by course
?semester_type=string # Filter by type (even/odd)
?isActive=boolean     # Filter by status
?page=number          # Page number
?limit=number         # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "semester_name": "string",
      "semester_code": "string",
      "semester_type": "even" | "odd",
      "institution_id": "string",
      "degree_id": "string",
      "department_id": "string",
      "program_id": "string",
      "course_id": "string",
      "is_active": boolean,
      "institution": {
        "name": "string"
      },
      "degree": {
        "degree_name": "string"
      },
      "department": {
        "department_name": "string"
      },
      "program": {
        "program_name": "string"
      },
      "course": {
        "course_name": "string"
      }
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='sections' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Sections API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            {/* List Sections */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>List Sections</h3>
                <Badge variant='outline'>GET</Badge>
              </div>
              <CodeBlock
                language='bash'
                code={`
GET /api/v1/sections

# Query Parameters
?search=string         # Search by name or code
?institution_id=string # Filter by institution
?degree_id=string     # Filter by degree
?department_id=string # Filter by department
?program_id=string    # Filter by program
?course_id=string     # Filter by course
?semester_id=string   # Filter by semester
?isActive=boolean     # Filter by status
?page=number          # Page number
?limit=number         # Items per page

# Response
{
  "data": [
    {
      "id": "string",
      "section_name": "string",
      "section_code": "string",
      "institution_id": "string",
      "degree_id": "string",
      "department_id": "string",
      "program_id": "string",
      "course_id": "string",
      "semester_id": "string",
      "is_active": boolean,
      "institution": {
        "name": "string"
      },
      "degree": {
        "degree_name": "string"
      },
      "department": {
        "department_name": "string"
      },
      "program": {
        "program_name": "string"
      },
      "course": {
        "course_name": "string"
      },
      "semester": {
        "semester_name": "string"
      }
    }
  ],
  "metadata": {
    "total": number,
    "page": number,
    "limit": number,
    "totalPages": number
  }
}
                `}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
