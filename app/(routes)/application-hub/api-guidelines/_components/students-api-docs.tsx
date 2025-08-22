'use client';

import { useState, ReactNode } from 'react';
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
import toast from 'react-hot-toast';

export default function StudentsApiDocs(): ReactNode {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Prompt has been copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const aiPromptTemplate = (
    fields: string
  ) => `I need to implement a feature to fetch data from the MyJKKN API system. The API requires authentication using an API key.

Key details:
- Base URL: https://my.jkkn.ac.in/api
- API Key format: jk_xxxxx_xxxxx (provided by administrator)
- Authentication: Bearer token in Authorization header
- Module: students

I need to:
1. Create a function to fetch data from this endpoint:
   - /api-management/students

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

For student data, the structure includes: ${fields}

Please show me a complete implementation using Next.js 14, TypeScript, and TailwindCSS that follows best practices for API data fetching and error handling.`;

  // Basic Examples
  const basicExamples = {
    listStudents: `// Fetch students example
const fetchStudents = async (apiKey) => {
  try {
    const response = await fetch('https://my.jkkn.ac.in/api/api-management/students', {
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
    console.error('Error fetching students:', error);
    throw error;
  }
};`,

    getStudent: `// Fetch student by ID example
const fetchStudentById = async (apiKey, studentId) => {
  try {
    const response = await fetch(\`https://my.jkkn.ac.in/api/api-management/students/\${studentId}\`, {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Student not found');
      }
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching student:', error);
    throw error;
  }
};`,

    filterStudents: `// Fetch and filter students example
const fetchFilteredStudents = async (apiKey, filters = {}) => {
  try {
    // Build query parameters
    const queryParams = new URLSearchParams();
    
    if (filters.page) queryParams.append('page', filters.page);
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.search) queryParams.append('search', filters.search);
    if (filters.institution_id) queryParams.append('institution_id', filters.institution_id);
    if (filters.department_id) queryParams.append('department_id', filters.department_id);
    if (filters.program_id) queryParams.append('program_id', filters.program_id);
    if (filters.is_profile_complete !== undefined) 
      queryParams.append('is_profile_complete', filters.is_profile_complete);
    
    const url = \`https://my.jkkn.ac.in/api/api-management/students?\${queryParams.toString()}\`;
    
    const response = await fetch(url, {
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
    console.error('Error fetching filtered students:', error);
    throw error;
  }
};`
  };

  // Complete examples with interfaces
  const completeExamples = {
    studentsList: `'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Student {
  id: string;
  first_name: string;
  last_name: string | null;
  roll_number: string;
  student_email: string;
  student_mobile: string;
  institution: { id: string; name: string };
  department: { id: string; department_name: string };
  program: { id: string; program_name: string };
  is_profile_complete: boolean;
}

interface ApiResponse {
  data: Student[];
  metadata: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface StudentsFilterProps {
  apiKey: string;
}

export default function StudentsList({ apiKey }: StudentsFilterProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<ApiResponse | null>(null);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    search: '',
    institution_id: '',
    is_profile_complete: ''
  });

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        queryParams.append('page', filters.page.toString());
        queryParams.append('limit', filters.limit.toString());
        if (filters.search) queryParams.append('search', filters.search);
        if (filters.institution_id) queryParams.append('institution_id', filters.institution_id);
        if (filters.is_profile_complete) 
          queryParams.append('is_profile_complete', filters.is_profile_complete);
        
        const url = \`/api/api-management/students?\${queryParams.toString()}\`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Accept': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error(\`Failed to fetch students: \${response.status}\`);
        }
        
        const data = await response.json();
        setStudents(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching students:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [apiKey, filters]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }));
  };

  const handleInstitutionChange = (value: string) => {
    setFilters(prev => ({ ...prev, institution_id: value, page: 1 }));
  };

  const handleProfileStatusChange = (value: string) => {
    setFilters(prev => ({ ...prev, is_profile_complete: value, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">{error}</p>
        <Button 
          onClick={() => setFilters({
            page: 1,
            limit: 10,
            search: '',
            institution_id: '',
            is_profile_complete: ''
          })}
          variant="outline" 
          className="mt-4"
        >
          Reset and try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students..."
            className="pl-8"
            value={filters.search}
            onChange={handleSearchChange}
          />
        </div>
        
        <Select
          value={filters.institution_id}
          onValueChange={handleInstitutionChange}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Institutions</SelectItem>
            {/* You'd map through available institutions here */}
          </SelectContent>
        </Select>
        
        <Select
          value={filters.is_profile_complete}
          onValueChange={handleProfileStatusChange}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Profile Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Profiles</SelectItem>
            <SelectItem value="true">Complete</SelectItem>
            <SelectItem value="false">Incomplete</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {students?.data.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No students found matching your criteria</p>
        </div>
      ) : (
        <div className="space-y-4">
          {students?.data.map((student) => (
            <Card key={student.id} className="p-4">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    {student.first_name} {student.last_name || ''}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {student.roll_number ? \`Roll No: \${student.roll_number}\` : 'No Roll Number'}
                  </p>
                  <p className="text-sm">
                    {student.institution?.name} • {student.program?.program_name}
                  </p>
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  <Badge variant={student.is_profile_complete ? "default" : "outline"}>
                    {student.is_profile_complete ? "Complete" : "Incomplete"}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    {student.student_email}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {student.student_mobile}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          
          {/* Pagination */}
          {students && students.metadata.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Previous
              </Button>
              
              <div className="flex items-center">
                <span className="text-sm">
                  Page {filters.page} of {students.metadata.totalPages}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= students.metadata.totalPages}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}`,

    studentDetails: `'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, UserCog } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface StudentDetails {
  id: string;
  first_name: string;
  last_name: string | null;
  roll_number: string;
  student_email: string;
  college_email: string;
  student_mobile: string;
  father_name: string;
  mother_name: string;
  date_of_birth: string;
  gender: string;
  religion: string;
  community: string;
  institution: { id: string; name: string };
  department: { id: string; department_name: string };
  program: { id: string; program_name: string };
  degree: { id: string; degree_name: string };
  is_profile_complete: boolean;
  permanent_address_street: string;
  permanent_address_district: string;
  permanent_address_state: string;
  permanent_address_pin_code: string;
}

interface StudentDetailsProps {
  apiKey: string;
  studentId: string;
  onBack: () => void;
}

export default function StudentDetails({ apiKey, studentId, onBack }: StudentDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentDetails | null>(null);

  useEffect(() => {
    const fetchStudentDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(\`/api/api-management/students/\${studentId}\`, {
          method: 'GET',
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Accept': 'application/json',
          }
        });
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Student not found');
          }
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        
        const { data } = await response.json();
        setStudent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching student details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentDetails();
  }, [apiKey, studentId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">{error}</p>
        <Button 
          onClick={onBack}
          variant="outline" 
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Students
        </Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">No student data available</p>
        <Button 
          onClick={onBack}
          variant="outline" 
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Students
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <Button 
          onClick={onBack}
          variant="outline" 
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        <Badge variant={student.is_profile_complete ? "default" : "outline"}>
          {student.is_profile_complete ? "Complete Profile" : "Incomplete Profile"}
        </Badge>
      </div>
      
      <div>
        <h1 className="text-2xl font-bold">
          {student.first_name} {student.last_name || ''}
        </h1>
        <p className='text-muted-foreground'>
          {student.roll_number
            ? \`Roll No: \${student.roll_number}\`
            : 'No Roll Number'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <p className="text-sm font-medium">Email:</p>
              <p className="text-sm">{student.student_email || 'Not Available'}</p>
              
              <p className="text-sm font-medium">College Email:</p>
              <p className="text-sm">{student.college_email || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Mobile:</p>
              <p className="text-sm">{student.student_mobile || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Date of Birth:</p>
              <p className="text-sm">{student.date_of_birth || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Gender:</p>
              <p className="text-sm">{student.gender || 'Not Available'}</p>
            </div>
          </CardContent>
        </Card>
        
        {/* Academic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Academic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <p className="text-sm font-medium">Institution:</p>
              <p className="text-sm">{student.institution?.name || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Degree:</p>
              <p className="text-sm">{student.degree?.degree_name || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Department:</p>
              <p className="text-sm">{student.department?.department_name || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Program:</p>
              <p className="text-sm">{student.program?.program_name || 'Not Available'}</p>
            </div>
          </CardContent>
        </Card>
        
        {/* Family Information */}
        <Card>
          <CardHeader>
            <CardTitle>Family Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <p className="text-sm font-medium">Father's Name:</p>
              <p className="text-sm">{student.father_name || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Mother's Name:</p>
              <p className="text-sm">{student.mother_name || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Religion:</p>
              <p className="text-sm">{student.religion || 'Not Available'}</p>
              
              <p className="text-sm font-medium">Community:</p>
              <p className="text-sm">{student.community || 'Not Available'}</p>
            </div>
          </CardContent>
        </Card>
        
        {/* Address Information */}
        <Card>
          <CardHeader>
            <CardTitle>Address Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <p className="text-sm font-medium">Street:</p>
              <p className="text-sm">{student.permanent_address_street || 'Not Available'}</p>
              
              <p className="text-sm font-medium">District:</p>
              <p className="text-sm">{student.permanent_address_district || 'Not Available'}</p>
              
              <p className="text-sm font-medium">State:</p>
              <p className="text-sm">{student.permanent_address_state || 'Not Available'}</p>
              
              <p className="text-sm font-medium">PIN Code:</p>
              <p className="text-sm">{student.permanent_address_pin_code || 'Not Available'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}`
  };

  return (
    <div className='py-4 space-y-10'>
      <Alert className='bg-muted'>
        <AlertTitle className='text-lg font-semibold'>Students API</AlertTitle>
        <AlertDescription>
          Access student records through authenticated API endpoints. All
          endpoints require an API key for authorization.
        </AlertDescription>
      </Alert>

      <div className='space-y-8'>
        <div>
          <h2 className='text-xl font-semibold mb-4'>Generate API Key</h2>
          <ApiKeyGenerator />
        </div>

        <div className='space-y-4'>
          <h2 className='text-xl font-semibold'>API Endpoints</h2>

          <Accordion type='single' collapsible className='space-y-4'>
            <AccordionItem value='list-students' className='border rounded-lg'>
              <AccordionTrigger className='px-4 hover:no-underline'>
                <div className='flex items-center gap-2'>
                  <span className='font-semibold'>List Students</span>
                  <Badge variant='secondary'>GET</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='px-4 pb-4 space-y-4'>
                <p className='text-muted-foreground'>
                  Retrieves a paginated list of all students with options for
                  filtering and searching.
                </p>
                <CodeBlock
                  language='bash'
                  code={`GET /api-management/students`}
                />

                <div className='space-y-2'>
                  <p className='font-medium'>Query Parameters:</p>
                  <ul className='list-disc list-inside space-y-1 text-sm'>
                    <li>
                      <code className='bg-muted px-1'>page</code>: Page number
                      (default: 1)
                    </li>
                    <li>
                      <code className='bg-muted px-1'>limit</code>: Items per
                      page (default: 10)
                    </li>
                    <li>
                      <code className='bg-muted px-1'>search</code>: Search by
                      first name, last name, email, mobile, or roll number
                    </li>
                    <li>
                      <code className='bg-muted px-1'>institution_id</code>:
                      Filter by institution
                    </li>
                    <li>
                      <code className='bg-muted px-1'>department_id</code>:
                      Filter by department
                    </li>
                    <li>
                      <code className='bg-muted px-1'>program_id</code>: Filter
                      by program
                    </li>
                    <li>
                      <code className='bg-muted px-1'>is_profile_complete</code>
                      : Filter by profile completion status
                    </li>
                  </ul>
                </div>

                <CodeBlock
                  language='javascript'
                  code={basicExamples.listStudents}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value='get-student' className='border rounded-lg'>
              <AccordionTrigger className='px-4 hover:no-underline'>
                <div className='flex items-center gap-2'>
                  <span className='font-semibold'>Get Student by ID</span>
                  <Badge variant='secondary'>GET</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='px-4 pb-4 space-y-4'>
                <p className='text-muted-foreground'>
                  Retrieves details for a specific student by their ID.
                </p>
                <CodeBlock
                  language='bash'
                  code={`GET /api-management/students/{id}`}
                />

                <div className='space-y-2'>
                  <p className='font-medium'>Path Parameters:</p>
                  <ul className='list-disc list-inside space-y-1 text-sm'>
                    <li>
                      <code className='bg-muted px-1'>id</code>: The unique
                      identifier of the student
                    </li>
                  </ul>
                </div>

                <CodeBlock
                  language='javascript'
                  code={basicExamples.getStudent}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value='filter-students'
              className='border rounded-lg'
            >
              <AccordionTrigger className='px-4 hover:no-underline'>
                <div className='flex items-center gap-2'>
                  <span className='font-semibold'>
                    Filter Students (Advanced)
                  </span>
                  <Badge variant='secondary'>GET</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='px-4 pb-4 space-y-4'>
                <p className='text-muted-foreground'>
                  Advanced examples for filtering and paginating students.
                </p>

                <CodeBlock
                  language='javascript'
                  code={basicExamples.filterStudents}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className='space-y-4'>
          <div className='flex justify-between items-center'>
            <h2 className='text-xl font-semibold'>
              Complete Implementation Examples
            </h2>
            <Button
              variant='outline'
              size='sm'
              className='flex items-center gap-2'
              onClick={() =>
                copyToClipboard(
                  aiPromptTemplate(
                    'id, first_name, last_name, roll_number, institution, department, program, is_profile_complete'
                  )
                )
              }
            >
              <CopyIcon className='h-4 w-4' />
              Copy AI Prompt
            </Button>
          </div>

          <Tabs defaultValue='list'>
            <TabsList className='mb-4'>
              <TabsTrigger value='list'>Student List</TabsTrigger>
              <TabsTrigger value='details'>Student Details</TabsTrigger>
            </TabsList>

            <TabsContent value='list'>
              <Card>
                <CardContent className='pt-6'>
                  <CodeBlock
                    language='typescript'
                    code={completeExamples.studentsList}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='details'>
              <Card>
                <CardContent className='pt-6'>
                  <CodeBlock
                    language='typescript'
                    code={completeExamples.studentDetails}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
