'use client';

import { ReactElement } from 'react';
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
import { CopyIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function StaffApiDocs(): ReactElement {
  const [copied, setCopied] = useState(false);
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

  const aiPrompt = `I need to implement a feature to fetch staff data from the MyJKKN API system. The API requires authentication using an API key.

Key details:
- Base URL: https://myadmin.jkkn.ac.in/api
- API Key format: jkkn_xxxxx_xxxxx (provided by administrator)
- Authentication: Bearer token in Authorization header
- Module: staff

I need to:
1. Create a function to fetch data from these endpoints:
   - /api-management/staff (list all staff)
   - /api-management/staff/{id} (get a specific staff member)

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

For staff data, the structure includes: id, first_name, last_name, gender, email, phone, institution_email, designation, department, institution, and more fields.

Please show me a complete implementation using Next.js 14, TypeScript, and TailwindCSS that follows best practices for API data fetching and error handling.`;

  // Basic Examples
  const basicExamples = {
    listStaff: `// Fetch staff list example
const fetchStaff = async (apiKey) => {
  try {
    const response = await fetch('https://myadmin.jkkn.ac.in/api/api-management/staff', {
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
    console.error('Error fetching staff:', error);
    throw error;
  }
};`,

    getStaffMember: `// Fetch specific staff member example
const fetchStaffMember = async (apiKey, staffId) => {
  try {
    const response = await fetch(\`https://myadmin.jkkn.ac.in/api/api-management/staff/\${staffId}\`, {
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
    console.error('Error fetching staff member:', error);
    throw error;
  }
};`,

    withFilters: `// Fetch staff with filters example
const fetchStaffWithFilters = async (apiKey, filters = {}) => {
  try {
    // Create URL with query parameters
    const url = new URL('https://myadmin.jkkn.ac.in/api/api-management/staff');
    
    // Add filters to URL
    Object.entries(filters).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, String(value));
    });
    
    const response = await fetch(url.toString(), {
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
    console.error('Error fetching staff with filters:', error);
    throw error;
  }
};

// Usage example with filters
const filters = {
  page: 1,
  limit: 20,
  search: 'John',
  institution_id: '1234',
  department_id: '5678',
  category_id: '9012',
  is_active: true
};

fetchStaffWithFilters(apiKey, filters);`,

    fetchAllStaff: `// Fetch all staff (no pagination) example
const fetchAllStaff = async (apiKey, filters = {}) => {
  try {
    // Create URL with query parameters, including all=true
    const url = new URL('https://myadmin.jkkn.ac.in/api/api-management/staff');
    
    // Always add all=true to get all records
    url.searchParams.append('all', 'true');
    
    // Add other filters to URL (page and limit are ignored when all=true)
    Object.entries(filters).forEach(([key, value]) => {
      if (value && key !== 'page' && key !== 'limit') {
        url.searchParams.append(key, String(value));
      }
    });
    
    const response = await fetch(url.toString(), {
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
    console.error('Error fetching all staff:', error);
    throw error;
  }
};

// Usage example for fetching all staff
const filters = {
  search: 'Professor',
  institution_id: '1234',
  is_active: true
};

fetchAllStaff(apiKey, filters);`
  };

  // Complete examples with interfaces
  const completeExamples = {
    interfaces: `// Staff data interfaces
interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'bigender';
  date_of_birth: string;
  marital_status: 'single' | 'married' | 'divorced' | 'widow';
  blood_group?: string;
  email: string;
  institution_email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  
  // Foreign key references
  category_id: string;
  institution_id: string;
  department_id: string;
  
  // Joined data
  category?: {
    id: string;
    category_name: string;
  };
  institution?: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
}

interface PaginatedResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    returned: number;
  };
}

interface AllDataResponse<T> {
  data: T[];
  metadata: {
    total: number;
    all: true;
    returned: number;
  };
}

interface StaffFilters {
  all?: boolean;
  page?: number;
  limit?: number;
  search?: string;
  institution_id?: string;
  department_id?: string;
  category_id?: string;
  is_active?: boolean;
}`,

    apiService: `// staff-api.service.ts
import { StaffMember, PaginatedResponse, StaffFilters } from './types';

export class StaffApiService {
  private baseUrl = 'https://myadmin.jkkn.ac.in/api/api-management';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string): Promise<T> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${this.apiKey}\`,
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || \`HTTP error! status: \${response.status}\`
      );
    }

    return response.json();
  }

  async getStaffList(
    filters: StaffFilters = {}
  ): Promise<PaginatedResponse<StaffMember> | AllDataResponse<StaffMember>> {
    // Build query parameters
    const params = new URLSearchParams();
    
    if (filters.all) params.append('all', 'true');
    if (filters.page && !filters.all) params.append('page', filters.page.toString());
    if (filters.limit && !filters.all) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.institution_id) params.append('institution_id', filters.institution_id);
    if (filters.department_id) params.append('department_id', filters.department_id);
    if (filters.category_id) params.append('category_id', filters.category_id);
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active.toString());
    
    const queryString = params.toString() ? \`?\${params.toString()}\` : '';
    
    return this.request<PaginatedResponse<StaffMember> | AllDataResponse<StaffMember>>(\`/staff\${queryString}\`);
  }

  async getStaffMember(id: string): Promise<{ data: StaffMember }> {
    return this.request<{ data: StaffMember }>(\`/staff/\${id}\`);
  }
}`,

    reactComponent: `'use client';

import { useEffect, useState } from 'react';
import { StaffApiService } from './staff-api.service';
import { StaffMember, PaginatedResponse, StaffFilters } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export function StaffList() {
  const [apiKey, setApiKey] = useState<string>('');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [metadata, setMetadata] = useState<PaginatedResponse<StaffMember>['metadata']>();
  const [filters, setFilters] = useState<StaffFilters>({
    page: 1,
    limit: 10,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    if (!apiKey) {
      setError('API key is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const staffApiService = new StaffApiService(apiKey);
      const result = await staffApiService.getStaffList(filters);
      
      setStaffList(result.data);
      setMetadata(result.metadata);
    } catch (err) {
      console.error('Error fetching staff:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch staff');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when filters change or API key is set
  useEffect(() => {
    if (apiKey) {
      fetchStaff();
    }
  }, [filters.page, apiKey]);

  const handleFilterChange = (key: keyof StaffFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key === 'page' ? value : 1 // Reset to page 1 if changing filter
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Staff API</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Input
              placeholder="Enter API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              className="max-w-md"
            />
            <Button onClick={fetchStaff} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Fetch Staff
            </Button>
          </div>
          
          {error && (
            <div className="bg-red-50 p-4 rounded-md text-red-700 mb-6">
              {error}
            </div>
          )}
          
          <div className="mb-6 flex flex-wrap gap-4">
            <Input
              placeholder="Search staff..."
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full sm:w-64"
            />
            
            <Select 
              value={String(filters.limit)} 
              onValueChange={(value) => handleFilterChange('limit', parseInt(value))}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="25">25 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {staffList.map((staff) => (
                  <Card key={staff.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {staff.profile_picture ? (
                          <img
                            src={staff.profile_picture}
                            alt={staffimage}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {staff.first_name[0]}{staff.last_name[0]}
                            </span>
                          </div>
                        )}
                        <div>
                          <h3 className="font-medium">
                            {staff.first_name} {staff.last_name}
                          </h3>
                          <p className="text-sm text-gray-500">{staff.designation}</p>
                          <p className="text-sm">
                            {staff.department?.department_name} |{" "}
                            {staff.institution?.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {staff.staff_id && \`ID: \${staff.staff_id}\`}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {metadata && (
                <div className="flex justify-between items-center mt-6">
                  <div className="text-sm text-gray-500">
                    Showing {staffList.length} of {metadata.total} results
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page === 1}
                      onClick={() => handleFilterChange('page', filters.page! - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page === metadata.totalPages}
                      onClick={() => handleFilterChange('page', filters.page! + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}`
  };

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-2xl font-bold mb-4'>Staff API Documentation</h2>
        <p className='mb-4'>
          The Staff API allows you to access staff information from the MyJKKN
          system. This API is protected by API keys and supports pagination,
          searching, and filtering.
        </p>

        <div className='flex justify-between items-start flex-col sm:flex-row gap-4'>
          <div className='w-full sm:w-auto'>
            <Button
              variant='outline'
              className='flex items-center gap-2 w-full sm:w-auto'
              onClick={() => copyToClipboard(aiPrompt)}
            >
              <CopyIcon className='h-4 w-4' />
              {copied ? 'Copied!' : 'Copy AI Prompt for Staff API'}
            </Button>
          </div>
        </div>
      </div>

      <Alert>
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>
          All API endpoints require authentication using an API key. Include
          your API key in the Authorization header as a Bearer token.
        </AlertDescription>
      </Alert>

      <div className='space-y-6'>
        <h3 className='text-xl font-semibold'>Endpoints</h3>

        {/* Staff List Endpoint */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center gap-3 mb-4'>
              <Badge variant='outline' className='bg-blue-50 text-blue-700'>
                GET
              </Badge>
              <code className='font-mono text-sm bg-muted px-2 py-1 rounded'>
                /api/api-management/staff
              </code>
            </div>

            <p className='mb-4'>
              Fetches a paginated list of staff members. You can filter the
              results using query parameters.
            </p>

            <h4 className='font-semibold mb-2'>Query Parameters</h4>
            <ul className='list-disc pl-5 mb-4 space-y-1'>
              <li>
                <code>all</code> - Set to <code>true</code> to fetch all records
                without pagination
              </li>
              <li>
                <code>page</code> - Page number (default: 1, ignored when
                all=true)
              </li>
              <li>
                <code>limit</code> - Items per page (default: 10, ignored when
                all=true)
              </li>
              <li>
                <code>search</code> - Search term to filter by name, email, or
                staff ID
              </li>
              <li>
                <code>institution_id</code> - Filter by institution ID
              </li>
              <li>
                <code>department_id</code> - Filter by department ID
              </li>
              <li>
                <code>category_id</code> - Filter by staff category ID
              </li>
              <li>
                <code>is_active</code> - Filter by active status (true/false)
              </li>
            </ul>

            <Accordion type='single' collapsible className='mb-4'>
              <AccordionItem value='response-paginated'>
                <AccordionTrigger>
                  Example Response (Paginated)
                </AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='json'
                    code={JSON.stringify(
                      {
                        data: [
                          {
                            id: '123e4567-e89b-12d3-a456-426614174000',
                            first_name: 'John',
                            last_name: 'Doe',
                            gender: 'male',
                            date_of_birth: '1985-05-10',
                            marital_status: 'married',
                            blood_group: 'O+',
                            email: 'john.doe@example.com',
                            institution_email: 'john.doe@jkkn.ac.in',
                            phone: '9876543210',
                            staff_id: 'STAFF001',
                            profile_picture:
                              'https://example.com/profiles/john-doe.jpg',
                            address: '123 Main St',
                            state: 'Tamil Nadu',
                            district: 'Chennai',
                            pincode: '600001',
                            date_of_joining: '2020-06-15',
                            designation: 'Associate Professor',
                            category_id: '123e4567-e89b-12d3-a456-426614174111',
                            institution_id:
                              '123e4567-e89b-12d3-a456-426614174222',
                            department_id:
                              '123e4567-e89b-12d3-a456-426614174333',
                            is_active: true,
                            created_at: '2020-06-15T10:00:00Z',
                            updated_at: '2023-04-20T14:30:00Z',
                            category: {
                              id: '123e4567-e89b-12d3-a456-426614174111',
                              category_name: 'Teaching'
                            },
                            institution: {
                              id: '123e4567-e89b-12d3-a456-426614174222',
                              name: 'JKKN College of Engineering'
                            },
                            department: {
                              id: '123e4567-e89b-12d3-a456-426614174333',
                              department_name: 'Computer Science'
                            }
                          }
                          // Additional staff members would be here
                        ],
                        metadata: {
                          total: 156,
                          page: 1,
                          limit: 10,
                          totalPages: 16,
                          returned: 10
                        }
                      },
                      null,
                      2
                    )}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='response-all'>
                <AccordionTrigger>Example Response (All Data)</AccordionTrigger>
                <AccordionContent>
                  <p className='text-sm text-muted-foreground mb-2'>
                    When using <code>all=true</code> parameter:
                  </p>
                  <CodeBlock
                    language='json'
                    code={JSON.stringify(
                      {
                        data: [
                          // All staff records would be included here
                          {
                            id: '123e4567-e89b-12d3-a456-426614174000',
                            first_name: 'John',
                            last_name: 'Doe'
                            // ... complete staff data
                          }
                          // ... all other staff records
                        ],
                        metadata: {
                          total: 156,
                          all: true,
                          returned: 156
                        }
                      },
                      null,
                      2
                    )}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Staff Detail Endpoint */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center gap-3 mb-4'>
              <Badge variant='outline' className='bg-blue-50 text-blue-700'>
                GET
              </Badge>
              <code className='font-mono text-sm bg-muted px-2 py-1 rounded'>
                /api/api-management/staff/{'{id}'}
              </code>
            </div>

            <p className='mb-4'>
              Fetches details of a specific staff member by ID.
            </p>

            <h4 className='font-semibold mb-2'>URL Parameters</h4>
            <ul className='list-disc pl-5 mb-4 space-y-1'>
              <li>
                <code>id</code> - Staff member ID (UUID)
              </li>
            </ul>

            <Accordion type='single' collapsible className='mb-4'>
              <AccordionItem value='response'>
                <AccordionTrigger>Example Response</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='json'
                    code={JSON.stringify(
                      {
                        data: {
                          id: '123e4567-e89b-12d3-a456-426614174000',
                          first_name: 'John',
                          last_name: 'Doe',
                          gender: 'male',
                          date_of_birth: '1985-05-10',
                          marital_status: 'married',
                          blood_group: 'O+',
                          email: 'john.doe@example.com',
                          institution_email: 'john.doe@jkkn.ac.in',
                          phone: '9876543210',
                          staff_id: 'STAFF001',
                          profile_picture:
                            'https://example.com/profiles/john-doe.jpg',
                          address: '123 Main St',
                          state: 'Tamil Nadu',
                          district: 'Chennai',
                          pincode: '600001',
                          date_of_joining: '2020-06-15',
                          designation: 'Associate Professor',
                          category_id: '123e4567-e89b-12d3-a456-426614174111',
                          institution_id:
                            '123e4567-e89b-12d3-a456-426614174222',
                          department_id: '123e4567-e89b-12d3-a456-426614174333',
                          is_active: true,
                          created_at: '2020-06-15T10:00:00Z',
                          updated_at: '2023-04-20T14:30:00Z',
                          category: {
                            id: '123e4567-e89b-12d3-a456-426614174111',
                            category_name: 'Teaching'
                          },
                          institution: {
                            id: '123e4567-e89b-12d3-a456-426614174222',
                            name: 'JKKN College of Engineering'
                          },
                          department: {
                            id: '123e4567-e89b-12d3-a456-426614174333',
                            department_name: 'Computer Science'
                          }
                        }
                      },
                      null,
                      2
                    )}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <div className='space-y-6'>
        <h3 className='text-xl font-semibold'>Usage Examples</h3>

        <Tabs defaultValue='basic' className='w-full'>
          <TabsList className='mb-4'>
            <TabsTrigger value='basic'>Basic Examples</TabsTrigger>
            <TabsTrigger value='complete'>Complete Implementation</TabsTrigger>
          </TabsList>

          <TabsContent value='basic' className='space-y-6'>
            {/* Basic Examples */}
            <Accordion type='single' collapsible>
              <AccordionItem value='listStaff'>
                <AccordionTrigger>Fetch Staff List Example</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='javascript'
                    code={basicExamples.listStaff}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='getStaffMember'>
                <AccordionTrigger>Fetch Staff Member Example</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='javascript'
                    code={basicExamples.getStaffMember}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='withFilters'>
                <AccordionTrigger>
                  Fetch Staff with Filters Example
                </AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='javascript'
                    code={basicExamples.withFilters}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='fetchAllStaff'>
                <AccordionTrigger>
                  Fetch All Staff (No Pagination) Example
                </AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='javascript'
                    code={basicExamples.fetchAllStaff}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          <TabsContent value='complete' className='space-y-6'>
            {/* Complete Implementation */}
            <Accordion type='single' collapsible>
              <AccordionItem value='interfaces'>
                <AccordionTrigger>TypeScript Interfaces</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='typescript'
                    code={completeExamples.interfaces}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='apiService'>
                <AccordionTrigger>Staff API Service Class</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='typescript'
                    code={completeExamples.apiService}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='reactComponent'>
                <AccordionTrigger>React Component</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    language='tsx'
                    code={completeExamples.reactComponent}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
