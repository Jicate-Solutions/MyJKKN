# Supabase Default Prompts & Templates

## 🤖 Auto-Agent Prompts

These prompts automatically trigger specific behaviors when working with Supabase.

### 📝 MASTER PROMPT (Copy this at session start)

```
Remember these Supabase rules for MyJKKN project:

1. SQL FILE RULES:
   - NEVER create new SQL files for existing objects
   - Tables go ONLY in supabase/setup/01_tables.sql
   - Functions go ONLY in supabase/setup/02_functions.sql
   - Policies go ONLY in supabase/setup/03_policies.sql
   - ALWAYS check supabase/SQL_FILE_INDEX.md first
   - UPDATE existing files, don't create new ones

2. NAMING CONVENTIONS:
   - Use snake_case for all database objects
   - Prefix indexes with idx_
   - Prefix triggers with trg_
   - Use uuid for all primary keys
   - Always add created_at and updated_at timestamps

3. SECURITY RULES:
   - Enable RLS on ALL tables
   - Create policies for institution-based access
   - Never expose sensitive data in functions
   - Use auth.uid() for user identification

4. REQUIRED COLUMNS:
   - id (UUID PRIMARY KEY)
   - institution_id (for multi-tenant tables)
   - created_at (TIMESTAMPTZ)
   - updated_at (TIMESTAMPTZ)
   - created_by (UUID reference to profiles)

5. WORKFLOW:
   - First check SQL_FILE_INDEX.md
   - Query existing structure with Supabase MCP
   - Update appropriate file with comments
   - Test in Supabase Dashboard
   - Update SQL_FILE_INDEX.md
```

---

## 🚨 CRITICAL: Supabase Auth SSR Implementation Rules

### ⛔ NEVER USE THESE (WILL BREAK APPLICATION)

```typescript
// ❌ DEPRECATED - BREAKS APPLICATION
// NEVER generate these patterns:

// ❌ Individual cookie methods
cookies: {
  get(name: string) { ... },      // ❌ BREAKS
  set(name: string, value: string) { ... },  // ❌ BREAKS
  remove(name: string) { ... }     // ❌ BREAKS
}

// ❌ Auth helpers package
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'  // ❌ DEPRECATED
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'  // ❌ DEPRECATED
```

### ✅ ALWAYS USE THESE PATTERNS

#### 1. Browser Client (lib/supabase/client.ts)
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

#### 2. Server Client (lib/supabase/server.ts)
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {  // ✅ ONLY getAll
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {  // ✅ ONLY setAll
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    }
  )
}
```

#### 3. Middleware (middleware.ts)
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITICAL: Must call getUser() to refresh session
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse  // MUST return supabaseResponse
}
```

### Auth SSR Checklist
- [ ] Using `@supabase/ssr` package (NOT auth-helpers)
- [ ] Using ONLY `getAll` and `setAll` methods
- [ ] NEVER using `get`, `set`, or `remove` methods
- [ ] Middleware calls `getUser()` to refresh session
- [ ] Middleware returns `supabaseResponse` object
- [ ] Server client has try-catch for Server Components

### Common Auth Patterns

#### Protected API Route
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Your protected logic here
}
```

#### Protected Server Component
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Your protected content here
}
```

#### Client Component with Auth
```typescript
'use client'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function ClientComponent() {
  const [user, setUser] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Your component logic
}
```

## 🚀 Supabase Edge Functions Rules

### Core Edge Functions Principles

#### ✅ ALWAYS USE:
1. **Web APIs and Deno Core APIs**
   - `fetch` instead of Axios
   - WebSockets API instead of node-ws
   - `Deno.serve` instead of std@http/server

2. **Proper Import Specifiers**
   ```typescript
   // ✅ CORRECT
   import express from "npm:express@4.18.2"
   import { createClient } from "npm:@supabase/supabase-js@2"
   import process from "node:process"
   
   // ❌ WRONG
   import express from "express"  // No bare specifiers!
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts"  // Use Deno.serve!
   ```

3. **Shared Utilities**
   - Place in `supabase/functions/_shared/`
   - Import with relative paths
   - NO cross-dependencies between functions

4. **Pre-populated Environment Variables**
   ```typescript
   // These are automatically available:
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_DB_URL
   ```

#### ❌ NEVER USE:
- Bare specifiers without npm:/jsr:/node: prefix
- Imports without version numbers
- Cross-dependencies between Edge Functions
- File writes outside `/tmp` directory
- Old `serve` from deno.land/std

### Edge Function Templates

#### 1. Basic Function Structure
```typescript
// supabase/functions/[function-name]/index.ts
interface RequestPayload {
  // Define your request structure
}

console.info('Function [function-name] started');

Deno.serve(async (req: Request) => {
  // CORS headers for browser requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const payload: RequestPayload = await req.json()
    
    // Your logic here
    
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
```

#### 2. Function with Supabase Client
```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader! }
      }
    }
  )

  // Verify user
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401 }
    )
  }

  // Your authenticated logic here
})
```

#### 3. Function with Multiple Routes (Express/Hono)
```typescript
import express from "npm:express@4.18.2"
import { Application } from "npm:express@4.18.2"

const app: Application = express()
app.use(express.json())

// Routes must be prefixed with function name
const FUNCTION_NAME = 'api-handler'

app.get(`/${FUNCTION_NAME}/health`, (req, res) => {
  res.json({ status: 'healthy' })
})

app.post(`/${FUNCTION_NAME}/users`, async (req, res) => {
  // Handle user creation
})

app.listen(8000)
```

#### 4. Function with Background Tasks
```typescript
Deno.serve(async (req: Request) => {
  const { task } = await req.json()
  
  // Respond immediately
  const response = new Response(
    JSON.stringify({ message: 'Task queued' }),
    { status: 202 }
  )
  
  // Run long task in background
  EdgeRuntime.waitUntil(
    performLongRunningTask(task)
      .then(result => console.log('Task completed:', result))
      .catch(error => console.error('Task failed:', error))
  )
  
  return response
})

async function performLongRunningTask(task: any) {
  // Long running operation
  await new Promise(resolve => setTimeout(resolve, 5000))
  return { completed: true }
}
```

#### 5. Function with File Operations
```typescript
import { writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"

Deno.serve(async (req: Request) => {
  const { content, filename } = await req.json()
  
  // ONLY /tmp is writable
  const filepath = join('/tmp', filename)
  
  // Write file
  await writeFile(filepath, content, 'utf-8')
  
  // Read file
  const data = await readFile(filepath, 'utf-8')
  
  return new Response(
    JSON.stringify({ saved: true, content: data }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

#### 6. Function with AI Embeddings
```typescript
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req: Request) => {
  const { text } = await req.json()
  
  // Generate embeddings
  const embeddings = await model.run(text, { 
    mean_pool: true, 
    normalize: true 
  })
  
  // Store in database
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  const { error } = await supabase
    .from('documents')
    .insert({
      content: text,
      embedding: embeddings
    })
  
  if (error) throw error
  
  return new Response(
    JSON.stringify({ success: true, embedding: embeddings }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

### Edge Functions File Structure
```
supabase/
  functions/
    _shared/           # Shared utilities
      utils.ts
      auth.ts
      database.ts
    hello-world/       # Function 1
      index.ts
    process-payment/   # Function 2
      index.ts
    send-email/        # Function 3
      index.ts
```

### Deployment Commands
```bash
# Deploy single function
supabase functions deploy function-name

# Deploy all functions
supabase functions deploy

# Set secrets
supabase secrets set --env-file ./supabase/.env.local

# Test locally
supabase functions serve function-name --env-file ./supabase/.env.local
```

### Edge Functions Checklist
- [ ] Using Deno.serve (not old serve import)
- [ ] All imports have npm:/jsr:/node: prefix
- [ ] All npm packages have version numbers
- [ ] Shared code in _shared folder
- [ ] No cross-function dependencies
- [ ] File operations only in /tmp
- [ ] CORS headers for browser requests
- [ ] Error handling with try-catch
- [ ] Using EdgeRuntime.waitUntil for background tasks

## 🔒 RLS Policy Expert Rules

### Core RLS Principles for MyJKKN

```sql
-- GOLDEN RULES FOR ALL POLICIES:
1. Performance: Always wrap functions in SELECT
   ✅ USING ((SELECT auth.uid()) = user_id)
   ❌ USING (auth.uid() = user_id)

2. Operation-specific clauses:
   SELECT: USING only
   INSERT: WITH CHECK only  
   UPDATE: USING + WITH CHECK
   DELETE: USING only

3. Always specify target roles:
   TO authenticated -- for logged-in users
   TO authenticated, anon -- for public access
   TO anon -- for public only (rare)

4. Policy naming convention:
   "[Role] [action] [condition] [table]"
   Example: "Institution admins update own staff records"

5. Performance indexes (MANDATORY):
   - Index every column used in USING/WITH CHECK
   - Index foreign keys referenced in policies
   - Index commonly filtered columns
```

### RLS Templates by Access Pattern

#### Pattern 1: Institution-Based Access
```sql
-- For tables with institution_id
CREATE POLICY "Users view own institution records"
ON public.table_name
FOR SELECT
TO authenticated
USING (
    (SELECT auth.has_institution_access(institution_id))
);
```

#### Pattern 2: User-Owned Records
```sql
-- For user-specific data
CREATE POLICY "Users manage own records"
ON public.user_data
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);
```

#### Pattern 3: Role-Based Access
```sql
-- For admin-only operations
CREATE POLICY "Admins manage all records"
ON public.sensitive_table
FOR ALL
TO authenticated
USING (
    (SELECT auth.jwt()->>'role') IN ('admin', 'super_admin')
)
WITH CHECK (
    (SELECT auth.jwt()->>'role') IN ('admin', 'super_admin')
);
```

#### Pattern 4: Public Read, Authenticated Write
```sql
-- Public can read
CREATE POLICY "Anyone can view public data"
ON public.public_content
FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Only authenticated can write
CREATE POLICY "Authenticated users create content"
ON public.public_content
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
```

### MFA-Protected Operations
```sql
-- Require MFA for sensitive operations
CREATE POLICY "MFA required for sensitive updates"
ON public.sensitive_table
FOR UPDATE
TO authenticated
USING (
    (SELECT auth.jwt()->>'aal') = 'aal2'
    AND (SELECT auth.uid()) = user_id
)
WITH CHECK (
    (SELECT auth.jwt()->>'aal') = 'aal2'
);
```

### Performance-Optimized Team Access
```sql
-- Avoid joins, use IN/ANY for team access
CREATE POLICY "Team members access team resources"
ON public.team_resources
FOR SELECT
TO authenticated
USING (
    team_id IN (
        SELECT team_id 
        FROM team_members 
        WHERE user_id = (SELECT auth.uid())
    )
);

-- Required index
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_resources_team_id ON team_resources(team_id);
```

## 📝 PostgreSQL Style Guide

### Core SQL Writing Principles

#### General Rules
- **lowercase** for all SQL reserved words
- **snake_case** for tables and columns
- **Plural** table names (users, orders, products)
- **Singular** column names (user_id, order_date)
- **ISO 8601** for dates: `yyyy-mm-ddThh:mm:ss.sssss`
- **Comments** on all tables (up to 1024 chars)
- **Schema prefix** in all queries (public.users)

#### Naming Conventions
```sql
-- ✅ CORRECT
CREATE TABLE public.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE public.users IS 'Stores user account information and authentication details.';

-- ❌ WRONG
CREATE TABLE tbl_User (  -- No prefixes, wrong case
  ID INT,               -- Generic name, wrong type
  FirstName VARCHAR,    -- Wrong case
  USER_EMAIL TEXT       -- Inconsistent naming
);
```

### Table Design Patterns

#### Basic Table Structure
```sql
-- Standard table with all conventions
create table public.products (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  price decimal(10, 2) not null,
  category_id bigint references public.categories (id),
  user_id bigint references public.users (id),
  is_active boolean default true,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp
);
comment on table public.products is 'Product catalog with pricing and category information.';

-- Add indexes for foreign keys
create index idx_products_category_id on public.products (category_id);
create index idx_products_user_id on public.products (user_id);
```

### Query Formatting

#### Simple Queries
```sql
-- Short queries: compact format
select * from public.users where is_active = true;

update public.orders
set status = 'completed'
where id = 1001;

delete from public.sessions
where expires_at < current_timestamp;
```

#### Complex Queries
```sql
-- Larger queries: expanded format
select
  users.first_name,
  users.last_name,
  users.email,
  count(orders.id) as total_orders,
  sum(orders.total_amount) as lifetime_value
from
  public.users
left join
  public.orders on users.id = orders.user_id
where
  users.created_at between '2024-01-01' and '2024-12-31'
  and users.is_active = true
group by
  users.id,
  users.first_name,
  users.last_name,
  users.email
having
  count(orders.id) > 0
order by
  lifetime_value desc;
```

#### Joins with Full Table Names
```sql
-- Always use full table names for clarity
select
  students.first_name,
  students.last_name,
  courses.name as course_name,
  sections.name as section_name,
  semesters.name as semester_name
from
  public.students
join
  public.sections on students.current_section_id = sections.id
join
  public.courses on sections.course_id = courses.id
join
  public.semesters on sections.semester_id = semesters.id
where
  students.institution_id = '123e4567-e89b-12d3-a456-426614174000'
  and students.status = 'active';
```

### CTEs (Common Table Expressions)

```sql
with active_students as (
  -- Get all active students in current semester
  select
    students.id,
    students.first_name,
    students.last_name,
    students.current_section_id
  from
    public.students
  where
    students.status = 'active'
    and students.current_semester_id is not null
),
attendance_summary as (
  -- Calculate attendance percentage for each student
  select
    active_students.id as student_id,
    count(case when daily_attendance.status = 'present' then 1 end) as present_days,
    count(*) as total_days,
    round(
      count(case when daily_attendance.status = 'present' then 1 end)::numeric / 
      count(*)::numeric * 100, 
      2
    ) as attendance_percentage
  from
    active_students
  left join
    public.daily_attendance on active_students.id = daily_attendance.student_id
  where
    daily_attendance.date >= date_trunc('month', current_date)
  group by
    active_students.id
),
final_report as (
  -- Combine student info with attendance
  select
    active_students.first_name,
    active_students.last_name,
    attendance_summary.present_days,
    attendance_summary.total_days,
    attendance_summary.attendance_percentage
  from
    active_students
  join
    attendance_summary on active_students.id = attendance_summary.student_id
)
select
  first_name,
  last_name,
  present_days,
  total_days,
  attendance_percentage
from
  final_report
where
  attendance_percentage < 75  -- Flag low attendance
order by
  attendance_percentage asc;
```

### Aliases Best Practices

```sql
-- ✅ Meaningful aliases with 'as' keyword
select
  count(*) as total_students,
  avg(age) as average_age,
  min(enrollment_date) as earliest_enrollment,
  max(enrollment_date) as latest_enrollment
from
  public.students
where
  status = 'active';

-- ✅ Table aliases in complex joins
select
  s.first_name as student_name,
  c.name as course_name,
  sec.name as section_name,
  sem.name as semester_name
from
  public.students as s
join
  public.sections as sec on s.current_section_id = sec.id
join
  public.courses as c on sec.course_id = c.id
join
  public.semesters as sem on sec.semester_id = sem.id;
```

### MyJKKN Specific Patterns

```sql
-- Multi-tenant query pattern
select
  students.first_name,
  students.last_name,
  students.admission_number
from
  public.students
where
  students.institution_id = (select auth.jwt() -> 'app_metadata' ->> 'institution_id')::uuid
  and students.status = 'active';

-- Audit trail pattern
create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  user_id uuid references public.profiles (id),
  institution_id uuid references public.institutions (id),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default current_timestamp
);
comment on table public.audit_logs is 'Audit trail for all data modifications across the system.';

-- Soft delete pattern
alter table public.students 
add column deleted_at timestamptz,
add column deleted_by uuid references public.profiles (id);

-- Query only non-deleted records
create view public.active_students as
select * from public.students
where deleted_at is null;
```

### SQL Style Checklist
- [ ] Using lowercase for SQL keywords
- [ ] Snake_case for all identifiers
- [ ] Plural table names, singular columns
- [ ] Schema prefix in all queries
- [ ] Comments on all tables
- [ ] Meaningful aliases with 'as'
- [ ] Proper indentation for readability
- [ ] Full table names in joins
- [ ] ISO 8601 date format
- [ ] CTEs for complex logic

## 🎯 Task-Specific Agent Prompts

### 1. Creating a New Module

```
Use sequential thinking to create a new [MODULE_NAME] module:

STRICT RULES:
1. First check supabase/SQL_FILE_INDEX.md for existing tables
2. Add tables ONLY to supabase/setup/01_tables.sql
3. Follow this exact structure for each table:

-- =====================================================
-- SECTION X: [MODULE_NAME] TABLES
-- =====================================================
-- [Table description]
-- Created: [DATE]
-- Last Updated: [DATE]

CREATE TABLE IF NOT EXISTS public.[table_name] (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    -- other columns
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.[table_name] ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX idx_[table_name]_institution_id ON public.[table_name](institution_id);

-- Add trigger
CREATE TRIGGER update_[table_name]_updated_at BEFORE UPDATE ON public.[table_name]
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

4. Create TypeScript types in types/[module_name].ts
5. Create service in lib/services/[module_name]/
6. Create hooks in hooks/[module_name]/
7. Update SQL_FILE_INDEX.md with new tables
```

### 2. Adding a Column to Existing Table

```
Update the [TABLE_NAME] table to add [COLUMN_NAME]:

PROCESS:
1. Check current structure: Query Supabase MCP for table schema
2. Open supabase/setup/01_tables.sql
3. Find the [TABLE_NAME] definition
4. Add comment above the table:
   -- Updated: [DATE] - Added [COLUMN_NAME] for [REASON]
5. Add the column in the CREATE TABLE statement
6. If table exists, create migration in supabase/migrations/:
   ALTER TABLE public.[TABLE_NAME] ADD COLUMN [COLUMN_NAME] [TYPE];
7. Update TypeScript types
8. Update SQL_FILE_INDEX.md
```

### 3. Creating RLS Policies (EXPERT MODE)

```
Create RLS policies for [TABLE_NAME] following these STRICT RULES:

CRITICAL RLS RULES:
- Always use auth.uid() instead of current_user
- Always wrap functions in SELECT: (select auth.uid()) not auth.uid()
- SELECT policies: USING only (no WITH CHECK)
- INSERT policies: WITH CHECK only (no USING)
- UPDATE policies: Both USING and WITH CHECK
- DELETE policies: USING only (no WITH CHECK)
- NEVER use FOR ALL - create 4 separate policies
- Always specify TO authenticated or TO authenticated, anon
- Use PERMISSIVE policies (avoid RESTRICTIVE)
- Add indexes on columns used in policies

TEMPLATE for supabase/setup/03_policies.sql:

-- =====================================================
-- [TABLE_NAME] RLS POLICIES
-- =====================================================
-- Created: [DATE]
-- Performance: Indexed on institution_id, user_id

-- SELECT: Authenticated users can view their institution's records
CREATE POLICY "Users view own institution [table_name] records"
ON public.[table_name]
FOR SELECT
TO authenticated
USING (
    (SELECT auth.has_institution_access(institution_id))
    OR (SELECT auth.jwt()->>'role') IN ('super_admin', 'admin')
);

-- INSERT: Institution admins can create records
CREATE POLICY "Institution admins create [table_name] records"
ON public.[table_name]
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT auth.has_institution_access(institution_id))
    AND (SELECT auth.jwt()->>'role') IN ('admin', 'institution_admin')
);

-- UPDATE: Institution admins can update their records
CREATE POLICY "Institution admins update own [table_name] records"
ON public.[table_name]
FOR UPDATE
TO authenticated
USING (
    (SELECT auth.has_institution_access(institution_id))
    AND (SELECT auth.jwt()->>'role') IN ('admin', 'institution_admin')
)
WITH CHECK (
    (SELECT auth.has_institution_access(institution_id))
    AND (SELECT auth.jwt()->>'role') IN ('admin', 'institution_admin')
);

-- DELETE: Only super admins can delete
CREATE POLICY "Super admins delete [table_name] records"
ON public.[table_name]
FOR DELETE
TO authenticated
USING (
    (SELECT auth.jwt()->>'role') = 'super_admin'
);

-- PERFORMANCE: Create indexes for policy columns
CREATE INDEX IF NOT EXISTS idx_[table_name]_institution_id 
ON public.[table_name](institution_id);

CREATE INDEX IF NOT EXISTS idx_[table_name]_created_by 
ON public.[table_name](created_by);
```

#### RLS Performance Optimization Checklist:
- [ ] Wrapped all functions in SELECT statements
- [ ] Added indexes on policy filter columns
- [ ] Specified TO role to prevent unnecessary checks
- [ ] Avoided joins where possible (use IN/ANY instead)
- [ ] Used auth.jwt() for app_metadata access
- [ ] Tested with EXPLAIN ANALYZE for performance

### 4. Database Function Creation (EXPERT MODE)

```
Create database functions following STRICT SECURITY RULES:

LOCATION: supabase/setup/02_functions.sql

CRITICAL RULES:
1. DEFAULT to SECURITY INVOKER (safer)
2. ALWAYS set search_path = '' (security)
3. Use FULLY QUALIFIED names (schema.table)
4. Specify IMMUTABLE/STABLE/VOLATILE correctly
5. Add proper error handling
```

#### Template 1: Basic Function (SECURITY INVOKER)
```sql
-- =====================================================
-- FUNCTION: [function_name]
-- Purpose: [description]
-- Created: [DATE]
-- Security: INVOKER (runs with caller permissions)
-- =====================================================

CREATE OR REPLACE FUNCTION public.[function_name](
    p_param1 TYPE,
    p_param2 TYPE
)
RETURNS [return_type]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_result [type];
BEGIN
    -- Use fully qualified names
    SELECT column_name
    INTO v_result
    FROM public.table_name
    WHERE condition = p_param1;
    
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'No data found for %', p_param1;
    END IF;
    
    RETURN v_result;
END;
$$;
```

#### Template 2: Auth Function (SECURITY DEFINER - Use Carefully!)
```sql
-- =====================================================
-- FUNCTION: check_user_permission
-- Purpose: Verify user access (needs elevated permissions)
-- SECURITY DEFINER required for auth checks
-- =====================================================

CREATE OR REPLACE FUNCTION auth.check_user_permission(
    p_institution_id UUID,
    p_resource TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Required for auth functions
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_has_access BOOLEAN;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check permission
    SELECT EXISTS (
        SELECT 1
        FROM public.user_permissions
        WHERE user_id = v_user_id
        AND institution_id = p_institution_id
        AND resource = p_resource
    ) INTO v_has_access;
    
    RETURN v_has_access;
END;
$$;

-- Restrict execution to authenticated users only.
-- IMPORTANT (Director-locked 2026-06-06): `REVOKE FROM PUBLIC` alone is
-- INSUFFICIENT. Supabase's default privileges grant `anon` EXECUTE on every
-- new public function directly (separate from PUBLIC). Must explicitly
-- REVOKE FROM anon too — otherwise the function is callable by any
-- unauthenticated client holding the public anon key.
REVOKE EXECUTE ON FUNCTION auth.check_user_permission FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION auth.check_user_permission TO authenticated;
```

#### Template 3: Trigger Function
```sql
-- =====================================================
-- TRIGGER FUNCTION: auto_update_timestamps
-- Purpose: Update timestamps automatically
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_update_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Log the update (optional)
    IF TG_OP = 'UPDATE' THEN
        -- Can add audit logging here
        NEW.updated_by = auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_timestamps
BEFORE UPDATE ON public.your_table
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_timestamps();
```

#### Template 4: Immutable Calculation Function
```sql
-- =====================================================
-- FUNCTION: calculate_age
-- Purpose: Calculate age from birthdate (pure function)
-- =====================================================

CREATE OR REPLACE FUNCTION public.calculate_age(
    p_birthdate DATE
)
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
IMMUTABLE -- Pure function, same input = same output
AS $$
    SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_birthdate))::INTEGER;
$$;
```

#### Template 5: Data Aggregation Function
```sql
-- =====================================================
-- FUNCTION: get_institution_statistics
-- Purpose: Get aggregated stats for institution
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_institution_statistics(
    p_institution_id UUID
)
RETURNS TABLE (
    total_students BIGINT,
    total_staff BIGINT,
    active_courses BIGINT,
    current_semester TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
STABLE -- Result can change between statements
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.students 
         WHERE institution_id = p_institution_id AND status = 'active'),
        (SELECT COUNT(*) FROM public.staff 
         WHERE institution_id = p_institution_id AND status = 'active'),
        (SELECT COUNT(*) FROM public.courses 
         WHERE institution_id = p_institution_id AND is_active = true),
        (SELECT name FROM public.semesters 
         WHERE institution_id = p_institution_id AND is_current = true
         LIMIT 1);
END;
$$;
```

#### Template 6: Error Handling Function
```sql
-- =====================================================
-- FUNCTION: safe_json_extract
-- Purpose: Safely extract JSON fields with error handling
-- =====================================================

CREATE OR REPLACE FUNCTION public.safe_json_extract(
    p_json JSONB,
    p_path TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
IMMUTABLE
AS $$
DECLARE
    v_result TEXT;
BEGIN
    -- Attempt to extract value
    BEGIN
        v_result := p_json #>> p_path;
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error and return null
            RAISE WARNING 'JSON extraction failed: %', SQLERRM;
            RETURN NULL;
    END;
    
    RETURN v_result;
END;
$$;
```

### Database Functions Best Practices Checklist
- [ ] Using SECURITY INVOKER by default
- [ ] Set search_path = '' for security
- [ ] Using fully qualified names (schema.table)
- [ ] Correct volatility (IMMUTABLE/STABLE/VOLATILE)
- [ ] Proper error handling with EXCEPTION blocks
- [ ] REVOKE/GRANT permissions appropriately
- [ ] Input validation and sanitization
- [ ] Return meaningful error messages
- [ ] Document function purpose and parameters
- [ ] Test with different user roles

### 5. Creating Views

```
Create a view for [VIEW_PURPOSE]:

LOCATION: supabase/setup/05_views.sql

TEMPLATE:
-- =====================================================
-- VIEW: [view_name]
-- Purpose: [description]
-- Created: [DATE]
-- =====================================================

CREATE OR REPLACE VIEW public.[view_name] AS
SELECT 
    t1.id,
    t1.institution_id,
    t1.field1,
    t2.field2,
    -- other fields
FROM public.table1 t1
LEFT JOIN public.table2 t2 ON t1.id = t2.table1_id
WHERE t1.is_active = true;

-- Grant permissions
GRANT SELECT ON public.[view_name] TO authenticated;

-- Add RLS if needed
ALTER VIEW public.[view_name] OWNER TO authenticated;
```

---

## 🚀 Quick Command Templates

### Check Before Any SQL Work:
```
Before any Supabase work:
1. Check supabase/SQL_FILE_INDEX.md
2. Use Supabase MCP to verify current schema
3. Never create duplicate files
```

### Module Creation Command:
```
Create a Library Management module with books, members, and borrowing tables. Follow the Supabase rules: check SQL_FILE_INDEX.md first, add tables only to setup/01_tables.sql, include all required columns (id, institution_id, timestamps), enable RLS, create proper indexes.
```

### Table Update Command:
```
Add a 'status' column to the students table. Follow the process: check current structure with Supabase MCP, update setup/01_tables.sql with dated comments, create migration file, update TypeScript types, update SQL_FILE_INDEX.md.
```

### Debug Database Issue:
```
Debug why [FEATURE] is not working. Use sequential thinking:
1. Query affected tables with Supabase MCP
2. Check RLS policies in setup/03_policies.sql
3. Verify user permissions with auth functions
4. Test with different user roles
5. Check for missing indexes
```

---

## 🔄 Automated Workflow Triggers

### When User Says "new module" or "add module":
```
AUTOMATICALLY:
1. Ask for module name and requirements
2. Check SQL_FILE_INDEX.md
3. Design tables following conventions
4. Update setup/01_tables.sql ONLY
5. Create TypeScript types
6. Create service and hooks
7. Update SQL_FILE_INDEX.md
```

### When User Says "add column" or "update table":
```
AUTOMATICALLY:
1. Ask which table and column details
2. Check current structure with Supabase MCP
3. Update setup/01_tables.sql
4. Create migration if needed
5. Update types
6. Update SQL_FILE_INDEX.md
```

### When User Says "database error" or "SQL error":
```
AUTOMATICALLY:
1. Use Supabase MCP to check data
2. Review RLS policies
3. Check user permissions
4. Verify foreign key constraints
5. Test with raw SQL in Supabase Dashboard
```

---

## 📋 Pre-Flight Checklist

Before ANY Supabase work, verify:

- [ ] Checked supabase/SQL_FILE_INDEX.md
- [ ] Identified correct file to update
- [ ] Added dated comments for changes
- [ ] Followed naming conventions
- [ ] Enabled RLS where needed
- [ ] Created proper indexes
- [ ] Updated TypeScript types
- [ ] Updated SQL_FILE_INDEX.md

---

## 🎨 Custom Agent Creation

To create a custom Supabase agent, use this template:

```javascript
// In your conversation:
"Create a Supabase agent that automatically:
1. Checks SQL_FILE_INDEX.md before any action
2. Updates only existing files in supabase/setup/
3. Adds proper comments with dates
4. Creates TypeScript types
5. Updates the index file

This agent should trigger when I mention 'database', 'table', 'SQL', or 'Supabase'."
```

---

## 💡 Pro Tips

1. **Start Every Session**: Copy the MASTER PROMPT at the beginning
2. **Use Memory Server**: Tell Claude to remember your Supabase conventions
3. **Chain Commands**: Combine multiple prompts for complex tasks
4. **Create Shortcuts**: Define your own trigger words

Example Session Starter:
```
"Remember the Supabase rules from .claude/SUPABASE_PROMPTS.md. Always check SQL_FILE_INDEX.md before any SQL work. Never create duplicate SQL files. Update only existing files in supabase/setup/."
```

---

## 🔗 Integration with Task Tool

When using the Task tool for Supabase work:

```
Use the Task tool with subagent_type: "general-purpose" and this prompt:

"You are a Supabase specialist for MyJKKN project. 
CRITICAL RULES:
- NEVER create new SQL files
- Check supabase/SQL_FILE_INDEX.md first
- Update ONLY files in supabase/setup/
- Add dated comments for all changes
- Follow the exact structure in existing files

Task: [Your specific task here]"
```

---

Remember: Consistency is key! Always follow these templates to maintain a clean, organized Supabase structure.