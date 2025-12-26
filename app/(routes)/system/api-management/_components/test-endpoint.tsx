// app/(routes)/system/api-management/_components/test-endpoint.tsx
'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { ChevronDown, ChevronUp, Play, Copy, Check } from 'lucide-react';
import toast  from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const API_ENDPOINTS = {
  learners: [
    { value: '/api/api-management/learners/profiles', label: 'Learners - Profiles (Active)' },
    { value: '/api/api-management/learners/profiles/[id]', label: 'Learners - Profile by ID' },
    { value: '/api/api-management/learners/enquiries', label: 'Learners - Enquiries' },
    { value: '/api/api-management/learners/enquiries/[id]', label: 'Learners - Enquiry by ID' },
    { value: '/api/api-management/learners/alumni', label: 'Learners - Alumni' }
  ],
  organizations: [
    { value: '/api/api-management/organizations/institutions', label: 'Organizations - Institutions' },
    { value: '/api/api-management/organizations/institutions/[id]', label: 'Organizations - Institution by ID' },
    { value: '/api/api-management/organizations/degrees', label: 'Organizations - Degrees' },
    { value: '/api/api-management/organizations/degrees/[id]', label: 'Organizations - Degree by ID' },
    { value: '/api/api-management/organizations/departments', label: 'Organizations - Departments' },
    { value: '/api/api-management/organizations/departments/[id]', label: 'Organizations - Department by ID' },
    { value: '/api/api-management/organizations/programs', label: 'Organizations - Programs' },
    { value: '/api/api-management/organizations/programs/[id]', label: 'Organizations - Program by ID' },
    { value: '/api/api-management/organizations/courses', label: 'Organizations - Courses' },
    { value: '/api/api-management/organizations/courses/[id]', label: 'Organizations - Course by ID' },
    { value: '/api/api-management/organizations/semesters', label: 'Organizations - Semesters' },
    { value: '/api/api-management/organizations/semesters/[id]', label: 'Organizations - Semester by ID' },
    { value: '/api/api-management/organizations/sections', label: 'Organizations - Sections' },
    { value: '/api/api-management/organizations/sections/[id]', label: 'Organizations - Section by ID' }
  ],
  academic: [
    { value: '/api/api-management/academic/regulations', label: 'Academic - Regulations' },
    { value: '/api/api-management/academic/regulations/[id]', label: 'Academic - Regulation by ID' },
    { value: '/api/api-management/academic/batches', label: 'Academic - Batches' },
    { value: '/api/api-management/academic/batches/[id]', label: 'Academic - Batch by ID' }
  ],
  staff: [
    { value: '/api/api-management/staff', label: 'Staff - List' },
    { value: '/api/api-management/staff/[id]', label: 'Staff - By ID' }
  ],
  applications: [
    { value: '/api/api-management/applications', label: 'Applications - List' },
    { value: '/api/api-management/applications/[id]', label: 'Applications - By ID' }
  ]
};

// Query parameters for each endpoint
const QUERY_PARAMETERS: Record<string, Array<{ value: string; label: string; description: string }>> = {
  '/api/api-management/learners/profiles': [
    { value: 'lifecycle_status', label: 'lifecycle_status', description: 'Comma-separated lifecycle statuses (default: active)' },
    { value: 'program_id', label: 'program_id', description: 'Filter by program ID (UUID)' },
    { value: 'semester_id', label: 'semester_id', description: 'Filter by semester ID (UUID)' },
    { value: 'section_id', label: 'section_id', description: 'Filter by section ID (UUID)' },
    { value: 'admission_year', label: 'admission_year', description: 'Filter by admission year (e.g., 2024)' },
    { value: 'gender', label: 'gender', description: 'Filter by gender (Male/Female)' },
    { value: 'quota', label: 'quota', description: 'Filter by admission quota' },
    { value: 'expand', label: 'expand', description: 'Include related data (program,semester,section)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/learners/profiles/[id]': [
    { value: 'id', label: 'id', description: 'Learner profile ID (UUID) - replace [id] in URL' },
    { value: 'expand', label: 'expand', description: 'Include related data (program,semester,section)' }
  ],
  '/api/api-management/learners/enquiries': [
    { value: 'program_id', label: 'program_id', description: 'Filter by program ID (UUID)' },
    { value: 'enquiry_date_from', label: 'enquiry_date_from', description: 'Filter enquiries from date (YYYY-MM-DD)' },
    { value: 'enquiry_date_to', label: 'enquiry_date_to', description: 'Filter enquiries to date (YYYY-MM-DD)' },
    { value: 'expand', label: 'expand', description: 'Include related data (program)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/learners/enquiries/[id]': [
    { value: 'id', label: 'id', description: 'Enquiry ID (UUID) - replace [id] in URL' },
    { value: 'expand', label: 'expand', description: 'Include related data (program)' }
  ],
  '/api/api-management/learners/alumni': [
    { value: 'program_id', label: 'program_id', description: 'Filter by program ID (UUID)' },
    { value: 'admission_year', label: 'admission_year', description: 'Filter by admission year (e.g., 2020)' },
    { value: 'expand', label: 'expand', description: 'Include related data (program,semester)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/institutions': [
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/institutions/[id]': [
    { value: 'id', label: 'id', description: 'Institution ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/organizations/degrees': [
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/degrees/[id]': [
    { value: 'id', label: 'id', description: 'Degree ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/organizations/departments': [
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/departments/[id]': [
    { value: 'id', label: 'id', description: 'Department ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/organizations/programs': [
    { value: 'degree_id', label: 'degree_id', description: 'Filter by degree ID (UUID)' },
    { value: 'department_id', label: 'department_id', description: 'Filter by department ID (UUID)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/programs/[id]': [
    { value: 'id', label: 'id', description: 'Program ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/organizations/courses': [
    { value: 'is_active', label: 'is_active', description: 'Filter by active status (true/false)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/courses/[id]': [
    { value: 'id', label: 'id', description: 'Course ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/organizations/semesters': [
    { value: 'program_id', label: 'program_id', description: 'Filter by program ID (UUID)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/semesters/[id]': [
    { value: 'id', label: 'id', description: 'Semester ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/organizations/sections': [
    { value: 'semester_id', label: 'semester_id', description: 'Filter by semester ID (UUID)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/organizations/sections/[id]': [
    { value: 'id', label: 'id', description: 'Section ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/staff': [
    { value: 'department_id', label: 'department_id', description: 'Filter by department ID (UUID)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/staff/[id]': [
    { value: 'id', label: 'id', description: 'Staff ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/applications': [
    { value: 'program_id', label: 'program_id', description: 'Filter by program ID (UUID)' },
    { value: 'status', label: 'status', description: 'Filter by application status' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/applications/[id]': [
    { value: 'id', label: 'id', description: 'Application ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/academic/regulations': [
    { value: 'regulation_year', label: 'regulation_year', description: 'Filter by regulation year (e.g., 2024)' },
    { value: 'is_active', label: 'is_active', description: 'Filter by active status (true/false)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/academic/regulations/[id]': [
    { value: 'id', label: 'id', description: 'Regulation ID (UUID) - replace [id] in URL' }
  ],
  '/api/api-management/academic/batches': [
    { value: 'batch_year', label: 'batch_year', description: 'Filter by batch year (e.g., 2024)' },
    { value: 'is_active', label: 'is_active', description: 'Filter by active status (true/false)' },
    { value: 'page', label: 'page', description: 'Page number (default: 1)' },
    { value: 'limit', label: 'limit', description: 'Items per page (default: 50, max: 200)' }
  ],
  '/api/api-management/academic/batches/[id]': [
    { value: 'id', label: 'id', description: 'Batch ID (UUID) - replace [id] in URL' }
  ]
};

const formSchema = z.object({
  endpoint: z.string().min(1, 'Endpoint is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  apiKey: z.string().min(1, 'API Key is required'),
  params: z.record(z.string()).optional()
});

interface ParamField {
  key: string;
  value: string;
}

const API_KEY_STORAGE_KEY = 'test_api_key';

export function TestEndpoint() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [params, setParams] = useState<ParamField[]>([{ key: '', value: '' }]);
  const [hasCopied, setHasCopied] = useState(false);
  const [showResponse, setShowResponse] = useState(true);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [hasKeyCopied, setHasKeyCopied] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      endpoint: '/api/api-management/learners/profiles',
      method: 'GET',
      apiKey: '',
      params: {}
    }
  });

  // Get available parameters for the selected endpoint
  const selectedEndpoint = form.watch('endpoint');
  const availableParams = QUERY_PARAMETERS[selectedEndpoint] || [];

  // Generate a test API key
  const generateTestApiKey = async () => {
    try {
      setIsGeneratingKey(true);
      const response = await fetch('/api/system/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Auto-Generated Test Key',
          expires_at: null, // Never expires
          permissions: { read: true, write: false }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate test API key');
      }

      const data = await response.json();
      const apiKey = data.plainTextKey;

      // Save to form and localStorage
      form.setValue('apiKey', apiKey);
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

      return apiKey;
    } catch (error) {
      console.error('[test-endpoint] Error generating API key:', error);
      throw error;
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Load or generate API key on mount
  useEffect(() => {
    const initializeApiKey = async () => {
      const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (savedKey) {
        form.setValue('apiKey', savedKey);
      } else {
        // Auto-generate a test key if none exists
        await generateTestApiKey();
      }
    };

    initializeApiKey();
  }, []);

  // Clear parameters when endpoint changes
  useEffect(() => {
    setParams([{ key: '', value: '' }]);
  }, [selectedEndpoint]);

  const handleRegenerateKey = async () => {
    await generateTestApiKey();
  };

  const copyApiKey = () => {
    const apiKey = form.getValues('apiKey');
    navigator.clipboard.writeText(apiKey);
    setHasKeyCopied(true);
    setTimeout(() => setHasKeyCopied(false), 2000);
  };

  const addParam = () => {
    setParams([...params, { key: '', value: '' }]);
  };

  const removeParam = (index: number) => {
    setParams(params.filter((_, i) => i !== index));
  };

  const updateParam = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const newParams = [...params];
    newParams[index] = { ...newParams[index], [field]: value };
    setParams(newParams);
  };

  const buildUrl = (endpoint: string, params: Record<string, string>) => {
    const url = new URL(window.location.origin + endpoint);
    Object.entries(params).forEach(([key, value]) => {
      if (key && value) {
        url.searchParams.append(key, value);
      }
    });
    return url.toString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true);
      setResponse(null);

      // Build URL with params
      const paramObject: Record<string, string> = {};
      params.forEach((param) => {
        if (param.key && param.value) {
          paramObject[param.key] = param.value;
        }
      });

      const url = buildUrl(values.endpoint, paramObject);

      // Make request
      const response = await fetch(url, {
        method: values.method,
        headers: {
          Authorization: `Bearer ${values.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      setResponse({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data
      });
    } catch (error) {
      setResponse({
        error: true,
        message: error instanceof Error ? error.message : 'An error occurred'
      });
    } finally {
      setIsLoading(false);
      setShowResponse(true);
    }
  };

  return (
    <div className='w-full max-w-5xl mx-auto space-y-6 p-4'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <FormField
            control={form.control}
            name='endpoint'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endpoint</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select an API endpoint' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className='h-[300px]'>
                    <SelectGroup>
                      <SelectLabel>Learners API</SelectLabel>
                      {API_ENDPOINTS.learners.map((endpoint) => (
                        <SelectItem key={endpoint.value} value={endpoint.value}>
                          {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Organizations API</SelectLabel>
                      {API_ENDPOINTS.organizations.map((endpoint) => (
                        <SelectItem key={endpoint.value} value={endpoint.value}>
                          {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Academic API</SelectLabel>
                      {API_ENDPOINTS.academic.map((endpoint) => (
                        <SelectItem key={endpoint.value} value={endpoint.value}>
                          {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Staff API</SelectLabel>
                      {API_ENDPOINTS.staff.map((endpoint) => (
                        <SelectItem key={endpoint.value} value={endpoint.value}>
                          {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Applications API</SelectLabel>
                      {API_ENDPOINTS.applications.map((endpoint) => (
                        <SelectItem key={endpoint.value} value={endpoint.value}>
                          {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormDescription className='text-xs'>
                  Note: Endpoints with [id] require replacing [id] with an actual UUID in query parameters
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='method'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Method</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select method' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='GET'>GET</SelectItem>
                    <SelectItem value='POST'>POST</SelectItem>
                    <SelectItem value='PUT'>PUT</SelectItem>
                    <SelectItem value='DELETE'>DELETE</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='apiKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key (Auto-Generated)</FormLabel>
                <div className='flex gap-2'>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder={isGeneratingKey ? 'Generating...' : 'Auto-generated test key'}
                      {...field}
                      readOnly
                      className='font-mono text-sm'
                    />
                  </FormControl>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    onClick={copyApiKey}
                    disabled={!field.value || isGeneratingKey}
                    title='Copy API key'
                  >
                    {hasKeyCopied ? (
                      <Check className='h-4 w-4 text-green-500' />
                    ) : (
                      <Copy className='h-4 w-4' />
                    )}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleRegenerateKey}
                    disabled={isGeneratingKey}
                    title='Generate new API key'
                  >
                    {isGeneratingKey ? 'Generating...' : 'Regenerate'}
                  </Button>
                </div>
                <FormDescription className='text-xs'>
                  {isGeneratingKey
                    ? 'Generating a new test API key...'
                    : 'Auto-generated test key that never expires. Saved locally for convenience.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='space-y-4'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
              <FormLabel>Query Parameters</FormLabel>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={addParam}
                className='w-full sm:w-auto'
                disabled={availableParams.length === 0}
              >
                Add Parameter
              </Button>
            </div>
            {availableParams.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                No query parameters available for this endpoint
              </p>
            )}
            {params.map((param, index) => (
              <div key={index} className='flex flex-col gap-2'>
                <div className='flex flex-col sm:flex-row gap-2'>
                  <Select
                    value={param.key}
                    onValueChange={(value) => updateParam(index, 'key', value)}
                  >
                    <SelectTrigger className='flex-1'>
                      <SelectValue placeholder='Select parameter' />
                    </SelectTrigger>
                    <SelectContent>
                      {availableParams.map((availParam) => (
                        <SelectItem key={availParam.value} value={availParam.value}>
                          {availParam.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder='Value'
                    value={param.value}
                    onChange={(e) => updateParam(index, 'value', e.target.value)}
                    className='flex-1'
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={() => removeParam(index)}
                    className='self-center'
                  >
                    ×
                  </Button>
                </div>
                {param.key && (
                  <p className='text-xs text-muted-foreground px-1'>
                    {availableParams.find((p) => p.value === param.key)?.description}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className='flex justify-end'>
            <Button
              type='submit'
              disabled={isLoading}
              className='w-full sm:w-auto'
            >
              <Play className='mr-2 h-4 w-4' />
              {isLoading ? 'Testing...' : 'Test Endpoint'}
            </Button>
          </div>
        </form>
      </Form>

      {response && (
        <Card className='mt-6'>
          <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-2'>
            <div>
              <CardTitle className='text-lg'>Response</CardTitle>
              <div className='flex items-center gap-2'>
                <span className='text-sm text-muted-foreground'>Status:</span>
                <Badge
                  variant={response.status < 400 ? 'default' : 'destructive'}
                >
                  {response.status}
                </Badge>
              </div>
            </div>
            <div className='flex gap-2 self-end sm:self-auto'>
              <Button
                variant='ghost'
                size='icon'
                onClick={() =>
                  copyToClipboard(JSON.stringify(response, null, 2))
                }
              >
                {hasCopied ? (
                  <Check className='h-4 w-4 text-green-500' />
                ) : (
                  <Copy className='h-4 w-4' />
                )}
              </Button>
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setShowResponse(!showResponse)}
              >
                {showResponse ? (
                  <ChevronUp className='h-4 w-4' />
                ) : (
                  <ChevronDown className='h-4 w-4' />
                )}
              </Button>
            </div>
          </CardHeader>
          {showResponse && (
            <CardContent>
              <pre className='bg-white p-4 rounded-lg overflow-x-auto max-h-[400px] text-xs sm:text-sm'>
                <code>{JSON.stringify(response, null, 2)}</code>
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
