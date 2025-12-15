# Authentication Guide

> Secure authentication flow for MyJKKN integration

---

## Overview

MyJKKN uses Supabase Auth with Server-Side Rendering (SSR) for secure authentication. This guide covers authentication for child applications.

---

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER ENTERS CREDENTIALS                                      │
│     - Email (institution email preferred)                       │
│     - Password                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. SUPABASE AUTH                                                │
│     - Validates credentials                                     │
│     - Creates JWT tokens (access + refresh)                     │
│     - Returns user session                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. SESSION STORAGE                                              │
│     - Access token stored in HTTP-only cookies                  │
│     - Refresh token for session renewal                         │
│     - Automatic token refresh on expiry                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. PROFILE FETCH                                                │
│     - Load user profile from `profiles` table                   │
│     - Load roles and permissions                                │
│     - Load institution access list                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. SESSION CONTEXT                                              │
│     - Store in React context                                    │
│     - Available throughout app                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Initialize Supabase Client

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### 2. Login Implementation

```typescript
// Login function
async function login(email: string, password: string) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
```

### 3. Session Management

```typescript
// Get current session
async function getSession() {
  const supabase = createClient();

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return null;
  }

  return session;
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // Handle logout
  } else if (event === 'TOKEN_REFRESHED') {
    // Token auto-refreshed
  }
});
```

### 4. API Request with Auth

```typescript
// Make authenticated API request
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const session = await getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    // Handle unauthorized - redirect to login
    window.location.href = '/login';
  }

  return response.json();
}
```

---

## Server-Side Auth (SSR)

### Create Server Client

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Handle in Server Component
          }
        }
      }
    }
  );
}
```

### Use in API Routes

```typescript
// app/api/[route]/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Proceed with authenticated request
  // ...
}
```

---

## Token Structure

### Access Token (JWT)

```json
{
  "aud": "authenticated",
  "exp": 1734567890,
  "sub": "user-uuid",
  "email": "user@jkkn.ac.in",
  "role": "authenticated",
  "app_metadata": {
    "provider": "email"
  },
  "user_metadata": {
    "full_name": "John Doe"
  }
}
```

### Token Lifetimes

| Token | Default Lifetime | Configurable |
|-------|------------------|--------------|
| Access Token | 1 hour | Yes |
| Refresh Token | 7 days | Yes |
| Session | Until logout | - |

---

## Profile Loading

After authentication, load user profile:

```typescript
interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  default_institution_id?: string;
  is_super_admin: boolean;
  user_type: 'super_admin' | 'admin' | 'staff' | 'faculty' | 'student';
}

async function loadProfile(userId: string): Promise<UserProfile> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}
```

---

## Loading Permissions

```typescript
interface UserRole {
  role_id: string;
  role: {
    id: string;
    role_name: string;
    permissions: Record<string, boolean>;
  };
}

async function loadUserRoles(profileId: string): Promise<UserRole[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_roles')
    .select(`
      role_id,
      role:custom_roles(
        id,
        role_name,
        permissions
      )
    `)
    .eq('profile_id', profileId)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}
```

---

## Institution Access

```typescript
interface InstitutionAccess {
  institution_id: string;
  access_type: 'full' | 'read_only' | 'billing_only';
  institution: {
    id: string;
    name: string;
  };
}

async function loadInstitutionAccess(
  profileId: string
): Promise<InstitutionAccess[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_institution_access')
    .select(`
      institution_id,
      access_type,
      institution:institutions(id, name)
    `)
    .eq('profile_id', profileId)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}
```

---

## Complete Auth Context

```typescript
interface AuthContext {
  user: User | null;
  profile: UserProfile | null;
  roles: UserRole[];
  permissions: Record<string, boolean>;
  institutionAccess: InstitutionAccess[];
  currentInstitutionId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  hasInstitutionAccess: (institutionId: string) => boolean;
}
```

---

## Logout

```typescript
async function logout() {
  const supabase = createClient();

  await supabase.auth.signOut();

  // Redirect to login
  window.location.href = '/login';
}
```

---

## Password Reset

```typescript
// Request password reset
async function requestPasswordReset(email: string) {
  const supabase = createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  });

  if (error) throw error;
}

// Update password
async function updatePassword(newPassword: string) {
  const supabase = createClient();

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;
}
```

---

## Security Best Practices

1. **Use HTTPS**: Always use HTTPS in production
2. **HTTP-Only Cookies**: Tokens stored in HTTP-only cookies
3. **CSRF Protection**: Built into Supabase SSR
4. **Token Refresh**: Auto-refresh before expiry
5. **Secure Headers**: Proper CORS and security headers
6. **Password Policy**: Enforce strong passwords

---

## Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]

# Optional (for admin operations)
SUPABASE_SERVICE_ROLE_KEY=[your-service-key]
```

---

*Last Updated: December 2024*
