'use client';

import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/code-block';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

export default function EndpointsContent() {
  return (
    <div className='py-4 space-y-6'>
      <div className='space-y-4'>
        <h1 className='text-2xl font-bold'>Available API Endpoints</h1>
        <p className='text-muted-foreground'>
          Complete list of all available endpoints for accessing organization
          data
        </p>
      </div>

      <Accordion type='single' collapsible className='space-y-4'>
        {/* Institutions Endpoints */}
        <AccordionItem value='institutions' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Institutions API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>List Institutions</h3>
              <CodeBlock
                language='bash'
                code={`GET /api-management/organizations/institutions`}
              />
              <div className='space-y-2'>
                <p className='font-medium'>Query Parameters:</p>
                <ul className='list-disc list-inside space-y-1 text-sm'>
                  <li>
                    <code className='bg-muted px-1'>page</code>: Page number
                    (default: 1)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>limit</code>: Items per page
                    (default: 10)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>search</code>: Search by
                    name
                  </li>
                  <li>
                    <code className='bg-muted px-1'>isActive</code>: Filter by
                    status
                  </li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Degrees Endpoints */}
        <AccordionItem value='degrees' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Degrees API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>List Degrees</h3>
              <CodeBlock
                language='bash'
                code={`GET /api-management/organizations/degrees`}
              />
              <div className='space-y-2'>
                <p className='font-medium'>Query Parameters:</p>
                <ul className='list-disc list-inside space-y-1 text-sm'>
                  <li>
                    <code className='bg-muted px-1'>page</code>: Page number
                    (default: 1)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>limit</code>: Items per page
                    (default: 10)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>search</code>: Search by
                    name
                  </li>
                  <li>
                    <code className='bg-muted px-1'>institution_id</code>:
                    Filter by institution
                  </li>
                  <li>
                    <code className='bg-muted px-1'>isActive</code>: Filter by
                    status
                  </li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Departments Endpoints */}
        <AccordionItem value='departments' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Departments API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>List Departments</h3>
              <CodeBlock
                language='bash'
                code={`GET /api-management/organizations/departments`}
              />
              <div className='space-y-2'>
                <p className='font-medium'>Query Parameters:</p>
                <ul className='list-disc list-inside space-y-1 text-sm'>
                  <li>
                    <code className='bg-muted px-1'>page</code>: Page number
                    (default: 1)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>limit</code>: Items per page
                    (default: 10)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>search</code>: Search by
                    name
                  </li>
                  <li>
                    <code className='bg-muted px-1'>institution_id</code>:
                    Filter by institution
                  </li>
                  <li>
                    <code className='bg-muted px-1'>degree_id</code>: Filter by
                    degree
                  </li>
                  <li>
                    <code className='bg-muted px-1'>isActive</code>: Filter by
                    status
                  </li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Programs Endpoints */}
        <AccordionItem value='programs' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Programs API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>List Programs</h3>
              <CodeBlock
                language='bash'
                code={`GET /api-management/organizations/programs`}
              />
              <div className='space-y-2'>
                <p className='font-medium'>Query Parameters:</p>
                <ul className='list-disc list-inside space-y-1 text-sm'>
                  <li>
                    <code className='bg-muted px-1'>page</code>: Page number
                    (default: 1)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>limit</code>: Items per page
                    (default: 10)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>search</code>: Search by
                    name
                  </li>
                  <li>
                    <code className='bg-muted px-1'>institution_id</code>:
                    Filter by institution
                  </li>
                  <li>
                    <code className='bg-muted px-1'>degree_id</code>: Filter by
                    degree
                  </li>
                  <li>
                    <code className='bg-muted px-1'>department_id</code>: Filter
                    by department
                  </li>
                  <li>
                    <code className='bg-muted px-1'>isActive</code>: Filter by
                    status
                  </li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Courses Endpoints */}
        <AccordionItem value='courses' className='border rounded-lg'>
          <AccordionTrigger className='px-4 hover:no-underline'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>Courses API</span>
              <Badge variant='secondary'>GET</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-4 pb-4 space-y-6'>
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>List Courses</h3>
              <CodeBlock
                language='bash'
                code={`GET /api-management/organizations/courses`}
              />
              <div className='space-y-2'>
                <p className='font-medium'>Query Parameters:</p>
                <ul className='list-disc list-inside space-y-1 text-sm'>
                  <li>
                    <code className='bg-muted px-1'>page</code>: Page number
                    (default: 1)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>limit</code>: Items per page
                    (default: 10)
                  </li>
                  <li>
                    <code className='bg-muted px-1'>search</code>: Search by
                    name or code
                  </li>
                  <li>
                    <code className='bg-muted px-1'>institution_id</code>:
                    Filter by institution
                  </li>
                  <li>
                    <code className='bg-muted px-1'>degree_id</code>: Filter by
                    degree
                  </li>
                  <li>
                    <code className='bg-muted px-1'>department_id</code>: Filter
                    by department
                  </li>
                  <li>
                    <code className='bg-muted px-1'>program_id</code>: Filter by
                    program
                  </li>
                  <li>
                    <code className='bg-muted px-1'>isActive</code>: Filter by
                    status
                  </li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Add more endpoints as needed */}
      </Accordion>
    </div>
  );
}
