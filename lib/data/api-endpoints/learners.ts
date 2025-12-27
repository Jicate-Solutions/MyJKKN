/**
 * Learners API Module Configuration
 * Complete endpoint documentation for the Learners module
 */

import {
  ApiModuleConfig,
  ApiEndpoint,
  ApiParameter,
  ApiResponse,
  ApiErrorResponse,
  ApiCodeExample,
  ApiAiPrompt,
} from '@/lib/types/api-documentation';

// Common authentication configuration for all endpoints
const commonAuthentication = {
  type: 'bearer' as const,
  description:
    'API key required in Authorization header. Generate your API key from the API Management dashboard.',
  headerName: 'Authorization',
  example: 'Bearer your_api_key_here',
  scopes: ['read'],
};

// Common query parameters
const paginationParams: ApiParameter[] = [
  {
    name: 'page',
    type: 'number',
    required: false,
    description: 'Page number for pagination',
    example: 1,
    default: '1',
  },
  {
    name: 'limit',
    type: 'number',
    required: false,
    description: 'Number of items per page (max 200)',
    example: 50,
    default: '50',
    max: 200,
  },
];

const expandParam: ApiParameter = {
  name: 'expand',
  type: 'string',
  required: false,
  description:
    'Comma-separated list of related data to include (e.g., program,semester,section)',
  example: 'program,semester,section',
};

const programIdParam: ApiParameter = {
  name: 'program_id',
  type: 'string',
  required: false,
  description: 'Filter by program UUID',
  example: '880e8400-e29b-41d4-a716-446655440003',
};

// Common error responses
const commonErrors: ApiErrorResponse[] = [
  {
    statusCode: 401,
    errorCode: 'UNAUTHORIZED',
    message: 'API key is required in Authorization header',
    example: {
      error: 'API key is required in Authorization header',
    },
  },
  {
    statusCode: 401,
    errorCode: 'INVALID_API_KEY',
    message: 'Invalid API key',
    example: {
      error: 'Invalid API key',
    },
  },
  {
    statusCode: 401,
    errorCode: 'EXPIRED_API_KEY',
    message: 'API key has expired',
    example: {
      error: 'API key has expired',
    },
  },
  {
    statusCode: 403,
    errorCode: 'FORBIDDEN',
    message: 'API key does not have read permission',
    example: {
      error: 'API key does not have read permission',
    },
  },
  {
    statusCode: 500,
    errorCode: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    example: {
      error: 'Internal server error',
    },
  },
];

// =============================================================================
// PROFILES ENDPOINTS
// =============================================================================

const profilesListEndpoint: ApiEndpoint = {
  id: 'learners-profiles-list',
  module: 'learners',
  category: 'Profiles',
  title: 'List Learner Profiles',
  description:
    'Retrieve a paginated list of learner profiles with extensive filtering options including lifecycle status, program, semester, section, admission year, gender, and quota.',
  method: 'GET',
  path: '/api/api-management/learners/profiles',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'lifecycle_status',
      type: 'string',
      required: false,
      description:
        'Comma-separated lifecycle statuses to filter by. Default: active',
      example: 'active,alumni,exited',
      default: 'active',
    },
    programIdParam,
    {
      name: 'semester_id',
      type: 'string',
      required: false,
      description: 'Filter by semester UUID',
      example: 'aa0e8400-e29b-41d4-a716-446655440005',
    },
    {
      name: 'section_id',
      type: 'string',
      required: false,
      description: 'Filter by section UUID',
      example: 'bb0e8400-e29b-41d4-a716-446655440006',
    },
    {
      name: 'admission_year',
      type: 'number',
      required: false,
      description: 'Filter by admission year',
      example: 2024,
    },
    {
      name: 'gender',
      type: 'string',
      required: false,
      description: 'Filter by gender',
      example: 'Male',
      enum: ['Male', 'Female', 'Other'],
    },
    {
      name: 'quota',
      type: 'string',
      required: false,
      description: 'Filter by admission quota',
      example: 'Government',
    },
    expandParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved learner profiles',
      contentType: 'json',
      example: {
        count: 250,
        data: [
          {
            id: 'cc0e8400-e29b-41d4-a716-446655440007',
            application_id: 'dd0e8400-e29b-41d4-a716-446655440008',
            lifecycle_status: 'active',
            first_name: 'John',
            last_name: 'Doe',
            date_of_birth: '2005-05-15',
            gender: 'Male',
            student_mobile: '9876543210',
            student_email: 'john.doe@student.jkkn.ac.in',
            roll_number: 'CS2024001',
            register_number: '711621104001',
            program_id: '880e8400-e29b-41d4-a716-446655440003',
            semester_id: 'aa0e8400-e29b-41d4-a716-446655440005',
            section_id: 'bb0e8400-e29b-41d4-a716-446655440006',
            admission_year: 2024,
            quota: 'Government',
            is_profile_complete: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 250,
          totalPages: 5,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/learners/profiles?page=1&limit=50&lifecycle_status=active&expand=program,semester,section', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of learner profiles
console.log(data.pagination); // Pagination info
console.log(data.count); // Total count`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/learners/profiles?page=1&limit=50&lifecycle_status=active&expand=program,semester,section" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/learners/profiles"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 50,
    "lifecycle_status": "active",
    "expand": "program,semester,section"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of learner profiles
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Active Students by Program',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Learners API, fetch all active students for a specific program and display their names, roll numbers, and contact details.',
      expectedOutput:
        'A list of active students with first_name, last_name, roll_number, student_mobile, and student_email.',
      tags: ['profiles', 'filtering', 'program'],
    },
    {
      title: 'Analyze Gender Distribution by Program',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Learners API, fetch all active students and analyze the gender distribution across different programs.',
      expectedOutput:
        'A statistical breakdown showing male, female, and other gender counts per program.',
      tags: ['profiles', 'analytics', 'gender'],
    },
    {
      title: 'Generate Student Contact List',
      category: 'automation',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Learners API, fetch all active students for a section and generate a CSV file with their names, roll numbers, mobile numbers, and email addresses for communication purposes.',
      expectedOutput:
        'A CSV file containing student contact information ready for import into communication tools.',
      tags: ['profiles', 'export', 'communication'],
    },
  ],
  tags: ['profiles', 'pagination', 'filtering', 'students'],
  notes: [
    'Default lifecycle_status is "active" - use lifecycle_status parameter to include other statuses',
    'The expand parameter supports: program, semester, section - use comma-separated values for multiple',
    'Maximum limit is 200 items per page',
    'Results are ordered by created_at in descending order (newest first)',
    'Profile data includes extensive personal, academic, and contact information',
  ],
};

const profilesByIdEndpoint: ApiEndpoint = {
  id: 'learners-profiles-by-id',
  module: 'learners',
  category: 'Profiles',
  title: 'Get Learner Profile by ID',
  description:
    'Retrieve detailed information about a specific learner profile using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/learners/profiles/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the learner profile',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
  ],
  queryParameters: [expandParam],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved learner profile',
      contentType: 'json',
      example: {
        id: 'cc0e8400-e29b-41d4-a716-446655440007',
        application_id: 'dd0e8400-e29b-41d4-a716-446655440008',
        lifecycle_status: 'active',
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '2005-05-15',
        gender: 'Male',
        religion: 'Hindu',
        community: 'OC',
        caste: 'General',
        father_name: 'Robert Doe',
        father_occupation: 'Engineer',
        father_mobile: '9876543211',
        mother_name: 'Jane Doe',
        mother_occupation: 'Teacher',
        mother_mobile: '9876543212',
        annual_income: 500000,
        student_mobile: '9876543210',
        student_email: 'john.doe@student.jkkn.ac.in',
        permanent_address_street: '123 Main Street',
        permanent_address_taluk: 'Komarapalayam',
        permanent_address_district: 'Namakkal',
        permanent_address_pin_code: '638183',
        permanent_address_state: 'Tamil Nadu',
        roll_number: 'CS2024001',
        register_number: '711621104001',
        college_email: 'john.doe@jkkn.ac.in',
        program_id: '880e8400-e29b-41d4-a716-446655440003',
        semester_id: 'aa0e8400-e29b-41d4-a716-446655440005',
        section_id: 'bb0e8400-e29b-41d4-a716-446655440006',
        admission_year: 2024,
        quota: 'Government',
        category: 'OC',
        entry_type: 'Regular',
        tenth_marks: 95.5,
        twelfth_marks: 92.3,
        blood_group: 'O+',
        is_profile_complete: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Learner profile not found',
      example: {
        error: 'Learner profile not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const learnerId = 'cc0e8400-e29b-41d4-a716-446655440007';
const response = await fetch(\`https://www.jkkn.ai/api/api-management/learners/profiles/\${learnerId}?expand=program,semester,section\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const learner = await response.json();
console.log(learner);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/learners/profiles/cc0e8400-e29b-41d4-a716-446655440007?expand=program,semester,section" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

learner_id = "cc0e8400-e29b-41d4-a716-446655440007"
url = f"https://www.jkkn.ai/api/api-management/learners/profiles/{learner_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"expand": "program,semester,section"}

response = requests.get(url, headers=headers, params=params)
learner = response.json()
print(learner)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Complete Student Profile',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Learners API, fetch the complete profile of a student including all personal, academic, and contact information.',
      expectedOutput:
        'Complete student profile with personal details, family information, academic records, and contact information.',
      tags: ['profiles', 'single-record', 'complete-data'],
    },
    {
      title: 'Verify Student Eligibility for Scholarship',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Learners API, fetch a student profile and verify their eligibility for a government scholarship based on community, annual income, and academic marks.',
      expectedOutput:
        'Eligibility status with details on community category, income bracket, and academic performance.',
      tags: ['profiles', 'verification', 'scholarship'],
    },
  ],
  tags: ['profiles', 'by-id', 'students'],
  notes: [
    'Use expand parameter to include related program, semester, and section details',
    'Profile includes sensitive personal information - ensure proper authorization',
    'All monetary values (annual_income) are in INR',
  ],
  relatedEndpoints: ['learners-profiles-list'],
};

// =============================================================================
// ENQUIRIES ENDPOINTS
// =============================================================================

const enquiriesListEndpoint: ApiEndpoint = {
  id: 'learners-enquiries-list',
  module: 'learners',
  category: 'Enquiries',
  title: 'List Learner Enquiries',
  description:
    'Retrieve a paginated list of learner enquiries with optional filtering by program and enquiry date range.',
  method: 'GET',
  path: '/api/api-management/learners/enquiries',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    programIdParam,
    {
      name: 'enquiry_date_from',
      type: 'string',
      required: false,
      description: 'Filter enquiries from this date (YYYY-MM-DD format)',
      example: '2024-01-01',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    {
      name: 'enquiry_date_to',
      type: 'string',
      required: false,
      description: 'Filter enquiries to this date (YYYY-MM-DD format)',
      example: '2024-12-31',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    expandParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved enquiries',
      contentType: 'json',
      example: {
        count: 150,
        data: [
          {
            id: 'ee0e8400-e29b-41d4-a716-446655440009',
            enquiry_date: '2024-03-15',
            first_name: 'Jane',
            last_name: 'Smith',
            date_of_birth: '2006-08-20',
            gender: 'Female',
            student_mobile: '9876543220',
            student_email: 'jane.smith@example.com',
            father_name: 'Michael Smith',
            father_mobile: '9876543221',
            mother_name: 'Sarah Smith',
            mother_mobile: '9876543222',
            program_id: '880e8400-e29b-41d4-a716-446655440003',
            tenth_marks: 94.0,
            twelfth_marks: 90.5,
            reference_type: 'Website',
            created_at: '2024-03-15T00:00:00Z',
            updated_at: '2024-03-15T00:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 150,
          totalPages: 3,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/learners/enquiries?page=1&limit=50&enquiry_date_from=2024-01-01&enquiry_date_to=2024-12-31&expand=program', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of enquiries
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/learners/enquiries?page=1&limit=50&enquiry_date_from=2024-01-01&enquiry_date_to=2024-12-31&expand=program" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/learners/enquiries"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 50,
    "enquiry_date_from": "2024-01-01",
    "enquiry_date_to": "2024-12-31",
    "expand": "program"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of enquiries`,
    },
  ],
  aiPrompts: [
    {
      title: 'Analyze Enquiry Trends by Month',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Learners API, fetch all enquiries for the current year and analyze the trend of enquiries by month to identify peak admission periods.',
      expectedOutput:
        'A monthly breakdown showing the count of enquiries per month with trend visualization.',
      tags: ['enquiries', 'analytics', 'trends'],
    },
    {
      title: 'Generate Follow-up List for Enquiries',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Learners API, fetch all enquiries from the last 30 days and generate a list of prospective students to follow up with, including their contact details.',
      expectedOutput:
        'A list of recent enquiries with names, mobile numbers, and programs of interest.',
      tags: ['enquiries', 'follow-up', 'communication'],
    },
    {
      title: 'Compare Enquiry Sources',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Learners API, fetch all enquiries and analyze which reference sources (Website, Social Media, Direct Visit, etc.) are driving the most enquiries.',
      expectedOutput:
        'A statistical breakdown of enquiries by reference type/source.',
      tags: ['enquiries', 'analytics', 'sources'],
    },
  ],
  tags: ['enquiries', 'pagination', 'date-filtering'],
  notes: [
    'Enquiries represent prospective students who have shown interest but not yet enrolled',
    'Date filters (enquiry_date_from, enquiry_date_to) must be in YYYY-MM-DD format',
    'Use expand=program to include program details in the response',
    'Results are ordered by enquiry_date in descending order (newest first)',
  ],
};

const enquiriesByIdEndpoint: ApiEndpoint = {
  id: 'learners-enquiries-by-id',
  module: 'learners',
  category: 'Enquiries',
  title: 'Get Enquiry by ID',
  description:
    'Retrieve detailed information about a specific enquiry using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/learners/enquiries/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the enquiry',
      example: 'ee0e8400-e29b-41d4-a716-446655440009',
    },
  ],
  queryParameters: [expandParam],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved enquiry',
      contentType: 'json',
      example: {
        id: 'ee0e8400-e29b-41d4-a716-446655440009',
        enquiry_date: '2024-03-15',
        first_name: 'Jane',
        last_name: 'Smith',
        date_of_birth: '2006-08-20',
        gender: 'Female',
        student_mobile: '9876543220',
        student_email: 'jane.smith@example.com',
        father_name: 'Michael Smith',
        father_mobile: '9876543221',
        mother_name: 'Sarah Smith',
        mother_mobile: '9876543222',
        program_id: '880e8400-e29b-41d4-a716-446655440003',
        tenth_marks: 94.0,
        twelfth_marks: 90.5,
        reference_type: 'Website',
        reference_name: 'JKKN Website',
        reference_contact: null,
        created_at: '2024-03-15T00:00:00Z',
        updated_at: '2024-03-15T00:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Enquiry not found',
      example: {
        error: 'Enquiry not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const enquiryId = 'ee0e8400-e29b-41d4-a716-446655440009';
const response = await fetch(\`https://www.jkkn.ai/api/api-management/learners/enquiries/\${enquiryId}?expand=program\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const enquiry = await response.json();
console.log(enquiry);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/learners/enquiries/ee0e8400-e29b-41d4-a716-446655440009?expand=program" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

enquiry_id = "ee0e8400-e29b-41d4-a716-446655440009"
url = f"https://www.jkkn.ai/api/api-management/learners/enquiries/{enquiry_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"expand": "program"}

response = requests.get(url, headers=headers, params=params)
enquiry = response.json()
print(enquiry)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Enquiry Details for Follow-up',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Learners API, fetch details of a specific enquiry to prepare for a follow-up call with the prospective student.',
      expectedOutput:
        'Complete enquiry details including student contact information, program interest, and reference source.',
      tags: ['enquiries', 'single-record', 'follow-up'],
    },
  ],
  tags: ['enquiries', 'by-id'],
  notes: [
    'Use expand=program to include program details in the response',
    'Enquiry data includes prospective student contact and academic information',
  ],
  relatedEndpoints: ['learners-enquiries-list'],
};

// =============================================================================
// ALUMNI ENDPOINTS
// =============================================================================

const alumniListEndpoint: ApiEndpoint = {
  id: 'learners-alumni-list',
  module: 'learners',
  category: 'Alumni',
  title: 'List Alumni',
  description:
    'Retrieve a paginated list of alumni and graduated learners with optional filtering by program and admission year.',
  method: 'GET',
  path: '/api/api-management/learners/alumni',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    programIdParam,
    {
      name: 'admission_year',
      type: 'number',
      required: false,
      description: 'Filter by admission year (e.g., 2020)',
      example: 2020,
    },
    expandParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved alumni',
      contentType: 'json',
      example: {
        count: 180,
        data: [
          {
            id: 'ff0e8400-e29b-41d4-a716-446655440010',
            lifecycle_status: 'alumni',
            first_name: 'Alice',
            last_name: 'Johnson',
            date_of_birth: '2002-03-10',
            gender: 'Female',
            student_mobile: '9876543230',
            student_email: 'alice.johnson@alumni.jkkn.ac.in',
            roll_number: 'CS2020001',
            register_number: '711618104001',
            program_id: '880e8400-e29b-41d4-a716-446655440003',
            admission_year: 2020,
            is_profile_complete: true,
            created_at: '2020-09-01T00:00:00Z',
            updated_at: '2024-05-15T00:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 180,
          totalPages: 4,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/learners/alumni?page=1&limit=50&admission_year=2020&expand=program,semester', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of alumni
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/learners/alumni?page=1&limit=50&admission_year=2020&expand=program,semester" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/learners/alumni"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 50,
    "admission_year": 2020,
    "expand": "program,semester"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of alumni`,
    },
  ],
  aiPrompts: [
    {
      title: 'Generate Alumni Directory by Batch',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Learners API, fetch all alumni from a specific admission year and generate an alumni directory with names, roll numbers, and contact details.',
      expectedOutput:
        'A comprehensive list of alumni from the specified batch year with contact information.',
      tags: ['alumni', 'directory', 'batch'],
    },
    {
      title: 'Analyze Alumni Demographics',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Learners API, fetch all alumni and analyze the demographics including gender distribution, program distribution, and year-wise graduation trends.',
      expectedOutput:
        'Statistical breakdown of alumni demographics with visualizations and trends.',
      tags: ['alumni', 'analytics', 'demographics'],
    },
    {
      title: 'Create Alumni Mailing List',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Learners API, fetch all alumni from the last 5 years and create a mailing list with their email addresses for alumni event invitations.',
      expectedOutput:
        'A formatted mailing list of alumni email addresses ready for use in email campaigns.',
      tags: ['alumni', 'communication', 'events'],
    },
  ],
  tags: ['alumni', 'pagination', 'filtering'],
  notes: [
    'Alumni are learners with lifecycle_status = "alumni"',
    'Graduated learners who have completed their programs',
    'Use admission_year to filter by specific batches',
    'The expand parameter supports: program, semester',
    'Results are ordered by updated_at in descending order',
  ],
};

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================

export const learnersModuleConfig: ApiModuleConfig = {
  moduleName: 'Learners',
  moduleDescription:
    'The Learners API module provides comprehensive access to student data including active learner profiles, prospective student enquiries, and alumni records. All endpoints support pagination, filtering, and data expansion for related entities.',
  baseUrl: 'https://www.jkkn.ai',
  endpoints: [
    // Profiles (2)
    profilesListEndpoint,
    profilesByIdEndpoint,
    // Enquiries (2)
    enquiriesListEndpoint,
    enquiriesByIdEndpoint,
    // Alumni (1)
    alumniListEndpoint,
  ],
  commonErrors,
  authenticationOverview:
    'All Learners API endpoints require Bearer token authentication using an API key. Generate your API key from the API Management dashboard and include it in the Authorization header of every request.',
  generalNotes: [
    'All list endpoints support pagination with page and limit query parameters',
    'Maximum limit per page is 200 items',
    'The expand parameter allows including related data (program, semester, section) to reduce API calls',
    'Default lifecycle_status for profiles is "active" unless specified otherwise',
    'All endpoints return standard error responses (401, 403, 500) as documented',
    'Results are ordered by created_at or enquiry_date in descending order (newest first)',
    'Learner profiles contain sensitive personal information - ensure proper authorization and data handling',
    'Date filters must use YYYY-MM-DD format',
  ],
};

export default learnersModuleConfig;
