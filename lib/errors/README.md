# Error Handling System

## Overview

Comprehensive error handling system for MyJKKN with custom error classes, centralized logging, and standardized API responses.

## Quick Start

```typescript
// Import everything you need
import {
  ValidationError,
  NotFoundError,
  ErrorLogger,
  handleApiError,
  successResponse,
  fromSupabaseError
} from '@/lib/errors';

// In a service
static async getResource(id: string) {
  try {
    if (!id) {
      throw new ValidationError('ID is required');
    }

    const { data, error } = await supabase
      .from('table')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw fromSupabaseError(error, 'Resource');
    }

    if (!data) {
      throw new NotFoundError('Resource');
    }

    return data;
  } catch (error) {
    ErrorLogger.log(error as Error, {
      method: 'getResource',
      id
    });
    throw error;
  }
}

// In an API route
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');

    if (!id) {
      throw new ValidationError('ID parameter is required');
    }

    const data = await Service.getResource(id);
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/resource',
      method: 'GET'
    });
  }
}
```

## Error Classes

### AppError (Base Class)

```typescript
new AppError(
  message: string,
  code: string,
  statusCode?: number,
  isOperational?: boolean
)
```

All custom errors extend this base class.

### ValidationError (400)

```typescript
// Simple validation error
throw new ValidationError('Name is required');

// With field-specific details
throw new ValidationError('Validation failed', {
  email: ['Invalid format'],
  password: ['Too short']
});
```

Use for:
- Missing required fields
- Invalid format
- Out of range values
- Business rule violations

### AuthenticationError (401)

```typescript
throw new AuthenticationError('You must be logged in');
```

Use for:
- Missing authentication
- Invalid credentials
- Expired sessions

### AuthorizationError (403)

```typescript
throw new AuthorizationError('Access denied to this resource');
```

Use for:
- Insufficient permissions
- Cross-institution access attempts
- Role-based access violations

### NotFoundError (404)

```typescript
throw new NotFoundError('Student');
// Message: "Student not found"
```

Use for:
- Resource doesn't exist
- Access denied (for security - don't reveal existence)

### ConflictError (409)

```typescript
throw new ConflictError('Email already registered');
```

Use for:
- Duplicate records
- Concurrent modification
- State conflicts

### RateLimitError (429)

```typescript
throw new RateLimitError('Too many login attempts');
```

Use for:
- Rate limiting
- Throttling

### DatabaseError (500)

```typescript
// Non-operational - don't expose to clients
throw new DatabaseError('Connection failed', originalError);
```

Use for:
- Database connection issues
- Query execution failures
- Transaction errors

### ExternalServiceError (503)

```typescript
throw new ExternalServiceError('Payment Gateway', 'Timeout');
```

Use for:
- Third-party API failures
- External service timeouts
- Integration errors

### FileProcessingError (422)

```typescript
throw new FileProcessingError('Invalid CSV format');
```

Use for:
- File upload errors
- Format validation
- Processing failures

### BusinessLogicError (422)

```typescript
throw new BusinessLogicError('Cannot enroll graduated student');
```

Use for:
- Business rule violations
- Workflow constraints
- Domain-specific errors

## Error Logger

### Log Errors

```typescript
ErrorLogger.log(error: Error, context?: ErrorContext)
```

```typescript
try {
  // ... operation
} catch (error) {
  ErrorLogger.log(error as Error, {
    method: 'ServiceName.methodName',
    userId: userId,
    institutionId: institutionId,
    // Don't log sensitive data!
  });
  throw error;
}
```

### Log Warnings

```typescript
ErrorLogger.warn(message: string, context?: ErrorContext)
```

```typescript
if (!optionalField) {
  ErrorLogger.warn('Optional field missing', {
    method: 'processData',
    field: 'optionalField'
  });
}
```

### Log Info

```typescript
ErrorLogger.info(message: string, context?: ErrorContext)
```

```typescript
ErrorLogger.info('Bulk operation completed', {
  method: 'importStudents',
  count: students.length
});
```

### Sanitize for Client

```typescript
const clientError = ErrorLogger.sanitizeForClient(error);
// { message: "User-friendly message", code: "ERROR_CODE" }
```

Only operational errors are sent to clients. Internal errors are hidden.

## API Error Handler

### Handle Errors

```typescript
handleApiError(error: unknown, context?: ErrorContext): NextResponse
```

```typescript
export async function POST(req: NextRequest) {
  try {
    // ... operation
  } catch (error) {
    return handleApiError(error, {
      route: '/api/billing/invoices',
      method: 'POST',
      params: { institutionId }
    });
  }
}
```

Returns:
```json
{
  "success": false,
  "error": "User-friendly message",
  "code": "ERROR_CODE",
  "details": { ... } // Optional, for validation errors
}
```

### Success Response

```typescript
successResponse<T>(data: T, message?: string, statusCode?: number): NextResponse
```

```typescript
// Basic success
return successResponse(data);

// With message
return successResponse(data, 'Invoice created successfully');

// Custom status code
return successResponse(data, 'Created', 201);
```

Returns:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

### Wrap Handler

```typescript
withErrorHandler<T>(handler: T, context?: ErrorContext): T
```

```typescript
export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const data = await Service.getData();
    return successResponse(data);
  },
  {
    route: '/api/data',
    method: 'GET'
  }
);
```

## Supabase Error Conversion

```typescript
fromSupabaseError(error: any, context?: string): AppError
```

Automatically converts Supabase errors to appropriate custom errors:

| Supabase Code | Custom Error | HTTP Status |
|--------------|--------------|-------------|
| PGRST116 | NotFoundError | 404 |
| 23505 | ConflictError | 409 |
| 23503 | ValidationError | 400 |
| 42501 | AuthorizationError | 403 |
| Other | DatabaseError | 500 |

```typescript
const { data, error } = await supabase.from('table').select();

if (error) {
  throw fromSupabaseError(error, 'Student data');
}
```

## Error Boundaries

### Global Error Boundary

Located at `app/error.tsx` - catches all unhandled errors.

### Module Error Boundaries

Located at `app/(routes)/[module]/error.tsx` - provides module-specific context.

Create for each major module:

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ModuleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Module Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      {/* Error UI */}
    </div>
  );
}
```

## Best Practices

### 1. Validate Input Early

```typescript
// ✅ Good
if (!id) {
  throw new ValidationError('ID is required');
}

// ❌ Bad
const { data } = await supabase.from('table').eq('id', id);
// Null/undefined passed to database
```

### 2. Use Specific Errors

```typescript
// ✅ Good
if (error.code === 'PGRST116') {
  throw new NotFoundError('Student');
}

// ❌ Bad
throw new Error('Not found');
```

### 3. Log with Context

```typescript
// ✅ Good
ErrorLogger.log(error, {
  method: 'BillingService.createInvoice',
  studentId: studentId,
  institutionId: institutionId
});

// ❌ Bad
console.error('Error:', error);
```

### 4. Re-throw Errors

```typescript
// ✅ Good
try {
  // operation
} catch (error) {
  ErrorLogger.log(error as Error, context);
  throw error; // Let caller handle
}

// ❌ Bad
try {
  // operation
} catch (error) {
  console.error(error);
  return null; // Swallowed!
}
```

### 5. Don't Expose Internals

```typescript
// ✅ Good
throw fromSupabaseError(error, 'Invoice');
// Client sees: "Invoice not found"

// ❌ Bad
throw error;
// Client sees: "relation 'billing_invoices' does not exist"
```

### 6. Handle All Error Paths

```typescript
// ✅ Good
if (error) {
  throw fromSupabaseError(error);
}

if (!data) {
  throw new NotFoundError('Resource');
}

return data;

// ❌ Bad
if (error) throw error;
return data; // Could be null!
```

### 7. Sanitize Search Input

```typescript
// ✅ Good
private static sanitizeSearch(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

// ❌ Bad
.ilike('name', `%${userInput}%`) // SQL injection!
```

## Testing

```typescript
import { ValidationError, NotFoundError } from '@/lib/errors';

describe('StudentService', () => {
  it('should throw ValidationError for empty ID', async () => {
    await expect(
      StudentService.getStudent('')
    ).rejects.toThrow(ValidationError);
  });

  it('should throw NotFoundError for non-existent student', async () => {
    await expect(
      StudentService.getStudent('non-existent-id')
    ).rejects.toThrow(NotFoundError);
  });
});
```

## HTTP Status Code Reference

| Code | Error Type | Use Case |
|------|------------|----------|
| 400 | ValidationError | Invalid input |
| 401 | AuthenticationError | Not logged in |
| 403 | AuthorizationError | No permission |
| 404 | NotFoundError | Resource not found |
| 409 | ConflictError | Duplicate/conflict |
| 422 | BusinessLogicError, FileProcessingError | Business rules |
| 429 | RateLimitError | Rate limiting |
| 500 | DatabaseError | Internal error |
| 503 | ExternalServiceError | Service unavailable |

## Migration Guide

See [ERROR_HANDLING_MIGRATION_GUIDE.md](../../docs/ERROR_HANDLING_MIGRATION_GUIDE.md) for step-by-step migration instructions.

## Examples

- **Service**: `lib/services/examples/service-with-error-handling.example.ts`
- **API Route**: `app/api/examples/resources/route.example.ts`
- **Tests**: `lib/errors/__tests__/error-handling.test.ts`

## FAQ

**Q: When should I log errors?**
A: In services, log before re-throwing. In API routes, `handleApiError` logs automatically.

**Q: Should I catch errors in React components?**
A: No, use error boundaries. Let errors bubble up.

**Q: Can I create custom error classes?**
A: Yes, extend `AppError` and set appropriate code and status.

**Q: How do I test error handling?**
A: Use `expect().rejects.toThrow(ErrorClass)`.

**Q: Should I display error.message to users?**
A: Only for operational errors. Use `sanitizeForClient()`.
