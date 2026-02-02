# Product Requirements Document (PRD) - Updated for MyJKKN

## Centralized Authentication Server Architecture

---

## Document Information

| Field            | Details                                       |
| ---------------- | --------------------------------------------- |
| **Product Name** | MyJKKN Centralized Auth Server System         |
| **Version**      | 2.0 (Updated with MyJKKN Specifics)           |
| **Date**         | September 30, 2025                            |
| **Status**       | Implementation Ready                          |
| **Author**       | System Architect                              |
| **Stakeholders** | Engineering Team, Product Team, Security Team |
| **Parent App**   | MyJKKN (hhprjbgknupaplivtoib)                 |

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Problem Statement](#3-problem-statement)
4. [Goals & Objectives](#4-goals--objectives)
5. [System Architecture](#5-system-architecture)
6. [Migration Strategy](#6-migration-strategy)
7. [Technical Requirements](#7-technical-requirements)
8. [Data Models](#8-data-models)
9. [API Specifications](#9-api-specifications)
10. [Implementation Plan](#10-implementation-plan)
11. [Testing Strategy](#11-testing-strategy)
12. [Risk Assessment](#12-risk-assessment)

---

# 1. Executive Summary

## 1.1 Overview

This document outlines the extraction and transformation of **MyJKKN's existing child app authentication system** into a **standalone Centralized Authentication Server**. The current implementation is embedded within MyJKKN; this project will separate it into an independent, scalable service.

## 1.2 Business Value

- **Separation of Concerns**: Authentication becomes a dedicated service
- **Improved Performance**: MyJKKN's main app is not burdened with auth operations
- **Enhanced Security**: Dedicated security focus and monitoring
- **Easier Maintenance**: Independent deployment and scaling
- **Better Scalability**: Can handle 50+ child applications independently

## 1.3 Current vs. Target Architecture

### Current (Embedded in MyJKKN):

```
MyJKKN Application
├── Main Application Logic
├── User Management
└── Child App Authentication ← Currently here
    ├── OAuth 2.0 Flow
    ├── JWT Token Management
    ├── Session Management
    └── Analytics
```

### Target (Separated):

```
MyJKKN Application          Auth Server (New)        Child Apps
├── Main Logic      ←→     ├── OAuth 2.0           ←→  ├── App 1
├── User Mgmt       ←→     ├── JWT Management      ←→  ├── App 2
└── User Sync       ←→     ├── Sessions            ←→  └── App N
                           └── Analytics
```

---

# 2. Current State Analysis

## 2.1 MyJKKN Existing Implementation

### 2.1.1 Technology Stack

**Parent Application (MyJKKN)**:

- **Framework**: Next.js 15 with App Router
- **Database**: Supabase PostgreSQL (Project ID: hhprjbgknupaplivtoib)
- **Region**: ap-south-1 (Mumbai)
- **Authentication**: Supabase Auth with Google OAuth
- **Package**: `@supabase/ssr` for Next.js integration

### 2.1.2 Current Database Schema

**Auth-Related Tables**:

```sql
-- Auth Schema (Supabase Managed)
auth.users                  -- Primary user authentication
auth.refresh_tokens         -- Refresh token storage
auth.sessions              -- Active user sessions
auth.identities            -- OAuth provider data

-- Public Schema (MyJKKN Managed)
public.profiles            -- User profiles (extends auth.users)
  ├── id UUID PRIMARY KEY  -- Links to auth.users.id
  ├── email TEXT UNIQUE
  ├── full_name TEXT
  ├── role TEXT DEFAULT 'student'
  ├── institution_id UUID  -- Multi-tenancy
  └── is_pre_registered BOOLEAN

-- Child App Integration (Currently in MyJKKN)
public.applications        -- Child app registry
  ├── id UUID PRIMARY KEY
  ├── app_id VARCHAR UNIQUE           -- e.g., 'student_portal_v1'
  ├── name VARCHAR
  ├── uses_parent_auth BOOLEAN        -- Flag for centralized auth
  ├── api_key_hash VARCHAR            -- SHA-256 hash
  ├── allowed_redirect_uris TEXT[]
  ├── allowed_scopes VARCHAR[]
  ├── app_permissions JSONB
  ├── rate_limit_requests INTEGER
  └── last_auth_activity TIMESTAMPTZ

public.child_app_unified_sessions    -- Optimized session storage
  ├── id UUID PRIMARY KEY
  ├── user_id UUID UNIQUE
  ├── app_sessions JSONB              -- All app sessions in one record
  ├── global_metadata JSONB
  └── total_apps_connected INTEGER

public.child_app_auth_codes_bucket   -- Authorization codes (time-bucketed)
  ├── id UUID PRIMARY KEY
  ├── bucket_timestamp TIMESTAMPTZ
  ├── bucket_key VARCHAR UNIQUE
  ├── codes JSONB                     -- Array of auth codes
  ├── active_count INTEGER
  └── expires_at TIMESTAMPTZ

public.child_app_analytics          -- Usage analytics
  ├── id UUID PRIMARY KEY
  ├── app_id VARCHAR
  ├── analytics_date DATE
  ├── hourly_stats JSONB
  ├── daily_summary JSONB
  └── error_logs JSONB

public.user_institution_access      -- Multi-tenancy control
  ├── user_id UUID
  ├── institution_id UUID
  └── access_type VARCHAR

public.api_keys                     -- API key management
  ├── key_value VARCHAR UNIQUE
  ├── permissions JSONB
  └── expires_at TIMESTAMPTZ
```

### 2.1.3 Current API Endpoints (in MyJKKN)

```typescript
// Location: app/api/auth/child-app/

1. POST /api/auth/child-app/authorize
   - Initiates OAuth 2.0 authorization flow
   - Returns authorization code

2. POST /api/auth/child-app/token
   - Exchanges auth code for JWT tokens
   - Supports grant types: authorization_code, refresh_token
   - Returns: access_token, refresh_token

3. POST /api/auth/child-app/validate
   - Validates JWT access token
   - Returns user info and permissions

4. GET /api/auth/child-app/login
   - User consent page
   - Shows app permissions
   - Generates auth code on approval
```

### 2.1.4 Current Authentication Flow

```
┌────────────┐     ┌──────────────┐     ┌────────────────┐
│ Child App  │────▶│   MyJKKN     │────▶│   User Login   │
└────────────┘     │ (Auth Server)│     │  (OAuth Page)  │
      │            └──────────────┘     └────────────────┘
      │                    │                      │
      │ 1. Redirect        │                      │
      │ with app_id        │                      │
      │                    │ 2. Show Login        │
      │                    │─────────────────────▶│
      │                    │                      │
      │                    │ 3. User Approves     │
      │                    │◀─────────────────────│
      │                    │                      │
      │ 4. Auth Code       │                      │
      │◀───────────────────│                      │
      │                    │                      │
      │ 5. Exchange Code   │                      │
      │    for Tokens      │                      │
      │────────────────────▶                      │
      │                    │                      │
      │ 6. JWT Tokens      │                      │
      │◀───────────────────│                      │
```

### 2.1.5 Current JWT Token Structure

```typescript
// Access Token (HS256, 1 hour expiry)
{
  sub: 'user_uuid',
  email: 'user@example.com',
  role: 'student',
  app_id: 'student_portal_v1',
  scope: 'read write profile',
  institution_id: 'institution_uuid',
  iat: 1696075200,
  exp: 1696078800
}

// Refresh Token (HS256, 30 days expiry)
{
  sub: 'user_uuid',
  app_id: 'student_portal_v1',
  type: 'refresh',
  iat: 1696075200,
  exp: 1698667200
}
```

### 2.1.6 Current Services

**Location: `lib/services/`**

```typescript
// OptimizedSessionManagerService
- createUserSession() - Creates session in unified table
- validateSession() - Validates access token
- refreshSession() - Issues new tokens
- terminateSession() - Logs out user

// OptimizedAuthCodesService
- createAuthCode() - Generates time-bucketed auth code
- validateAuthCode() - Validates and consumes code
- autoCleanupIfNeeded() - Cleans expired codes

// ChildAppAnalyticsService
- logAuth() - Logs authentication events
- trackUsage() - Tracks API usage
- getDailyStats() - Retrieves analytics
```

## 2.2 What Works Well

✅ **OAuth 2.0 Implementation**: Standard-compliant flow  
✅ **JWT Token Management**: Secure token generation  
✅ **Optimized Storage**: Time-bucketed auth codes reduce DB records by 95%  
✅ **Unified Sessions**: One record per user instead of per user-app (99% reduction)  
✅ **Analytics**: Comprehensive usage tracking  
✅ **Multi-tenancy**: Institution-based access control

## 2.3 Current Limitations

❌ **Tight Coupling**: Auth logic embedded in MyJKKN  
❌ **Scalability**: Auth operations consume MyJKKN resources  
❌ **Deployment**: Can't deploy auth updates independently  
❌ **Monitoring**: Auth metrics mixed with main app metrics  
❌ **Security**: Harder to implement auth-specific security measures

---

# 3. Problem Statement

## 3.1 Why Separate the Auth Server?

### Current Pain Points

1. **Resource Contention**
   - Auth operations compete with main MyJKKN operations
   - Database queries for 50+ child apps impact main app performance
2. **Deployment Complexity**
   - Auth updates require full MyJKKN deployment
   - Risky to deploy auth changes with main app changes
3. **Security Isolation**
   - Auth server should have stricter security policies
   - Harder to audit when mixed with main app
4. **Scaling Challenges**
   - Can't scale auth server independently
   - Auth traffic spikes affect MyJKKN performance

### Example Scenario

```
Current Problem:
- MyJKKN serves 1,000 students
- 50 child apps
- Each child app makes 10 auth requests/minute
- Total: 500 auth req/min on MyJKKN
- MyJKKN's main features slow down during peak auth times

After Separation:
- Auth Server handles 500 req/min independently
- MyJKKN performance unaffected by auth load
- Can scale auth server separately
```

---

# 4. Goals & Objectives

## 4.1 Primary Goals

| Goal                         | Success Metric                    | Priority |
| ---------------------------- | --------------------------------- | -------- |
| Extract auth from MyJKKN     | Auth server running independently | P0       |
| Maintain 100% compatibility  | No changes needed in child apps   | P0       |
| Zero downtime migration      | Gradual rollout with fallback     | P0       |
| Improve auth response time   | < 150ms (from current ~200ms)     | P1       |
| Independent scaling          | Auth server scales separately     | P1       |
| Enhanced security monitoring | Dedicated security dashboard      | P2       |

## 4.2 Success Criteria

- ✅ All existing child apps work without code changes
- ✅ Auth server handles 1000+ req/min without affecting MyJKKN
- ✅ <1% error rate during migration
- ✅ Same or better authentication response times
- ✅ All analytics data preserved

---

# 5. System Architecture

## 5.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ECOSYSTEM                                │
│                                                                  │
│  ┌────────────────────┐                                         │
│  │   MyJKKN (Parent)  │                                         │
│  │  (Supabase:        │                                         │
│  │   kvizhngldtiuu... │                                         │
│  │                    │                                         │
│  │  - Users (auth)    │                                         │
│  │  - Profiles        │                                         │
│  │  - Main App Logic  │                                         │
│  └───────┬────────────┘                                         │
│          │                                                       │
│          │ Webhook/Realtime Sync                                │
│          │ - User Registration Event                            │
│          │ - Profile Updates                                    │
│          │ - Permission Changes                                 │
│          ↓                                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │   CENTRALIZED AUTH SERVER (NEW)                 │           │
│  │   New Supabase Project: nhiniwzkarxqyvgglmiy    │           │
│  │   Region: ap-southeast-1                        │           │
│  │                                                  │           │
│  │   ┌──────────────────────────────────────┐     │           │
│  │   │  Database (Supabase)                 │     │           │
│  │   │  - users (synced from MyJKKN)        │     │           │
│  │   │  - applications                      │     │           │
│  │   │  - auth_sessions                     │     │           │
│  │   │  - auth_codes_bucket                 │     │           │
│  │   │  - analytics                         │     │           │
│  │   │  - audit_logs                        │     │           │
│  │   └──────────────────────────────────────┘     │           │
│  │                                                  │           │
│  │   ┌──────────────────────────────────────┐     │           │
│  │   │  API Server (Next.js 15)             │     │           │
│  │   │  - /api/auth/authorize               │     │           │
│  │   │  - /api/auth/token                   │     │           │
│  │   │  - /api/auth/validate                │     │           │
│  │   │  - /api/auth/sync-user (webhook)     │     │           │
│  │   │  - /api/auth/grant-access            │     │           │
│  │   │  - /api/admin/* (management APIs)    │     │           │
│  │   └──────────────────────────────────────┘     │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     │                                            │
│                     │ JWT Tokens (HTTPS)                        │
│                     │                                            │
│           ┌─────────┴────────┬───────────────┐                 │
│           ↓                  ↓               ↓                 │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐     │
│   │  Child App 1 │   │  Child App 2 │   │  Child App N │     │
│   │  (Unchanged) │   │  (Unchanged) │   │  (Unchanged) │     │
│   └──────────────┘   └──────────────┘   └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 5.2 Component Breakdown

### 5.2.1 MyJKKN (Parent Application)

**Supabase Project**: `hhprjbgknupaplivtoib`  
**Region**: `ap-south-1`  
**Role**: User management and primary application

**Responsibilities**:

- User registration via Google OAuth
- Profile management
- Main application features
- Sync user data to Auth Server (webhook/realtime)
- Grant/revoke child app permissions (admin UI)

**Tables to Retain**:

```sql
-- Keep in MyJKKN
auth.users                    -- Supabase Auth
public.profiles              -- User profiles
public.institutions          -- Multi-tenancy
public.user_institution_access
public.academic_years
public.students
public.staff
... (all main app tables)
```

**Tables to Remove** (migrated to Auth Server):

```sql
-- Move to Auth Server
public.applications
public.child_app_unified_sessions
public.child_app_auth_codes_bucket
public.child_app_analytics
```

### 5.2.2 Auth Server (New Supabase Project)

**Supabase Project**: `nhiniwzkarxqyvgglmiy` (already created!)  
**Region**: `ap-southeast-1`  
**Role**: Dedicated authentication and authorization

**Responsibilities**:

- OAuth 2.0 authorization flow
- JWT token issuance and validation
- Session management
- Application registration
- Analytics and audit logging
- User data sync from MyJKKN

**Technology Stack**:

```typescript
Framework: Next.js 15 (App Router)
Database: Supabase PostgreSQL (nhiniwzkarxqyvgglmiy)
Auth: Custom JWT (jose library)
API: RESTful with Next.js Route Handlers
Libraries:
  - @supabase/ssr: Supabase SSR integration
  - jose: JWT generation/validation (already in use)
  - bcryptjs: Password hashing (if needed)
```

### 5.2.3 Data Flow Diagrams

#### User Registration & Sync Flow

```
┌─────────┐     ┌───────────┐     ┌─────────────┐
│  User   │────▶│  MyJKKN   │────▶│ Auth Server │
└─────────┘     └───────────┘     └─────────────┘
     │               │                    │
     │ 1. Google     │                    │
     │    OAuth      │                    │
     │──────────────▶│                    │
     │               │                    │
     │               │ 2. Create Profile  │
     │               │    in MyJKKN DB    │
     │               │                    │
     │               │ 3. Webhook/Event   │
     │               │    Sync User       │
     │               │────────────────────▶│
     │               │                    │
     │               │                    │ 4. Store User
     │               │                    │    in Auth DB
     │               │                    │
     │               │ 5. Sync Success    │
     │               │◀────────────────────│
     │               │                    │
     │ 6. Complete   │                    │
     │◀──────────────│                    │
```

#### Child App Login Flow (No Changes for Child Apps)

```
┌──────────┐     ┌─────────────┐     ┌───────────┐
│Child App │────▶│ Auth Server │────▶│  MyJKKN   │
└──────────┘     └─────────────┘     └───────────┘
      │                 │                   │
      │ 1. Redirect     │                   │
      │ /authorize      │                   │
      │────────────────▶│                   │
      │                 │                   │
      │                 │ 2. Verify App     │
      │                 │    Permissions    │
      │                 │                   │
      │                 │ 3. Show Login UI  │
      │                 │    (Auth Server   │
      │                 │     hosted page)  │
      │                 │                   │
      │ 4. Auth Code    │                   │
      │◀────────────────│                   │
      │                 │                   │
      │ 5. Exchange     │                   │
      │ /token          │                   │
      │────────────────▶│                   │
      │                 │                   │
      │                 │ 6. Validate User  │
      │                 │    & Permissions  │
      │                 │                   │
      │ 7. JWT Tokens   │                   │
      │◀────────────────│                   │
```

---

# 6. Migration Strategy

## 6.1 Migration Phases

### Phase 1: Preparation (Week 1)

**Goal**: Set up Auth Server infrastructure

```
Tasks:
1. ✅ Supabase project already created (nhiniwzkarxqyvgglmiy)
2. Create Next.js 15 application structure
3. Set up database schema in Auth Server
4. Configure environment variables
5. Deploy to Vercel (staging)
```

**Database Schema Creation**:

```sql
-- Auth Server Tables (in nhiniwzkarxqyvgglmiy)

-- 1. Synced Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL UNIQUE,  -- MyJKKN user ID
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  institution_id UUID,  -- For multi-tenancy
  app_permissions JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Applications (Migrated from MyJKKN)
CREATE TABLE applications (
  -- Copy structure from MyJKKN.applications
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  api_key_hash VARCHAR,
  allowed_redirect_uris TEXT[],
  allowed_scopes VARCHAR[] DEFAULT ARRAY['read', 'write', 'profile'],
  app_permissions JSONB DEFAULT '[]'::jsonb,
  uses_parent_auth BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  rate_limit_requests INTEGER DEFAULT 1000,
  rate_limit_window_minutes INTEGER DEFAULT 60,
  last_auth_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Auth Sessions (Migrated from child_app_unified_sessions)
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  app_sessions JSONB DEFAULT '{}'::jsonb,
  global_metadata JSONB DEFAULT '{}'::jsonb,
  total_apps_connected INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 4. Auth Codes (Migrated from child_app_auth_codes_bucket)
CREATE TABLE auth_codes_bucket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_timestamp TIMESTAMPTZ NOT NULL,
  bucket_key VARCHAR UNIQUE NOT NULL,
  codes JSONB DEFAULT '[]'::jsonb,
  active_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  expired_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Analytics (Migrated from child_app_analytics)
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id VARCHAR NOT NULL,
  analytics_date DATE NOT NULL,
  hourly_stats JSONB DEFAULT '[]'::jsonb,
  daily_summary JSONB DEFAULT '{}'::jsonb,
  error_logs JSONB DEFAULT '[]'::jsonb,
  detailed_logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Audit Logs (New for security)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  event_details JSONB,
  ip_address INET,
  user_agent TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_parent_id ON users(parent_user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_applications_app_id ON applications(app_id);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

### Phase 2: Data Migration (Week 2)

**Goal**: Migrate existing data to Auth Server

**Migration Script**:

```typescript
// scripts/migrate-to-auth-server.ts

import { createClient } from '@supabase/supabase-js';

const myJKKN = createClient(
  process.env.MYJKKN_URL,
  process.env.MYJKKN_SERVICE_KEY
);

const authServer = createClient(
  process.env.AUTH_SERVER_URL,
  process.env.AUTH_SERVER_SERVICE_KEY
);

async function migrateData() {
  // 1. Migrate Applications
  const { data: apps } = await myJKKN
    .from('applications')
    .select('*')
    .eq('uses_parent_auth', true);

  await authServer.from('applications').insert(apps);

  // 2. Migrate Users (sync from profiles)
  const { data: profiles } = await myJKKN
    .from('profiles')
    .select('*');

  const users = profiles.map(p => ({
    parent_user_id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    institution_id: p.institution_id
  }));

  await authServer.from('users').insert(users);

  // 3. Migrate Sessions
  const { data: sessions } = await myJKKN
    .from('child_app_unified_sessions')
    .select('*');

  await authServer.from('auth_sessions').insert(sessions);

  // 4. Migrate Analytics
  const { data: analytics } = await myJKKN
    .from('child_app_analytics')
    .select('*');

  await authServer.from('analytics').insert(analytics);
}
```

### Phase 3: Code Migration (Week 3)

**Goal**: Move authentication code to Auth Server

**Services to Migrate**:

```typescript
// From: MyJKKN/lib/services/
// To: AuthServer/lib/services/

1. OptimizedSessionManagerService
   → auth-server/lib/services/session-service.ts

2. OptimizedAuthCodesService
   → auth-server/lib/services/auth-codes-service.ts

3. ChildAppAnalyticsService
   → auth-server/lib/services/analytics-service.ts
```

**API Routes to Migrate**:

```typescript
// From: MyJKKN/app/api/auth/child-app/
// To: AuthServer/app/api/auth/

1. authorize/route.ts → authorize/route.ts
2. token/route.ts → token/route.ts
3. validate/route.ts → validate/route.ts
4. Add: sync-user/route.ts (new webhook endpoint)
```

### Phase 4: Sync Setup (Week 4)

**Goal**: Set up real-time user sync from MyJKKN to Auth Server

**Option 1: Webhook (Recommended)**

```typescript
// MyJKKN: Trigger on user changes
// Location: app/api/webhooks/user-sync/route.ts

export async function POST(request: Request) {
  const { type, record } = await request.json();

  if (type === 'INSERT' || type === 'UPDATE') {
    // Sync to Auth Server
    await fetch(`${AUTH_SERVER_URL}/api/auth/sync-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.AUTH_SERVER_API_KEY!
      },
      body: JSON.stringify({
        parent_user_id: record.id,
        email: record.email,
        full_name: record.full_name,
        role: record.role,
        institution_id: record.institution_id
      })
    });
  }
}
```

**Supabase Trigger**:

```sql
-- In MyJKKN Database
CREATE OR REPLACE FUNCTION notify_user_sync()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://auth-server.example.com/api/auth/sync-user',
    headers := '{"Content-Type": "application/json", "x-api-key": "secret"}'::jsonb,
    body := jsonb_build_object(
      'parent_user_id', NEW.id,
      'email', NEW.email,
      'full_name', NEW.full_name,
      'role', NEW.role,
      'institution_id', NEW.institution_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_sync_trigger
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION notify_user_sync();
```

### Phase 5: Gradual Rollout (Week 5-6)

**Strategy**: Blue-Green Deployment

**Week 5: Test with 1 Child App**

```typescript
// Update 1 child app to point to Auth Server
const AUTH_URL = process.env.USE_NEW_AUTH
  ? 'https://auth-server.example.com'
  : 'https://myjkkn.example.com';

// Monitor for errors
if (errorRate > 1%) {
  // Rollback to MyJKKN
  switchToOldAuth();
}
```

**Week 6: Gradual Rollout**

```
Day 1: 10% of child apps → Auth Server
Day 2: 25% of child apps → Auth Server
Day 3: 50% of child apps → Auth Server
Day 4: 75% of child apps → Auth Server
Day 5: 100% of child apps → Auth Server
```

### Phase 6: Cleanup (Week 7)

**Goal**: Remove auth code from MyJKKN

```typescript
// Delete from MyJKKN:
1. app/api/auth/child-app/* (all routes)
2. lib/services/*-child-app-*.ts
3. DROP TABLE child_app_unified_sessions
4. DROP TABLE child_app_auth_codes_bucket
5. DROP TABLE child_app_analytics
6. Update applications table (remove auth columns)
```

## 6.2 Migration Checklist

### Pre-Migration

- [ ] Auth Server Supabase project created ✅
- [ ] Next.js app deployed to Vercel
- [ ] Database schema created
- [ ] Environment variables configured
- [ ] Sync mechanism tested
- [ ] Rollback plan documented

### During Migration

- [ ] Data migrated to Auth Server
- [ ] Code migrated and tested
- [ ] 1 pilot child app testing
- [ ] Monitoring dashboards set up
- [ ] Error rate < 1%
- [ ] Performance acceptable

### Post-Migration

- [ ] All child apps using Auth Server
- [ ] MyJKKN auth code removed
- [ ] Database tables cleaned up
- [ ] Documentation updated
- [ ] Team trained

---

# 7. Technical Requirements

## 7.1 Auth Server Technology Stack

```typescript
Framework: Next.js 15
  - App Router
  - Server Actions
  - Edge Runtime (for fast responses)

Database: Supabase (nhiniwzkarxqyvgglmiy)
  - PostgreSQL 17
  - Region: ap-southeast-1
  - Connection pooling: Enabled
  - Point-in-time recovery: 7 days

Authentication:
  - JWT: jose library (already in MyJKKN)
  - Algorithm: HS256 (migrate to RS256 later)
  - Access Token: 1 hour
  - Refresh Token: 30 days

API:
  - RESTful with Next.js Route Handlers
  - CORS: Configured for child app domains
  - Rate Limiting: Upstash Redis
  - Validation: Zod schemas

Libraries:
  - @supabase/ssr: SSR integration
  - jose: JWT operations
  - zod: Request validation
  - @upstash/ratelimit: Rate limiting
```

## 7.2 Infrastructure

**Hosting**: Vercel  
**Domain**: `auth.jkkn.ai` (to be configured)  
**SSL**: Auto-provisioned by Vercel

**Performance Requirements**:

- API Response: < 150ms (p95)
- Token Validation: < 50ms (p95)
- Uptime: 99.9% SLA

**Scaling**:

- Serverless auto-scaling
- Database: Supabase auto-scaling
- CDN: Vercel Edge Network

---

# 8. Data Models

## 8.1 Auth Server Schema (Detailed)

### 8.1.1 Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL UNIQUE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  institution_id UUID,
  app_permissions JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_email CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

COMMENT ON TABLE users IS 'Synced users from MyJKKN parent application';
COMMENT ON COLUMN users.parent_user_id IS 'Original user ID from MyJKKN';
COMMENT ON COLUMN users.app_permissions IS 'Child app permissions: {app_id: [scopes]}';
```

**app_permissions JSON Structure**:

```json
{
  "student_portal_v1": ["read", "write", "profile"],
  "library_app": ["read"],
  "hostel_app": ["read", "write", "admin"]
}
```

### 8.1.2 Applications Table (Extended)

```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  api_key_hash VARCHAR,
  allowed_redirect_uris TEXT[] NOT NULL,
  allowed_scopes VARCHAR[] DEFAULT ARRAY['read', 'write', 'profile'],
  app_permissions JSONB DEFAULT '[]'::jsonb,

  -- Security
  uses_parent_auth BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  rate_limit_requests INTEGER DEFAULT 1000,
  rate_limit_window_minutes INTEGER DEFAULT 60,

  -- Branding
  logo_url TEXT,
  primary_color VARCHAR,

  -- Metadata
  last_auth_activity TIMESTAMPTZ,
  total_users_count INTEGER DEFAULT 0,
  active_sessions_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_scopes CHECK (
    allowed_scopes <@ ARRAY['read', 'write', 'admin', 'profile']
  )
);

CREATE INDEX idx_applications_app_id ON applications(app_id);
CREATE INDEX idx_applications_active ON applications(is_active);
```

(Due to length limitations, I'll create a separate file for the rest of the PRD)

---

**Document Status**: Part 1 of 2
**Next Section**: API Specifications, Implementation Plan, Testing Strategy

Would you like me to continue with the remaining sections?
