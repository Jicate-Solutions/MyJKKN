/**
 * Campus Living API Module Configuration
 * Complete endpoint documentation for the Campus Living module
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

// Write-enabled authentication for POST endpoints
const writeAuthentication = {
  type: 'bearer' as const,
  description:
    'API key with write permission required in Authorization header. Generate your API key from the API Management dashboard.',
  headerName: 'Authorization',
  example: 'Bearer your_api_key_here',
  scopes: ['write'],
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
// BLOCKS ENDPOINTS
// =============================================================================

const blocksListEndpoint: ApiEndpoint = {
  id: 'campus-living-blocks-list',
  module: 'campus-living' as any,
  category: 'Blocks',
  title: 'List Hostel Blocks',
  description:
    'Retrieve a paginated list of hostel blocks with optional filtering by gender and status.',
  method: 'GET',
  path: '/api/api-management/campus-living/blocks',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'gender',
      type: 'string',
      required: false,
      description: 'Filter by gender designation of the block',
      example: 'male',
      enum: ['male', 'female'],
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by block status',
      example: 'active',
      enum: ['active', 'inactive', 'maintenance'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of blocks',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'b10e8400-e29b-41d4-a716-446655440001',
            name: 'Block A',
            hostel_type: 'boys',
            status: 'active',
            total_rooms: 50,
            total_capacity: 200,
            current_occupancy: 175,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        count: 150,
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
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/blocks?page=1&limit=50', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of hostel blocks
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/blocks?page=1&limit=50" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/blocks"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of hostel blocks
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get All Active Hostel Blocks',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all active hostel blocks and display their names, gender designation, and occupancy statistics.',
      expectedOutput:
        'A list of active hostel blocks with name, hostel_type, total_rooms, total_capacity, and current_occupancy.',
      tags: ['blocks', 'occupancy', 'basic-query'],
    },
    {
      title: 'Analyze Block Occupancy Rates',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all hostel blocks and calculate the occupancy rate for each block to identify under-utilized or over-crowded blocks.',
      expectedOutput:
        'A breakdown of each block with occupancy percentage calculated from current_occupancy / total_capacity.',
      tags: ['blocks', 'analytics', 'occupancy'],
    },
  ],
  tags: ['blocks', 'pagination', 'filtering', 'hostel'],
  notes: [
    'Blocks represent physical hostel buildings or wings',
    'Each block is designated for a specific gender',
    'Occupancy counts (occupied_beds) are updated in near real-time',
    'Results are ordered by name in ascending order',
  ],
};

const blocksByIdEndpoint: ApiEndpoint = {
  id: 'campus-living-blocks-by-id',
  module: 'campus-living' as any,
  category: 'Blocks',
  title: 'Get Block by ID',
  description:
    'Retrieve detailed information about a specific hostel block including its rooms and assigned wardens.',
  method: 'GET',
  path: '/api/api-management/campus-living/blocks/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the hostel block',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved block with rooms and wardens',
      contentType: 'json',
      example: {
        id: 'b10e8400-e29b-41d4-a716-446655440001',
        name: 'Block A',
        hostel_type: 'boys',
        status: 'active',
        total_rooms: 50,
        total_capacity: 200,
        current_occupancy: 175,
        total_floors: 4,
        rooms: [
          {
            id: 'r10e8400-e29b-41d4-a716-446655440001',
            room_number: 'A-101',
            floor: 1,
            room_type: 'double',
            capacity: 4,
            current_occupancy: 3,
            status: 'available',
          },
        ],
        wardens: [
          {
            id: 'w10e8400-e29b-41d4-a716-446655440001',
            name: 'Dr. Ramesh Kumar',
            phone: '9876543210',
            designation: 'Chief Warden',
          },
        ],
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
      message: 'Block not found',
      example: {
        error: 'Block not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const blockId = 'b10e8400-e29b-41d4-a716-446655440001';
const response = await fetch(\`https://www.jkkn.ai/api/api-management/campus-living/blocks/\${blockId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const block = await response.json();
console.log(block);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/blocks/b10e8400-e29b-41d4-a716-446655440001" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

block_id = "b10e8400-e29b-41d4-a716-446655440001"
url = f"https://www.jkkn.ai/api/api-management/campus-living/blocks/{block_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
block = response.json()
print(block)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Block Details with Room Availability',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch a specific block and list all rooms with their availability status.',
      expectedOutput:
        'Block details with a list of rooms showing room_number, floor, room_type, capacity, current_occupancy, and status.',
      tags: ['blocks', 'rooms', 'availability'],
    },
  ],
  tags: ['blocks', 'by-id', 'rooms', 'wardens'],
  notes: [
    'Includes nested rooms array with current occupancy',
    'Includes assigned wardens with contact information',
    'Room status can be: available, full, maintenance, reserved',
  ],
  relatedEndpoints: ['campus-living-blocks-list', 'campus-living-rooms-list'],
};

// =============================================================================
// ROOMS ENDPOINTS
// =============================================================================

const roomsListEndpoint: ApiEndpoint = {
  id: 'campus-living-rooms-list',
  module: 'campus-living' as any,
  category: 'Rooms',
  title: 'List Rooms',
  description:
    'Retrieve a paginated list of hostel rooms with optional filtering by block, status, room type, and floor.',
  method: 'GET',
  path: '/api/api-management/campus-living/rooms',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by room status',
      example: 'available',
      enum: ['available', 'full', 'maintenance', 'reserved'],
    },
    {
      name: 'room_type',
      type: 'string',
      required: false,
      description: 'Filter by room type',
      example: 'double',
      enum: ['single', 'double', 'triple', 'dormitory'],
    },
    {
      name: 'floor',
      type: 'number',
      required: false,
      description: 'Filter by floor number',
      example: 1,
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of rooms',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'r10e8400-e29b-41d4-a716-446655440001',
            room_number: 'A-101',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            floor: 1,
            room_type: 'double',
            capacity: 4,
            current_occupancy: 3,
            status: 'available',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        count: 200,
        pagination: {
          page: 1,
          limit: 50,
          total: 200,
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
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/rooms?page=1&limit=50&status=available', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of rooms
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/rooms?page=1&limit=50&status=available" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/rooms"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "available"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of rooms
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Find Available Rooms in a Block',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, find all available rooms in a specific hostel block that have vacant beds.',
      expectedOutput:
        'A list of rooms with status "available" showing room_number, room_type, capacity, and current_occupancy.',
      tags: ['rooms', 'availability', 'filtering'],
    },
    {
      title: 'Room Utilization by Floor',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all rooms for a block and analyze utilization rates per floor.',
      expectedOutput:
        'A floor-wise breakdown showing total rooms, total beds, occupied beds, and utilization percentage per floor.',
      tags: ['rooms', 'analytics', 'utilization'],
    },
  ],
  tags: ['rooms', 'pagination', 'filtering'],
  notes: [
    'Room types include single, double, triple, and dormitory',
    'Status reflects current availability: available (has vacant beds), full, maintenance, reserved',
    'Use block_id filter to get rooms for a specific block',
    'Results are ordered by room_number in ascending order',
  ],
};

const roomsByIdEndpoint: ApiEndpoint = {
  id: 'campus-living-rooms-by-id',
  module: 'campus-living' as any,
  category: 'Rooms',
  title: 'Get Room by ID',
  description:
    'Retrieve detailed information about a specific room including its beds and parent block info.',
  method: 'GET',
  path: '/api/api-management/campus-living/rooms/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the room',
      example: 'r10e8400-e29b-41d4-a716-446655440001',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved room with beds and block info',
      contentType: 'json',
      example: {
        id: 'r10e8400-e29b-41d4-a716-446655440001',
        room_number: 'A-101',
        block_id: 'b10e8400-e29b-41d4-a716-446655440001',
        floor: 1,
        room_type: 'double',
        capacity: 4,
        current_occupancy: 3,
        status: 'available',
        block: {
          id: 'b10e8400-e29b-41d4-a716-446655440001',
          name: 'Block A',
          hostel_type: 'boys',
        },
        beds: [
          {
            id: 'bed10e84-e29b-41d4-a716-446655440001',
            bed_number: 'A-101-1',
            status: 'occupied',
            resident_name: 'Rahul Sharma',
          },
          {
            id: 'bed10e84-e29b-41d4-a716-446655440002',
            bed_number: 'A-101-2',
            status: 'vacant',
            resident_name: null,
          },
        ],
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
      message: 'Room not found',
      example: {
        error: 'Room not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const roomId = 'r10e8400-e29b-41d4-a716-446655440001';
const response = await fetch(\`https://www.jkkn.ai/api/api-management/campus-living/rooms/\${roomId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const room = await response.json();
console.log(room);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/rooms/r10e8400-e29b-41d4-a716-446655440001" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

room_id = "r10e8400-e29b-41d4-a716-446655440001"
url = f"https://www.jkkn.ai/api/api-management/campus-living/rooms/{room_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
room = response.json()
print(room)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Check Room Bed Availability',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch a specific room and check which beds are vacant for new allocation.',
      expectedOutput:
        'Room details with a list of beds showing bed_number, status (occupied/vacant), and current resident if any.',
      tags: ['rooms', 'beds', 'availability'],
    },
  ],
  tags: ['rooms', 'by-id', 'beds', 'block'],
  notes: [
    'Includes nested beds array with occupancy status',
    'Includes parent block information',
    'Bed status can be: occupied, vacant, reserved, maintenance',
  ],
  relatedEndpoints: ['campus-living-rooms-list', 'campus-living-beds-list'],
};

// =============================================================================
// ROOM ALLOCATIONS ENDPOINTS
// =============================================================================

const allocationsListEndpoint: ApiEndpoint = {
  id: 'campus-living-allocations-list',
  module: 'campus-living' as any,
  category: 'Room Allocations',
  title: 'List Room Allocations',
  description:
    'Retrieve a paginated list of room allocations with optional filtering by status, block, and learner.',
  method: 'GET',
  path: '/api/api-management/campus-living/room-allocations',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by allocation status',
      example: 'active',
      enum: ['active', 'vacated', 'transferred', 'pending'],
    },
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'learner_id',
      type: 'string',
      required: false,
      description: 'Filter by learner UUID',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of room allocations',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'al10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'John Doe',
            room_id: 'r10e8400-e29b-41d4-a716-446655440001',
            room_number: 'A-101',
            bed_id: 'bed10e84-e29b-41d4-a716-446655440001',
            bed_number: 'A-101-1',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            block_name: 'Block A',
            status: 'active',
            allocated_at: '2024-08-01T00:00:00Z',
            vacated_at: null,
            created_at: '2024-08-01T00:00:00Z',
            updated_at: '2024-08-01T00:00:00Z',
          },
        ],
        count: 500,
        pagination: {
          page: 1,
          limit: 50,
          total: 500,
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
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/room-allocations?page=1&limit=50&status=active', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of allocations
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/room-allocations?page=1&limit=50&status=active" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/room-allocations"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "active"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of allocations
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Active Allocations for a Block',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all active room allocations for a specific block to see current residents.',
      expectedOutput:
        'A list of active allocations with learner_name, room_number, bed_number, and allocated_at date.',
      tags: ['allocations', 'filtering', 'block'],
    },
    {
      title: 'Track Room Allocation History for a Learner',
      category: 'data-retrieval',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all room allocations (active and vacated) for a specific learner to see their full hostel stay history.',
      expectedOutput:
        'A chronological list of all allocations for the learner showing room changes and duration of stay.',
      tags: ['allocations', 'history', 'learner'],
    },
  ],
  tags: ['allocations', 'pagination', 'filtering'],
  notes: [
    'Allocations track the assignment of learners to specific beds in rooms',
    'Status: active (currently residing), vacated (left), transferred (moved to another room), pending (awaiting check-in)',
    'Use learner_id to get allocation history for a specific student',
    'Results are ordered by created_at in descending order',
  ],
};

const allocationsCreateEndpoint: ApiEndpoint = {
  id: 'campus-living-allocations-create',
  module: 'campus-living' as any,
  category: 'Room Allocations',
  title: 'Create Room Allocation',
  description:
    'Create a new room allocation to assign a learner to a specific bed in a room.',
  method: 'POST',
  path: '/api/api-management/campus-living/room-allocations',
  authentication: writeAuthentication,
  requestBody: {
    contentType: 'application/json',
    schema: [
      {
        name: 'learner_id',
        type: 'string',
        required: true,
        description: 'UUID of the learner to allocate',
        example: 'cc0e8400-e29b-41d4-a716-446655440007',
      },
      {
        name: 'room_id',
        type: 'string',
        required: true,
        description: 'UUID of the room to allocate to',
        example: 'r10e8400-e29b-41d4-a716-446655440001',
      },
      {
        name: 'bed_id',
        type: 'string',
        required: true,
        description: 'UUID of the specific bed to assign',
        example: 'bed10e84-e29b-41d4-a716-446655440002',
      },
    ],
    example: {
      learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
      room_id: 'r10e8400-e29b-41d4-a716-446655440001',
      bed_id: 'bed10e84-e29b-41d4-a716-446655440002',
    },
  },
  successResponses: [
    {
      statusCode: 201,
      description: 'Room allocation created successfully',
      contentType: 'json',
      example: {
        id: 'al10e840-e29b-41d4-a716-446655440002',
        learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
        room_id: 'r10e8400-e29b-41d4-a716-446655440001',
        bed_id: 'bed10e84-e29b-41d4-a716-446655440002',
        status: 'active',
        allocated_at: '2024-08-15T10:00:00Z',
        created_at: '2024-08-15T10:00:00Z',
        updated_at: '2024-08-15T10:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      example: {
        error: 'learner_id, room_id, and bed_id are required',
      },
    },
    {
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: 'Bed is already occupied',
      example: {
        error: 'Bed is already occupied',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/room-allocations', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
    room_id: 'r10e8400-e29b-41d4-a716-446655440001',
    bed_id: 'bed10e84-e29b-41d4-a716-446655440002'
  })
});

const allocation = await response.json();
console.log(allocation);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X POST "https://www.jkkn.ai/api/api-management/campus-living/room-allocations" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "room_id": "r10e8400-e29b-41d4-a716-446655440001",
    "bed_id": "bed10e84-e29b-41d4-a716-446655440002"
  }'`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/room-allocations"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
payload = {
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "room_id": "r10e8400-e29b-41d4-a716-446655440001",
    "bed_id": "bed10e84-e29b-41d4-a716-446655440002"
}

response = requests.post(url, headers=headers, json=payload)
allocation = response.json()
print(allocation)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Allocate a Room to a Learner',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, allocate a specific bed in a room to a learner by providing their IDs.',
      expectedOutput:
        'A newly created allocation record with status "active" and allocated_at timestamp.',
      tags: ['allocations', 'create', 'automation'],
    },
  ],
  tags: ['allocations', 'create', 'write'],
  notes: [
    'Requires an API key with write permission',
    'The bed must be vacant to create a new allocation',
    'Creating an allocation automatically updates the bed and room occupancy counts',
    'A learner can only have one active allocation at a time',
  ],
  relatedEndpoints: ['campus-living-allocations-list', 'campus-living-beds-list'],
};

// =============================================================================
// BEDS ENDPOINTS
// =============================================================================

const bedsListEndpoint: ApiEndpoint = {
  id: 'campus-living-beds-list',
  module: 'campus-living' as any,
  category: 'Beds',
  title: 'List Beds',
  description:
    'Retrieve a paginated list of beds with optional filtering by room, block, and status.',
  method: 'GET',
  path: '/api/api-management/campus-living/beds',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'room_id',
      type: 'string',
      required: false,
      description: 'Filter by room UUID',
      example: 'r10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by bed status',
      example: 'vacant',
      enum: ['occupied', 'vacant', 'reserved', 'maintenance'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of beds',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'bed10e84-e29b-41d4-a716-446655440001',
            bed_number: 'A-101-1',
            room_id: 'r10e8400-e29b-41d4-a716-446655440001',
            room_number: 'A-101',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            block_name: 'Block A',
            status: 'occupied',
            resident_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            resident_name: 'John Doe',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        count: 800,
        pagination: {
          page: 1,
          limit: 50,
          total: 800,
          totalPages: 16,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/beds?page=1&limit=50&status=vacant', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of beds
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/beds?page=1&limit=50&status=vacant" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/beds"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "vacant"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of beds
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Find All Vacant Beds',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, find all vacant beds across all hostel blocks to identify available spots for new allocations.',
      expectedOutput:
        'A list of vacant beds with bed_number, room_number, block_name, and status.',
      tags: ['beds', 'availability', 'vacant'],
    },
    {
      title: 'Bed Occupancy Report by Block',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all beds and generate a block-wise occupancy report showing occupied vs vacant beds.',
      expectedOutput:
        'A block-wise summary with total beds, occupied beds, vacant beds, and occupancy percentage.',
      tags: ['beds', 'analytics', 'occupancy'],
    },
  ],
  tags: ['beds', 'pagination', 'filtering'],
  notes: [
    'Beds are the most granular unit of hostel allocation',
    'Each bed belongs to a room which belongs to a block',
    'Status: occupied (student assigned), vacant (available), reserved (held for incoming student), maintenance (not usable)',
    'Use status=vacant to find beds available for allocation',
  ],
};

// =============================================================================
// RESIDENTS ENDPOINTS
// =============================================================================

const residentsListEndpoint: ApiEndpoint = {
  id: 'campus-living-residents-list',
  module: 'campus-living' as any,
  category: 'Residents',
  title: 'List Active Residents',
  description:
    'Retrieve a paginated list of active hostel residents with optional filtering by block and search.',
  method: 'GET',
  path: '/api/api-management/campus-living/residents',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'search',
      type: 'string',
      required: false,
      description: 'Search by resident name or roll number (case-insensitive)',
      example: 'Rahul',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of active residents',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'cc0e8400-e29b-41d4-a716-446655440007',
            name: 'Rahul Sharma',
            roll_number: 'CS2024001',
            program: 'B.Tech Computer Science',
            block_name: 'Block A',
            room_number: 'A-101',
            bed_number: 'A-101-1',
            phone: '9876543210',
            email: 'rahul.sharma@student.jkkn.ac.in',
            allocated_at: '2024-08-01T00:00:00Z',
          },
        ],
        count: 450,
        pagination: {
          page: 1,
          limit: 50,
          total: 450,
          totalPages: 9,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/residents?page=1&limit=50&search=Rahul', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of residents
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/residents?page=1&limit=50&search=Rahul" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/residents"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "search": "Rahul"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of residents
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Search Hostel Residents',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, search for a resident by name and retrieve their room and block details.',
      expectedOutput:
        'Matching residents with name, roll_number, block_name, room_number, and contact details.',
      tags: ['residents', 'search', 'basic-query'],
    },
  ],
  tags: ['residents', 'pagination', 'search', 'filtering'],
  notes: [
    'This endpoint only returns currently active residents (students with active room allocations)',
    'Search is case-insensitive and matches against name and roll number',
    'Includes denormalized block, room, and bed information for convenience',
  ],
};

const residentsByIdEndpoint: ApiEndpoint = {
  id: 'campus-living-residents-by-id',
  module: 'campus-living' as any,
  category: 'Residents',
  title: 'Get Resident Details',
  description:
    'Retrieve detailed information about a specific resident including their allocation history.',
  method: 'GET',
  path: '/api/api-management/campus-living/residents/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the resident (learner)',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved resident with allocation history',
      contentType: 'json',
      example: {
        id: 'cc0e8400-e29b-41d4-a716-446655440007',
        name: 'Rahul Sharma',
        roll_number: 'CS2024001',
        program: 'B.Tech Computer Science',
        phone: '9876543210',
        email: 'rahul.sharma@student.jkkn.ac.in',
        current_allocation: {
          block_name: 'Block A',
          room_number: 'A-101',
          bed_number: 'A-101-1',
          allocated_at: '2024-08-01T00:00:00Z',
        },
        allocation_history: [
          {
            block_name: 'Block B',
            room_number: 'B-205',
            bed_number: 'B-205-2',
            allocated_at: '2023-08-01T00:00:00Z',
            vacated_at: '2024-07-31T00:00:00Z',
            status: 'vacated',
          },
        ],
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Resident not found',
      example: {
        error: 'Resident not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const residentId = 'cc0e8400-e29b-41d4-a716-446655440007';
const response = await fetch(\`https://www.jkkn.ai/api/api-management/campus-living/residents/\${residentId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const resident = await response.json();
console.log(resident);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/residents/cc0e8400-e29b-41d4-a716-446655440007" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

resident_id = "cc0e8400-e29b-41d4-a716-446655440007"
url = f"https://www.jkkn.ai/api/api-management/campus-living/residents/{resident_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
resident = response.json()
print(resident)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Complete Resident Profile with History',
      category: 'data-retrieval',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch a resident profile and display their current allocation alongside their full hostel stay history.',
      expectedOutput:
        'Resident details with current_allocation and allocation_history showing all past room assignments.',
      tags: ['residents', 'history', 'profile'],
    },
  ],
  tags: ['residents', 'by-id', 'history'],
  notes: [
    'Includes current active allocation and historical allocations',
    'Allocation history is ordered by allocated_at in descending order',
    'The id parameter refers to the learner profile UUID',
  ],
  relatedEndpoints: ['campus-living-residents-list', 'campus-living-allocations-list'],
};

// =============================================================================
// LEAVE REQUESTS ENDPOINTS
// =============================================================================

const leaveListEndpoint: ApiEndpoint = {
  id: 'campus-living-leave-list',
  module: 'campus-living' as any,
  category: 'Leave Requests',
  title: 'List Leave Requests',
  description:
    'Retrieve a paginated list of hostel leave requests with optional filtering by status, leave type, and learner.',
  method: 'GET',
  path: '/api/api-management/campus-living/leave-requests',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by leave request status',
      example: 'pending',
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
    },
    {
      name: 'leave_type',
      type: 'string',
      required: false,
      description: 'Filter by type of leave',
      example: 'weekend',
      enum: ['weekend', 'vacation', 'emergency', 'medical', 'other'],
    },
    {
      name: 'learner_id',
      type: 'string',
      required: false,
      description: 'Filter by learner UUID',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of leave requests',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'lv10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            leave_type: 'weekend',
            reason: 'Family function',
            from_date: '2024-09-14',
            to_date: '2024-09-15',
            status: 'approved',
            approved_by: 'Dr. Ramesh Kumar',
            created_at: '2024-09-12T10:00:00Z',
            updated_at: '2024-09-12T14:00:00Z',
          },
        ],
        count: 120,
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
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/leave-requests?page=1&limit=50&status=pending', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of leave requests
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/leave-requests?page=1&limit=50&status=pending" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/leave-requests"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "pending"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of leave requests
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Pending Leave Requests',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all pending leave requests that need approval from the warden.',
      expectedOutput:
        'A list of pending leave requests with learner_name, leave_type, reason, from_date, and to_date.',
      tags: ['leave', 'pending', 'approval'],
    },
  ],
  tags: ['leave-requests', 'pagination', 'filtering'],
  notes: [
    'Leave types: weekend (short leave), vacation (semester break), emergency, medical, other',
    'Only wardens and admins can approve/reject leave requests',
    'Dates are in YYYY-MM-DD format',
    'Results are ordered by created_at in descending order',
  ],
};

const leaveCreateEndpoint: ApiEndpoint = {
  id: 'campus-living-leave-create',
  module: 'campus-living' as any,
  category: 'Leave Requests',
  title: 'Create Leave Request',
  description: 'Create a new hostel leave request for a learner.',
  method: 'POST',
  path: '/api/api-management/campus-living/leave-requests',
  authentication: writeAuthentication,
  requestBody: {
    contentType: 'application/json',
    schema: [
      {
        name: 'learner_id',
        type: 'string',
        required: true,
        description: 'UUID of the learner requesting leave',
        example: 'cc0e8400-e29b-41d4-a716-446655440007',
      },
      {
        name: 'leave_type',
        type: 'string',
        required: true,
        description: 'Type of leave being requested',
        example: 'weekend',
        enum: ['weekend', 'vacation', 'emergency', 'medical', 'other'],
      },
      {
        name: 'reason',
        type: 'string',
        required: true,
        description: 'Reason for the leave request',
        example: 'Family function at hometown',
      },
      {
        name: 'from_date',
        type: 'string',
        required: true,
        description: 'Start date of leave (YYYY-MM-DD)',
        example: '2024-09-14',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      {
        name: 'to_date',
        type: 'string',
        required: true,
        description: 'End date of leave (YYYY-MM-DD)',
        example: '2024-09-15',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
    ],
    example: {
      learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
      leave_type: 'weekend',
      reason: 'Family function at hometown',
      from_date: '2024-09-14',
      to_date: '2024-09-15',
    },
  },
  successResponses: [
    {
      statusCode: 201,
      description: 'Leave request created successfully',
      contentType: 'json',
      example: {
        id: 'lv10e840-e29b-41d4-a716-446655440002',
        learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
        leave_type: 'weekend',
        reason: 'Family function at hometown',
        from_date: '2024-09-14',
        to_date: '2024-09-15',
        status: 'pending',
        created_at: '2024-09-12T10:00:00Z',
        updated_at: '2024-09-12T10:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      example: {
        error: 'from_date must be before to_date',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/leave-requests', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
    leave_type: 'weekend',
    reason: 'Family function at hometown',
    from_date: '2024-09-14',
    to_date: '2024-09-15'
  })
});

const leaveRequest = await response.json();
console.log(leaveRequest);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X POST "https://www.jkkn.ai/api/api-management/campus-living/leave-requests" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "leave_type": "weekend",
    "reason": "Family function at hometown",
    "from_date": "2024-09-14",
    "to_date": "2024-09-15"
  }'`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/leave-requests"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
payload = {
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "leave_type": "weekend",
    "reason": "Family function at hometown",
    "from_date": "2024-09-14",
    "to_date": "2024-09-15"
}

response = requests.post(url, headers=headers, json=payload)
leave_request = response.json()
print(leave_request)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Submit a Leave Request',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, submit a weekend leave request for a hostel resident.',
      expectedOutput:
        'A newly created leave request with status "pending" awaiting warden approval.',
      tags: ['leave', 'create', 'automation'],
    },
  ],
  tags: ['leave-requests', 'create', 'write'],
  notes: [
    'Requires an API key with write permission',
    'New leave requests are always created with status "pending"',
    'from_date must be before or equal to to_date',
    'The learner must have an active room allocation to submit a leave request',
  ],
  relatedEndpoints: ['campus-living-leave-list'],
};

// =============================================================================
// GATE PASSES ENDPOINTS
// =============================================================================

const gatePassesListEndpoint: ApiEndpoint = {
  id: 'campus-living-gate-passes-list',
  module: 'campus-living' as any,
  category: 'Gate Passes',
  title: 'List Gate Passes',
  description:
    'Retrieve a paginated list of gate passes with optional filtering by status, pass type, and learner.',
  method: 'GET',
  path: '/api/api-management/campus-living/gate-passes',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by gate pass status',
      example: 'active',
      enum: ['active', 'used', 'expired', 'cancelled'],
    },
    {
      name: 'pass_type',
      type: 'string',
      required: false,
      description: 'Filter by gate pass type',
      example: 'outing',
      enum: ['outing', 'medical', 'emergency', 'event', 'other'],
    },
    {
      name: 'learner_id',
      type: 'string',
      required: false,
      description: 'Filter by learner UUID',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of gate passes',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'gp10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            pass_type: 'outing',
            purpose: 'Shopping',
            out_time: '2024-09-14T10:00:00Z',
            expected_return_time: '2024-09-14T18:00:00Z',
            actual_return_time: '2024-09-14T17:30:00Z',
            status: 'used',
            approved_by: 'Dr. Ramesh Kumar',
            created_at: '2024-09-14T09:00:00Z',
            updated_at: '2024-09-14T17:30:00Z',
          },
        ],
        count: 350,
        pagination: {
          page: 1,
          limit: 50,
          total: 350,
          totalPages: 7,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/gate-passes?page=1&limit=50&status=active', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of gate passes
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/gate-passes?page=1&limit=50&status=active" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/gate-passes"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "active"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of gate passes
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Track Active Gate Passes',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all active (not yet returned) gate passes to track students currently outside the hostel.',
      expectedOutput:
        'A list of active gate passes with learner_name, pass_type, out_time, and expected_return_time.',
      tags: ['gate-passes', 'tracking', 'active'],
    },
  ],
  tags: ['gate-passes', 'pagination', 'filtering'],
  notes: [
    'Gate passes track student entry/exit from the hostel campus',
    'Status: active (student is out), used (returned), expired (past return time without check-in), cancelled',
    'Pass types: outing (general), medical, emergency, event, other',
    'Results are ordered by created_at in descending order',
  ],
};

const gatePassesCreateEndpoint: ApiEndpoint = {
  id: 'campus-living-gate-passes-create',
  module: 'campus-living' as any,
  category: 'Gate Passes',
  title: 'Create Gate Pass',
  description: 'Create a new gate pass for a hostel resident.',
  method: 'POST',
  path: '/api/api-management/campus-living/gate-passes',
  authentication: writeAuthentication,
  requestBody: {
    contentType: 'application/json',
    schema: [
      {
        name: 'learner_id',
        type: 'string',
        required: true,
        description: 'UUID of the learner requesting the gate pass',
        example: 'cc0e8400-e29b-41d4-a716-446655440007',
      },
      {
        name: 'pass_type',
        type: 'string',
        required: true,
        description: 'Type of gate pass',
        example: 'outing',
        enum: ['outing', 'medical', 'emergency', 'event', 'other'],
      },
      {
        name: 'purpose',
        type: 'string',
        required: true,
        description: 'Purpose of going out',
        example: 'Shopping at nearby mall',
      },
      {
        name: 'expected_return_time',
        type: 'string',
        required: true,
        description: 'Expected return time in ISO 8601 format',
        example: '2024-09-14T18:00:00Z',
      },
    ],
    example: {
      learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
      pass_type: 'outing',
      purpose: 'Shopping at nearby mall',
      expected_return_time: '2024-09-14T18:00:00Z',
    },
  },
  successResponses: [
    {
      statusCode: 201,
      description: 'Gate pass created successfully',
      contentType: 'json',
      example: {
        id: 'gp10e840-e29b-41d4-a716-446655440002',
        learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
        pass_type: 'outing',
        purpose: 'Shopping at nearby mall',
        out_time: '2024-09-14T10:00:00Z',
        expected_return_time: '2024-09-14T18:00:00Z',
        status: 'active',
        created_at: '2024-09-14T10:00:00Z',
        updated_at: '2024-09-14T10:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      example: {
        error: 'learner_id, pass_type, purpose, and expected_return_time are required',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/gate-passes', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
    pass_type: 'outing',
    purpose: 'Shopping at nearby mall',
    expected_return_time: '2024-09-14T18:00:00Z'
  })
});

const gatePass = await response.json();
console.log(gatePass);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X POST "https://www.jkkn.ai/api/api-management/campus-living/gate-passes" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "pass_type": "outing",
    "purpose": "Shopping at nearby mall",
    "expected_return_time": "2024-09-14T18:00:00Z"
  }'`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/gate-passes"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
payload = {
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "pass_type": "outing",
    "purpose": "Shopping at nearby mall",
    "expected_return_time": "2024-09-14T18:00:00Z"
}

response = requests.post(url, headers=headers, json=payload)
gate_pass = response.json()
print(gate_pass)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Issue a Gate Pass',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, create a gate pass for a hostel resident who needs to go out for personal work.',
      expectedOutput:
        'A newly created gate pass with status "active" and the out_time set to current time.',
      tags: ['gate-passes', 'create', 'automation'],
    },
  ],
  tags: ['gate-passes', 'create', 'write'],
  notes: [
    'Requires an API key with write permission',
    'out_time is automatically set to the current server time upon creation',
    'The learner must have an active room allocation to get a gate pass',
    'A learner cannot have multiple active gate passes simultaneously',
  ],
  relatedEndpoints: ['campus-living-gate-passes-list'],
};

// =============================================================================
// INCIDENTS ENDPOINTS
// =============================================================================

const incidentsListEndpoint: ApiEndpoint = {
  id: 'campus-living-incidents-list',
  module: 'campus-living' as any,
  category: 'Incidents',
  title: 'List Incidents',
  description:
    'Retrieve a paginated list of hostel incidents with optional filtering by status, severity, and category.',
  method: 'GET',
  path: '/api/api-management/campus-living/incidents',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by incident status',
      example: 'open',
      enum: ['open', 'investigating', 'resolved', 'closed'],
    },
    {
      name: 'severity',
      type: 'string',
      required: false,
      description: 'Filter by incident severity',
      example: 'medium',
      enum: ['low', 'medium', 'high', 'critical'],
    },
    {
      name: 'category',
      type: 'string',
      required: false,
      description: 'Filter by incident category',
      example: 'disciplinary',
      enum: ['disciplinary', 'safety', 'property_damage', 'noise', 'other'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of incidents',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'in10e840-e29b-41d4-a716-446655440001',
            title: 'Noise complaint - Block A Floor 3',
            category: 'noise',
            severity: 'low',
            status: 'resolved',
            description: 'Excessive noise reported during study hours',
            reported_by: 'Dr. Ramesh Kumar',
            reported_at: '2024-09-10T22:00:00Z',
            resolved_at: '2024-09-11T10:00:00Z',
            created_at: '2024-09-10T22:00:00Z',
            updated_at: '2024-09-11T10:00:00Z',
          },
        ],
        count: 45,
        pagination: {
          page: 1,
          limit: 50,
          total: 45,
          totalPages: 1,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/incidents?page=1&limit=50&status=open', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of incidents
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/incidents?page=1&limit=50&status=open" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/incidents"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "open"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of incidents
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Open Incidents by Severity',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all open incidents sorted by severity to prioritize resolution.',
      expectedOutput:
        'A list of open incidents with title, category, severity, description, and reported_at.',
      tags: ['incidents', 'open', 'priority'],
    },
    {
      title: 'Incident Trend Analysis',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all incidents and analyze trends by category and severity over time.',
      expectedOutput:
        'A monthly breakdown of incidents by category with severity distribution.',
      tags: ['incidents', 'analytics', 'trends'],
    },
  ],
  tags: ['incidents', 'pagination', 'filtering'],
  notes: [
    'Incidents track any notable events in the hostel (disciplinary, safety, property damage, etc.)',
    'Severity levels: low (minor), medium (needs attention), high (urgent), critical (immediate action required)',
    'Results are ordered by created_at in descending order',
  ],
};

const incidentsByIdEndpoint: ApiEndpoint = {
  id: 'campus-living-incidents-by-id',
  module: 'campus-living' as any,
  category: 'Incidents',
  title: 'Get Incident by ID',
  description:
    'Retrieve detailed information about a specific incident including involved parties.',
  method: 'GET',
  path: '/api/api-management/campus-living/incidents/[id]',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique UUID of the incident',
      example: 'in10e840-e29b-41d4-a716-446655440001',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Successfully retrieved incident with involved parties',
      contentType: 'json',
      example: {
        id: 'in10e840-e29b-41d4-a716-446655440001',
        title: 'Noise complaint - Block A Floor 3',
        category: 'noise',
        severity: 'low',
        status: 'resolved',
        description: 'Excessive noise reported during study hours from room A-301',
        reported_by: 'Dr. Ramesh Kumar',
        reported_at: '2024-09-10T22:00:00Z',
        resolved_at: '2024-09-11T10:00:00Z',
        resolution_notes: 'Warning issued to occupants of room A-301',
        parties: [
          {
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            role: 'involved',
            room_number: 'A-301',
          },
        ],
        created_at: '2024-09-10T22:00:00Z',
        updated_at: '2024-09-11T10:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Incident not found',
      example: {
        error: 'Incident not found',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const incidentId = 'in10e840-e29b-41d4-a716-446655440001';
const response = await fetch(\`https://www.jkkn.ai/api/api-management/campus-living/incidents/\${incidentId}\`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const incident = await response.json();
console.log(incident);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/incidents/in10e840-e29b-41d4-a716-446655440001" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

incident_id = "in10e840-e29b-41d4-a716-446655440001"
url = f"https://www.jkkn.ai/api/api-management/campus-living/incidents/{incident_id}"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
incident = response.json()
print(incident)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Incident Details with Involved Parties',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch a specific incident and identify all involved parties for follow-up action.',
      expectedOutput:
        'Incident details with description, resolution_notes, and a list of involved parties with names and room numbers.',
      tags: ['incidents', 'single-record', 'parties'],
    },
  ],
  tags: ['incidents', 'by-id', 'parties'],
  notes: [
    'Includes nested parties array listing all learners involved in the incident',
    'Party roles can be: involved, witness, reporter',
    'Resolution notes are available once the incident is resolved or closed',
  ],
  relatedEndpoints: ['campus-living-incidents-list'],
};

// =============================================================================
// VISITORS ENDPOINTS
// =============================================================================

const visitorsListEndpoint: ApiEndpoint = {
  id: 'campus-living-visitors-list',
  module: 'campus-living' as any,
  category: 'Visitors',
  title: 'List Visitors',
  description:
    'Retrieve a paginated list of hostel visitors with optional filtering by status and block.',
  method: 'GET',
  path: '/api/api-management/campus-living/visitors',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by visitor status',
      example: 'checked_in',
      enum: ['checked_in', 'checked_out', 'pending'],
    },
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID being visited',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of visitors',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'vs10e840-e29b-41d4-a716-446655440001',
            visitor_name: 'Mr. Sharma',
            visitor_phone: '9876543230',
            relation: 'Father',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            block_name: 'Block A',
            purpose: 'Parent visit',
            check_in_time: '2024-09-15T10:00:00Z',
            check_out_time: '2024-09-15T16:00:00Z',
            status: 'checked_out',
            created_at: '2024-09-15T10:00:00Z',
            updated_at: '2024-09-15T16:00:00Z',
          },
        ],
        count: 80,
        pagination: {
          page: 1,
          limit: 50,
          total: 80,
          totalPages: 2,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/visitors?page=1&limit=50&status=checked_in', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of visitors
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/visitors?page=1&limit=50&status=checked_in" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/visitors"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "checked_in"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of visitors
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Track Current Visitors in Hostel',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all currently checked-in visitors to know who is on the hostel premises.',
      expectedOutput:
        'A list of checked-in visitors with visitor_name, relation, learner_name, block_name, and check_in_time.',
      tags: ['visitors', 'tracking', 'checked-in'],
    },
  ],
  tags: ['visitors', 'pagination', 'filtering'],
  notes: [
    'Visitors are external persons (parents, guardians, etc.) visiting hostel residents',
    'Status: checked_in (currently on premises), checked_out (left), pending (registered but not arrived)',
    'Results are ordered by created_at in descending order',
  ],
};

const visitorsCreateEndpoint: ApiEndpoint = {
  id: 'campus-living-visitors-create',
  module: 'campus-living' as any,
  category: 'Visitors',
  title: 'Register Visitor',
  description: 'Register a new visitor at the hostel gate.',
  method: 'POST',
  path: '/api/api-management/campus-living/visitors',
  authentication: writeAuthentication,
  requestBody: {
    contentType: 'application/json',
    schema: [
      {
        name: 'visitor_name',
        type: 'string',
        required: true,
        description: 'Full name of the visitor',
        example: 'Mr. Sharma',
      },
      {
        name: 'visitor_phone',
        type: 'string',
        required: true,
        description: 'Phone number of the visitor',
        example: '9876543230',
      },
      {
        name: 'relation',
        type: 'string',
        required: true,
        description: 'Relationship to the resident',
        example: 'Father',
      },
      {
        name: 'learner_id',
        type: 'string',
        required: true,
        description: 'UUID of the resident being visited',
        example: 'cc0e8400-e29b-41d4-a716-446655440007',
      },
      {
        name: 'purpose',
        type: 'string',
        required: true,
        description: 'Purpose of the visit',
        example: 'Parent visit',
      },
    ],
    example: {
      visitor_name: 'Mr. Sharma',
      visitor_phone: '9876543230',
      relation: 'Father',
      learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
      purpose: 'Parent visit',
    },
  },
  successResponses: [
    {
      statusCode: 201,
      description: 'Visitor registered successfully',
      contentType: 'json',
      example: {
        id: 'vs10e840-e29b-41d4-a716-446655440002',
        visitor_name: 'Mr. Sharma',
        visitor_phone: '9876543230',
        relation: 'Father',
        learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
        purpose: 'Parent visit',
        check_in_time: '2024-09-15T10:00:00Z',
        status: 'checked_in',
        created_at: '2024-09-15T10:00:00Z',
        updated_at: '2024-09-15T10:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      example: {
        error: 'visitor_name, visitor_phone, relation, learner_id, and purpose are required',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/visitors', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    visitor_name: 'Mr. Sharma',
    visitor_phone: '9876543230',
    relation: 'Father',
    learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
    purpose: 'Parent visit'
  })
});

const visitor = await response.json();
console.log(visitor);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X POST "https://www.jkkn.ai/api/api-management/campus-living/visitors" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "visitor_name": "Mr. Sharma",
    "visitor_phone": "9876543230",
    "relation": "Father",
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "purpose": "Parent visit"
  }'`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/visitors"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
payload = {
    "visitor_name": "Mr. Sharma",
    "visitor_phone": "9876543230",
    "relation": "Father",
    "learner_id": "cc0e8400-e29b-41d4-a716-446655440007",
    "purpose": "Parent visit"
}

response = requests.post(url, headers=headers, json=payload)
visitor = response.json()
print(visitor)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Register a Parent Visit',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, register a parent visiting their child at the hostel.',
      expectedOutput:
        'A newly created visitor record with status "checked_in" and check_in_time set to now.',
      tags: ['visitors', 'create', 'registration'],
    },
  ],
  tags: ['visitors', 'create', 'write'],
  notes: [
    'Requires an API key with write permission',
    'check_in_time is automatically set to the current server time',
    'The learner must have an active room allocation to receive visitors',
    'Visitor registration is required for security and tracking purposes',
  ],
  relatedEndpoints: ['campus-living-visitors-list'],
};

// =============================================================================
// ATTENDANCE ENDPOINTS
// =============================================================================

const attendanceListEndpoint: ApiEndpoint = {
  id: 'campus-living-attendance-list',
  module: 'campus-living' as any,
  category: 'Attendance',
  title: 'List Attendance Records',
  description:
    'Retrieve a paginated list of hostel attendance records with optional filtering by block, status, and date range.',
  method: 'GET',
  path: '/api/api-management/campus-living/attendance',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by attendance status',
      example: 'present',
      enum: ['present', 'absent', 'on_leave', 'late'],
    },
    {
      name: 'date_from',
      type: 'string',
      required: false,
      description: 'Filter records from this date (YYYY-MM-DD)',
      example: '2024-09-01',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    {
      name: 'date_to',
      type: 'string',
      required: false,
      description: 'Filter records to this date (YYYY-MM-DD)',
      example: '2024-09-30',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of attendance records',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'at10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            block_name: 'Block A',
            room_number: 'A-101',
            date: '2024-09-15',
            status: 'present',
            check_in_time: '2024-09-15T21:30:00Z',
            marked_by: 'Dr. Ramesh Kumar',
            created_at: '2024-09-15T21:30:00Z',
          },
        ],
        count: 1200,
        pagination: {
          page: 1,
          limit: 50,
          total: 1200,
          totalPages: 24,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/attendance?page=1&limit=50&date_from=2024-09-01&date_to=2024-09-30', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of attendance records
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/attendance?page=1&limit=50&date_from=2024-09-01&date_to=2024-09-30" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/attendance"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "page": 1,
    "limit": 50,
    "date_from": "2024-09-01",
    "date_to": "2024-09-30"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of attendance records
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Check Daily Attendance for a Block',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch attendance records for a specific block on a given date to identify absent students.',
      expectedOutput:
        'A list of attendance records for the date showing learner_name, room_number, and status (present/absent/on_leave).',
      tags: ['attendance', 'daily', 'block'],
    },
    {
      title: 'Monthly Attendance Report',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all attendance records for a month and generate a summary showing attendance percentage per block.',
      expectedOutput:
        'A block-wise monthly attendance summary with present count, absent count, and attendance percentage.',
      tags: ['attendance', 'analytics', 'monthly'],
    },
  ],
  tags: ['attendance', 'pagination', 'filtering', 'date-range'],
  notes: [
    'Attendance is typically recorded during evening roll call',
    'Status: present (in hostel), absent (not in hostel), on_leave (approved leave), late (checked in after deadline)',
    'Date filters must be in YYYY-MM-DD format',
    'Results are ordered by date in descending order',
  ],
};

// =============================================================================
// HEALTH & SAFETY ENDPOINTS
// =============================================================================

const healthCasesListEndpoint: ApiEndpoint = {
  id: 'campus-living-health-cases-list',
  module: 'campus-living' as any,
  category: 'Health & Safety',
  title: 'List Health Cases',
  description:
    'Retrieve a paginated list of health cases reported in the hostel with optional filtering by status and severity.',
  method: 'GET',
  path: '/api/api-management/campus-living/health-cases',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by health case status',
      example: 'active',
      enum: ['active', 'recovering', 'resolved', 'referred'],
    },
    {
      name: 'severity',
      type: 'string',
      required: false,
      description: 'Filter by severity level',
      example: 'moderate',
      enum: ['mild', 'moderate', 'severe', 'critical'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of health cases',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'hc10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            condition: 'Fever and cold',
            severity: 'mild',
            status: 'recovering',
            reported_at: '2024-09-14T08:00:00Z',
            treatment: 'Prescribed paracetamol and rest',
            doctor_name: 'Dr. Priya Nair',
            created_at: '2024-09-14T08:00:00Z',
            updated_at: '2024-09-15T10:00:00Z',
          },
        ],
        count: 25,
        pagination: {
          page: 1,
          limit: 50,
          total: 25,
          totalPages: 1,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/health-cases?page=1&limit=50&status=active', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of health cases
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/health-cases?page=1&limit=50&status=active" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/health-cases"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "active"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of health cases
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Track Active Health Cases',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all active health cases to monitor students who are currently unwell.',
      expectedOutput:
        'A list of active health cases with learner_name, condition, severity, and treatment details.',
      tags: ['health', 'active', 'monitoring'],
    },
  ],
  tags: ['health', 'pagination', 'filtering'],
  notes: [
    'Health cases track student illnesses and medical conditions reported in the hostel',
    'Severity: mild (no immediate concern), moderate (needs monitoring), severe (needs medical attention), critical (hospital referral)',
    'Status: active (ongoing), recovering, resolved (fully recovered), referred (sent to hospital)',
    'Contains sensitive medical information - ensure proper authorization',
  ],
};

const inspectionsListEndpoint: ApiEndpoint = {
  id: 'campus-living-inspections-list',
  module: 'campus-living' as any,
  category: 'Health & Safety',
  title: 'List Inspections',
  description:
    'Retrieve a paginated list of hostel inspections with optional filtering by status and inspection type.',
  method: 'GET',
  path: '/api/api-management/campus-living/inspections',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by inspection status',
      example: 'completed',
      enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    },
    {
      name: 'inspection_type',
      type: 'string',
      required: false,
      description: 'Filter by type of inspection',
      example: 'room',
      enum: ['room', 'fire_safety', 'hygiene', 'electrical', 'general'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of inspections',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'is10e840-e29b-41d4-a716-446655440001',
            inspection_type: 'room',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            block_name: 'Block A',
            status: 'completed',
            scheduled_date: '2024-09-15',
            completed_date: '2024-09-15',
            inspector_name: 'Dr. Ramesh Kumar',
            score: 85,
            remarks: 'Overall cleanliness good. Minor issues in floor 3.',
            created_at: '2024-09-10T00:00:00Z',
            updated_at: '2024-09-15T16:00:00Z',
          },
        ],
        count: 30,
        pagination: {
          page: 1,
          limit: 50,
          total: 30,
          totalPages: 1,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/inspections?page=1&limit=50&status=completed', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of inspections
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/inspections?page=1&limit=50&status=completed" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/inspections"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "completed"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of inspections
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Review Completed Inspection Scores',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all completed inspections and compare scores across blocks to identify areas needing improvement.',
      expectedOutput:
        'A block-wise comparison of inspection scores with average scores and remarks.',
      tags: ['inspections', 'analytics', 'scores'],
    },
  ],
  tags: ['inspections', 'pagination', 'filtering'],
  notes: [
    'Inspections are periodic checks conducted by wardens or hostel management',
    'Types: room (room cleanliness), fire_safety, hygiene, electrical, general',
    'Score is on a scale of 0-100',
    'Results are ordered by scheduled_date in descending order',
  ],
};

// =============================================================================
// MAINTENANCE ENDPOINTS
// =============================================================================

const maintenanceListEndpoint: ApiEndpoint = {
  id: 'campus-living-maintenance-list',
  module: 'campus-living' as any,
  category: 'Maintenance',
  title: 'List Maintenance Requests',
  description:
    'Retrieve a paginated list of maintenance requests with optional filtering by status, priority, category, and SLA status.',
  method: 'GET',
  path: '/api/api-management/campus-living/maintenance',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by maintenance request status',
      example: 'pending',
      enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
    },
    {
      name: 'priority',
      type: 'string',
      required: false,
      description: 'Filter by priority level',
      example: 'high',
      enum: ['low', 'medium', 'high', 'urgent'],
    },
    {
      name: 'category',
      type: 'string',
      required: false,
      description: 'Filter by maintenance category',
      example: 'plumbing',
      enum: ['electrical', 'plumbing', 'carpentry', 'civil', 'cleaning', 'other'],
    },
    {
      name: 'sla_status',
      type: 'string',
      required: false,
      description: 'Filter by SLA compliance status',
      example: 'within_sla',
      enum: ['within_sla', 'approaching_sla', 'breached_sla'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of maintenance requests',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'mt10e840-e29b-41d4-a716-446655440001',
            title: 'Leaking tap in room A-101',
            category: 'plumbing',
            priority: 'medium',
            status: 'assigned',
            sla_status: 'within_sla',
            description: 'Bathroom tap is continuously dripping',
            block_name: 'Block A',
            room_number: 'A-101',
            reported_by: 'Rahul Sharma',
            assigned_to: 'Maintenance Team A',
            reported_at: '2024-09-14T08:00:00Z',
            sla_deadline: '2024-09-15T08:00:00Z',
            created_at: '2024-09-14T08:00:00Z',
            updated_at: '2024-09-14T10:00:00Z',
          },
        ],
        count: 60,
        pagination: {
          page: 1,
          limit: 50,
          total: 60,
          totalPages: 2,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/maintenance?page=1&limit=50&status=pending&priority=high', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of maintenance requests
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/maintenance?page=1&limit=50&status=pending&priority=high" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/maintenance"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "pending", "priority": "high"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of maintenance requests
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get SLA-Breached Maintenance Requests',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all maintenance requests that have breached their SLA deadline for escalation.',
      expectedOutput:
        'A list of maintenance requests with sla_status "breached_sla" showing title, priority, reported_at, and sla_deadline.',
      tags: ['maintenance', 'sla', 'escalation'],
    },
    {
      title: 'Maintenance Category Analysis',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all maintenance requests and analyze which categories have the most issues to prioritize infrastructure improvements.',
      expectedOutput:
        'A category-wise breakdown showing request count, average resolution time, and SLA compliance rate.',
      tags: ['maintenance', 'analytics', 'categories'],
    },
  ],
  tags: ['maintenance', 'pagination', 'filtering', 'sla'],
  notes: [
    'Maintenance requests track repair and upkeep tasks in the hostel',
    'Priority: low (can wait), medium (within a day), high (within hours), urgent (immediate)',
    'SLA status is auto-calculated based on priority and deadline',
    'Results are ordered by created_at in descending order',
  ],
};

const maintenanceCreateEndpoint: ApiEndpoint = {
  id: 'campus-living-maintenance-create',
  module: 'campus-living' as any,
  category: 'Maintenance',
  title: 'Create Maintenance Request',
  description: 'Create a new maintenance request for a hostel room or common area.',
  method: 'POST',
  path: '/api/api-management/campus-living/maintenance',
  authentication: writeAuthentication,
  requestBody: {
    contentType: 'application/json',
    schema: [
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Brief title of the maintenance issue',
        example: 'Leaking tap in room A-101',
      },
      {
        name: 'category',
        type: 'string',
        required: true,
        description: 'Category of the maintenance issue',
        example: 'plumbing',
        enum: ['electrical', 'plumbing', 'carpentry', 'civil', 'cleaning', 'other'],
      },
      {
        name: 'priority',
        type: 'string',
        required: true,
        description: 'Priority level of the request',
        example: 'medium',
        enum: ['low', 'medium', 'high', 'urgent'],
      },
      {
        name: 'description',
        type: 'string',
        required: true,
        description: 'Detailed description of the issue',
        example: 'Bathroom tap is continuously dripping and wasting water',
      },
      {
        name: 'room_id',
        type: 'string',
        required: false,
        description: 'UUID of the room where the issue is (optional for common areas)',
        example: 'r10e8400-e29b-41d4-a716-446655440001',
      },
      {
        name: 'block_id',
        type: 'string',
        required: true,
        description: 'UUID of the block where the issue is located',
        example: 'b10e8400-e29b-41d4-a716-446655440001',
      },
    ],
    example: {
      title: 'Leaking tap in room A-101',
      category: 'plumbing',
      priority: 'medium',
      description: 'Bathroom tap is continuously dripping and wasting water',
      room_id: 'r10e8400-e29b-41d4-a716-446655440001',
      block_id: 'b10e8400-e29b-41d4-a716-446655440001',
    },
  },
  successResponses: [
    {
      statusCode: 201,
      description: 'Maintenance request created successfully',
      contentType: 'json',
      example: {
        id: 'mt10e840-e29b-41d4-a716-446655440002',
        title: 'Leaking tap in room A-101',
        category: 'plumbing',
        priority: 'medium',
        status: 'pending',
        sla_status: 'within_sla',
        description: 'Bathroom tap is continuously dripping and wasting water',
        room_id: 'r10e8400-e29b-41d4-a716-446655440001',
        block_id: 'b10e8400-e29b-41d4-a716-446655440001',
        sla_deadline: '2024-09-15T08:00:00Z',
        created_at: '2024-09-14T08:00:00Z',
        updated_at: '2024-09-14T08:00:00Z',
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      example: {
        error: 'title, category, priority, description, and block_id are required',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/maintenance', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Leaking tap in room A-101',
    category: 'plumbing',
    priority: 'medium',
    description: 'Bathroom tap is continuously dripping and wasting water',
    room_id: 'r10e8400-e29b-41d4-a716-446655440001',
    block_id: 'b10e8400-e29b-41d4-a716-446655440001'
  })
});

const request = await response.json();
console.log(request);`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X POST "https://www.jkkn.ai/api/api-management/campus-living/maintenance" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Leaking tap in room A-101",
    "category": "plumbing",
    "priority": "medium",
    "description": "Bathroom tap is continuously dripping and wasting water",
    "room_id": "r10e8400-e29b-41d4-a716-446655440001",
    "block_id": "b10e8400-e29b-41d4-a716-446655440001"
  }'`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/maintenance"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
payload = {
    "title": "Leaking tap in room A-101",
    "category": "plumbing",
    "priority": "medium",
    "description": "Bathroom tap is continuously dripping and wasting water",
    "room_id": "r10e8400-e29b-41d4-a716-446655440001",
    "block_id": "b10e8400-e29b-41d4-a716-446655440001"
}

response = requests.post(url, headers=headers, json=payload)
maintenance_request = response.json()
print(maintenance_request)`,
    },
  ],
  aiPrompts: [
    {
      title: 'Submit a Maintenance Request',
      category: 'automation',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, create a maintenance request for a plumbing issue in a hostel room.',
      expectedOutput:
        'A newly created maintenance request with status "pending" and SLA deadline auto-calculated based on priority.',
      tags: ['maintenance', 'create', 'automation'],
    },
  ],
  tags: ['maintenance', 'create', 'write'],
  notes: [
    'Requires an API key with write permission',
    'SLA deadline is automatically calculated based on priority level',
    'room_id is optional - omit for common area issues',
    'New requests always start with status "pending"',
  ],
  relatedEndpoints: ['campus-living-maintenance-list'],
};

// =============================================================================
// HOUSEKEEPING ENDPOINTS
// =============================================================================

const cleaningListEndpoint: ApiEndpoint = {
  id: 'campus-living-cleaning-list',
  module: 'campus-living' as any,
  category: 'Housekeeping',
  title: 'List Cleaning Tasks',
  description:
    'Retrieve a list of cleaning tasks or schedules with optional filtering by type, status, block, and cleaning type.',
  method: 'GET',
  path: '/api/api-management/campus-living/cleaning',
  authentication: commonAuthentication,
  queryParameters: [
    {
      name: 'type',
      type: 'string',
      required: false,
      description: 'Whether to fetch tasks or schedules',
      example: 'tasks',
      enum: ['tasks', 'schedules'],
      default: 'tasks',
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by task status',
      example: 'completed',
      enum: ['pending', 'in_progress', 'completed', 'skipped'],
    },
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'cleaning_type',
      type: 'string',
      required: false,
      description: 'Filter by cleaning type',
      example: 'room',
      enum: ['room', 'common_area', 'bathroom', 'corridor', 'deep_clean'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'List of cleaning tasks or schedules',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'cl10e840-e29b-41d4-a716-446655440001',
            cleaning_type: 'room',
            block_id: 'b10e8400-e29b-41d4-a716-446655440001',
            block_name: 'Block A',
            floor: 1,
            status: 'completed',
            assigned_to: 'Cleaning Staff A',
            scheduled_date: '2024-09-15',
            completed_at: '2024-09-15T08:30:00Z',
            remarks: 'All rooms on floor 1 cleaned',
            created_at: '2024-09-14T00:00:00Z',
            updated_at: '2024-09-15T08:30:00Z',
          },
        ],
        count: 75,
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/cleaning?type=tasks&status=pending&block_id=b10e8400-e29b-41d4-a716-446655440001', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of cleaning tasks`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/cleaning?type=tasks&status=pending&block_id=b10e8400-e29b-41d4-a716-446655440001" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/cleaning"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {
    "type": "tasks",
    "status": "pending",
    "block_id": "b10e8400-e29b-41d4-a716-446655440001"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of cleaning tasks`,
    },
  ],
  aiPrompts: [
    {
      title: 'Track Pending Cleaning Tasks',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all pending cleaning tasks for today to ensure all areas are cleaned.',
      expectedOutput:
        'A list of pending cleaning tasks with cleaning_type, block_name, floor, and assigned_to.',
      tags: ['cleaning', 'pending', 'tracking'],
    },
  ],
  tags: ['cleaning', 'housekeeping', 'filtering'],
  notes: [
    'Use type=tasks for individual cleaning tasks and type=schedules for recurring schedules',
    'Cleaning types: room (individual rooms), common_area, bathroom, corridor, deep_clean (periodic)',
    'Status: pending (not started), in_progress, completed, skipped (with reason)',
  ],
};

const laundryListEndpoint: ApiEndpoint = {
  id: 'campus-living-laundry-list',
  module: 'campus-living' as any,
  category: 'Housekeeping',
  title: 'List Laundry Orders',
  description:
    'Retrieve a paginated list of laundry orders with optional filtering by status and learner.',
  method: 'GET',
  path: '/api/api-management/campus-living/laundry',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by laundry order status',
      example: 'in_progress',
      enum: ['submitted', 'in_progress', 'ready', 'collected', 'cancelled'],
    },
    {
      name: 'learner_id',
      type: 'string',
      required: false,
      description: 'Filter by learner UUID',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of laundry orders',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'ld10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            item_count: 8,
            status: 'ready',
            submitted_at: '2024-09-14T08:00:00Z',
            ready_at: '2024-09-15T16:00:00Z',
            collected_at: null,
            created_at: '2024-09-14T08:00:00Z',
            updated_at: '2024-09-15T16:00:00Z',
          },
        ],
        count: 200,
        pagination: {
          page: 1,
          limit: 50,
          total: 200,
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
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/laundry?page=1&limit=50&status=ready', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of laundry orders
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/laundry?page=1&limit=50&status=ready" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/laundry"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "status": "ready"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of laundry orders
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Check Laundry Ready for Collection',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all laundry orders that are ready for collection to notify students.',
      expectedOutput:
        'A list of ready laundry orders with learner_name, item_count, submitted_at, and ready_at.',
      tags: ['laundry', 'ready', 'notification'],
    },
  ],
  tags: ['laundry', 'housekeeping', 'pagination', 'filtering'],
  notes: [
    'Laundry orders track clothes submitted by residents to the hostel laundry service',
    'Status flow: submitted -> in_progress -> ready -> collected',
    'item_count represents the total number of clothing items in the order',
    'Results are ordered by created_at in descending order',
  ],
};

// =============================================================================
// MESS MANAGEMENT ENDPOINTS
// =============================================================================

const messMenuListEndpoint: ApiEndpoint = {
  id: 'campus-living-mess-menu-list',
  module: 'campus-living' as any,
  category: 'Mess Management',
  title: 'List Mess Menus',
  description:
    'Retrieve a paginated list of mess menus with optional filtering by meal type, block, and current status.',
  method: 'GET',
  path: '/api/api-management/campus-living/mess/menu',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'meal_type',
      type: 'string',
      required: false,
      description: 'Filter by meal type',
      example: 'lunch',
      enum: ['breakfast', 'lunch', 'snacks', 'dinner'],
    },
    {
      name: 'block_id',
      type: 'string',
      required: false,
      description: 'Filter by hostel block UUID (for block-specific menus)',
      example: 'b10e8400-e29b-41d4-a716-446655440001',
    },
    {
      name: 'current',
      type: 'boolean',
      required: false,
      description: 'If true, return only the current week menu',
      example: true,
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of mess menus',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'mm10e840-e29b-41d4-a716-446655440001',
            date: '2024-09-15',
            day: 'Sunday',
            meal_type: 'lunch',
            items: ['Rice', 'Sambar', 'Rasam', 'Poriyal', 'Curd', 'Papad'],
            special_item: 'Chicken Biryani',
            block_id: null,
            is_active: true,
            created_at: '2024-09-10T00:00:00Z',
            updated_at: '2024-09-10T00:00:00Z',
          },
        ],
        count: 28,
        pagination: {
          page: 1,
          limit: 50,
          total: 28,
          totalPages: 1,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/mess/menu?current=true', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of menu items`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/mess/menu?current=true" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/mess/menu"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"current": "true"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of menu items`,
    },
  ],
  aiPrompts: [
    {
      title: 'Get Current Week Mess Menu',
      category: 'data-retrieval',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch the current week mess menu and display it organized by day and meal type.',
      expectedOutput:
        'A weekly menu organized by day showing breakfast, lunch, snacks, and dinner items for each day.',
      tags: ['mess', 'menu', 'current-week'],
    },
  ],
  tags: ['mess', 'menu', 'pagination', 'filtering'],
  notes: [
    'Meal types: breakfast, lunch, snacks, dinner',
    'Use current=true to get only the current week menu',
    'block_id is null for common menus shared across all blocks',
    'items is an array of food item names',
    'special_item indicates any special dish for the day',
  ],
};

const messAttendanceListEndpoint: ApiEndpoint = {
  id: 'campus-living-mess-attendance-list',
  module: 'campus-living' as any,
  category: 'Mess Management',
  title: 'List Meal Attendance Records',
  description:
    'Retrieve a paginated list of meal attendance records with optional filtering by learner, meal type, and consumption status.',
  method: 'GET',
  path: '/api/api-management/campus-living/mess/attendance',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'learner_id',
      type: 'string',
      required: false,
      description: 'Filter by learner UUID',
      example: 'cc0e8400-e29b-41d4-a716-446655440007',
    },
    {
      name: 'meal_type',
      type: 'string',
      required: false,
      description: 'Filter by meal type',
      example: 'lunch',
      enum: ['breakfast', 'lunch', 'snacks', 'dinner'],
    },
    {
      name: 'consumed',
      type: 'boolean',
      required: false,
      description: 'Filter by whether the meal was consumed',
      example: true,
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of meal attendance records',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'ma10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            date: '2024-09-15',
            meal_type: 'lunch',
            consumed: true,
            scan_time: '2024-09-15T12:30:00Z',
            created_at: '2024-09-15T12:30:00Z',
          },
        ],
        count: 3000,
        pagination: {
          page: 1,
          limit: 50,
          total: 3000,
          totalPages: 60,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/mess/attendance?page=1&limit=50&meal_type=lunch&consumed=true', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of meal attendance records
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/mess/attendance?page=1&limit=50&meal_type=lunch&consumed=true" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/mess/attendance"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "meal_type": "lunch", "consumed": "true"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of meal attendance records
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Analyze Meal Consumption Patterns',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch meal attendance records for a month and analyze which meals have the highest and lowest consumption rates.',
      expectedOutput:
        'A meal-type-wise breakdown showing total expected, actual consumed, and consumption percentage.',
      tags: ['mess', 'attendance', 'analytics'],
    },
  ],
  tags: ['mess', 'attendance', 'pagination', 'filtering'],
  notes: [
    'Meal attendance is typically recorded via ID card scan at the mess entrance',
    'consumed=true means the student had the meal; consumed=false means they skipped it',
    'scan_time records when the student entered the mess',
    'High data volume - use date filters for efficient querying',
  ],
};

const messFeedbackListEndpoint: ApiEndpoint = {
  id: 'campus-living-mess-feedback-list',
  module: 'campus-living' as any,
  category: 'Mess Management',
  title: 'List Mess Feedback',
  description:
    'Retrieve a paginated list of mess feedback and complaints with optional filtering by complaint status and meal type.',
  method: 'GET',
  path: '/api/api-management/campus-living/mess/feedback',
  authentication: commonAuthentication,
  queryParameters: [
    ...paginationParams,
    {
      name: 'is_complaint',
      type: 'boolean',
      required: false,
      description: 'Filter to show only complaints (true) or general feedback (false)',
      example: true,
    },
    {
      name: 'meal_type',
      type: 'string',
      required: false,
      description: 'Filter by meal type the feedback is about',
      example: 'lunch',
      enum: ['breakfast', 'lunch', 'snacks', 'dinner'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Paginated list of mess feedback',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'mf10e840-e29b-41d4-a716-446655440001',
            learner_id: 'cc0e8400-e29b-41d4-a716-446655440007',
            learner_name: 'Rahul Sharma',
            meal_type: 'lunch',
            rating: 4,
            comment: 'Food quality was good today. Would like more variety in desserts.',
            is_complaint: false,
            date: '2024-09-15',
            created_at: '2024-09-15T13:00:00Z',
          },
        ],
        count: 150,
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
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/mess/feedback?page=1&limit=50&is_complaint=true', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of feedback entries
console.log(data.pagination); // Pagination info`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/mess/feedback?page=1&limit=50&is_complaint=true" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/mess/feedback"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"page": 1, "limit": 50, "is_complaint": "true"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of feedback entries
print(data["pagination"])  # Pagination info`,
    },
  ],
  aiPrompts: [
    {
      title: 'Analyze Mess Feedback Ratings',
      category: 'analysis',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch all mess feedback and calculate average ratings per meal type to identify which meals need improvement.',
      expectedOutput:
        'A meal-type-wise breakdown of average ratings, total feedback count, and complaint percentage.',
      tags: ['mess', 'feedback', 'analytics', 'ratings'],
    },
  ],
  tags: ['mess', 'feedback', 'pagination', 'filtering'],
  notes: [
    'Feedback includes both general reviews and specific complaints',
    'Rating is on a scale of 1-5',
    'is_complaint=true filters only negative feedback that requires action',
    'Results are ordered by created_at in descending order',
  ],
};

const messBillingListEndpoint: ApiEndpoint = {
  id: 'campus-living-mess-billing-list',
  module: 'campus-living' as any,
  category: 'Mess Management',
  title: 'List Mess Billing',
  description:
    'Retrieve a list of mess billing periods or student billing records with optional filtering by type, status, and payment status.',
  method: 'GET',
  path: '/api/api-management/campus-living/mess/billing',
  authentication: commonAuthentication,
  queryParameters: [
    {
      name: 'type',
      type: 'string',
      required: false,
      description: 'Whether to fetch billing periods or individual student bills',
      example: 'periods',
      enum: ['periods', 'student'],
      default: 'periods',
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by billing period status',
      example: 'active',
      enum: ['draft', 'active', 'closed'],
    },
    {
      name: 'payment_status',
      type: 'string',
      required: false,
      description: 'Filter by student payment status (only for type=student)',
      example: 'pending',
      enum: ['pending', 'paid', 'partial', 'overdue'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'List of mess billing records',
      contentType: 'json',
      example: {
        data: [
          {
            id: 'mb10e840-e29b-41d4-a716-446655440001',
            period_name: 'September 2024',
            start_date: '2024-09-01',
            end_date: '2024-09-30',
            status: 'active',
            total_amount: 3500,
            total_students: 450,
            paid_count: 380,
            pending_count: 70,
            created_at: '2024-09-01T00:00:00Z',
            updated_at: '2024-09-15T00:00:00Z',
          },
        ],
        count: 12,
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/mess/billing?type=periods&status=active', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data); // Array of billing records`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/mess/billing?type=periods&status=active" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/mess/billing"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"type": "periods", "status": "active"}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data["data"])  # Array of billing records`,
    },
  ],
  aiPrompts: [
    {
      title: 'Check Mess Billing Payment Status',
      category: 'data-retrieval',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch student-level mess billing records to identify students with overdue payments.',
      expectedOutput:
        'A list of student billing records with payment_status "overdue" showing learner_name, amount, and due_date.',
      tags: ['mess', 'billing', 'payments', 'overdue'],
    },
  ],
  tags: ['mess', 'billing', 'filtering'],
  notes: [
    'Use type=periods for monthly billing period summaries',
    'Use type=student for individual student billing records',
    'payment_status filter only applies when type=student',
    'All monetary values are in INR',
  ],
};

// =============================================================================
// REPORTS & DASHBOARD ENDPOINTS
// =============================================================================

const reportsEndpoint: ApiEndpoint = {
  id: 'campus-living-reports',
  module: 'campus-living' as any,
  category: 'Reports & Dashboard',
  title: 'Generate Reports',
  description:
    'Generate various campus living reports including occupancy, attendance, maintenance, mess feedback, and leave reports.',
  method: 'GET',
  path: '/api/api-management/campus-living/reports',
  authentication: commonAuthentication,
  queryParameters: [
    {
      name: 'report_type',
      type: 'string',
      required: true,
      description: 'Type of report to generate',
      example: 'occupancy',
      enum: ['occupancy', 'attendance', 'maintenance', 'mess_feedback', 'leave'],
    },
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Generated report data',
      contentType: 'json',
      example: {
        report_type: 'occupancy',
        generated_at: '2024-09-15T12:00:00Z',
        summary: {
          total_blocks: 8,
          total_rooms: 400,
          total_capacity: 1600,
          occupied_beds: 1420,
          occupancy_rate: 88.75,
        },
        data: [
          {
            block_name: 'Block A',
            hostel_type: 'boys',
            total_capacity: 200,
            occupied_beds: 185,
            occupancy_rate: 92.5,
          },
        ],
      },
    },
  ],
  errorResponses: [
    ...commonErrors,
    {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid report type',
      example: {
        error: 'report_type must be one of: occupancy, attendance, maintenance, mess_feedback, leave',
      },
    },
  ],
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/reports?report_type=occupancy', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const report = await response.json();
console.log(report.summary); // Report summary
console.log(report.data); // Detailed report data`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/reports?report_type=occupancy" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/reports"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}
params = {"report_type": "occupancy"}

response = requests.get(url, headers=headers, params=params)
report = response.json()
print(report["summary"])  # Report summary
print(report["data"])  # Detailed report data`,
    },
  ],
  aiPrompts: [
    {
      title: 'Generate Occupancy Report',
      category: 'analysis',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, generate an occupancy report to understand current hostel utilization across all blocks.',
      expectedOutput:
        'An occupancy report with summary statistics and block-wise breakdown of beds, occupancy, and utilization rates.',
      tags: ['reports', 'occupancy', 'analytics'],
    },
    {
      title: 'Compare All Report Types',
      category: 'analysis',
      complexity: 'advanced',
      prompt:
        'Using the MyJKKN Campus Living API, generate all five report types (occupancy, attendance, maintenance, mess_feedback, leave) and create a comprehensive campus living health dashboard.',
      expectedOutput:
        'A combined dashboard with occupancy rates, attendance percentages, maintenance backlogs, mess satisfaction scores, and leave trends.',
      tags: ['reports', 'dashboard', 'comprehensive'],
    },
  ],
  tags: ['reports', 'analytics'],
  notes: [
    'report_type is required - must be one of: occupancy, attendance, maintenance, mess_feedback, leave',
    'Report data structure varies by report_type',
    'Reports are generated in real-time based on current data',
    'For historical reports, use the specific module list endpoints with date filters',
  ],
};

const dashboardEndpoint: ApiEndpoint = {
  id: 'campus-living-dashboard',
  module: 'campus-living' as any,
  category: 'Reports & Dashboard',
  title: 'Get Dashboard Summary',
  description:
    'Retrieve a comprehensive dashboard summary with occupancy statistics, pending actions, and active counts across all campus living modules.',
  method: 'GET',
  path: '/api/api-management/campus-living/dashboard',
  authentication: commonAuthentication,
  successResponses: [
    {
      statusCode: 200,
      description: 'Dashboard summary data',
      contentType: 'json',
      example: {
        occupancy: {
          total_blocks: 8,
          total_beds: 1600,
          occupied_beds: 1420,
          occupancy_rate: 88.75,
          vacant_beds: 180,
        },
        pending_actions: {
          leave_requests: 12,
          gate_passes: 5,
          maintenance_requests: 8,
          visitor_approvals: 3,
        },
        active_counts: {
          residents: 1420,
          active_leave: 35,
          active_gate_passes: 15,
          open_incidents: 4,
          health_cases: 6,
          pending_maintenance: 18,
        },
        today: {
          check_ins: 3,
          check_outs: 2,
          visitors: 8,
          meals_served: 4250,
          attendance_rate: 95.2,
        },
      },
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'javascript',
      label: 'JavaScript (Fetch)',
      code: `const response = await fetch('https://www.jkkn.ai/api/api-management/campus-living/dashboard', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});

const dashboard = await response.json();
console.log(dashboard.occupancy); // Occupancy stats
console.log(dashboard.pending_actions); // Items needing attention
console.log(dashboard.active_counts); // Current active counts
console.log(dashboard.today); // Today's activity`,
    },
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -X GET "https://www.jkkn.ai/api/api-management/campus-living/dashboard" \\
  -H "Authorization: Bearer your_api_key_here" \\
  -H "Content-Type: application/json"`,
    },
    {
      language: 'python',
      label: 'Python (Requests)',
      code: `import requests

url = "https://www.jkkn.ai/api/api-management/campus-living/dashboard"
headers = {
    "Authorization": "Bearer your_api_key_here",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
dashboard = response.json()
print(dashboard["occupancy"])  # Occupancy stats
print(dashboard["pending_actions"])  # Items needing attention
print(dashboard["active_counts"])  # Current active counts
print(dashboard["today"])  # Today's activity`,
    },
  ],
  aiPrompts: [
    {
      title: 'Build a Campus Living Dashboard',
      category: 'integration',
      complexity: 'beginner',
      prompt:
        'Using the MyJKKN Campus Living API, fetch the dashboard summary and display key metrics for the hostel management team.',
      expectedOutput:
        'A dashboard showing occupancy rate, pending actions requiring attention, active counts, and today\'s activity summary.',
      tags: ['dashboard', 'summary', 'overview'],
    },
    {
      title: 'Alert on Critical Dashboard Metrics',
      category: 'automation',
      complexity: 'intermediate',
      prompt:
        'Using the MyJKKN Campus Living API, fetch the dashboard and generate alerts for any concerning metrics such as low attendance rate, high pending maintenance, or critical health cases.',
      expectedOutput:
        'A list of alerts based on threshold checks against dashboard metrics.',
      tags: ['dashboard', 'alerts', 'monitoring'],
    },
  ],
  tags: ['dashboard', 'summary', 'overview'],
  notes: [
    'Provides a single-call overview of the entire campus living system',
    'Occupancy data is updated in near real-time',
    'pending_actions shows items requiring admin/warden action',
    'today section shows activity counts for the current day',
    'All counts are scoped to the organization associated with the API key',
  ],
};

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================

export const campusLivingModuleConfig: ApiModuleConfig = {
  moduleName: 'Campus Living',
  moduleDescription:
    'Complete API for hostel management including blocks, rooms, allocations, leave requests, gate passes, incidents, visitors, attendance, health cases, inspections, maintenance, cleaning, laundry, mess management, reports, and dashboard.',
  baseUrl: 'https://www.jkkn.ai',
  endpoints: [
    // Blocks (2)
    blocksListEndpoint,
    blocksByIdEndpoint,
    // Rooms (2)
    roomsListEndpoint,
    roomsByIdEndpoint,
    // Room Allocations (2)
    allocationsListEndpoint,
    allocationsCreateEndpoint,
    // Beds (1)
    bedsListEndpoint,
    // Residents (2)
    residentsListEndpoint,
    residentsByIdEndpoint,
    // Leave Requests (2)
    leaveListEndpoint,
    leaveCreateEndpoint,
    // Gate Passes (2)
    gatePassesListEndpoint,
    gatePassesCreateEndpoint,
    // Incidents (2)
    incidentsListEndpoint,
    incidentsByIdEndpoint,
    // Visitors (2)
    visitorsListEndpoint,
    visitorsCreateEndpoint,
    // Attendance (1)
    attendanceListEndpoint,
    // Health & Safety (2)
    healthCasesListEndpoint,
    inspectionsListEndpoint,
    // Maintenance (2)
    maintenanceListEndpoint,
    maintenanceCreateEndpoint,
    // Housekeeping (2)
    cleaningListEndpoint,
    laundryListEndpoint,
    // Mess Management (4)
    messMenuListEndpoint,
    messAttendanceListEndpoint,
    messFeedbackListEndpoint,
    messBillingListEndpoint,
    // Reports & Dashboard (2)
    reportsEndpoint,
    dashboardEndpoint,
  ],
  commonErrors,
  authenticationOverview:
    'All Campus Living API endpoints require a valid API key with appropriate permissions (read or write). Include your API key in the Authorization header as a Bearer token.',
  generalNotes: [
    'All endpoints are scoped to the organization associated with your API key',
    'Pagination is available on all list endpoints via page and limit query parameters',
    'Write operations (POST, PATCH, DELETE) require an API key with write permission',
    'Date range filtering is available via date_from and date_to query parameters on relevant endpoints',
  ],
};

export default campusLivingModuleConfig;
