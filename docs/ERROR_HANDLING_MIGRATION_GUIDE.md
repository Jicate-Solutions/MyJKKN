# Error Handling Migration Guide

## Overview

This guide explains how to migrate existing services and API routes to use the new comprehensive error handling system.

## New Error Handling System Components

### 1. Error Classes (`lib/errors/app-errors.ts`)

Custom error classes for different error types:

- **AppError** - Base error class
- **ValidationError** - Input validation errors (400)
- **AuthenticationError** - Authentication required (401)
- **AuthorizationError** - Permission denied (403)
- **NotFoundError** - Resource not found (404)
- **ConflictError** - Data conflicts (409)
- **RateLimitError** - Too many requests (429)
- **DatabaseError** - Database operation failures (500)
- **ExternalServiceError** - External service issues (503)
- **FileProcessingError** - File processing errors (422)
- **BusinessLogicError** - Business rule violations (422)

### 2. Error Logger (`lib/utils/error-logger.ts`)

Centralized logging with sanitization:

- `ErrorLogger.log(error, context)` - Log errors with context
- `ErrorLogger.sanitizeForClient(error)` - Safe error messages for clients
- `ErrorLogger.warn(message, context)` - Log warnings
- `ErrorLogger.info(message, context)` - Log info events

### 3. API Error Handler (`lib/utils/api-error-handler.ts`)

Standardized API error responses:

- `handleApiError(error, context)` - Standard error response
- `successResponse(data, message, statusCode)` - Standard success response
- `withErrorHandler(handler, context)` - Wrap handlers with error handling

### 4. Error Boundaries

- **Global**: `app/error.tsx` - Catches all unhandled errors
- **Module-specific**: `app/(routes)/[module]/error.tsx` - Module context

## Migration Steps

### Step 1: Update Service Files

**BEFORE (Bad):**

```typescript
static async getResource(id: string) {
  try {
    const { data, error } = await supabase
      .from('table')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error; // Generic!
    return data;
  } catch (error) {
    console.error('Error:', error); // Logged but no context
    throw error; // No custom error type
  }
}
```

**AFTER (Good):**

```typescript
import {
  ValidationError,
  NotFoundError,
  fromSupabaseError
} from '@/lib/errors/app-errors';
import { ErrorLogger } from '@/lib/utils/error-logger';

static async getResource(id: string, institutionId?: string) {
  try {
    // 1. Validate input
    if (!id) {
      throw new ValidationError('Resource ID is required');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationError('Invalid ID format');
    }

    // 2. Build query with authorization
    let query = this.supabase
      .from('table')
      .select('*')
      .eq('id', id);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    // 3. Execute query
    const { data, error } = await query.single();

    // 4. Handle errors specifically
    if (error) {
      throw fromSupabaseError(error, 'Resource');
    }

    if (!data) {
      throw new NotFoundError('Resource');
    }

    return data;
  } catch (error) {
    // 5. Log with context
    ErrorLogger.log(error as Error, {
      method: 'ServiceName.getResource',
      id,
      institutionId
    });

    // 6. Re-throw for caller to handle
    throw error;
  }
}
```

### Step 2: Update API Routes

**BEFORE (Bad):**

```typescript
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    const data = await Service.get(id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Something went wrong' }, // Generic!
      { status: 500 }
    );
  }
}
```

**AFTER (Good):**

```typescript
import { handleApiError, successResponse } from '@/lib/utils/api-error-handler';
import { ValidationError } from '@/lib/errors/app-errors';

export async function GET(req: NextRequest) {
  try {
    // 1. Extract and validate parameters
    const id = req.nextUrl.searchParams.get('id');

    if (!id) {
      throw new ValidationError('ID parameter is required');
    }

    // 2. Call service
    const data = await Service.get(id);

    // 3. Return standardized success response
    return successResponse(data);
  } catch (error) {
    // 4. Handle error with context
    return handleApiError(error, {
      route: '/api/resource',
      method: 'GET',
      params: { id: req.nextUrl.searchParams.get('id') }
    });
  }
}
```

### Step 3: Add Module Error Boundaries

Create `app/(routes)/[module]/error.tsx` for each module:

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
    console.error('[Module Error]', {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Module Error
        </h2>

        <p className="mb-6 text-muted-foreground">
          There was an error. Please try again.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 rounded-lg bg-muted p-4 text-left">
            <p className="text-sm font-mono text-destructive">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            onClick={() => router.push('/module')}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Module
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Common Error Patterns

### 1. Validation Errors

```typescript
// Input validation
if (!data.name || data.name.trim().length === 0) {
  throw new ValidationError('Name is required');
}

// Format validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  throw new ValidationError('Invalid email format');
}

// Range validation
if (age < 0 || age > 150) {
  throw new ValidationError('Age must be between 0 and 150');
}
```

### 2. Authorization Errors

```typescript
// Check user is logged in
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) {
  throw new AuthenticationError();
}

// Check institution access
if (institutionId && resource.institution_id !== institutionId) {
  throw new AuthorizationError('Access denied to this resource');
}
```

### 3. Not Found Errors

```typescript
// Resource not found
const { data, error } = await query.single();

if (error?.code === 'PGRST116') {
  throw new NotFoundError('Resource');
}

if (!data) {
  throw new NotFoundError('Resource');
}
```

### 4. Database Errors

```typescript
// Use fromSupabaseError for automatic error conversion
if (error) {
  throw fromSupabaseError(error, 'Resource operation');
}

// Or create specific database error
if (error.code === '23505') {
  throw new ConflictError('Resource already exists');
}
```

### 5. Business Logic Errors

```typescript
// Business rule violation
if (student.status === 'graduated') {
  throw new BusinessLogicError('Cannot enroll graduated student');
}

// Insufficient data
if (billAmount > wallet.balance) {
  throw new BusinessLogicError('Insufficient wallet balance');
}
```

## Error Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Response

```json
{
  "success": false,
  "error": "User-friendly error message",
  "code": "ERROR_CODE",
  "details": { ... } // Optional, for validation errors
}
```

## Testing Error Handling

### 1. Test Input Validation

```typescript
// Should throw ValidationError
await expect(Service.create({ name: '' })).rejects.toThrow(ValidationError);
```

### 2. Test Authorization

```typescript
// Should throw AuthorizationError
await expect(Service.get(id, wrongInstitutionId)).rejects.toThrow(AuthorizationError);
```

### 3. Test Not Found

```typescript
// Should throw NotFoundError
await expect(Service.get('non-existent-id')).rejects.toThrow(NotFoundError);
```

## Security Considerations

1. **Never expose internal errors** - Use `ErrorLogger.sanitizeForClient()`
2. **Don't log sensitive data** - Redact user data in error logs
3. **Sanitize search inputs** - Prevent SQL injection
4. **Always validate input** - Before database operations
5. **Use fromSupabaseError** - Proper error code translation

## Checklist for Each Service Method

- [ ] Add input validation
- [ ] Use custom error classes
- [ ] Add proper error logging with context
- [ ] Re-throw errors (don't swallow)
- [ ] Include institution_id filtering for authorization
- [ ] Sanitize search inputs
- [ ] Handle all error cases specifically

## Checklist for Each API Route

- [ ] Wrap in try-catch
- [ ] Validate query parameters
- [ ] Use `handleApiError` for errors
- [ ] Use `successResponse` for success
- [ ] Return proper HTTP status codes
- [ ] Log errors with route context

## Priority Files to Update

### High Priority (User-Facing)

1. `lib/services/billing/**/*-service.ts` - Billing operations
2. `lib/services/grievance/**/*-service.ts` - Grievance handling
3. `lib/services/stakeholder-nps/**/*-service.ts` - NPS surveys
4. `app/api/billing/**/route.ts` - Billing API routes
5. `app/api/grievance/**/route.ts` - Grievance API routes

### Medium Priority (Core Operations)

6. `lib/services/organization/**/*-service.ts` - Organization services
7. `lib/services/academic/**/*-service.ts` - Academic services
8. `app/api/organizations/**/route.ts` - Organization API routes

### Low Priority (Internal)

9. Other services and utilities

## Examples

See these files for complete examples:

- **Service**: `lib/services/examples/service-with-error-handling.example.ts`
- **API Route**: `app/api/examples/resources/route.example.ts`
- **Error Boundary**: `app/(routes)/billing/error.tsx`

## FAQ

**Q: Should I catch and log errors in services?**
A: Yes, log with context, then re-throw. Let the API route handle the response.

**Q: When should I use DatabaseError vs fromSupabaseError?**
A: Use `fromSupabaseError` - it automatically converts Supabase errors to appropriate custom errors.

**Q: Can I create custom error classes for my module?**
A: Yes, extend `AppError` and set appropriate code and status code.

**Q: How do I handle errors in React components?**
A: Use error boundaries. Service calls should throw, boundaries catch and display.

**Q: Should I display error.message to users?**
A: Only for operational errors (ValidationError, NotFoundError). Use `sanitizeForClient()`.

## Next Steps

1. Update core billing services (highest impact)
2. Update all TQM module services
3. Update all API routes
4. Add comprehensive error boundaries
5. Test error handling thoroughly
6. Monitor production errors

## Resources

- [Error Classes](../lib/errors/app-errors.ts)
- [Error Logger](../lib/utils/error-logger.ts)
- [API Error Handler](../lib/utils/api-error-handler.ts)
- [Example Service](../lib/services/examples/service-with-error-handling.example.ts)
- [Example Route](../app/api/examples/resources/route.example.ts)
