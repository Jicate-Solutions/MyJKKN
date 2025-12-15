# MyJKKN Integration Guide

> Build connected applications using MyJKKN APIs

---

## Overview

This guide helps developers build applications that integrate with MyJKKN. Whether you're building a student mobile app, parent portal, or specialized module, this documentation provides everything needed.

### What is MyJKKN?

MyJKKN is a comprehensive educational management platform for JKKN educational institutions. It provides:

- **19 Modules**: Organizations, Students, Users, Academic, Billing, Staff, and more
- **68 Database Tables**: Complete educational data model
- **1200+ Fields**: Detailed entity tracking
- **REST API**: Standardized endpoints for all operations
- **Multi-tenant**: Institution-isolated data access

---

## Integration Documents

| Document | Description |
|----------|-------------|
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Auth flow, tokens, session management |
| [API_REFERENCE.md](./API_REFERENCE.md) | Complete endpoint documentation |
| [PERMISSIONS.md](./PERMISSIONS.md) | Permission system and requirements |
| [EXAMPLES.md](./EXAMPLES.md) | Code examples in multiple languages |

---

## Quick Start

### 1. Authentication

```typescript
// Login to get session
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@jkkn.ac.in',
  password: 'password'
});

// Session tokens in data.session
const accessToken = data.session?.access_token;
```

### 2. Make API Calls

```typescript
// Fetch data with authentication
const response = await fetch('/api/api-management/students/list', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

const students = await response.json();
```

### 3. Handle Responses

```typescript
// Standard response format
interface ApiResponse<T> {
  data: T;
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Error response
interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
```

---

## Architecture Overview

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 15.5.7 |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (SSR) |
| API | Next.js API Routes |
| State | React Query + Zustand |

### API Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT APPLICATION                                              │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   React     │    │   React     │    │   API       │         │
│  │   Query     │───▶│   Hooks     │───▶│   Client    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEXT.JS API ROUTES                                              │
│  /api/[module]/[entity]/route.ts                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Request Validation → Auth Check → Permission Check →    │   │
│  │  Service Layer → Database Query → Response Formatting   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER                                                   │
│  lib/services/[module]/[entity]-service.ts                      │
│                                                                  │
│  - Business logic                                                │
│  - Data validation                                               │
│  - Relationship handling                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE (PostgreSQL)                                          │
│                                                                  │
│  - Row Level Security (RLS)                                     │
│  - Institution-scoped queries                                   │
│  - Foreign key relationships                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Pattern

### Read Endpoints (GET)

```
GET /api/api-management/{module}/{entity}
```

- Uses `api-management` prefix for read operations
- Supports filtering, pagination, sorting
- Returns related entities when needed

### Write Endpoints (POST/PUT/DELETE)

```
POST   /api/{module}/{entity}
PUT    /api/{module}/{entity}/:id
DELETE /api/{module}/{entity}/:id
```

- Direct module paths for write operations
- Requires appropriate permissions
- Validates data against schema

---

## Common Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search across text fields |
| `institution_id` | UUID | Filter by institution |
| `page` | number | Page number (1-based) |
| `limit` | number | Items per page (default: 10) |
| `sortBy` | string | Field to sort by |
| `sortDirection` | 'asc' \| 'desc' | Sort direction |
| `isActive` | boolean | Filter by active status |

### Academic Hierarchy Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `degree_id` | UUID | Filter by degree |
| `department_id` | UUID | Filter by department |
| `program_id` | UUID | Filter by program |
| `semester_id` | UUID | Filter by semester |
| `section_id` | UUID | Filter by section |

---

## Response Format

### Success Response

```json
{
  "data": [...],
  "metadata": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### Single Item Response

```json
{
  "data": {
    "id": "uuid",
    ...
  }
}
```

### Error Response

```json
{
  "error": "Unauthorized",
  "message": "You do not have permission to access this resource",
  "statusCode": 403
}
```

---

## Institution Context

All operations are institution-scoped. The current institution is determined by:

1. **User's Default Institution**: Set in profile preferences
2. **Session Context**: Selected institution in UI
3. **URL Parameter**: `institution_id` in API calls

### Multi-Institution Access

Users can have access to multiple institutions:
- Full access: Read/Write all data
- Read-only access: Read data only
- Billing-only access: Limited to billing module

See [PERMISSIONS.md](./PERMISSIONS.md) for details.

---

## Rate Limiting

| Tier | Requests/Minute | Burst |
|------|-----------------|-------|
| Standard | 60 | 10 |
| Premium | 300 | 50 |
| Internal | Unlimited | - |

---

## Webhooks (Future)

Planned webhook events:
- `student.created`, `student.updated`
- `bill.created`, `payment.received`
- `attendance.marked`

---

## Support

- **Documentation**: This guide and module-specific docs
- **API Explorer**: Available in development mode
- **Issues**: Report via institutional IT support

---

*Last Updated: December 2024*
