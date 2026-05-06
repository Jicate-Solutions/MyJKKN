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
import { DownloadMarkdownButton } from '@/components/api-docs/shared/download-markdown-button';
import { staffApiDocsMarkdown } from './staff-api-docs.markdown';

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
- Base URL: https://jkkn.ai/api
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
    const response = await fetch('https://jkkn.ai/api/api-management/staff', {
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
    const response = await fetch(\`https://jkkn.ai/api/api-management/staff/\${staffId}\`, {
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
    const url = new URL('https://jkkn.ai/api/api-management/staff');
    
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
    const url = new URL('https://jkkn.ai/api/api-management/staff');
    
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
//
// IMPORTANT: Additional fields by category
// ────────────────────────────────────────
// Each staff record is anchored to an "employment category" (Teaching,
// Non-Teaching, etc.). The category controls TWO things:
//   1. category.is_teaching            → if true, department_id is required.
//   2. category.shows_extended_profile → if true, the 29 extended-profile
//      fields below (experience_years, publications, qualifications, …) are
//      meaningful for staff in that category. The per-row opt-in flag is
//      \`has_extended_profile\`. When BOTH flags are false, treat the extended
//      fields as semantically empty even though scalar defaults (0, '') and
//      JSONB defaults ([]) will still be present on the wire.
interface StaffCategory {
  id: string;
  category_name: string;
  is_teaching: boolean;
  shows_extended_profile: boolean;
}

interface ExtendedProfile {
  // Scalars (DB defaults: 0 / 'draft' / false)
  has_extended_profile: boolean;
  slug: string | null;
  status: 'draft' | 'published';
  display_order: number;
  experience_years: number;
  research_papers: number;
  phd_scholars: number;
  awards_won: number;
  pg_dissertations_guided: number;
  ug_projects_guided: number;
  qualification_summary: string | null;
  professional_summary: string | null;
  mentoring_description: string | null;
  google_scholar_url: string | null;
  researchgate_url: string | null;
  orcid_url: string | null;
  // JSONB arrays (DB default: [])
  badges: unknown[];
  qualifications: unknown[];
  specialisations: unknown[];
  experience_entries: unknown[];
  research_focus_areas: unknown[];
  publications: unknown[];
  funded_projects: unknown[];
  certifications: unknown[];
  awards: unknown[];
  memberships: unknown[];
  phd_scholars_list: unknown[];
  faqs: unknown[];
  achievements: unknown[];
}

interface StaffMember extends ExtendedProfile {
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

  // Role taxonomy
  // role_type — coarse: 'faculty' | 'admin' | 'support' | 'management' (freeform)
  // role_key  — fine-grained custom_roles key (e.g. 'hod', 'principal', 'admission_counselor')
  role_type: 'faculty' | 'admin' | 'support' | 'management' | string | null;
  role_key: string;

  // Foreign key references
  category_id: string;
  institution_id: string;
  department_id: string;

  // Joined named entities — every *_id column above is paired with its
  // display label so consumers don't need a second call to resolve UUIDs.
  // category exposes is_teaching + shows_extended_profile so consumers can
  // interpret the extended-profile fields.
  category?: StaffCategory;
  institution?: {
    id: string;
    name: string;
    counselling_code?: string | null;
  };
  department?: {
    id: string;
    department_name: string;
  };
  // role joins custom_roles via the role_key FK; role_name is the human-readable
  // label (e.g. 'Head of Department'), role_key is the permission slug ('hod').
  role?: {
    id: string;
    role_key: string;
    role_name: string;
    description: string | null;
    is_system_role: boolean | null;
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
  has_extended_profile?: boolean; // filter to rows with extended profile filled
  // Role-based filters (see "Role-Based Fetching" section below)
  role_type?: 'faculty' | 'admin' | 'support' | 'management' | string;
  role_key?: string; // e.g. 'hod', 'principal', 'admission_counselor'
}`,

    apiService: `// staff-api.service.ts
import { StaffMember, PaginatedResponse, StaffFilters } from './types';

export class StaffApiService {
  private baseUrl = 'https://jkkn.ai/api/api-management';
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
    if (filters.has_extended_profile !== undefined) params.append('has_extended_profile', filters.has_extended_profile.toString());
    if (filters.role_type) params.append('role_type', filters.role_type);
    if (filters.role_key) params.append('role_key', filters.role_key);

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
          <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
            <Button
              variant='outline'
              className='flex items-center gap-2 w-full sm:w-auto'
              onClick={() => copyToClipboard(aiPrompt)}
            >
              <CopyIcon className='h-4 w-4' />
              {copied ? 'Copied!' : 'Copy AI Prompt for Staff API'}
            </Button>
            <DownloadMarkdownButton
              filename='staff-api-documentation.md'
              content={staffApiDocsMarkdown}
              className='w-full sm:w-auto'
            />
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
              <li>
                <code>has_extended_profile</code> - Filter to staff who have
                opted into the extended faculty profile (true/false). Use this
                with <code>category_id</code> to scope to a single category that
                has <code>shows_extended_profile = true</code>.
              </li>
              <li>
                <code>role_type</code> - Coarse role taxonomy. Common values:
                <code>faculty</code>, <code>admin</code>, <code>support</code>,
                <code>management</code>. Useful for grouping (e.g. directory
                pages, headcount reports).
              </li>
              <li>
                <code>role_key</code> - Fine-grained role keyed to
                <code>custom_roles.role_key</code> (e.g. <code>hod</code>,
                <code>principal</code>, <code>faculty</code>,
                <code>admission_counselor</code>). Use this when the consumer
                needs to act on permission-bearing roles (workflow approvers,
                permission-aware integrations).
              </li>
            </ul>

            <Alert className='mb-4'>
              <AlertTitle>Additional fields by category</AlertTitle>
              <AlertDescription>
                Every staff row carries <code>has_extended_profile</code> plus
                the 29 extended-profile columns (e.g. <code>experience_years</code>,
                <code>publications</code>, <code>qualifications</code>). The
                joined <code>category</code> object exposes
                <code> is_teaching</code> and <code>shows_extended_profile</code>
                so you can tell whether those fields are meaningful for the
                row. When <code>has_extended_profile = false</code> AND
                <code> category.shows_extended_profile = false</code>, treat
                scalars as semantically empty (DB defaults to <code>0</code>,
                <code>'draft'</code>) and JSONB arrays as empty (DB default
                <code>[]</code>).
              </AlertDescription>
            </Alert>

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
                            // Role taxonomy
                            role_type: 'faculty',
                            role_key: 'hod',
                            category_id: '123e4567-e89b-12d3-a456-426614174111',
                            institution_id:
                              '123e4567-e89b-12d3-a456-426614174222',
                            department_id:
                              '123e4567-e89b-12d3-a456-426614174333',
                            is_active: true,
                            created_at: '2020-06-15T10:00:00Z',
                            updated_at: '2023-04-20T14:30:00Z',
                            // Extended profile (gated by has_extended_profile +
                            // category.shows_extended_profile). Populated here
                            // because both flags are true.
                            has_extended_profile: true,
                            slug: 'john-doe',
                            status: 'published',
                            display_order: 0,
                            experience_years: 12,
                            research_papers: 18,
                            phd_scholars: 3,
                            awards_won: 4,
                            pg_dissertations_guided: 9,
                            ug_projects_guided: 22,
                            qualification_summary: 'Ph.D in CSE',
                            professional_summary: '12+ years in academia and industry',
                            mentoring_description: 'Active mentor for UG/PG projects',
                            google_scholar_url: 'https://scholar.google.com/citations?user=xxx',
                            researchgate_url: null,
                            orcid_url: null,
                            badges: [],
                            qualifications: [
                              { degree: 'Ph.D', institution: 'IIT Madras', year: 2015 }
                            ],
                            specialisations: ['Machine Learning', 'NLP'],
                            experience_entries: [],
                            research_focus_areas: [],
                            publications: [],
                            funded_projects: [],
                            certifications: [],
                            awards: [],
                            memberships: [],
                            phd_scholars_list: [],
                            faqs: [],
                            achievements: [],
                            // Embedded named entities — every *_id above paired
                            // with its display label so consumers don't need a
                            // second call to resolve UUIDs.
                            category: {
                              id: '123e4567-e89b-12d3-a456-426614174111',
                              category_name: 'Teaching',
                              is_teaching: true,
                              shows_extended_profile: true
                            },
                            institution: {
                              id: '123e4567-e89b-12d3-a456-426614174222',
                              name: 'JKKN College of Engineering',
                              counselling_code: '2755'
                            },
                            department: {
                              id: '123e4567-e89b-12d3-a456-426614174333',
                              department_name: 'Computer Science'
                            },
                            role: {
                              id: '123e4567-e89b-12d3-a456-426614174444',
                              role_key: 'hod',
                              role_name: 'Head of Department',
                              description: 'Department head with approval authority',
                              is_system_role: false
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
                          role_type: 'faculty',
                          role_key: 'hod',
                          category_id: '123e4567-e89b-12d3-a456-426614174111',
                          institution_id:
                            '123e4567-e89b-12d3-a456-426614174222',
                          department_id: '123e4567-e89b-12d3-a456-426614174333',
                          is_active: true,
                          created_at: '2020-06-15T10:00:00Z',
                          updated_at: '2023-04-20T14:30:00Z',
                          // Extended profile fields (gated by has_extended_profile
                          // AND category.shows_extended_profile).
                          has_extended_profile: true,
                          slug: 'john-doe',
                          status: 'published',
                          display_order: 0,
                          experience_years: 12,
                          research_papers: 18,
                          phd_scholars: 3,
                          awards_won: 4,
                          pg_dissertations_guided: 9,
                          ug_projects_guided: 22,
                          qualification_summary: 'Ph.D in CSE',
                          professional_summary: '12+ years in academia and industry',
                          mentoring_description: 'Active mentor for UG/PG projects',
                          google_scholar_url: 'https://scholar.google.com/citations?user=xxx',
                          researchgate_url: null,
                          orcid_url: null,
                          badges: [],
                          qualifications: [
                            { degree: 'Ph.D', institution: 'IIT Madras', year: 2015 }
                          ],
                          specialisations: ['Machine Learning', 'NLP'],
                          experience_entries: [],
                          research_focus_areas: [],
                          publications: [],
                          funded_projects: [],
                          certifications: [],
                          awards: [],
                          memberships: [],
                          phd_scholars_list: [],
                          faqs: [],
                          achievements: [],
                          // Embedded named entities — paired with the *_id columns above.
                          category: {
                            id: '123e4567-e89b-12d3-a456-426614174111',
                            category_name: 'Teaching',
                            is_teaching: true,
                            shows_extended_profile: true
                          },
                          institution: {
                            id: '123e4567-e89b-12d3-a456-426614174222',
                            name: 'JKKN College of Engineering',
                            counselling_code: '2755'
                          },
                          department: {
                            id: '123e4567-e89b-12d3-a456-426614174333',
                            department_name: 'Computer Science'
                          },
                          role: {
                            id: '123e4567-e89b-12d3-a456-426614174444',
                            role_key: 'hod',
                            role_name: 'Head of Department',
                            description: 'Department head with approval authority',
                            is_system_role: false
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

      {/* ───────── Role-Based Fetching ───────── */}
      <div className='space-y-4'>
        <h3 className='text-xl font-semibold'>Role-Based Fetching</h3>
        <p>
          Staff records carry two role-related fields that consumers can filter
          on. Pick the one that matches your intent — they are NOT
          interchangeable.
        </p>

        <Card>
          <CardContent className='pt-6 space-y-4'>
            <div>
              <Badge variant='outline' className='bg-purple-50 text-purple-700 mr-2'>
                role_type
              </Badge>
              <span className='text-sm font-medium'>Coarse taxonomy</span>
              <p className='text-sm text-muted-foreground mt-1'>
                A high-level grouping of staff. Common values:
                <code className='mx-1'>faculty</code>,
                <code className='mx-1'>admin</code>,
                <code className='mx-1'>support</code>,
                <code className='mx-1'>management</code>. Use this when
                building directories, headcount reports, or anything that
                groups staff by job family.
              </p>
            </div>
            <div>
              <Badge variant='outline' className='bg-blue-50 text-blue-700 mr-2'>
                role_key
              </Badge>
              <span className='text-sm font-medium'>Fine-grained role</span>
              <p className='text-sm text-muted-foreground mt-1'>
                References a row in the <code>custom_roles</code> table — drives
                actual permissions in MyJKKN. Examples:{' '}
                <code>hod</code>, <code>principal</code>, <code>dean</code>,{' '}
                <code>faculty</code>, <code>admission_counselor</code>,{' '}
                <code>expo_counselor</code>. Use this when you need to act on a
                specific permission-bearing role (workflow approvers,
                permission-aware integrations).
              </p>
            </div>
            <Alert>
              <AlertTitle>No DB CHECK constraint</AlertTitle>
              <AlertDescription>
                Both fields are freeform strings — there is no database-level
                whitelist. Treat unknown values defensively. The list above is
                conventional but new role keys can be added at any time via
                Role Management.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Accordion type='single' collapsible>
          <AccordionItem value='role-faculty-curl'>
            <AccordionTrigger>
              Fetch all faculty (role_type=faculty) — curl
            </AccordionTrigger>
            <AccordionContent>
              <CodeBlock
                language='bash'
                code={`curl -s "https://jkkn.ai/api/api-management/staff?role_type=faculty&is_active=true&limit=50" \\
  -H "Authorization: Bearer $JKKN_API_KEY" \\
  -H "Accept: application/json"`}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value='role-hod-curl'>
            <AccordionTrigger>
              Fetch only Heads of Department (role_key=hod) — curl
            </AccordionTrigger>
            <AccordionContent>
              <CodeBlock
                language='bash'
                code={`curl -s "https://jkkn.ai/api/api-management/staff?role_key=hod&is_active=true" \\
  -H "Authorization: Bearer $JKKN_API_KEY"`}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value='role-faculty-extended'>
            <AccordionTrigger>
              Fetch faculty with published extended profiles — JS
            </AccordionTrigger>
            <AccordionContent>
              <CodeBlock
                language='javascript'
                code={`// Useful for building a public faculty directory page.
const fetchPublishedFaculty = async (apiKey) => {
  const url = new URL('https://jkkn.ai/api/api-management/staff');
  url.searchParams.append('role_type', 'faculty');
  url.searchParams.append('has_extended_profile', 'true');
  url.searchParams.append('is_active', 'true');
  url.searchParams.append('all', 'true');

  const res = await fetch(url, {
    headers: { Authorization: \`Bearer \${apiKey}\` }
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const { data } = await res.json();

  // Belt-and-suspenders: status === 'published' is also DB-defaulted
  return data.filter((s) => s.status === 'published');
};`}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value='role-counselors'>
            <AccordionTrigger>
              Fetch counselors across both taxonomies (admission_counselor +
              expo_counselor) — JS
            </AccordionTrigger>
            <AccordionContent>
              <CodeBlock
                language='javascript'
                code={`// Two separate calls — combine client-side. role_key is single-valued
// per request (no IN-list support yet); fan out and merge.
const fetchAllCounselors = async (apiKey, institutionId) => {
  const base = (key) => {
    const u = new URL('https://jkkn.ai/api/api-management/staff');
    u.searchParams.append('role_key', key);
    u.searchParams.append('institution_id', institutionId);
    u.searchParams.append('is_active', 'true');
    u.searchParams.append('all', 'true');
    return u;
  };

  const [adm, expo] = await Promise.all([
    fetch(base('admission_counselor'), {
      headers: { Authorization: \`Bearer \${apiKey}\` }
    }).then((r) => r.json()),
    fetch(base('expo_counselor'), {
      headers: { Authorization: \`Bearer \${apiKey}\` }
    }).then((r) => r.json())
  ]);

  return [...adm.data, ...expo.data];
};`}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value='role-b2a-faculty'>
            <AccordionTrigger>
              Fetch faculty via B2A endpoint (lean response) — curl
            </AccordionTrigger>
            <AccordionContent>
              <p className='text-sm text-muted-foreground mb-2'>
                The <code>/api/b2a/staff</code> list returns a smaller payload
                per row (no extended-profile columns) — preferred for fast
                directory listings. Use{' '}
                <code>/api/b2a/staff/{'{id}'}</code> to fetch the full record.
              </p>
              <CodeBlock
                language='bash'
                code={`curl -s "https://jkkn.ai/api/b2a/staff?role_type=faculty&category_id=<UUID>&page=1&limit=20" \\
  -H "Authorization: Bearer $JKKN_API_KEY"`}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* ───────── Common Use Cases ───────── */}
      <div className='space-y-4'>
        <h3 className='text-xl font-semibold'>Common Use Cases</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardContent className='pt-6'>
              <h4 className='font-semibold mb-2'>Faculty directory page</h4>
              <p className='text-sm text-muted-foreground mb-2'>
                Render a public-facing faculty list with photos, departments,
                and bios.
              </p>
              <code className='text-xs bg-muted p-2 rounded block'>
                GET /api-management/staff?role_type=faculty&has_extended_profile=true&is_active=true&all=true
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='pt-6'>
              <h4 className='font-semibold mb-2'>HOD approvers list</h4>
              <p className='text-sm text-muted-foreground mb-2'>
                Resolve approvers for a department-level workflow (e.g.
                leave/OD).
              </p>
              <code className='text-xs bg-muted p-2 rounded block'>
                GET /api-management/staff?role_key=hod&department_id=&lt;UUID&gt;&is_active=true
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='pt-6'>
              <h4 className='font-semibold mb-2'>
                Per-institution headcount by role
              </h4>
              <p className='text-sm text-muted-foreground mb-2'>
                Run pagination with <code>limit=1</code> + read{' '}
                <code>metadata.total</code> for a fast count.
              </p>
              <code className='text-xs bg-muted p-2 rounded block'>
                GET /api-management/staff?institution_id=&lt;UUID&gt;&role_type=admin&limit=1
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='pt-6'>
              <h4 className='font-semibold mb-2'>Search within a role</h4>
              <p className='text-sm text-muted-foreground mb-2'>
                Combine <code>search</code> with <code>role_key</code> to
                resolve "Mr X" within a role.
              </p>
              <code className='text-xs bg-muted p-2 rounded block'>
                GET /api-management/staff?role_key=principal&search=raj&limit=10
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='pt-6'>
              <h4 className='font-semibold mb-2'>
                Teaching staff in a category
              </h4>
              <p className='text-sm text-muted-foreground mb-2'>
                Combines category filter with the response's{' '}
                <code>category.is_teaching</code> to identify teaching-only
                staff.
              </p>
              <code className='text-xs bg-muted p-2 rounded block'>
                GET /api-management/staff?category_id=&lt;UUID&gt;&is_active=true
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='pt-6'>
              <h4 className='font-semibold mb-2'>One staff member's full record</h4>
              <p className='text-sm text-muted-foreground mb-2'>
                Returns the 29 extended-profile columns plus category metadata.
              </p>
              <code className='text-xs bg-muted p-2 rounded block'>
                GET /api-management/staff/&lt;UUID&gt;
              </code>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ───────── Field Reference ───────── */}
      <div className='space-y-4'>
        <h3 className='text-xl font-semibold'>Field Reference</h3>
        <p className='text-sm text-muted-foreground'>
          Every field returned by <code>/api-management/staff</code> and{' '}
          <code>/api-management/staff/{'{id}'}</code>. The B2A list returns a
          lean subset; the B2A detail returns everything in this table.
        </p>

        <Alert>
          <AlertTitle>Names are always paired with IDs</AlertTitle>
          <AlertDescription>
            Every <code>*_id</code> column in the response is paired with a
            named-entity object so consuming applications can render labels
            without a second API call:
            <ul className='list-disc pl-5 mt-2 space-y-1 text-sm'>
              <li>
                <code>category_id</code> →{' '}
                <code>category.category_name</code>
              </li>
              <li>
                <code>institution_id</code> → <code>institution.name</code>{' '}
                (+ <code>counselling_code</code>)
              </li>
              <li>
                <code>department_id</code> →{' '}
                <code>department.department_name</code>
              </li>
              <li>
                <code>role_key</code> → <code>role.role_name</code> (display
                label, e.g. &quot;Head of Department&quot;) +{' '}
                <code>role.description</code>
              </li>
            </ul>
            <p className='mt-2 text-xs text-muted-foreground'>
              All four embeds are present on{' '}
              <code>/api/staff</code>,{' '}
              <code>/api/api-management/staff</code>, AND{' '}
              <code>/api/b2a/staff</code> (list + detail). Use whichever
              endpoint matches your authentication model — the embed shape is
              identical.
            </p>
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className='pt-6 overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4'>Field</th>
                  <th className='py-2 pr-4'>Type</th>
                  <th className='py-2'>Description</th>
                </tr>
              </thead>
              <tbody className='[&>tr]:border-b [&>tr:last-child]:border-0 [&>tr>td]:py-2 [&>tr>td]:pr-4 [&>tr>td]:align-top'>
                <tr><td><code>id</code></td><td>UUID</td><td>Primary key.</td></tr>
                <tr><td><code>staff_id</code></td><td>string | null</td><td>Human-readable employee ID (org-defined).</td></tr>
                <tr><td><code>first_name</code></td><td>string</td><td>Required.</td></tr>
                <tr><td><code>last_name</code></td><td>string</td><td>Required.</td></tr>
                <tr><td><code>gender</code></td><td>'male' | 'female' | 'bigender'</td><td>—</td></tr>
                <tr><td><code>date_of_birth</code></td><td>ISO date</td><td>—</td></tr>
                <tr><td><code>marital_status</code></td><td>'single' | 'married' | 'divorced' | 'widow'</td><td>—</td></tr>
                <tr><td><code>blood_group</code></td><td>string | null</td><td>e.g. 'O+', 'AB-'.</td></tr>
                <tr><td><code>email</code></td><td>string</td><td>Personal email.</td></tr>
                <tr><td><code>institution_email</code></td><td>string</td><td>Org email — used to match staff to a user account.</td></tr>
                <tr><td><code>phone</code></td><td>string</td><td>—</td></tr>
                <tr><td><code>profile_picture</code></td><td>string | null</td><td>URL.</td></tr>
                <tr><td><code>address, state, district, pincode</code></td><td>string | null</td><td>Address fields.</td></tr>
                <tr><td><code>date_of_joining</code></td><td>ISO date</td><td>—</td></tr>
                <tr><td><code>designation</code></td><td>string</td><td>Job title (e.g. 'Associate Professor'). Searchable via <code>?designation=</code> on B2A.</td></tr>
                <tr><td><code>role_type</code></td><td>string | null</td><td>Coarse role taxonomy (faculty / admin / support / management).</td></tr>
                <tr><td><code>role_key</code></td><td>string</td><td>Fine-grained role (matches <code>custom_roles.role_key</code>).</td></tr>
                <tr><td><code>category_id</code></td><td>UUID</td><td>FK → <code>employment_categories.id</code>.</td></tr>
                <tr><td><code>institution_id</code></td><td>UUID</td><td>FK → <code>institutions.id</code>.</td></tr>
                <tr><td><code>department_id</code></td><td>UUID | null</td><td>FK → <code>departments.id</code>. Required when category.is_teaching = true.</td></tr>
                <tr><td><code>is_active</code></td><td>boolean</td><td>—</td></tr>
                <tr><td><code>has_extended_profile</code></td><td>boolean</td><td>Per-row opt-in for the 29 extended-profile fields below.</td></tr>
                <tr><td><code>category</code></td><td>object</td><td><code>{`{ id, category_name, is_teaching, shows_extended_profile }`}</code> — embedded category metadata.</td></tr>
                <tr><td><code>institution</code></td><td>object</td><td><code>{`{ id, name, counselling_code }`}</code> — display name paired with the <code>institution_id</code> FK.</td></tr>
                <tr><td><code>department</code></td><td>object | null</td><td><code>{`{ id, department_name }`}</code> — display name paired with the <code>department_id</code> FK.</td></tr>
                <tr><td><code>role</code></td><td>object | null</td><td><code>{`{ id, role_key, role_name, description, is_system_role }`}</code> — joined from <code>custom_roles</code> via the <code>role_key</code> FK. <code>role_name</code> is the human-readable label (e.g. &quot;Head of Department&quot;); <code>role.permissions</code> and <code>role.module_scopes</code> are intentionally NOT exposed.</td></tr>
                <tr><td colSpan={3} className='font-semibold pt-3'>Extended Profile (gated by has_extended_profile + category.shows_extended_profile)</td></tr>
                <tr><td><code>slug</code></td><td>string | null</td><td>URL slug for public faculty page (UNIQUE).</td></tr>
                <tr><td><code>status</code></td><td>'draft' | 'published'</td><td>Publication state. Default 'draft'.</td></tr>
                <tr><td><code>display_order</code></td><td>integer</td><td>Sort key for directory listings.</td></tr>
                <tr><td><code>experience_years</code></td><td>integer</td><td>—</td></tr>
                <tr><td><code>research_papers</code></td><td>integer</td><td>—</td></tr>
                <tr><td><code>phd_scholars</code></td><td>integer</td><td>Count.</td></tr>
                <tr><td><code>awards_won</code></td><td>integer</td><td>—</td></tr>
                <tr><td><code>pg_dissertations_guided</code></td><td>integer</td><td>—</td></tr>
                <tr><td><code>ug_projects_guided</code></td><td>integer</td><td>—</td></tr>
                <tr><td><code>qualification_summary</code></td><td>string | null</td><td>Plain-text summary.</td></tr>
                <tr><td><code>professional_summary</code></td><td>string | null</td><td>—</td></tr>
                <tr><td><code>mentoring_description</code></td><td>string | null</td><td>—</td></tr>
                <tr><td><code>google_scholar_url, researchgate_url, orcid_url</code></td><td>string | null</td><td>External profile URLs.</td></tr>
                <tr><td><code>badges, qualifications, specialisations, experience_entries, research_focus_areas, publications, funded_projects, certifications, awards, memberships, phd_scholars_list, faqs, achievements</code></td><td>JSONB[] (default <code>[]</code>)</td><td>Structured arrays. Never null on the wire.</td></tr>
                <tr><td><code>created_at, updated_at</code></td><td>ISO timestamp</td><td>—</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ───────── Errors / Auth / Rate Limits ───────── */}
      <div className='space-y-4'>
        <h3 className='text-xl font-semibold'>
          Errors, Authentication & Rate Limits
        </h3>

        <Card>
          <CardContent className='pt-6 space-y-3'>
            <h4 className='font-semibold'>Authentication</h4>
            <p className='text-sm'>
              Send your API key as a Bearer token in the{' '}
              <code>Authorization</code> header on every request:
            </p>
            <CodeBlock
              language='bash'
              code={`Authorization: Bearer jkkn_xxxxxxxx_xxxxxxxx`}
            />
            <p className='text-sm text-muted-foreground'>
              The key is hashed (SHA-256) before lookup; we never store the
              plaintext. Keys can be created and revoked from the API
              Management section of MyJKKN. Each key carries{' '}
              <code>permissions.read</code> and{' '}
              <code>permissions.write</code> flags — staff list/detail
              endpoints require <code>read</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6 space-y-3'>
            <h4 className='font-semibold'>Error responses</h4>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4'>Status</th>
                  <th className='py-2 pr-4'>Code</th>
                  <th className='py-2'>When</th>
                </tr>
              </thead>
              <tbody className='[&>tr]:border-b [&>tr:last-child]:border-0 [&>tr>td]:py-2 [&>tr>td]:pr-4 [&>tr>td]:align-top'>
                <tr>
                  <td>400</td>
                  <td><code>INVALID_ID</code></td>
                  <td>Path parameter is not a valid UUID (B2A detail only).</td>
                </tr>
                <tr>
                  <td>401</td>
                  <td>—</td>
                  <td>Missing or malformed <code>Authorization</code> header; key not found; key revoked or expired.</td>
                </tr>
                <tr>
                  <td>403</td>
                  <td>—</td>
                  <td>Key lacks <code>read</code> permission for staff module.</td>
                </tr>
                <tr>
                  <td>404</td>
                  <td><code>NOT_FOUND</code></td>
                  <td>Detail endpoint and the staff record does not exist (or is outside the key's institution scope).</td>
                </tr>
                <tr>
                  <td>429</td>
                  <td><code>RATE_LIMIT_EXCEEDED</code></td>
                  <td>60 requests / minute per API key on B2A endpoints. Honour <code>Retry-After</code>.</td>
                </tr>
                <tr>
                  <td>500</td>
                  <td><code>INTERNAL_ERROR</code></td>
                  <td>Unexpected server error. Safe to retry with backoff.</td>
                </tr>
              </tbody>
            </table>
            <p className='text-xs text-muted-foreground'>
              Error body shape on B2A:{' '}
              <code>{'{ "error": { "code": "...", "message": "..." } }'}</code>.
              On <code>/api-management/*</code>:{' '}
              <code>{'{ "error": "..." }'}</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6 space-y-3'>
            <h4 className='font-semibold'>Rate limiting</h4>
            <p className='text-sm'>
              B2A endpoints (<code>/api/b2a/staff*</code>) are rate-limited to{' '}
              <strong>60 requests per minute per API key</strong>. Every
              response (success or 429) carries:
            </p>
            <ul className='text-sm list-disc pl-5'>
              <li>
                <code>X-RateLimit-Limit</code> — fixed at 60.
              </li>
              <li>
                <code>X-RateLimit-Remaining</code> — calls left in the current
                window.
              </li>
              <li>
                <code>X-RateLimit-Reset</code> — ISO-8601 reset timestamp.
              </li>
              <li>
                <code>Retry-After</code> (429 only) — seconds to wait.
              </li>
            </ul>
            <p className='text-sm text-muted-foreground'>
              The <code>/api-management/staff*</code> endpoints have no
              per-key rate limit but are subject to the same rate-limit
              middleware as the rest of MyJKKN.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6 space-y-3'>
            <h4 className='font-semibold'>CORS</h4>
            <p className='text-sm text-muted-foreground'>
              <code>/api-management/staff*</code> sends permissive CORS headers
              (configured in <code>lib/api-keys/cors.ts</code>) and supports
              <code> OPTIONS</code> preflight. B2A endpoints are intended for
              server-to-server use — there is no CORS allowlist; calling them
              from a browser will fail unless your origin is proxied.
            </p>
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
