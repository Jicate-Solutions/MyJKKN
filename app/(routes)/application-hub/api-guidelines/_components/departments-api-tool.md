# Departments API Usage Guide

This guide explains how to properly fetch department details using the MyJKKN API.

## API Endpoint

```
GET /api/api-management/organizations/departments
```

## Authentication

All requests must include an API key in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

The API key must be active and have read permissions.

## Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| page | number | Page number for pagination | 1 |
| limit | number | Number of items per page | 10 |
| search | string | Search by department name or code | - |
| institution_id | string | Filter by institution ID | - |
| degree_id | string | Filter by degree ID | - |
| isActive | boolean | Filter by active status (true/false) | - |

## Response Format

```typescript
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
```

## Example Usage (JavaScript/TypeScript)

```javascript
async function fetchDepartments(apiKey, page = 1, limit = 10, search = '', institutionId = '', degreeId = '', isActive = null) {
  // Construct the URL with query parameters
  let url = `/api/api-management/organizations/departments?page=${page}&limit=${limit}`;
  
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }
  
  if (institutionId) {
    url += `&institution_id=${encodeURIComponent(institutionId)}`;
  }
  
  if (degreeId) {
    url += `&degree_id=${encodeURIComponent(degreeId)}`;
  }
  
  if (isActive !== null) {
    url += `&isActive=${isActive}`;
  }
  
  // Make the API request
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `API error: ${response.status}`);
  }
  
  return await response.json();
}
```

## Edge Function Example (Deno)

If you need to fetch departments from a serverless function, here's an example using Deno:

```javascript
// Edge function for fetching departments
async function getDepartments(req) {
  const API_KEY = Deno.env.get("MYJKKN_API_KEY");
  const API_BASE_URL = Deno.env.get("MYJKKN_API_BASE_URL") || "https://my-jkkn-nine.vercel.app";
  
  // Parse request parameters
  const url = new URL(req.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '10';
  const search = url.searchParams.get('search') || '';
  const institutionId = url.searchParams.get('institution_id') || '';
  const degreeId = url.searchParams.get('degree_id') || '';
  const isActive = url.searchParams.get('isActive') || '';
  
  // Construct the API URL with correct parameter names
  let apiUrl = `${API_BASE_URL}/api/api-management/organizations/departments?page=${page}&limit=${limit}`;
  
  if (search) {
    apiUrl += `&search=${encodeURIComponent(search)}`;
  }
  
  if (institutionId) {
    apiUrl += `&institution_id=${encodeURIComponent(institutionId)}`;
  }
  
  if (degreeId) {
    apiUrl += `&degree_id=${encodeURIComponent(degreeId)}`;
  }
  
  if (isActive) {
    apiUrl += `&isActive=${isActive}`;
  }
  
  // Make the request with the API key
  const response = await fetch(apiUrl, {
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}
```

## Common Issues and Solutions

1. **Parameter Naming**: 
   - Make sure to use `limit` (not `pageSize`) for pagination size
   - Use `search` (not `filter`) for text search

2. **API Key Format**:
   - Ensure the API key is in the format `Bearer YOUR_API_KEY`
   - The API key must be active and have read permissions

3. **Response Structure**:
   - The response includes both department data and nested institution/degree data
   - Check that your client code correctly handles this nested structure

4. **Error Handling**:
   - Always implement proper error handling for API requests
   - Check both HTTP status codes and error messages in the response body

## Need Help?

If you encounter any issues with the departments API, please contact the MyJKKN support team.
