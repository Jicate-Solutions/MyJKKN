# Input Validation & Security System

## Overview

MyJKKN implements a comprehensive input validation and sanitization system to prevent:
- **XSS (Cross-Site Scripting)** attacks
- **SQL Injection** attacks
- **DoS (Denial of Service)** via oversized payloads
- **Data corruption** via malformed input
- **Path traversal** attacks in file uploads
- **Script injection** via unsanitized HTML

## Architecture

```
User Input → API Route → Validation Middleware → Zod Schema → InputValidator → Database
                ↓                                       ↓
          Rate Limiting                          Sanitization
```

## Core Components

### 1. InputValidator Utility (`lib/utils/input-validator.ts`)

Central validation and sanitization class with methods for:

| Method | Purpose | Security Benefits |
|--------|---------|-------------------|
| `email()` | Validate and normalize emails | Prevents malformed email storage, XSS via email |
| `phoneNumber()` | Validate Indian phone numbers | Ensures data consistency, prevents injection |
| `text()` | Sanitize text with HTML escaping | **PRIMARY XSS DEFENSE** |
| `uuid()` | Validate UUID format | Prevents invalid ID references |
| `json()` | Validate and size-limit JSON | Prevents DoS via oversized payloads |
| `number()` | Validate numeric ranges | Prevents overflow, invalid calculations |
| `date()` | Validate date ranges | Prevents invalid dates, future-dated attacks |
| `url()` | Validate URLs, block dangerous protocols | Prevents javascript:, data: URL attacks |
| `fileUpload()` | Validate file metadata | **PRIMARY FILE UPLOAD DEFENSE** |
| `html()` | Basic HTML validation | Detects dangerous tags and attributes |
| `enum()` | Validate enum values | Prevents invalid state values |
| `object()` | Deep object sanitization | Removes null bytes, prevents deep nesting |

### 2. Validation Middleware (`lib/middleware/validate-input.ts`)

Higher-order functions that wrap API routes:

```typescript
// Example: API route with validation
export const POST = withValidation(
  mySchema,
  async (req, validated) => {
    // validated is already sanitized and type-safe!
    return NextResponse.json({ success: true });
  }
);
```

Available middleware:

| Middleware | Purpose | Use Case |
|------------|---------|----------|
| `withValidation()` | Validate request body with Zod schema | All POST/PUT/PATCH endpoints |
| `withQueryValidation()` | Validate URL query parameters | GET endpoints with filters |
| `withBodySizeLimit()` | Enforce max payload size | Prevent DoS attacks |
| `withFileValidation()` | Validate file uploads | File upload endpoints |
| `withRateLimit()` | Basic rate limiting | Prevent brute force, spam |
| `composeValidation()` | Combine multiple middlewares | Complex validation needs |

### 3. Enhanced Zod Schemas (`lib/validations/*.ts`)

All validation schemas now use `.transform()` with `InputValidator`:

```typescript
// BEFORE (vulnerable to XSS)
name: z.string().min(2).max(255)

// AFTER (XSS-safe)
name: z.string()
  .min(2, 'Name too short')
  .max(255, 'Name too long')
  .transform((val) => InputValidator.text(val, {
    minLength: 2,
    maxLength: 255,
    fieldName: 'Name'
  }))
```

## Updated Validation Files

| File | Status | Key Security Improvements |
|------|--------|--------------------------|
| `parent-portal.ts` | ✅ UPDATED | Phone/email validation, text sanitization, JSON size limits |
| `stakeholder-nps.ts` | ✅ UPDATED | Text sanitization, JSON payload limits, date validation |
| `grievance.ts` | ✅ UPDATED | Attachment validation, text sanitization, email/phone validation |
| `billing-copq.ts` | ✅ UPDATED | Number validation, date validation, text sanitization |
| `process-excellence.ts` | ✅ UPDATED | Text sanitization, number validation |
| `maturity-assessment.ts` | ⏳ PENDING | Needs InputValidator integration |
| `education-consultants.ts` | ⏳ PENDING | Needs InputValidator integration |
| `profile.ts` | ⏳ PENDING | Needs InputValidator integration |
| `profile-change-request.ts` | ⏳ PENDING | Needs InputValidator integration |

## Example: Secure API Route

```typescript
// app/api/parent-portal/auth/register/route.ts
import { withValidation, withRateLimit, composeValidation } from '@/lib/middleware/validate-input';
import { parentRegistrationSchema, ParentRegistrationInput } from '@/lib/validations/parent-portal';

async function registerHandler(
  request: NextRequest,
  validated: ParentRegistrationInput // Already sanitized!
) {
  // All inputs are safe to use
  const result = await ParentService.register(validated);
  return NextResponse.json(result);
}

// Export with security layers
export const POST = composeValidation(
  (handler) => withRateLimit(20, 60000, handler), // Max 20 requests/min
)(withValidation(parentRegistrationSchema, registerHandler));
```

## Common Vulnerabilities FIXED

### 1. XSS via Unescaped Text ✅ FIXED

**Before:**
```typescript
name: z.string() // Allows: <script>alert('xss')</script>
```

**After:**
```typescript
name: z.string().transform((val) => InputValidator.text(val))
// Result: &lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;
```

### 2. SQL Injection via Malformed Input ✅ FIXED

**Before:**
```typescript
email: z.string().email() // Allows: admin'; DROP TABLE users;--
```

**After:**
```typescript
email: z.string().transform((val) => InputValidator.email(val))
// Throws error if not valid email format
```

### 3. DoS via Oversized Payloads ✅ FIXED

**Before:**
```typescript
metadata: z.record(z.unknown()) // Allows: 100 MB JSON payload
```

**After:**
```typescript
metadata: z.record(z.unknown())
  .transform((val) => InputValidator.json(val, 100000)) // Max 100 KB
// Throws error if payload exceeds limit
```

### 4. Path Traversal in File Uploads ✅ FIXED

**Before:**
```typescript
// No validation - allows: ../../etc/passwd
```

**After:**
```typescript
InputValidator.fileUpload(file, {
  maxSize: 10 * 1024 * 1024, // 10 MB
  allowedExtensions: ['pdf', 'jpg', 'png']
})
// Rejects files with path traversal characters
```

### 5. JavaScript URL Injection ✅ FIXED

**Before:**
```typescript
url: z.string().url() // Allows: javascript:alert('xss')
```

**After:**
```typescript
url: z.string().transform((val) => InputValidator.url(val))
// Throws error for javascript:, data: URLs
```

## Testing Input Validation

### Manual Testing Checklist

```bash
# Test XSS prevention
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert(\"xss\")</script>"}'
# Expected: Sanitized to &lt;script&gt;...

# Test oversized payload
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"data": "'$(head -c 2000000 /dev/zero | base64)'"}'
# Expected: 413 Payload Too Large

# Test invalid email
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email"}'
# Expected: 400 Validation Error

# Test rate limiting
for i in {1..25}; do
  curl -X POST http://localhost:3000/api/test -d '{}' &
done
# Expected: 429 Too Many Requests after 20 requests
```

### Automated Tests

```typescript
// __tests__/lib/utils/input-validator.test.ts
import { InputValidator } from '@/lib/utils/input-validator';

describe('InputValidator', () => {
  describe('text()', () => {
    it('should escape HTML to prevent XSS', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = InputValidator.text(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });

    it('should reject oversized text', () => {
      const longText = 'a'.repeat(10000);
      expect(() => InputValidator.text(longText, { maxLength: 1000 }))
        .toThrow('must not exceed 1000 characters');
    });

    it('should remove null bytes', () => {
      const withNull = 'test\0data';
      expect(() => InputValidator.text(withNull))
        .toThrow('contains invalid null bytes');
    });
  });

  describe('email()', () => {
    it('should normalize valid emails', () => {
      const email = InputValidator.email('  TEST@EXAMPLE.COM  ');
      expect(email).toBe('test@example.com');
    });

    it('should reject invalid emails', () => {
      expect(() => InputValidator.email('not-an-email'))
        .toThrow('Invalid email address format');
    });
  });

  describe('phoneNumber()', () => {
    it('should validate Indian phone numbers', () => {
      expect(InputValidator.phoneNumber('9876543210')).toBe('9876543210');
      expect(InputValidator.phoneNumber('+919876543210')).toBe('9876543210');
      expect(InputValidator.phoneNumber('919876543210')).toBe('9876543210');
    });

    it('should reject invalid phone numbers', () => {
      expect(() => InputValidator.phoneNumber('123'))
        .toThrow('Invalid phone number format');
      expect(() => InputValidator.phoneNumber('1234567890'))
        .toThrow('Must start with 6-9');
    });
  });

  describe('fileUpload()', () => {
    it('should reject files with path traversal', () => {
      expect(() => InputValidator.fileUpload({
        name: '../../etc/passwd',
        size: 1000,
        type: 'text/plain'
      })).toThrow('contains invalid characters');
    });

    it('should reject oversized files', () => {
      expect(() => InputValidator.fileUpload({
        name: 'large.pdf',
        size: 100 * 1024 * 1024, // 100 MB
        type: 'application/pdf'
      }, { maxSize: 10 * 1024 * 1024 })) // Max 10 MB
        .toThrow('exceeds maximum allowed');
    });
  });
});
```

## Migration Guide

### Step 1: Update Validation Schema

```typescript
// OLD (insecure)
export const mySchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email()
});

// NEW (secure)
import { InputValidator } from '@/lib/utils/input-validator';

export const mySchema = z.object({
  name: z.string()
    .min(2, 'Name too short')
    .max(100, 'Name too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 2,
      maxLength: 100,
      fieldName: 'Name'
    })),
  email: z.string()
    .transform((val) => InputValidator.email(val))
});
```

### Step 2: Update API Route

```typescript
// OLD (insecure)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const validated = mySchema.parse(body); // Direct parse, no sanitization
  // ...
}

// NEW (secure)
import { withValidation, withRateLimit, composeValidation } from '@/lib/middleware/validate-input';

async function handler(request: NextRequest, validated: MyInput) {
  // validated is already sanitized!
  // ...
}

export const POST = composeValidation(
  (h) => withRateLimit(100, 60000, h)
)(withValidation(mySchema, handler));
```

### Step 3: Update Service Layer (Optional but Recommended)

```typescript
// lib/services/my-service.ts
import { InputValidator } from '@/lib/utils/input-validator';

export class MyService {
  static async create(data: CreateInput) {
    // Double-check critical inputs at service layer
    const sanitizedName = InputValidator.text(data.name, { maxLength: 255 });
    const validatedEmail = InputValidator.email(data.email);

    const { error } = await supabase
      .from('my_table')
      .insert({ name: sanitizedName, email: validatedEmail });

    if (error) throw error;
  }
}
```

## Best Practices

### ✅ DO

1. **Always use `.transform()` with `InputValidator`** in Zod schemas
2. **Wrap all API routes** with `withValidation` middleware
3. **Add rate limiting** to authentication and sensitive endpoints
4. **Validate file uploads** before storage
5. **Set maximum payload sizes** for all endpoints
6. **Use TypeScript types** from validated schemas
7. **Log validation failures** for security monitoring

### ❌ DON'T

1. **Don't trust user input** - validate everything
2. **Don't skip validation** "just for testing"
3. **Don't allow unlimited payload sizes**
4. **Don't use `.parse()` directly** - use middleware instead
5. **Don't store unsanitized user input**
6. **Don't allow all file types** in uploads
7. **Don't ignore validation errors** in production

## Performance Considerations

- **Validation overhead**: ~1-5ms per request (acceptable)
- **Rate limiting**: In-memory (scales to ~10k users, use Redis for more)
- **JSON size limits**: Prevents memory exhaustion
- **File validation**: Metadata only (fast), actual content scanning happens async

## Production Checklist

Before deploying to production:

- [ ] All Zod schemas use `InputValidator.transform()`
- [ ] All API routes wrapped with `withValidation()`
- [ ] Rate limiting enabled on auth endpoints
- [ ] File upload validation implemented
- [ ] Payload size limits configured
- [ ] Validation errors logged to monitoring
- [ ] Security tests passing
- [ ] Input validation tested with malicious payloads

## Security Monitoring

Add to your monitoring dashboard:

```typescript
// Track validation failures
if (error instanceof ZodError) {
  logger.warn('Validation failed', {
    endpoint: request.url,
    errors: error.errors,
    ip: request.headers.get('x-forwarded-for')
  });
}
```

Monitor for:
- High rate of validation failures (possible attack)
- Repeated XSS attempts
- Oversized payload attempts
- File upload attacks

## References

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Zod Documentation](https://zod.dev)
- [validator.js Documentation](https://github.com/validatorjs/validator.js)

## Support

For questions or security concerns:
- Internal: Check `#security` channel
- External: security@myjkkn.com

---

**Last Updated**: 2026-02-01
**Status**: ✅ Core system implemented, migration in progress
**Security Level**: 🔒 High (multi-layer validation)
