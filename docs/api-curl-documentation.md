# MyJKKN API CURL Documentation

This comprehensive guide provides CURL commands to test all MyJKKN API endpoints. Use this documentation to validate your API key and test various endpoints.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Authentication](#authentication)
3. [Students API](#students-api)
4. [Staff API](#staff-api)
5. [Organizations API](#organizations-api)
6. [Error Handling](#error-handling)
7. [Testing Scripts](#testing-scripts)

---

## Prerequisites

Before using these CURL commands, ensure you have:

- A valid API key in format: `jk_xxxxx_xxxxx`
- CURL installed on your system
- Internet connection to reach `https://myadmin.jkkn.ac.in`

## Authentication

All API requests require authentication using a Bearer token:

```bash
Authorization: Bearer YOUR_API_KEY
```

### Test API Key Validity

```bash
# Basic connectivity test
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?limit=1" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\nTotal Time: %{time_total}s\n"
```

---

## Students API

### 1. List All Students (Basic)

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 2. List Students with Pagination

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 3. Search Students by Name

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?search=John&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 4. Filter Students by Institution

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?institution_id=YOUR_INSTITUTION_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 5. Filter Students by Profile Completion Status

```bash
# Complete profiles only
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?is_profile_complete=true&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"

# Incomplete profiles only
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?is_profile_complete=false&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 6. Get Student by ID

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students/STUDENT_ID_HERE" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 7. Complex Student Filtering

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?search=Engineering&institution_id=YOUR_INSTITUTION_ID&department_id=YOUR_DEPARTMENT_ID&program_id=YOUR_PROGRAM_ID&is_profile_complete=true&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

---

## Staff API

### 1. List All Staff (Basic)

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 2. List Staff with Pagination

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 3. Search Staff by Name

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?search=Professor&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 4. Filter Staff by Institution

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?institution_id=YOUR_INSTITUTION_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 5. Filter Staff by Department

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?department_id=YOUR_DEPARTMENT_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 6. Filter Staff by Active Status

```bash
# Active staff only
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?is_active=true&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"

# Inactive staff only
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?is_active=false&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 7. Get Staff Member by ID

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff/STAFF_ID_HERE" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 8. Complex Staff Filtering

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/staff?search=Computer&institution_id=YOUR_INSTITUTION_ID&department_id=YOUR_DEPARTMENT_ID&category_id=YOUR_CATEGORY_ID&is_active=true&page=1&limit=15" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

---

## Organizations API

### Institutions

#### 1. List All Institutions

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/institutions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 2. List Institutions with Pagination

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/institutions?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 3. Search Institutions by Name

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/institutions?search=JKKN&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 4. Filter Institutions by Active Status

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/institutions?isActive=true&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### Degrees

#### 1. List All Degrees

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/degrees" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 2. Search Degrees by Name

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/degrees?search=Engineering&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 3. Filter Degrees by Institution

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/degrees?institution_id=YOUR_INSTITUTION_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### Departments

#### 1. List All Departments

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/departments" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 2. Search Departments by Name

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/departments?search=Computer&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 3. Filter Departments by Institution and Degree

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/departments?institution_id=YOUR_INSTITUTION_ID&degree_id=YOUR_DEGREE_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### Programs

#### 1. List All Programs

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/programs" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 2. Filter Programs by Multiple Parameters

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/programs?institution_id=YOUR_INSTITUTION_ID&degree_id=YOUR_DEGREE_ID&department_id=YOUR_DEPARTMENT_ID&isActive=true&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### Courses

#### 1. List All Courses

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/courses" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 2. Search Courses by Name or Code

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/courses?search=Mathematics&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

#### 3. Filter Courses by All Parameters

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/organizations/courses?institution_id=YOUR_INSTITUTION_ID&degree_id=YOUR_DEGREE_ID&department_id=YOUR_DEPARTMENT_ID&program_id=YOUR_PROGRAM_ID&isActive=true&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

---

## Error Handling

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (Invalid parameters)
- `401` - Unauthorized (Invalid or missing API key)
- `403` - Forbidden (API key lacks permissions)
- `404` - Not Found (Resource doesn't exist)
- `429` - Too Many Requests (Rate limit exceeded)
- `500` - Internal Server Error

### Testing Error Responses

#### 1. Test Invalid API Key

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?limit=1" \
  -H "Authorization: Bearer invalid_api_key" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"
```

#### 2. Test Missing Authorization Header

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?limit=1" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"
```

#### 3. Test Invalid Endpoint

```bash
curl -X GET "https://myadmin.jkkn.ac.in/api/api-management/invalid-endpoint" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"
```

---

## Testing Scripts

### Batch Test Script (Bash)

Create a file named `api_test.sh`:

```bash
#!/bin/bash

# Configuration
API_KEY="YOUR_API_KEY_HERE"
BASE_URL="https://myadmin.jkkn.ac.in/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local description=$2

    echo -e "${YELLOW}Testing: $description${NC}"
    echo "Endpoint: $endpoint"

    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -X GET "$BASE_URL$endpoint" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Accept: application/json" \
        -H "Content-Type: application/json")

    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_status" -eq 200 ]; then
        echo -e "${GREEN}✓ Success (Status: $http_status)${NC}"
        echo "Response preview: $(echo "$body" | head -c 200)..."
    else
        echo -e "${RED}✗ Failed (Status: $http_status)${NC}"
        echo "Error: $body"
    fi
    echo "----------------------------------------"
}

# Test all endpoints
echo "Starting API Tests..."
echo "========================================"

# Students API
test_endpoint "/api-management/students?limit=2" "Students List (Limited)"
test_endpoint "/api-management/students?search=test&limit=1" "Students Search"

# Staff API
test_endpoint "/api-management/staff?limit=2" "Staff List (Limited)"
test_endpoint "/api-management/staff?is_active=true&limit=1" "Active Staff"

# Organizations API
test_endpoint "/api-management/organizations/institutions?limit=2" "Institutions List"
test_endpoint "/api-management/organizations/degrees?limit=2" "Degrees List"
test_endpoint "/api-management/organizations/departments?limit=2" "Departments List"
test_endpoint "/api-management/organizations/programs?limit=2" "Programs List"
test_endpoint "/api-management/organizations/courses?limit=2" "Courses List"

echo "API Tests Completed!"
```

### PowerShell Test Script (Windows)

Create a file named `api_test.ps1`:

```powershell
# Configuration
$ApiKey = "YOUR_API_KEY_HERE"
$BaseUrl = "https://myadmin.jkkn.ac.in/api"

# Function to test endpoint
function Test-Endpoint {
    param(
        [string]$Endpoint,
        [string]$Description
    )

    Write-Host "Testing: $Description" -ForegroundColor Yellow
    Write-Host "Endpoint: $Endpoint"

    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Accept" = "application/json"
        "Content-Type" = "application/json"
    }

    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl$Endpoint" -Method Get -Headers $headers
        Write-Host "✓ Success" -ForegroundColor Green
        Write-Host "Response preview: $($response | ConvertTo-Json -Depth 1 | Out-String -Stream | Select-Object -First 5)"
    }
    catch {
        Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host "----------------------------------------"
}

# Test all endpoints
Write-Host "Starting API Tests..." -ForegroundColor Cyan
Write-Host "========================================"

# Students API
Test-Endpoint "/api-management/students?limit=2" "Students List (Limited)"

# Staff API
Test-Endpoint "/api-management/staff?limit=2" "Staff List (Limited)"

# Organizations API
Test-Endpoint "/api-management/organizations/institutions?limit=2" "Institutions List"
Test-Endpoint "/api-management/organizations/degrees?limit=2" "Degrees List"

Write-Host "API Tests Completed!" -ForegroundColor Cyan
```

### JSON Response Format

All successful API responses follow this structure:

```json
{
  "data": [
    {
      // Resource-specific fields
    }
  ],
  "metadata": {
    "page": 1,
    "limit": 10,
    "total": 124,
    "totalPages": 13
  }
}
```

### Tips for Testing

1. **Start Simple**: Begin with basic endpoints without filters
2. **Check Status Codes**: Always verify HTTP status codes
3. **Validate JSON**: Ensure responses are valid JSON
4. **Test Pagination**: Try different page numbers and limits
5. **Test Filters**: Gradually add filters to complex queries
6. **Monitor Rate Limits**: Don't exceed API rate limits
7. **Save Responses**: Save sample responses for reference

### Rate Limiting

- Be respectful with API calls
- Add delays between requests if testing multiple endpoints
- Monitor for 429 status codes (Too Many Requests)

### Security Notes

- Never commit API keys to version control
- Use environment variables for API keys in scripts
- Rotate API keys regularly
- Monitor API key usage

---

## Troubleshooting

### Common Issues

1. **401 Unauthorized**

   - Verify API key format: `jk_xxxxx_xxxxx`
   - Check Authorization header format: `Bearer YOUR_API_KEY`

2. **400 Bad Request**

   - Check query parameter names and values
   - Ensure proper URL encoding

3. **404 Not Found**

   - Verify endpoint URLs
   - Check if resource IDs exist

4. **Network Issues**
   - Test connectivity to `https://myadmin.jkkn.ac.in`
   - Check firewall settings

### Debug Mode

Add `-v` flag to CURL for verbose output:

```bash
curl -v -X GET "https://myadmin.jkkn.ac.in/api/api-management/students?limit=1" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

This documentation provides comprehensive CURL examples for testing all MyJKKN API endpoints. Replace `YOUR_API_KEY` with your actual API key and adjust parameters as needed for your testing requirements.
