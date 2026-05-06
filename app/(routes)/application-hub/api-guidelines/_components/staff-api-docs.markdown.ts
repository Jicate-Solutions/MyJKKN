export const staffApiDocsMarkdown = `# Staff API Documentation

The Staff API allows you to access staff information from the MyJKKN system. This API is protected by API keys and supports pagination, searching, and filtering.

## Authentication

All API endpoints require authentication using an API key. Include your API key in the \`Authorization\` header as a Bearer token:

\`\`\`bash
Authorization: Bearer jkkn_xxxxxxxx_xxxxxxxx
\`\`\`

The key is hashed (SHA-256) before lookup; we never store the plaintext. Keys can be created and revoked from the API Management section of MyJKKN. Each key carries \`permissions.read\` and \`permissions.write\` flags — staff list/detail endpoints require \`read\`.

## Endpoints

### \`GET /api/api-management/staff\`

Fetches a paginated list of staff members. You can filter the results using query parameters.

**Query Parameters**

| Name | Description |
|------|-------------|
| \`all\` | Set to \`true\` to fetch all records without pagination |
| \`page\` | Page number (default: 1, ignored when all=true) |
| \`limit\` | Items per page (default: 10, ignored when all=true) |
| \`search\` | Search term to filter by name, email, or staff ID |
| \`institution_id\` | Filter by institution ID |
| \`department_id\` | Filter by department ID |
| \`category_id\` | Filter by staff category ID |
| \`is_active\` | Filter by active status (true/false) |
| \`has_extended_profile\` | Filter to staff who have opted into the extended faculty profile (true/false). Use with \`category_id\` to scope to a single category that has \`shows_extended_profile = true\`. |
| \`role_type\` | Coarse role taxonomy. Common values: \`faculty\`, \`admin\`, \`support\`, \`management\`. Useful for grouping (e.g. directory pages, headcount reports). |
| \`role_key\` | Fine-grained role keyed to \`custom_roles.role_key\` (e.g. \`hod\`, \`principal\`, \`faculty\`, \`admission_counselor\`). Use this when the consumer needs to act on permission-bearing roles. |

#### Additional fields by category

Every staff row carries \`has_extended_profile\` plus the 29 extended-profile columns (e.g. \`experience_years\`, \`publications\`, \`qualifications\`). The joined \`category\` object exposes \`is_teaching\` and \`shows_extended_profile\` so you can tell whether those fields are meaningful for the row. When \`has_extended_profile = false\` AND \`category.shows_extended_profile = false\`, treat scalars as semantically empty (DB defaults to \`0\`, \`'draft'\`) and JSONB arrays as empty (DB default \`[]\`).

#### Example Response (Paginated)

\`\`\`json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "first_name": "John",
      "last_name": "Doe",
      "gender": "male",
      "date_of_birth": "1985-05-10",
      "marital_status": "married",
      "blood_group": "O+",
      "email": "john.doe@example.com",
      "institution_email": "john.doe@jkkn.ac.in",
      "phone": "9876543210",
      "staff_id": "STAFF001",
      "profile_picture": "https://example.com/profiles/john-doe.jpg",
      "address": "123 Main St",
      "state": "Tamil Nadu",
      "district": "Chennai",
      "pincode": "600001",
      "date_of_joining": "2020-06-15",
      "designation": "Associate Professor",
      "role_type": "faculty",
      "role_key": "hod",
      "category_id": "123e4567-e89b-12d3-a456-426614174111",
      "institution_id": "123e4567-e89b-12d3-a456-426614174222",
      "department_id": "123e4567-e89b-12d3-a456-426614174333",
      "is_active": true,
      "created_at": "2020-06-15T10:00:00Z",
      "updated_at": "2023-04-20T14:30:00Z",
      "has_extended_profile": true,
      "slug": "john-doe",
      "status": "published",
      "display_order": 0,
      "experience_years": 12,
      "research_papers": 18,
      "phd_scholars": 3,
      "awards_won": 4,
      "pg_dissertations_guided": 9,
      "ug_projects_guided": 22,
      "qualification_summary": "Ph.D in CSE",
      "professional_summary": "12+ years in academia and industry",
      "mentoring_description": "Active mentor for UG/PG projects",
      "google_scholar_url": "https://scholar.google.com/citations?user=xxx",
      "researchgate_url": null,
      "orcid_url": null,
      "badges": [],
      "qualifications": [
        { "degree": "Ph.D", "institution": "IIT Madras", "year": 2015 }
      ],
      "specialisations": ["Machine Learning", "NLP"],
      "experience_entries": [],
      "research_focus_areas": [],
      "publications": [],
      "funded_projects": [],
      "certifications": [],
      "awards": [],
      "memberships": [],
      "phd_scholars_list": [],
      "faqs": [],
      "achievements": [],
      "category": {
        "id": "123e4567-e89b-12d3-a456-426614174111",
        "category_name": "Teaching",
        "is_teaching": true,
        "shows_extended_profile": true
      },
      "institution": {
        "id": "123e4567-e89b-12d3-a456-426614174222",
        "name": "JKKN College of Engineering",
        "counselling_code": "2755"
      },
      "department": {
        "id": "123e4567-e89b-12d3-a456-426614174333",
        "department_name": "Computer Science"
      },
      "role": {
        "id": "123e4567-e89b-12d3-a456-426614174444",
        "role_key": "hod",
        "role_name": "Head of Department",
        "description": "Department head with approval authority",
        "is_system_role": false
      }
    }
  ],
  "metadata": {
    "total": 156,
    "page": 1,
    "limit": 10,
    "totalPages": 16,
    "returned": 10
  }
}
\`\`\`

#### Example Response (All Data, \`all=true\`)

\`\`\`json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "first_name": "John",
      "last_name": "Doe"
    }
  ],
  "metadata": {
    "total": 156,
    "all": true,
    "returned": 156
  }
}
\`\`\`

### \`GET /api/api-management/staff/{id}\`

Fetches details of a specific staff member by ID.

**URL Parameters**

- \`id\` — Staff member ID (UUID)

The detail response is shaped identically to a single \`data[]\` entry from the list endpoint, with all 29 extended-profile columns and embedded named entities present.

## Role-Based Fetching

Staff records carry two role-related fields that consumers can filter on. Pick the one that matches your intent — they are NOT interchangeable.

### \`role_type\` — coarse taxonomy

A high-level grouping of staff. Common values: \`faculty\`, \`admin\`, \`support\`, \`management\`. Use this when building directories, headcount reports, or anything that groups staff by job family.

### \`role_key\` — fine-grained role

References a row in the \`custom_roles\` table — drives actual permissions in MyJKKN. Examples: \`hod\`, \`principal\`, \`dean\`, \`faculty\`, \`admission_counselor\`, \`expo_counselor\`. Use this when you need to act on a specific permission-bearing role (workflow approvers, permission-aware integrations).

> **No DB CHECK constraint** — both fields are freeform strings. Treat unknown values defensively. The list above is conventional but new role keys can be added at any time via Role Management.

#### Fetch all faculty (\`role_type=faculty\`)

\`\`\`bash
curl -s "https://jkkn.ai/api/api-management/staff?role_type=faculty&is_active=true&limit=50" \\
  -H "Authorization: Bearer $JKKN_API_KEY" \\
  -H "Accept: application/json"
\`\`\`

#### Fetch only Heads of Department (\`role_key=hod\`)

\`\`\`bash
curl -s "https://jkkn.ai/api/api-management/staff?role_key=hod&is_active=true" \\
  -H "Authorization: Bearer $JKKN_API_KEY"
\`\`\`

#### Fetch faculty with published extended profiles

\`\`\`javascript
// Useful for building a public faculty directory page.
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
};
\`\`\`

#### Fetch counselors across both taxonomies (admission_counselor + expo_counselor)

\`\`\`javascript
// Two separate calls — combine client-side. role_key is single-valued
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
};
\`\`\`

#### Fetch faculty via B2A endpoint (lean response)

The \`/api/b2a/staff\` list returns a smaller payload per row (no extended-profile columns) — preferred for fast directory listings. Use \`/api/b2a/staff/{id}\` to fetch the full record.

\`\`\`bash
curl -s "https://jkkn.ai/api/b2a/staff?role_type=faculty&category_id=<UUID>&page=1&limit=20" \\
  -H "Authorization: Bearer $JKKN_API_KEY"
\`\`\`

## Common Use Cases

- **Faculty directory page** — render a public-facing faculty list with photos, departments, and bios:
  \`GET /api-management/staff?role_type=faculty&has_extended_profile=true&is_active=true&all=true\`
- **HOD approvers list** — resolve approvers for a department-level workflow (e.g. leave/OD):
  \`GET /api-management/staff?role_key=hod&department_id=<UUID>&is_active=true\`
- **Per-institution headcount by role** — use \`limit=1\` + read \`metadata.total\` for a fast count:
  \`GET /api-management/staff?institution_id=<UUID>&role_type=admin&limit=1\`
- **Search within a role** — combine \`search\` with \`role_key\` to resolve "Mr X" within a role:
  \`GET /api-management/staff?role_key=principal&search=raj&limit=10\`
- **Teaching staff in a category** — combine category filter with the response's \`category.is_teaching\`:
  \`GET /api-management/staff?category_id=<UUID>&is_active=true\`
- **One staff member's full record** — returns all 29 extended-profile columns plus category metadata:
  \`GET /api-management/staff/<UUID>\`

## Field Reference

Every \`*_id\` column in the response is paired with a named-entity object so consuming applications can render labels without a second API call:

- \`category_id\` → \`category.category_name\`
- \`institution_id\` → \`institution.name\` (+ \`counselling_code\`)
- \`department_id\` → \`department.department_name\`
- \`role_key\` → \`role.role_name\` (display label, e.g. "Head of Department") + \`role.description\`

All four embeds are present on \`/api/staff\`, \`/api/api-management/staff\`, AND \`/api/b2a/staff\` (list + detail). Use whichever endpoint matches your authentication model — the embed shape is identical.

| Field | Type | Description |
|-------|------|-------------|
| \`id\` | UUID | Primary key. |
| \`staff_id\` | string \\| null | Human-readable employee ID (org-defined). |
| \`first_name\` | string | Required. |
| \`last_name\` | string | Required. |
| \`gender\` | 'male' \\| 'female' \\| 'bigender' | — |
| \`date_of_birth\` | ISO date | — |
| \`marital_status\` | 'single' \\| 'married' \\| 'divorced' \\| 'widow' | — |
| \`blood_group\` | string \\| null | e.g. 'O+', 'AB-'. |
| \`email\` | string | Personal email. |
| \`institution_email\` | string | Org email — used to match staff to a user account. |
| \`phone\` | string | — |
| \`profile_picture\` | string \\| null | URL. |
| \`address, state, district, pincode\` | string \\| null | Address fields. |
| \`date_of_joining\` | ISO date | — |
| \`designation\` | string | Job title. Searchable via \`?designation=\` on B2A. |
| \`role_type\` | string \\| null | Coarse role taxonomy (faculty / admin / support / management). |
| \`role_key\` | string | Fine-grained role (matches \`custom_roles.role_key\`). |
| \`category_id\` | UUID | FK → \`employment_categories.id\`. |
| \`institution_id\` | UUID | FK → \`institutions.id\`. |
| \`department_id\` | UUID \\| null | FK → \`departments.id\`. Required when category.is_teaching = true. |
| \`is_active\` | boolean | — |
| \`has_extended_profile\` | boolean | Per-row opt-in for the 29 extended-profile fields below. |
| \`category\` | object | \`{ id, category_name, is_teaching, shows_extended_profile }\` — embedded category metadata. |
| \`institution\` | object | \`{ id, name, counselling_code }\` — display name paired with \`institution_id\`. |
| \`department\` | object \\| null | \`{ id, department_name }\` — display name paired with \`department_id\`. |
| \`role\` | object \\| null | \`{ id, role_key, role_name, description, is_system_role }\` — joined from \`custom_roles\`. |

### Extended Profile (gated by \`has_extended_profile\` + \`category.shows_extended_profile\`)

| Field | Type | Description |
|-------|------|-------------|
| \`slug\` | string \\| null | URL slug for public faculty page (UNIQUE). |
| \`status\` | 'draft' \\| 'published' | Publication state. Default 'draft'. |
| \`display_order\` | integer | Sort key for directory listings. |
| \`experience_years\` | integer | — |
| \`research_papers\` | integer | — |
| \`phd_scholars\` | integer | Count. |
| \`awards_won\` | integer | — |
| \`pg_dissertations_guided\` | integer | — |
| \`ug_projects_guided\` | integer | — |
| \`qualification_summary\` | string \\| null | Plain-text summary. |
| \`professional_summary\` | string \\| null | — |
| \`mentoring_description\` | string \\| null | — |
| \`google_scholar_url, researchgate_url, orcid_url\` | string \\| null | External profile URLs. |
| \`badges, qualifications, specialisations, experience_entries, research_focus_areas, publications, funded_projects, certifications, awards, memberships, phd_scholars_list, faqs, achievements\` | JSONB[] (default \`[]\`) | Structured arrays. Never null on the wire. |
| \`created_at, updated_at\` | ISO timestamp | — |

## Errors, Authentication & Rate Limits

### Error responses

| Status | Code | When |
|--------|------|------|
| 400 | \`INVALID_ID\` | Path parameter is not a valid UUID (B2A detail only). |
| 401 | — | Missing or malformed \`Authorization\` header; key not found; key revoked or expired. |
| 403 | — | Key lacks \`read\` permission for staff module. |
| 404 | \`NOT_FOUND\` | Detail endpoint and the staff record does not exist (or is outside the key's institution scope). |
| 429 | \`RATE_LIMIT_EXCEEDED\` | 60 requests / minute per API key on B2A endpoints. Honour \`Retry-After\`. |
| 500 | \`INTERNAL_ERROR\` | Unexpected server error. Safe to retry with backoff. |

Error body shape on B2A: \`{ "error": { "code": "...", "message": "..." } }\`.
On \`/api-management/*\`: \`{ "error": "..." }\`.

### Rate limiting

B2A endpoints (\`/api/b2a/staff*\`) are rate-limited to **60 requests per minute per API key**. Every response (success or 429) carries:

- \`X-RateLimit-Limit\` — fixed at 60.
- \`X-RateLimit-Remaining\` — calls left in the current window.
- \`X-RateLimit-Reset\` — ISO-8601 reset timestamp.
- \`Retry-After\` (429 only) — seconds to wait.

The \`/api-management/staff*\` endpoints have no per-key rate limit but are subject to the same rate-limit middleware as the rest of MyJKKN.

### CORS

\`/api-management/staff*\` sends permissive CORS headers (configured in \`lib/api-keys/cors.ts\`) and supports \`OPTIONS\` preflight. B2A endpoints are intended for server-to-server use — there is no CORS allowlist; calling them from a browser will fail unless your origin is proxied.

## Usage Examples

### Basic — fetch staff list

\`\`\`javascript
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

    return await response.json();
  } catch (error) {
    console.error('Error fetching staff:', error);
    throw error;
  }
};
\`\`\`

### Basic — fetch staff member

\`\`\`javascript
const fetchStaffMember = async (apiKey, staffId) => {
  try {
    const response = await fetch(\`https://jkkn.ai/api/api-management/staff/\${staffId}\`, {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Accept': 'application/json',
      }
    });
    if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching staff member:', error);
    throw error;
  }
};
\`\`\`

### Basic — fetch staff with filters

\`\`\`javascript
const fetchStaffWithFilters = async (apiKey, filters = {}) => {
  const url = new URL('https://jkkn.ai/api/api-management/staff');
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
  if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
  return await response.json();
};

const filters = {
  page: 1,
  limit: 20,
  search: 'John',
  institution_id: '1234',
  department_id: '5678',
  category_id: '9012',
  is_active: true
};

fetchStaffWithFilters(apiKey, filters);
\`\`\`

### Basic — fetch all staff (no pagination)

\`\`\`javascript
const fetchAllStaff = async (apiKey, filters = {}) => {
  const url = new URL('https://jkkn.ai/api/api-management/staff');
  url.searchParams.append('all', 'true');
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
  if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
  return await response.json();
};
\`\`\`

### Complete implementation — TypeScript service class

\`\`\`typescript
// staff-api.service.ts
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
      throw new Error(errorData.error || \`HTTP error! status: \${response.status}\`);
    }

    return response.json();
  }

  async getStaffList(filters: StaffFilters = {}): Promise<PaginatedResponse<StaffMember>> {
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
    return this.request<PaginatedResponse<StaffMember>>(\`/staff\${queryString}\`);
  }

  async getStaffMember(id: string): Promise<{ data: StaffMember }> {
    return this.request<{ data: StaffMember }>(\`/staff/\${id}\`);
  }
}
\`\`\`

## AI Prompt for Staff API

I need to implement a feature to fetch staff data from the MyJKKN API system. The API requires authentication using an API key.

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
\`\`\`
{
  "data": [...],
  "metadata": {
    "page": 1,
    "totalPages": 5,
    "total": 124
  }
}
\`\`\`

For staff data, the structure includes: id, first_name, last_name, gender, email, phone, institution_email, designation, department, institution, and more fields.

Please show me a complete implementation using Next.js 14, TypeScript, and TailwindCSS that follows best practices for API data fetching and error handling.
`;
