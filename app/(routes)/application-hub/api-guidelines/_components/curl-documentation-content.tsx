'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CodeBlock } from '@/components/code-block';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function CurlDocumentationContent() {
  const [copied, setCopied] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied((prev) => ({ ...prev, [key]: true }));
    toast({
      title: 'Copied!',
      description: 'Command has been copied to clipboard'
    });
    setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 2000);
  };

  const curlExamples = {
    students: {
      basic: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      pagination: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students?page=1&limit=5" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      search: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students?search=John&page=1&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      filters: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students?institution_id=YOUR_INSTITUTION_ID&is_profile_complete=true&page=1&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      byId: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students/STUDENT_ID_HERE" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`
    },

    staff: {
      basic: `curl -X GET "https://my.jkkn.ac.in/api/api-management/staff" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      all: `curl -X GET "https://my.jkkn.ac.in/api/api-management/staff?all=true" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      search: `curl -X GET "https://my.jkkn.ac.in/api/api-management/staff?search=Professor&page=1&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      filters: `curl -X GET "https://my.jkkn.ac.in/api/api-management/staff?institution_id=YOUR_INSTITUTION_ID&department_id=YOUR_DEPARTMENT_ID&is_active=true&page=1&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      allWithFilters: `curl -X GET "https://my.jkkn.ac.in/api/api-management/staff?all=true&is_active=true&institution_id=YOUR_INSTITUTION_ID" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`
    },

    organizations: {
      institutions: `curl -X GET "https://my.jkkn.ac.in/api/api-management/organizations/institutions" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      degrees: `curl -X GET "https://my.jkkn.ac.in/api/api-management/organizations/degrees" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      departments: `curl -X GET "https://my.jkkn.ac.in/api/api-management/organizations/departments" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      programs: `curl -X GET "https://my.jkkn.ac.in/api/api-management/organizations/programs" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`,

      courses: `curl -X GET "https://my.jkkn.ac.in/api/api-management/organizations/courses" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json"`
    },

    testing: {
      validity: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students?limit=1" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json" \\
  -w "\\nHTTP Status: %{http_code}\\nTotal Time: %{time_total}s\\n"`,

      invalidKey: `curl -X GET "https://my.jkkn.ac.in/api/api-management/students?limit=1" \\
  -H "Authorization: Bearer invalid_api_key" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json" \\
  -w "\\nHTTP Status: %{http_code}\\n"`,

      verbose: `curl -v -X GET "https://my.jkkn.ac.in/api/api-management/students?limit=1" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json"`
    }
  };

  const testScript = `#!/bin/bash

# Configuration
API_KEY="YOUR_API_KEY_HERE"
BASE_URL="https://my.jkkn.ac.in/api"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -e "\${YELLOW}Testing: $description\${NC}"
    echo "Endpoint: $endpoint"
    
    response=$(curl -s -w "\\nHTTP_STATUS:%{http_code}" \\
        -X GET "$BASE_URL$endpoint" \\
        -H "Authorization: Bearer $API_KEY" \\
        -H "Accept: application/json" \\
        -H "Content-Type: application/json")
    
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')
    
    if [ "$http_status" -eq 200 ]; then
        echo -e "\${GREEN}✓ Success (Status: $http_status)\${NC}"
        echo "Response preview: $(echo "$body" | head -c 200)..."
    else
        echo -e "\${RED}✗ Failed (Status: $http_status)\${NC}"
        echo "Error: $body"
    fi
    echo "----------------------------------------"
}

# Test all endpoints
echo "Starting API Tests..."
echo "========================================"

# Students API
test_endpoint "/api-management/students?limit=2" "Students List (Limited)"
test_endpoint "/api-management/students?search=test&limit=1" "Students Search"

# Staff API
test_endpoint "/api-management/staff?limit=2" "Staff List (Limited)"
test_endpoint "/api-management/staff?all=true" "All Staff (No Pagination)"
test_endpoint "/api-management/staff?is_active=true&limit=1" "Active Staff"

# Organizations API
test_endpoint "/api-management/organizations/institutions?limit=2" "Institutions List"
test_endpoint "/api-management/organizations/degrees?limit=2" "Degrees List"
test_endpoint "/api-management/organizations/departments?limit=2" "Departments List"
test_endpoint "/api-management/organizations/programs?limit=2" "Programs List"
test_endpoint "/api-management/organizations/courses?limit=2" "Courses List"

echo "API Tests Completed!"`;

  return (
    <div className='py-4 space-y-6'>
      <div className='space-y-4'>
        <h1 className='text-2xl font-bold'>CURL Documentation</h1>
        <p className='text-muted-foreground'>
          Comprehensive CURL commands to test all MyJKKN API endpoints. Perfect
          for validating your API key and testing various endpoints.
        </p>
      </div>

      <Alert>
        <AlertTitle className='font-semibold'>Prerequisites</AlertTitle>
        <AlertDescription className='mt-2'>
          <ul className='list-disc list-inside space-y-1'>
            <li>
              Valid API key in format: <code>jk_xxxxx_xxxxx</code>
            </li>
            <li>CURL installed on your system</li>
            <li>
              Internet connection to reach <code>https://my.jkkn.ac.in</code>
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue='students' className='w-full'>
        <TabsList className='w-full h-auto flex flex-wrap gap-1 p-1 md:grid md:grid-cols-4 md:gap-0'>
          <TabsTrigger value='students'>Students API</TabsTrigger>
          <TabsTrigger value='staff'>Staff API</TabsTrigger>
          <TabsTrigger value='organizations'>Organizations</TabsTrigger>
          <TabsTrigger value='testing'>Testing Tools</TabsTrigger>
        </TabsList>

        <TabsContent value='students' className='space-y-6'>
          <div className='space-y-4'>
            <h2 className='text-xl font-semibold'>
              Students API CURL Commands
            </h2>

            <Accordion type='single' collapsible className='space-y-4'>
              <AccordionItem
                value='basic-students'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Basic List Students</span>
                    <Badge variant='secondary'>GET</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Retrieve all students with default pagination.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.students.basic}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.students.basic,
                          'students-basic'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['students-basic'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value='pagination-students'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>
                      Students with Pagination
                    </span>
                    <Badge variant='secondary'>GET</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Control pagination with page and limit parameters.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.students.pagination}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.students.pagination,
                          'students-pagination'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['students-pagination'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value='search-students'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Search Students</span>
                    <Badge variant='secondary'>GET</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Search students by name, email, mobile, or roll number.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.students.search}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.students.search,
                          'students-search'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['students-search'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value='filters-students'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Filter Students</span>
                    <Badge variant='secondary'>GET</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Filter students by institution, profile completion status,
                    etc.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.students.filters}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.students.filters,
                          'students-filters'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['students-filters'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value='byid-students'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Get Student by ID</span>
                    <Badge variant='secondary'>GET</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Retrieve a specific student by their ID.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.students.byId}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.students.byId,
                          'students-byid'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['students-byid'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </TabsContent>

        <TabsContent value='staff' className='space-y-6'>
          <div className='space-y-4'>
            <h2 className='text-xl font-semibold'>Staff API CURL Commands</h2>

            <div className='grid grid-cols-1 gap-4'>
              {Object.entries(curlExamples.staff).map(([key, command]) => (
                <Card key={key}>
                  <CardContent className='pt-6'>
                    <div className='flex justify-between items-center mb-4'>
                      <h3 className='font-semibold capitalize'>
                        {key.replace(/([A-Z])/g, ' $1')}
                      </h3>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => copyToClipboard(command, `staff-${key}`)}
                      >
                        <CopyIcon className='h-4 w-4' />
                        {copied[`staff-${key}`] ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <CodeBlock language='bash' code={command} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value='organizations' className='space-y-6'>
          <div className='space-y-4'>
            <h2 className='text-xl font-semibold'>
              Organizations API CURL Commands
            </h2>

            <div className='grid grid-cols-1 gap-4'>
              {Object.entries(curlExamples.organizations).map(
                ([key, command]) => (
                  <Card key={key}>
                    <CardContent className='pt-6'>
                      <div className='flex justify-between items-center mb-4'>
                        <h3 className='font-semibold capitalize'>{key}</h3>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => copyToClipboard(command, `org-${key}`)}
                        >
                          <CopyIcon className='h-4 w-4' />
                          {copied[`org-${key}`] ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <CodeBlock language='bash' code={command} />
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value='testing' className='space-y-6'>
          <div className='space-y-4'>
            <h2 className='text-xl font-semibold'>Testing Tools & Scripts</h2>

            <Accordion type='single' collapsible className='space-y-4'>
              <AccordionItem
                value='test-validity'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Test API Key Validity</span>
                    <Badge variant='outline'>Test</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Quick test to check if your API key is valid and working.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.testing.validity}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.testing.validity,
                          'test-validity'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['test-validity'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='test-errors' className='border rounded-lg'>
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Test Error Responses</span>
                    <Badge variant='outline'>Test</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Test with invalid API key to see error responses.
                  </p>
                  <div className='space-y-4'>
                    <div>
                      <h4 className='font-medium mb-2'>Invalid API Key:</h4>
                      <div className='flex justify-between items-start'>
                        <div className='flex-1'>
                          <CodeBlock
                            language='bash'
                            code={curlExamples.testing.invalidKey}
                          />
                        </div>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() =>
                            copyToClipboard(
                              curlExamples.testing.invalidKey,
                              'test-invalid'
                            )
                          }
                          className='ml-2'
                        >
                          <CopyIcon className='h-4 w-4' />
                          {copied['test-invalid'] ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='bash-script' className='border rounded-lg'>
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Bash Test Script</span>
                    <Badge variant='outline'>Script</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Comprehensive bash script to test all endpoints. Save as{' '}
                    <code>api_test.sh</code> and run with{' '}
                    <code>chmod +x api_test.sh && ./api_test.sh</code>
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock language='bash' code={testScript} />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => copyToClipboard(testScript, 'bash-script')}
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['bash-script'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value='verbose-debug'
                className='border rounded-lg'
              >
                <AccordionTrigger className='px-4 hover:no-underline'>
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold'>Verbose Debug Mode</span>
                    <Badge variant='outline'>Debug</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='px-4 pb-4 space-y-4'>
                  <p className='text-muted-foreground'>
                    Use verbose mode to see detailed request/response
                    information for debugging.
                  </p>
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <CodeBlock
                        language='bash'
                        code={curlExamples.testing.verbose}
                      />
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        copyToClipboard(
                          curlExamples.testing.verbose,
                          'test-verbose'
                        )
                      }
                      className='ml-2'
                    >
                      <CopyIcon className='h-4 w-4' />
                      {copied['test-verbose'] ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className='pt-6'>
          <h3 className='text-lg font-semibold mb-4'>
            Common HTTP Status Codes
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <Badge variant='default'>200</Badge>
                <span>Success</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive'>400</Badge>
                <span>Bad Request (Invalid parameters)</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive'>401</Badge>
                <span>Unauthorized (Invalid API key)</span>
              </div>
            </div>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive'>403</Badge>
                <span>Forbidden (Insufficient permissions)</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive'>404</Badge>
                <span>Not Found (Resource doesn&apos;t exist)</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive'>429</Badge>
                <span>Too Many Requests (Rate limited)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle className='font-semibold'>Important Notes</AlertTitle>
        <AlertDescription className='mt-2'>
          <ul className='list-disc list-inside space-y-1'>
            <li>
              Replace <code>YOUR_API_KEY</code> with your actual API key
            </li>
            <li>
              Replace placeholder IDs (like <code>YOUR_INSTITUTION_ID</code>)
              with real values
            </li>
            <li>
              All API responses follow a consistent JSON structure with{' '}
              <code>data</code> and <code>metadata</code> fields
            </li>
            <li>Be respectful with API calls and monitor rate limits</li>
            <li>Never commit API keys to version control systems</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
