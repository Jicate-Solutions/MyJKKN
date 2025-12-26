/**
 * Organizations API Module Configuration
 * Complete endpoint documentation for the Organizations module
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
  description: 'API key required in Authorization header. Generate your API key from the API Management dashboard.',
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
    description: 'Number of items per page',
    example: 10,
    default: '10',
  },
];

const searchParam: ApiParameter = {
  name: 'search',
  type: 'string',
  required: false,
  description: 'Search by name or code (case-insensitive)',
  example: 'engineering',
};

const isActiveParam: ApiParameter = {
  name: 'isActive',
  type: 'boolean',
  required: false,
  description: 'Filter by active status',
  example: true,
};

const institutionIdParam: ApiParameter = {
  name: 'institution_id',
  type: 'string',
  required: false,
  description: 'Filter by institution UUID',
  example: '550e8400-e29b-41d4-a716-446655440000',
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
// INSTITUTIONS ENDPOINTS
// =============================================================================

const institutionsListEndpoint: ApiEndpoint = {
  id: 'organizations-institutions-list',
  module: 'organizations',
  category: 'Institutions',
  title: 'List All Institutions',
  description: 'Retrieve a paginated list of all institutions with optional filtering by search term and active status.',
  method: 'GET',
  path: '/api/api-management/organizations/institutions',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    searchParam,
    isActiveParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved institutions',
      contentType: 'json',
      example: {
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'JKKN College of Engineering',
            counselling_code: 'JKKN001',
            is_active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        metadata: {
          total: 100,
          page: 1,
          limit: 10,
          totalPages: 10,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/institutions?page=1&limit=10&search=engineering', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of institutions
console.log(data.metadata); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/institutions?page=1&limit=10&search=engineering" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://myjkkn.ac.in/api/api-management/organizations/institutions"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 10,
    "search": "engineering"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of institutions
print(data["metadata"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get All Active Institutions',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch all active institutions and display their names and counselling codes.',
      expectedOutput: 'A list of institution names with their corresponding counselling codes for all active institutions.',
      tags: ['institutions', 'basic-query', 'filtering'],
    },
    {
      title: 'Analyze Institution Distribution',
      category: 'analysis',
      complexity: 'intermediate',
      prompt: 'Using the MyJKKN Organizations API, fetch all institutions and analyze the distribution of active vs inactive institutions. Calculate the percentage of active institutions.',
      expectedOutput: 'A statistical breakdown showing total institutions, number of active institutions, number of inactive institutions, and percentage of active institutions.',
      tags: ['institutions', 'analytics', 'statistics'],
    },
  ],
  tags: ['institutions', 'pagination', 'search'],
  notes: [
    'The search parameter performs case-insensitive matching on both name and counselling_code fields',
    'Results are ordered by created_at in descending order (newest first)',
    'Maximum limit per page is determined by server configuration',
  ],
};

const institutionsByIdEndpoint: ApiEndpoint = {
  id: 'organizations-institutions-by-id',
  module: 'organizations',
  category: 'Institutions',
  title: 'Get Institution by ID',
  description: 'Retrieve detailed information about a specific institution using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/organizations/institutions/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the institution',
      example: '550e8400-e29b-41d4-a716-446655440000',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved institution',
      contentType: 'json',
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'JKKN College of Engineering',
        counselling_code: 'JKKN001',
        is_active: true,
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
      message: 'Institution not found',
      example: {
        error: 'Institution not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const institutionId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/institutions/\${institutionId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const institution = await response.json();
console.log(institution);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/institutions/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

institution_id = "550e8400-e29b-41d4-a716-446655440000"
url = f"https://myjkkn.ac.in/api/api-management/organizations/institutions/{institution_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
institution = response.json()
print(institution)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Institution Details',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch the details of the institution with ID 550e8400-e29b-41d4-a716-446655440000.',
      expectedOutput: 'Complete institution details including name, counselling code, active status, and timestamps.',
      tags: ['institutions', 'single-record'],
    },
  ],
  tags: ['institutions', 'by-id'],
  relatedEndpoints: ['organizations-institutions-list'],
};

const institutionsNamesEndpoint: ApiEndpoint = {
  id: 'organizations-institutions-names',
  module: 'organizations',
  category: 'Institutions',
  title: 'Get Institution Names (Lightweight)',
  description: 'Retrieve a lightweight list of institution IDs and names, optimized for dropdowns and selection lists.',
  method: 'GET',
  path: '/api/api-management/organizations/institutions/names',
  authentication: commonAuthentication,
  queryParameters: [isActiveParam],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved institution names',
      contentType: 'json',
      example: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'JKKN College of Engineering',
        },
        {
          id: '660e8400-e29b-41d4-a716-446655440001',
          name: 'JKKN Dental College',
        },
      ],
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/institutions/names?isActive=true', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const institutions = await response.json();
// Use for dropdown options
const options = institutions.map(inst => ({
  value: inst.id,
  label: inst.name
}));`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/institutions/names?isActive=true" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://myjkkn.ac.in/api/api-management/organizations/institutions/names"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"isActive": "true"}

response = requests.get(url, headers=headers, params=params)
institutions = response.json()
# Use for dropdown options
options = [{"value": inst["id"], "label": inst["name"]} for inst in institutions]`,
    },
  ],
  aiPrompts: [
    {
      title: 'Populate Institution Dropdown',
      category: 'integration',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch all active institution names and create a dropdown list for a form.',
      expectedOutput: 'An array of institution IDs and names formatted for use in a dropdown/select component.',
      tags: ['institutions', 'dropdown', 'ui-integration'],
    },
  ],
  tags: ['institutions', 'lightweight', 'dropdown'],
  notes: [
    'This endpoint is optimized for UI components like dropdowns and select lists',
    'Returns only id and name fields to minimize payload size',
    'No pagination - returns all matching institutions',
  ],
  relatedEndpoints: ['organizations-institutions-list'],
};

// =============================================================================
// DEPARTMENTS ENDPOINTS
// =============================================================================

const departmentsListEndpoint: ApiEndpoint = {
  id: 'organizations-departments-list',
  module: 'organizations',
  category: 'Departments',
  title: 'List All Departments',
  description: 'Retrieve a paginated list of all departments with optional filtering by search term, institution, and active status. Includes new display_name and department_order fields.',
  method: 'GET',
  path: '/api/api-management/organizations/departments',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    searchParam,
    institutionIdParam,
    isActiveParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved departments',
      contentType: 'json',
      example: {
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            institution_id: '660e8400-e29b-41d4-a716-446655440001',
            degree_id: '770e8400-e29b-41d4-a716-446655440002',
            department_code: 'CS',
            department_name: 'Computer Science',
            display_name: 'Department of Computer Science & Engineering',
            department_order: 1,
            is_active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            institution: {
              id: '660e8400-e29b-41d4-a716-446655440001',
              name: 'JKKN College of Engineering',
              counselling_code: 'JKKN001',
            },
            degree: {
              id: '770e8400-e29b-41d4-a716-446655440002',
              degree_id: 'BTECH',
              degree_name: 'Bachelor of Technology',
            },
          },
        ],
        metadata: {
          total: 50,
          page: 1,
          limit: 10,
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
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/departments?page=1&limit=10&institution_id=660e8400-e29b-41d4-a716-446655440001', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of departments
console.log(data.metadata); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/departments?page=1&limit=10&institution_id=660e8400-e29b-41d4-a716-446655440001" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://myjkkn.ac.in/api/api-management/organizations/departments"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 10,
    "institution_id": "660e8400-e29b-41d4-a716-446655440001"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of departments
print(data["metadata"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Departments for Institution',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch all active departments for a specific institution and display their names and codes.',
      expectedOutput: 'A list of department names, codes, and display names for the specified institution.',
      tags: ['departments', 'filtering', 'institution'],
    },
    {
      title: 'Sort Departments by Custom Order',
      category: 'analysis',
      complexity: 'intermediate',
      prompt: 'Using the MyJKKN Organizations API, fetch all departments for an institution and sort them using the department_order field to display them in the preferred sequence.',
      expectedOutput: 'A sorted list of departments using the custom department_order field, useful for displaying departments in a specific organizational order.',
      tags: ['departments', 'sorting', 'custom-order'],
    },
  ],
  tags: ['departments', 'pagination', 'search', 'filtering'],
  notes: [
    'New fields: display_name allows for longer, more descriptive department names (e.g., "Department of Computer Science & Engineering")',
    'New fields: department_order enables custom sorting of departments independent of alphabetical order',
    'The search parameter matches department_code and department_name fields',
    'Results include nested institution and degree details',
  ],
};

const departmentsByIdEndpoint: ApiEndpoint = {
  id: 'organizations-departments-by-id',
  module: 'organizations',
  category: 'Departments',
  title: 'Get Department by ID',
  description: 'Retrieve detailed information about a specific department using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/organizations/departments/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the department',
      example: '550e8400-e29b-41d4-a716-446655440000',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved department',
      contentType: 'json',
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        institution_id: '660e8400-e29b-41d4-a716-446655440001',
        degree_id: '770e8400-e29b-41d4-a716-446655440002',
        department_code: 'CS',
        department_name: 'Computer Science',
        display_name: 'Department of Computer Science & Engineering',
        department_order: 1,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        institution: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          name: 'JKKN College of Engineering',
          counselling_code: 'JKKN001',
        },
        degree: {
          id: '770e8400-e29b-41d4-a716-446655440002',
          degree_id: 'BTECH',
          degree_name: 'Bachelor of Technology',
        },
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Department not found',
      example: {
        error: 'Department not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const departmentId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/departments/\${departmentId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const department = await response.json();
console.log(department);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/departments/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

department_id = "550e8400-e29b-41d4-a716-446655440000"
url = f"https://myjkkn.ac.in/api/api-management/organizations/departments/{department_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
department = response.json()
print(department)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Department Details with Relations',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch a specific department and display its details along with its associated institution and degree information.',
      expectedOutput: 'Complete department details including name, code, display name, and nested institution and degree details.',
      tags: ['departments', 'single-record', 'relations'],
    },
  ],
  tags: ['departments', 'by-id'],
  relatedEndpoints: ['organizations-departments-list'],
};

// =============================================================================
// DEGREES ENDPOINTS
// =============================================================================

const degreesListEndpoint: ApiEndpoint = {
  id: 'organizations-degrees-list',
  module: 'organizations',
  category: 'Degrees',
  title: 'List All Degrees',
  description: 'Retrieve a paginated list of all degrees with optional filtering by search term, institution, degree type, and active status. Includes new display_name and degree_order fields.',
  method: 'GET',
  path: '/api/api-management/organizations/degrees',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    searchParam,
    institutionIdParam,
    {
      name: 'degree_type',
      type: 'string',
      required: false,
      description: 'Filter by degree type (ug, pg, etc.)',
      example: 'ug',
      enum: ['ug', 'pg'],
    },
    isActiveParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved degrees',
      contentType: 'json',
      example: {
        data: [
          {
            id: '770e8400-e29b-41d4-a716-446655440002',
            institution_id: '660e8400-e29b-41d4-a716-446655440001',
            degree_id: 'BTECH',
            degree_name: 'Bachelor of Technology',
            degree_type: 'ug',
            display_name: 'Bachelor of Technology (Engineering)',
            degree_order: 1,
            is_active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            institution: {
              id: '660e8400-e29b-41d4-a716-446655440001',
              name: 'JKKN College of Engineering',
              counselling_code: 'JKKN001',
            },
          },
        ],
        metadata: {
          total: 30,
          page: 1,
          limit: 10,
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
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/degrees?page=1&limit=10&degree_type=ug', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of degrees`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/degrees?page=1&limit=10&degree_type=ug" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://myjkkn.ac.in/api/api-management/organizations/degrees"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 10, "degree_type": "ug"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get All Undergraduate Degrees',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch all undergraduate (UG) degrees and display their names and IDs.',
      expectedOutput: 'A list of all UG degrees with their degree_id, degree_name, and display_name fields.',
      tags: ['degrees', 'filtering', 'ug'],
    },
    {
      title: 'Compare Degree Types Across Institutions',
      category: 'analysis',
      complexity: 'intermediate',
      prompt: 'Using the MyJKKN Organizations API, fetch all degrees and analyze the distribution of UG vs PG degrees across different institutions.',
      expectedOutput: 'A statistical breakdown showing the count of UG and PG degrees per institution.',
      tags: ['degrees', 'analytics', 'comparison'],
    },
  ],
  tags: ['degrees', 'pagination', 'search', 'filtering'],
  notes: [
    'New fields: display_name allows for longer, more descriptive degree names',
    'New fields: degree_order enables custom sorting of degrees',
    'degree_type accepts "ug" (undergraduate) or "pg" (postgraduate) values',
    'Search parameter matches both degree_id and degree_name fields',
  ],
};

const degreesByIdEndpoint: ApiEndpoint = {
  id: 'organizations-degrees-by-id',
  module: 'organizations',
  category: 'Degrees',
  title: 'Get Degree by ID',
  description: 'Retrieve detailed information about a specific degree using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/organizations/degrees/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the degree',
      example: '770e8400-e29b-41d4-a716-446655440002',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved degree',
      contentType: 'json',
      example: {
        id: '770e8400-e29b-41d4-a716-446655440002',
        institution_id: '660e8400-e29b-41d4-a716-446655440001',
        degree_id: 'BTECH',
        degree_name: 'Bachelor of Technology',
        degree_type: 'ug',
        display_name: 'Bachelor of Technology (Engineering)',
        degree_order: 1,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        institution: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          name: 'JKKN College of Engineering',
          counselling_code: 'JKKN001',
        },
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Degree not found',
      example: {
        error: 'Degree not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const degreeId = '770e8400-e29b-41d4-a716-446655440002';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/degrees/\${degreeId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const degree = await response.json();
console.log(degree);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/degrees/770e8400-e29b-41d4-a716-446655440002" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

degree_id = "770e8400-e29b-41d4-a716-446655440002"
url = f"https://myjkkn.ac.in/api/api-management/organizations/degrees/{degree_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
degree = response.json()
print(degree)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Degree with Institution Info',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch a specific degree and display its details along with the associated institution information.',
      expectedOutput: 'Complete degree details including degree_id, degree_name, display_name, and nested institution details.',
      tags: ['degrees', 'single-record', 'relations'],
    },
  ],
  tags: ['degrees', 'by-id'],
  relatedEndpoints: ['organizations-degrees-list'],
};

// =============================================================================
// PROGRAMS ENDPOINTS
// =============================================================================

const programsListEndpoint: ApiEndpoint = {
  id: 'organizations-programs-list',
  module: 'organizations',
  category: 'Programs',
  title: 'List All Programs',
  description: 'Retrieve a paginated list of all programs with optional filtering by search term, institution, degree, department, and active status.',
  method: 'GET',
  path: '/api/api-management/organizations/programs',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    searchParam,
    institutionIdParam,
    {
      name: 'degree_id',
      type: 'string',
      required: false,
      description: 'Filter by degree UUID',
      example: '770e8400-e29b-41d4-a716-446655440002',
    },
    {
      name: 'department_id',
      type: 'string',
      required: false,
      description: 'Filter by department UUID',
      example: '550e8400-e29b-41d4-a716-446655440000',
    },
    isActiveParam,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved programs',
      contentType: 'json',
      example: {
        data: [
          {
            id: '880e8400-e29b-41d4-a716-446655440003',
            institution_id: '660e8400-e29b-41d4-a716-446655440001',
            degree_id: '770e8400-e29b-41d4-a716-446655440002',
            department_id: '550e8400-e29b-41d4-a716-446655440000',
            program_id: 'BTECH-CS',
            program_name: 'B.Tech Computer Science',
            is_active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            institution: {
              id: '660e8400-e29b-41d4-a716-446655440001',
              name: 'JKKN College of Engineering',
              counselling_code: 'JKKN001',
            },
            degree: {
              id: '770e8400-e29b-41d4-a716-446655440002',
              degree_id: 'BTECH',
              degree_name: 'Bachelor of Technology',
            },
            department: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              department_code: 'CS',
              department_name: 'Computer Science',
            },
          },
        ],
        metadata: {
          total: 40,
          page: 1,
          limit: 10,
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
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/programs?page=1&limit=10&department_id=550e8400-e29b-41d4-a716-446655440000', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of programs`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/programs?page=1&limit=10&department_id=550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://myjkkn.ac.in/api/api-management/organizations/programs"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 10,
    "department_id": "550e8400-e29b-41d4-a716-446655440000"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Programs by Department',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch all active programs for a specific department.',
      expectedOutput: 'A list of programs with their IDs, names, and associated institution, degree, and department details.',
      tags: ['programs', 'filtering', 'department'],
    },
    {
      title: 'Analyze Program Distribution',
      category: 'analysis',
      complexity: 'intermediate',
      prompt: 'Using the MyJKKN Organizations API, fetch all programs and analyze how many programs each department offers.',
      expectedOutput: 'A statistical breakdown showing program count per department.',
      tags: ['programs', 'analytics', 'distribution'],
    },
  ],
  tags: ['programs', 'pagination', 'search', 'filtering'],
  notes: [
    'Programs represent the combination of degree, department, and institution',
    'Results include nested details for institution, degree, and department',
    'Search parameter matches both program_id and program_name fields',
  ],
};

const programsByIdEndpoint: ApiEndpoint = {
  id: 'organizations-programs-by-id',
  module: 'organizations',
  category: 'Programs',
  title: 'Get Program by ID',
  description: 'Retrieve detailed information about a specific program using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/organizations/programs/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the program',
      example: '880e8400-e29b-41d4-a716-446655440003',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved program',
      contentType: 'json',
      example: {
        id: '880e8400-e29b-41d4-a716-446655440003',
        institution_id: '660e8400-e29b-41d4-a716-446655440001',
        degree_id: '770e8400-e29b-41d4-a716-446655440002',
        department_id: '550e8400-e29b-41d4-a716-446655440000',
        program_id: 'BTECH-CS',
        program_name: 'B.Tech Computer Science',
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        institution: {
          id: '660e8400-e29b-41d4-a716-446655440001',
          name: 'JKKN College of Engineering',
          counselling_code: 'JKKN001',
        },
        degree: {
          id: '770e8400-e29b-41d4-a716-446655440002',
          degree_id: 'BTECH',
          degree_name: 'Bachelor of Technology',
        },
        department: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          department_code: 'CS',
          department_name: 'Computer Science',
        },
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Program not found',
      example: {
        error: 'Program not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const programId = '880e8400-e29b-41d4-a716-446655440003';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/programs/\${programId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const program = await response.json();
console.log(program);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/programs/880e8400-e29b-41d4-a716-446655440003" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

program_id = "880e8400-e29b-41d4-a716-446655440003"
url = f"https://myjkkn.ac.in/api/api-management/organizations/programs/{program_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
program = response.json()
print(program)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Complete Program Hierarchy',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch a specific program and display its complete hierarchy including institution, degree, and department information.',
      expectedOutput: 'Complete program details with nested institution, degree, and department information showing the full organizational hierarchy.',
      tags: ['programs', 'single-record', 'relations', 'hierarchy'],
    },
  ],
  tags: ['programs', 'by-id'],
  relatedEndpoints: ['organizations-programs-list'],
};

// =============================================================================
// COURSES ENDPOINTS
// =============================================================================

const coursesListEndpoint: ApiEndpoint = {
  id: 'organizations-courses-list',
  module: 'organizations',
  category: 'Courses',
  title: 'List All Courses',
  description: 'Retrieve a paginated list of all courses with optional filtering by active status. Note: This endpoint uses a different response format with "count" and "pagination" fields instead of "metadata".',
  method: 'GET',
  path: '/api/api-management/organizations/courses',
  authentication: commonAuthentication,
  queryParameters: [
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
    {
      name: 'is_active',
      type: 'boolean',
      required: false,
      description: 'Filter by active status',
      example: true,
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved courses',
      contentType: 'json',
      example: {
        count: 120,
        data: [
          {
            id: '990e8400-e29b-41d4-a716-446655440004',
            course_code: 'CS101',
            course_name: 'Introduction to Programming',
            credits: 4,
            is_active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 120,
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
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/courses?page=1&limit=50&is_active=true', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const result = await response.json();
console.log(result.data); // Array of courses
console.log(result.pagination); // Pagination info
console.log(result.count); // Total count`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/courses?page=1&limit=50&is_active=true" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://myjkkn.ac.in/api/api-management/organizations/courses"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "is_active": "true"}

response = requests.get(url, headers=headers, params=params)
result = response.json()
print(result["data"])  # Array of courses
print(result["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get All Active Courses',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch all active courses and display their codes, names, and credit values.',
      expectedOutput: 'A list of active courses with course_code, course_name, and credits fields.',
      tags: ['courses', 'filtering'],
    },
    {
      title: 'Calculate Total Credits',
      category: 'analysis',
      complexity: 'intermediate',
      prompt: 'Using the MyJKKN Organizations API, fetch all courses and calculate the total credits offered across all active courses.',
      expectedOutput: 'A sum of all credits from active courses.',
      tags: ['courses', 'analytics', 'calculation'],
    },
  ],
  tags: ['courses', 'pagination', 'filtering'],
  notes: [
    'This endpoint uses a different response format: "count" and "pagination" instead of "metadata"',
    'Default limit is 50 items per page (higher than other endpoints)',
    'Maximum limit is capped at 200 items per page',
    'Results are ordered by created_at in descending order',
  ],
};

const coursesByIdEndpoint: ApiEndpoint = {
  id: 'organizations-courses-by-id',
  module: 'organizations',
  category: 'Courses',
  title: 'Get Course by ID',
  description: 'Retrieve detailed information about a specific course using its unique identifier.',
  method: 'GET',
  path: '/api/api-management/organizations/courses/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the course',
      example: '990e8400-e29b-41d4-a716-446655440004',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved course',
      contentType: 'json',
      example: {
        id: '990e8400-e29b-41d4-a716-446655440004',
        course_code: 'CS101',
        course_name: 'Introduction to Programming',
        credits: 4,
        is_active: true,
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
      message: 'Course not found',
      example: {
        error: 'Course not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const courseId = '990e8400-e29b-41d4-a716-446655440004';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/courses/\${courseId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const course = await response.json();
console.log(course);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/courses/990e8400-e29b-41d4-a716-446655440004" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

course_id = "990e8400-e29b-41d4-a716-446655440004"
url = f"https://myjkkn.ac.in/api/api-management/organizations/courses/{course_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
course = response.json()
print(course)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Course Details',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt: 'Using the MyJKKN Organizations API, fetch details of a specific course including its code, name, and credit value.',
      expectedOutput: 'Complete course details with course_code, course_name, credits, and status.',
      tags: ['courses', 'single-record'],
    },
  ],
  tags: ['courses', 'by-id'],
  relatedEndpoints: ['organizations-courses-list'],
};

// =============================================================================
// SEMESTERS ENDPOINTS (Placeholder - needs actual endpoint implementation)
// =============================================================================

const semestersListEndpoint: ApiEndpoint = {
  id: 'organizations-semesters-list',
  module: 'organizations',
  category: 'Semesters',
  title: 'List All Semesters',
  description: 'Retrieve a paginated list of all semesters with optional filtering.',
  method: 'GET',
  path: '/api/api-management/organizations/semesters',
  authentication: commonAuthentication,
  queryParameters: [...paginationParams, institutionIdParam, isActiveParam],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved semesters',
      contentType: 'json',
      example: {
        data: [],
        metadata: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/semesters?page=1&limit=10', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/semesters?page=1&limit=10" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
  ],
  aiPrompts: [],
  tags: ['semesters', 'pagination'],
  notes: ['This endpoint is available but specific response schema may vary based on implementation'],
};

const semestersByIdEndpoint: ApiEndpoint = {
  id: 'organizations-semesters-by-id',
  module: 'organizations',
  category: 'Semesters',
  title: 'Get Semester by ID',
  description: 'Retrieve detailed information about a specific semester.',
  method: 'GET',
  path: '/api/api-management/organizations/semesters/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the semester',
      example: 'aa0e8400-e29b-41d4-a716-446655440005',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved semester',
      contentType: 'json',
      example: {},
    },
  ],
  errorResponses: [...commonErrors],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const semesterId = 'aa0e8400-e29b-41d4-a716-446655440005';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/semesters/\${semesterId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const semester = await response.json();
console.log(semester);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/semesters/aa0e8400-e29b-41d4-a716-446655440005" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
  ],
  aiPrompts: [],
  tags: ['semesters', 'by-id'],
  relatedEndpoints: ['organizations-semesters-list'],
};

// =============================================================================
// SECTIONS ENDPOINTS (Placeholder - needs actual endpoint implementation)
// =============================================================================

const sectionsListEndpoint: ApiEndpoint = {
  id: 'organizations-sections-list',
  module: 'organizations',
  category: 'Sections',
  title: 'List All Sections',
  description: 'Retrieve a paginated list of all sections with optional filtering.',
  method: 'GET',
  path: '/api/api-management/organizations/sections',
  authentication: commonAuthentication,
  queryParameters: [...paginationParams, institutionIdParam, isActiveParam],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved sections',
      contentType: 'json',
      example: {
        data: [],
        metadata: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://myjkkn.ac.in/api/api-management/organizations/sections?page=1&limit=10', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/sections?page=1&limit=10" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
  ],
  aiPrompts: [],
  tags: ['sections', 'pagination'],
  notes: ['This endpoint is available but specific response schema may vary based on implementation'],
};

const sectionsByIdEndpoint: ApiEndpoint = {
  id: 'organizations-sections-by-id',
  module: 'organizations',
  category: 'Sections',
  title: 'Get Section by ID',
  description: 'Retrieve detailed information about a specific section.',
  method: 'GET',
  path: '/api/api-management/organizations/sections/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the section',
      example: 'bb0e8400-e29b-41d4-a716-446655440006',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved section',
      contentType: 'json',
      example: {},
    },
  ],
  errorResponses: [...commonErrors],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const sectionId = 'bb0e8400-e29b-41d4-a716-446655440006';
const response = await fetch(\`https://myjkkn.ac.in/api/api-management/organizations/sections/\${sectionId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const section = await response.json();
console.log(section);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://myjkkn.ac.in/api/api-management/organizations/sections/bb0e8400-e29b-41d4-a716-446655440006" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
  ],
  aiPrompts: [],
  tags: ['sections', 'by-id'],
  relatedEndpoints: ['organizations-sections-list'],
};

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================

export const organizationsModuleConfig: ApiModuleConfig = {
  moduleName: 'Organizations',
  moduleDescription:
    'The Organizations API module provides comprehensive access to institutional data including institutions, departments, degrees, programs, courses, semesters, and sections. All endpoints require API key authentication and support pagination, filtering, and search capabilities.',
  baseUrl: 'https://myjkkn.ac.in',
  endpoints: [
    // Institutions (3)
    institutionsListEndpoint,
    institutionsByIdEndpoint,
    institutionsNamesEndpoint,
    // Departments (2)
    departmentsListEndpoint,
    departmentsByIdEndpoint,
    // Degrees (2)
    degreesListEndpoint,
    degreesByIdEndpoint,
    // Programs (2)
    programsListEndpoint,
    programsByIdEndpoint,
    // Courses (2)
    coursesListEndpoint,
    coursesByIdEndpoint,
    // Semesters (2)
    semestersListEndpoint,
    semestersByIdEndpoint,
    // Sections (2)
    sectionsListEndpoint,
    sectionsByIdEndpoint,
  ],
  commonErrors,
  authenticationOverview:
    'All Organizations API endpoints require Bearer token authentication using an API key. Generate your API key from the API Management dashboard and include it in the Authorization header of every request.',
  generalNotes: [
    'All list endpoints support pagination with page and limit query parameters',
    'Search parameters perform case-insensitive matching using PostgreSQL ILIKE',
    'Results are ordered by created_at in descending order (newest first) unless specified otherwise',
    'All endpoints return standard error responses (401, 403, 500) as documented',
    'New fields display_name and order fields (degree_order, department_order) are now available for degrees and departments',
    'The courses endpoint uses a different response format with "count" and "pagination" instead of "metadata"',
    'Rate limiting may apply based on your API key configuration',
  ],
};

export default organizationsModuleConfig;
