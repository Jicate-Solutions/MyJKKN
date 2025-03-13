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
import { ApiKeyGenerator } from './api-key-generator';
import { CopyIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function ApiGuidelinesContent() {
  const [copied, setCopied] = useState(false);
  const [activeModule, setActiveModule] = useState('institutions');
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: 'Copied!',
      description: 'Prompt has been copied to clipboard'
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const aiPromptTemplate = (
    module: string,
    fields: string
  ) => `I need to implement a feature to fetch data from the MyJKKN API system. The API requires authentication using an API key.

Key details:
- Base URL: https://my-jkkn-nine.vercel.app/api
- API Key format: jk_xxxxx_xxxxx (provided by administrator)
- Authentication: Bearer token in Authorization header
- Module: ${module}

I need to:
1. Create a function to fetch data from this endpoint:
   - /api-management/organizations/${module}

2. Include proper error handling and loading states

3. Display the fetched data in a clean, accessible UI

The API returns paginated responses in this format:
{
  "data": [...],
  "metadata": {
    "page": 1,
    "totalPages": 5,
    "total": 124
  }
}

For ${module} data, the structure includes: ${fields}

Please show me a complete implementation using Next.js 14, TypeScript, and TailwindCSS that follows best practices for API data fetching and error handling.`;

  const aiPrompt = aiPromptTemplate(
    'institutions',
    'id, name, counselling_code, category, institution_type, is_active, created_at, updated_at'
  );

  // Basic Examples
  const basicExamples = {
    institutions: `// Fetch institutions example
const fetchInstitutions = async (apiKey) => {
  try {
    const response = await fetch('https://my-jkkn-nine.vercel.app/api/api-management/organizations/institutions', {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching institutions:', error);
    throw error;
  }
};`,

    departments: `// Fetch departments example
const fetchDepartments = async (apiKey) => {
  try {
    const response = await fetch('https://my-jkkn-nine.vercel.app/api/api-management/organizations/departments', {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching departments:', error);
    throw error;
  }
};`,

    programs: `// Fetch programs example
const fetchPrograms = async (apiKey) => {
  try {
    const response = await fetch('https://my-jkkn-nine.vercel.app/api/api-management/organizations/programs', {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching programs:', error);
    throw error;
  }
};`,

    degrees: `// Fetch degrees example
const fetchDegrees = async (apiKey) => {
  try {
    const response = await fetch('https://my-jkkn-nine.vercel.app/api/api-management/organizations/degrees', {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching degrees:', error);
    throw error;
  }
};`,

    courses: `// Fetch courses example
const fetchCourses = async (apiKey) => {
  try {
    const response = await fetch('https://my-jkkn-nine.vercel.app/api/api-management/organizations/courses', {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching courses:', error);
    throw error;
  }
};`
  };

  // Complete examples with interfaces
  const completeExamples = {
    institutions: `'use client';

import { useState } from 'react';
import { ApiFetcher } from '@/components/institution';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

export default function InstitutionsList() {
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
}`,


    departments: `'use client';

import { useState } from 'react';
import { ApiFetcher } from '@/components/institution';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Department {
  id: string;
  department_name: string;
  department_code: string;
  institution_id: string;
  degree_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  degree?: {
    id: string;
    degree_id: string;
    degree_name: string;
  };
}

interface ApiResponse {
  data: Department[];
  metadata: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function DepartmentsList() {
  const [departments, setDepartments] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDepartments = async (apiKey: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/api-management/organizations/departments?page=1&limit=10', {
        headers: {
          'Authorization': \`Bearer \${apiKey}\`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || \`API error: \${response.status}\`);
      }
      
      const data = await response.json();
      setDepartments(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch departments');
      console.error('Error fetching departments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Departments API Example</h1>
        <p className="text-gray-600 mb-4">
          This example demonstrates how to fetch departments using the API. You can filter by institution_id, 
          degree_id, search term, and active status.
        </p>
        <div className="bg-gray-100 p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">API Parameters:</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><code>page</code>: Page number (default: 1)</li>
            <li><code>limit</code>: Items per page (default: 10)</li>
            <li><code>search</code>: Search by department name or code</li>
            <li><code>institution_id</code>: Filter by institution ID</li>
            <li><code>degree_id</code>: Filter by degree ID</li>
            <li><code>isActive</code>: Filter by active status (true/false)</li>
          </ul>
        </div>
      </div>
      
      <ApiFetcher
        endpoint="/api-management/organizations/departments"
        apiKey="your_api_key_here"
        onDataReceived={(data) => setDepartments(data as ApiResponse)}
      />

      {isLoading && <p>Loading departments...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      
      {departments?.data.map((department) => (
        <Card key={department.id} className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{department.department_name}</h2>
                <p className="text-sm text-muted-foreground">
                  Code: {department.department_code}
                </p>
                {department.institution && (
                  <p className="text-sm text-muted-foreground">
                    Institution: {department.institution.name}
                  </p>
                )}
                {department.degree && (
                  <p className="text-sm text-muted-foreground">
                    Degree: {department.degree.degree_name}
                  </p>
                )}
              </div>
              <Badge variant={department.is_active ? 'default' : 'secondary'}>
                {department.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}`,


    programs: `'use client';

import { useState } from 'react';
import { ApiFetcher } from '@/components/institution';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Program {
  id: string;
  program_id: string;
  program_name: string;
  institution_id: string;
  department_id: string;
  degree_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_name: string;
    department_code: string;
  };
  degree?: {
    id: string;
    degree_id: string;
    degree_name: string;
  };
}

interface ApiResponse {
  data: Program[];
  metadata: {
    page: number;
    totalPages: number;
    total: number;
  };
}

export default function ProgramsList() {
  const [programs, setPrograms] = useState<ApiResponse | null>(null);

  const handleData = (data: unknown) => {
    setPrograms(data as ApiResponse);
  };

  return (
    <main className="container mx-auto p-6 space-y-6">
      <ApiFetcher
        endpoint="/api-management/organizations/programs"
        apiKey="your_api_key_here"
        onDataReceived={handleData}
      />

      {programs?.data.map((program) => (
        <Card key={program.id} className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{program.program_name}</h2>
                <p className="text-sm text-muted-foreground">
                  Code: {program.program_id}
                </p>
              </div>
              <Badge variant={program.is_active ? 'default' : 'secondary'}>
                {program.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}`,


    degrees: `'use client';

import { useState } from 'react';
import { ApiFetcher } from '@/components/institution';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Degree {
  id: string;
  degree_id: string;
  degree_name: string;
  degree_type: string;
  institution_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

interface ApiResponse {
  data: Degree[];
  metadata: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
  };
}

export default function DegreesList() {
  const [degrees, setDegrees] = useState<ApiResponse | null>(null);

  const handleData = (data: unknown) => {
    setDegrees(data as ApiResponse);
  };

  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Degrees API Example</h1>
        <p className="text-gray-600 mb-4">
          This example demonstrates how to fetch degrees using the API. You can filter by institution_id, 
          degree_type, search term, and active status.
        </p>
        <div className="bg-gray-100 p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">API Parameters:</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><code>page</code>: Page number (default: 1)</li>
            <li><code>limit</code>: Items per page (default: 10)</li>
            <li><code>search</code>: Search by degree ID or name</li>
            <li><code>institution_id</code>: Filter by institution ID</li>
            <li><code>degree_type</code>: Filter by degree type</li>
            <li><code>isActive</code>: Filter by active status (true/false)</li>
          </ul>
        </div>
      </div>
      
      <ApiFetcher
        endpoint="/api-management/organizations/degrees"
        apiKey="your_api_key_here"
        onDataReceived={handleData}
      />

      {degrees?.data.map((degree) => (
        <Card key={degree.id} className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{degree.degree_name}</h2>
                <p className="text-sm text-muted-foreground">
                  ID: {degree.degree_id} - Type: {degree.degree_type}
                </p>
                {degree.institution && (
                  <p className="text-sm text-muted-foreground">
                    Institution: {degree.institution.name}
                  </p>
                )}
              </div>
              <Badge variant={degree.is_active ? 'default' : 'secondary'}>
                {degree.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}`,


    courses: `'use client';

import { useState } from 'react';
import { ApiFetcher } from '@/components/institution';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Course {
  id: string;
  course_code: string;
  course_name: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_name: string;
    department_code: string;
  };
  program?: {
    id: string;
    program_id: string;
    program_name: string;
  };
  degree?: {
    id: string;
    degree_id: string;
    degree_name: string;
    degree_type: string;
  };
}

interface ApiResponse {
  data: Course[];
  metadata: {
    page: number;
    totalPages: number;
    total: number;
  };
}

export default function CoursesList() {
  const [courses, setCourses] = useState<ApiResponse | null>(null);

  const handleData = (data: unknown) => {
    setCourses(data as ApiResponse);
  };

  return (
    <main className="container mx-auto p-6 space-y-6">
      <ApiFetcher
        endpoint="/api-management/organizations/courses"
        apiKey="your_api_key_here"
        onDataReceived={handleData}
      />

      {courses?.data.map((course) => (
        <Card key={course.id} className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{course.course_name}</h2>
                <p className="text-sm text-muted-foreground">
                  Code: {course.course_code}
                </p>
              </div>
              <Badge variant={course.is_active ? 'default' : 'secondary'}>
                {course.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}`
  };

  // Module-specific field information
  const moduleFields = {
    institutions:
      'id, name, counselling_code, category, institution_type, is_active, created_at, updated_at',
    departments:
      'id, department_name, department_code, institution_id, degree_id, is_active, created_at, updated_at',
    programs:
      'id, program_id, program_name, institution_id, department_id, degree_id, is_active, created_at, updated_at',
    degrees: 'id, degree_id, degree_name, degree_type, institution_id, is_active, created_at, updated_at',
    courses:
      'id, course_code, course_name, institution_id, degree_id, department_id, program_id, is_active, created_at, updated_at'
  };

  return (
    <div className='py-4 space-y-6'>
      <div className='space-y-4'>
        <h1 className='text-2xl font-bold'>API Documentation</h1>
        <p className='text-muted-foreground'>
          A comprehensive guide to access organization data through our API
          system
        </p>
      </div>

      <Alert>
        <AlertTitle className='font-semibold'>Quick Start Guide</AlertTitle>
        <AlertDescription className='mt-2'>
          <ol className='list-decimal list-inside space-y-1'>
            <li>Get your API key from an administrator</li>
            <li>Import the ApiFetcher component in your application</li>
            <li>Make API requests by specifying endpoint and your API key</li>
            <li>Handle the returned data in your components</li>
          </ol>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue='institutions' onValueChange={setActiveModule}>
        <TabsList className='grid w-full grid-cols-5'>
          <TabsTrigger value='institutions'>Institutions</TabsTrigger>
          <TabsTrigger value='departments'>Departments</TabsTrigger>
          <TabsTrigger value='programs'>Programs</TabsTrigger>
          <TabsTrigger value='degrees'>Degrees</TabsTrigger>
          <TabsTrigger value='courses'>Courses</TabsTrigger>
        </TabsList>

        {/* For each module, create content */}
        {['institutions', 'departments', 'programs', 'degrees', 'courses'].map(
          (module) => (
            <TabsContent key={module} value={module} className='mt-4'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                <div className='md:col-span-2'>
                  <Tabs defaultValue='usage'>
                    <TabsList className='grid w-full grid-cols-4'>
                      <TabsTrigger value='usage'>Basic Usage</TabsTrigger>
                      <TabsTrigger value='components'>Components</TabsTrigger>
                      <TabsTrigger value='examples'>Examples</TabsTrigger>
                      <TabsTrigger value='ai-tools'>AI Tools</TabsTrigger>
                    </TabsList>

                    <TabsContent value='usage' className='space-y-4 mt-4'>
                      <Card>
                        <CardContent className='p-6 space-y-4'>
                          <h2 className='text-xl font-semibold'>
                            Getting Started with{' '}
                            {module.charAt(0).toUpperCase() + module.slice(1)}
                          </h2>

                          <div className='space-y-4'>
                            <h3 className='text-lg font-semibold'>
                              1. API Access Requirements
                            </h3>
                            <ul className='list-disc list-inside space-y-1'>
                              <li>
                                Valid API key (format:{' '}
                                <code>jk_xxxxx_xxxxx</code>)
                              </li>
                              <li>
                                Institution details associated with your account
                              </li>
                              <li>Access permissions for specific endpoints</li>
                            </ul>
                          </div>

                          <div className='space-y-4'>
                            <h3 className='text-lg font-semibold'>
                              2. Available Endpoints
                            </h3>
                            <ul className='list-disc list-inside space-y-1'>
                              <li>
                                <code>
                                  /api-management/organizations/{module}
                                </code>{' '}
                                - Get all {module}
                              </li>
                              <li>
                                <code>
                                  /api-management/organizations/{module}/[id]
                                </code>{' '}
                                - Get {module.slice(0, -1)} by ID
                              </li>
                            </ul>
                          </div>

                          <div className='space-y-4'>
                            <h3 className='text-lg font-semibold'>
                              3. Basic API Call
                            </h3>
                            <CodeBlock
                              language='typescript'
                              code={
                                basicExamples[
                                  module as keyof typeof basicExamples
                                ]
                              }
                            />
                          </div>

                          <div className='space-y-4'>
                            <h3 className='text-lg font-semibold'>
                              4. Response Structure
                            </h3>
                            <CodeBlock
                              language='json'
                              code={`
{
  "data": [
    {
      // ${module} data fields
      ${moduleFields[module as keyof typeof moduleFields]
                                .split(', ')
                                .map((field) => `"${field}": "value"`)
                                .join(',\n      ')}
    }
    // More items...
  ],
  "metadata": {
    "page": 1,
    "totalPages": 5,
    "total": 124
  }
}
                            `}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value='components' className='space-y-4 mt-4'>
                      <Card>
                        <CardContent className='p-6 space-y-4'>
                          <h2 className='text-xl font-semibold'>
                            API Fetcher Component for{' '}
                            {module.charAt(0).toUpperCase() + module.slice(1)}
                          </h2>
                          <p>
                            Import and use our reusable ApiFetcher component to
                            fetch {module} data:
                          </p>
                          <CodeBlock
                            language='typescript'
                            code={`
import React, { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";

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
                          <div className='space-y-4'>
                            <h3 className='text-lg font-semibold'>
                              Usage Example
                            </h3>
                            <CodeBlock
                              language='typescript'
                              code={`
import { ApiFetcher } from '@/components/institution';

function My${module.charAt(0).toUpperCase() + module.slice(0, -1)}Component() {
  const handle${module.charAt(0).toUpperCase() + module.slice(1)} = (data) => {
    console.log('Received ${module} data:', data);
    // Process your data here
  };

  return (
    <ApiFetcher 
      endpoint="/api-management/organizations/${module}"
      apiKey="your_api_key"
      onDataReceived={handle${module.charAt(0).toUpperCase() + module.slice(1)}}
    />
  );
}
                            `}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value='examples' className='space-y-4 mt-4'>
                      <Card>
                        <CardContent className='p-6 space-y-4'>
                          <h2 className='text-xl font-semibold'>
                            Complete Example
                          </h2>
                          <p className='text-muted-foreground'>
                            Here is a complete example of how to fetch and
                            display {module} data:
                          </p>
                          <CodeBlock
                            language='typescript'
                            code={
                              completeExamples[
                                module as keyof typeof completeExamples
                              ]
                            }
                          />
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value='ai-tools' className='space-y-4 mt-4'>
                      <Card>
                        <CardContent className='p-6 space-y-4'>
                          <div className='flex justify-between items-start'>
                            <h2 className='text-xl font-semibold'>
                              AI Tool Prompt for{' '}
                              {module.charAt(0).toUpperCase() + module.slice(1)}
                            </h2>
                            <Button
                              variant='outline'
                              size='sm'
                              className='flex items-center gap-1'
                              onClick={() =>
                                copyToClipboard(
                                  aiPromptTemplate(
                                    module,
                                    moduleFields[
                                      module as keyof typeof moduleFields
                                    ]
                                  )
                                )
                              }
                            >
                              {copied ? 'Copied!' : 'Copy Prompt'}{' '}
                              <CopyIcon className='h-4 w-4 ml-1' />
                            </Button>
                          </div>
                          <p className='text-muted-foreground'>
                            Use this prompt with AI coding tools like Cursor,
                            GitHub Copilot, or ChatGPT to quickly implement{' '}
                            {module} API integration:
                          </p>
                          <div className='bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm font-mono'>
                            {aiPromptTemplate(
                              module,
                              moduleFields[module as keyof typeof moduleFields]
                            )}
                          </div>

                          <div className='bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md'>
                            <h3 className='text-blue-800 font-medium'>
                              Prompt Instructions
                            </h3>
                            <p className='text-blue-700 text-sm mt-1'>
                              Copy and paste this prompt into your AI coding
                              tool. You can customize it by specifying
                              additional requirements for your specific use
                              case.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
                <div>
                  <ApiKeyGenerator />

                  <Card className='mt-6'>
                    <CardContent className='p-6 space-y-4'>
                      <h3 className='text-lg font-semibold'>
                        {module.charAt(0).toUpperCase() + module.slice(1)} Data
                        Structure
                      </h3>
                      <div className='space-y-2'>
                        {moduleFields[module as keyof typeof moduleFields]
                          .split(', ')
                          .map((field, index) => (
                            <div key={index} className='flex items-start'>
                              <Badge
                                variant='outline'
                                className='mr-2 font-mono'
                              >
                                {field}
                              </Badge>
                              <span className='text-sm text-muted-foreground'>
                                {field.includes('id')
                                  ? 'Unique identifier'
                                  : field.includes('name')
                                  ? 'Display name'
                                  : field.includes('active')
                                  ? 'Status indicator'
                                  : field.includes('code')
                                  ? 'Short code'
                                  : field.includes('type')
                                  ? 'Classification'
                                  : field.includes('created')
                                  ? 'Creation timestamp'
                                  : field.includes('updated')
                                  ? 'Update timestamp'
                                  : field.includes('description')
                                  ? 'Detailed information'
                                  : field.includes('credit')
                                  ? 'Credit value'
                                  : field.includes('level')
                                  ? 'Education level'
                                  : field.includes('abbreviation')
                                  ? 'Short form'
                                  : 'Field data'}
                              </span>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          )
        )}
      </Tabs>

      <Alert>
        <AlertTitle className='font-semibold'>Security Notice</AlertTitle>
        <AlertDescription>
          For security reasons, keep your API key confidential and never expose
          it in client-side code. Use environment variables for production
          applications. Contact the administrator if you need a new API key or
          have any questions.
        </AlertDescription>
      </Alert>
    </div>
  );
}
