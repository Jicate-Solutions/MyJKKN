# Centralized Bug Reporter Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a centralized bug reporting platform with SDK package that allows development teams to integrate bug reporting into their applications, manage bugs across multiple apps, and run organization-specific bug bounty programs.

**Architecture:** Monorepo structure with centralized Next.js 15 platform app, React SDK package for integration, and shared types package. Single Supabase project with multi-tenant RLS architecture (Organization → Applications → Bugs). SDK distributed via GitHub Package Registry.

**Tech Stack:** Next.js 15 (App Router), Supabase (Auth, Database, Storage), React Query, TypeScript, Tailwind CSS, Shadcn/UI, npm workspaces

---

## Prerequisites

- Node.js 18+ installed
- npm 9+ installed
- Supabase account with new project created
- GitHub account for package registry
- Git configured

---

## Phase 1: Project Structure & Monorepo Setup

### Task 1.1: Initialize Monorepo Structure

**Files:**
- Create: `bug-reporter-platform/package.json`
- Create: `bug-reporter-platform/.gitignore`
- Create: `bug-reporter-platform/README.md`
- Create: `bug-reporter-platform/apps/.gitkeep`
- Create: `bug-reporter-platform/packages/.gitkeep`

**Step 1: Create root directory and initialize**

```bash
mkdir bug-reporter-platform
cd bug-reporter-platform
npm init -y
```

**Step 2: Configure workspace in package.json**

```json
{
  "name": "bug-reporter-platform",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=platform",
    "build": "npm run build --workspaces",
    "build:sdk": "npm run build --workspace=@your-org/bug-reporter-sdk",
    "publish:sdk": "npm run build:sdk && npm publish --workspace=@your-org/bug-reporter-sdk",
    "typecheck": "npm run typecheck --workspaces"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

**Step 3: Create .gitignore**

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Next.js
.next/
out/
build/
dist/

# Environment
.env
.env*.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Misc
*.log
.turbo/
```

**Step 4: Create README.md**

```markdown
# Centralized Bug Reporter Platform

A multi-tenant bug reporting platform with SDK for easy integration.

## Structure

- `apps/platform` - Centralized Next.js platform
- `packages/bug-reporter-sdk` - React SDK for integration
- `packages/shared` - Shared types and utilities

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Publish SDK

\`\`\`bash
npm run publish:sdk
\`\`\`
```

**Step 5: Create directory structure**

```bash
mkdir -p apps packages supabase/migrations supabase/setup
touch apps/.gitkeep packages/.gitkeep
```

**Step 6: Initialize git and commit**

```bash
git init
git add .
git commit -m "chore: initialize monorepo structure"
```

---

### Task 1.2: Create Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/organizations.ts`
- Create: `packages/shared/src/types/applications.ts`
- Create: `packages/shared/src/types/bug-reports.ts`
- Create: `packages/shared/src/types/index.ts`

**Step 1: Initialize shared package**

```bash
cd packages
mkdir -p shared/src/types
cd shared
npm init -y
```

**Step 2: Configure package.json**

```json
{
  "name": "@bug-reporter/shared",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create types/organizations.ts**

```typescript
export type OrganizationRole = 'owner' | 'admin' | 'developer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  settings?: {
    bug_bounty?: {
      weekly_prize?: number;
      currency?: string;
      internship_wins_required?: number;
      enabled?: boolean;
    };
    [key: string]: any;
  };
  subscription_tier?: 'free' | 'pro' | 'enterprise';
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  joined_at: string;
  user?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export interface CreateOrganizationPayload {
  name: string;
  slug: string;
  settings?: Organization['settings'];
}

export interface UpdateOrganizationPayload {
  name?: string;
  slug?: string;
  settings?: Organization['settings'];
}

export interface InviteMemberPayload {
  email: string;
  role: OrganizationRole;
}
```

**Step 5: Create types/applications.ts**

```typescript
export interface Application {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  api_key: string;
  created_by_user_id: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  settings?: {
    allowed_domains?: string[];
    webhook_url?: string;
    [key: string]: any;
  };
  _stats?: {
    total_bugs: number;
    resolved_bugs: number;
    pending_bugs: number;
  };
}

export interface CreateApplicationPayload {
  name: string;
  slug: string;
  app_url: string;
  settings?: Application['settings'];
}

export interface UpdateApplicationPayload {
  name?: string;
  slug?: string;
  app_url?: string;
  settings?: Application['settings'];
}

export interface RegenerateApiKeyResponse {
  api_key: string;
}
```

**Step 6: Create types/bug-reports.ts**

```typescript
// Copy from existing MyJKKN types/bugs.ts with additions
export type BugReportStatus =
  | 'new'
  | 'seen'
  | 'in_progress'
  | 'resolved'
  | 'wont_fix';

export type BugReportCategory =
  | 'bug'
  | 'feature_request'
  | 'ui_design'
  | 'performance'
  | 'security'
  | 'other';

export interface BugReport {
  id: string;
  display_id: string;
  created_at: string;

  // Multi-tenant fields
  organization_id: string;
  application_id: string;

  // Reporter info
  reporter_user_id: string;
  reporter?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;

  // Bug details
  page_url: string;
  description: string;
  category?: BugReportCategory | null;
  screenshot_url?: string | null;
  console_logs?: any[] | null;
  status: BugReportStatus;
  resolved_at?: string | null;

  // Metadata
  metadata?: {
    browser?: string;
    os?: string;
    userAgent?: string;
    screenResolution?: string;
    viewport?: string;
    [key: string]: any;
  } | null;

  // Optional context (deprecated for centralized platform)
  institution_id?: string | null;
  department_id?: string | null;
  institution_name?: string | null;
  department_name?: string | null;
  department_code?: string | null;
}

export interface BugReportLeaderboardEntry {
  user_id: string;
  user_name: string | null;
  avatar_url: string | null;
  total_bugs_count: number;
  resolved_bugs_count: number;
  organization_id?: string; // For org-specific leaderboards
}

export interface DetailedBugReport extends BugReport {
  reporter: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  application?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface BugReportMessage {
  id: string;
  bug_report_id: string;
  sender_user_id: string;
  message_text: string;
  message_type?: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  is_internal?: boolean;
  reply_to_message_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  edited_at?: string | null;
  is_deleted?: boolean;
  sender?: {
    id: string;
    full_name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
}

export interface BugReportParticipant {
  id: string;
  bug_report_id: string;
  user_id: string;
  role?: string;
  can_view_internal?: boolean;
  joined_at?: string | null;
  last_read_at?: string | null;
  is_active?: boolean;
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
}

export interface BugReportFilters {
  status?: BugReportStatus;
  category?: BugReportCategory;
  organization_id?: string;
  application_id?: string;
  page?: number;
  limit?: number;
}

// SDK-specific types
export interface CreateBugReportPayload {
  page_url: string;
  description: string;
  category?: BugReportCategory;
  screenshot_data_url?: string;
  console_logs?: any[];
  metadata?: object;

  // User context (optional, provided by SDK)
  user_email?: string;
  user_name?: string;
  user_id?: string;
}
```

**Step 7: Create types/index.ts**

```typescript
// Organizations
export * from './organizations';

// Applications
export * from './applications';

// Bug Reports
export * from './bug-reports';
```

**Step 8: Create src/index.ts**

```typescript
export * from './types';
```

**Step 9: Commit shared package**

```bash
cd ../.. # back to root
git add packages/shared
git commit -m "feat(shared): add shared types package"
```

---

## Phase 2: Database Schema & Supabase Setup

### Task 2.1: Create Database Schema

**Files:**
- Create: `supabase/setup/01_tables.sql`
- Create: `supabase/setup/02_functions.sql`
- Create: `supabase/setup/03_policies.sql`
- Create: `supabase/setup/04_triggers.sql`
- Create: `supabase/setup/05_views.sql`
- Create: `supabase/SQL_FILE_INDEX.md`

**Step 1: Create SQL_FILE_INDEX.md**

```markdown
# SQL File Index

## File Organization

- **01_tables.sql** - All table definitions
- **02_functions.sql** - Database functions
- **03_policies.sql** - RLS policies
- **04_triggers.sql** - Database triggers
- **05_views.sql** - Database views

## Last Updated: 2025-01-16

## Tables
- organizations
- organization_members
- applications
- bug_reports (enhanced with org/app fields)
- bug_report_messages
- bug_report_participants

## Views
- bug_reporters_leaderboard_org (per-organization)
```

**Step 2: Create 01_tables.sql**

```sql
-- Updated: 2025-01-16 - Initial schema for centralized bug reporter platform

-- =============================================
-- ORGANIZATIONS
-- =============================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise'))
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);

-- =============================================
-- ORGANIZATION MEMBERS
-- =============================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer')),
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(organization_id, role);

-- =============================================
-- APPLICATIONS
-- =============================================

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,

  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_applications_org ON applications(organization_id);
CREATE INDEX idx_applications_api_key ON applications(api_key);
CREATE INDEX idx_applications_creator ON applications(created_by_user_id);

-- =============================================
-- BUG REPORTS (Enhanced from existing)
-- =============================================

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Multi-tenant fields (NEW)
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  -- Reporter
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Bug details
  page_url TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT CHECK (category IN ('bug', 'feature_request', 'ui_design', 'performance', 'security', 'other')),
  screenshot_url TEXT,
  console_logs JSONB,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'in_progress', 'resolved', 'wont_fix')),
  resolved_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Legacy fields (keep for compatibility, but not used in centralized platform)
  institution_id UUID,
  department_id UUID,
  institution_name TEXT,
  department_name TEXT,
  department_code TEXT
);

CREATE INDEX idx_bug_reports_org ON bug_reports(organization_id);
CREATE INDEX idx_bug_reports_app ON bug_reports(application_id);
CREATE INDEX idx_bug_reports_reporter ON bug_reports(reporter_user_id);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_created ON bug_reports(created_at DESC);
CREATE INDEX idx_bug_reports_display_id ON bug_reports(display_id);

-- =============================================
-- BUG REPORT MESSAGES (Reuse existing)
-- =============================================

CREATE TABLE IF NOT EXISTS bug_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'user_message',
  attachment_url TEXT,
  attachment_type TEXT,
  is_internal BOOLEAN DEFAULT false,
  reply_to_message_id UUID REFERENCES bug_report_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_bug_messages_report ON bug_report_messages(bug_report_id);
CREATE INDEX idx_bug_messages_sender ON bug_report_messages(sender_user_id);
CREATE INDEX idx_bug_messages_created ON bug_report_messages(created_at);

-- =============================================
-- BUG REPORT PARTICIPANTS (Reuse existing)
-- =============================================

CREATE TABLE IF NOT EXISTS bug_report_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'participant',
  can_view_internal BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  UNIQUE(bug_report_id, user_id)
);

CREATE INDEX idx_bug_participants_report ON bug_report_participants(bug_report_id);
CREATE INDEX idx_bug_participants_user ON bug_report_participants(user_id);

-- =============================================
-- MESSAGE READ TRACKING (Reuse existing)
-- =============================================

CREATE TABLE IF NOT EXISTS bug_report_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES bug_report_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_reads_message ON bug_report_message_reads(message_id);
CREATE INDEX idx_message_reads_user ON bug_report_message_reads(user_id);
```

**Step 3: Create 02_functions.sql**

```sql
-- Updated: 2025-01-16 - Functions for centralized bug reporter

-- =============================================
-- GENERATE DISPLAY ID FOR BUG REPORTS
-- =============================================

CREATE OR REPLACE FUNCTION generate_bug_display_id()
RETURNS TEXT AS $$
DECLARE
  new_id TEXT;
  count INTEGER;
BEGIN
  -- Get count of existing bugs + 1
  SELECT COUNT(*) + 1 INTO count FROM bug_reports;

  -- Format as BUG-001, BUG-002, etc.
  new_id := 'BUG-' || LPAD(count::TEXT, 3, '0');

  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM bug_reports WHERE display_id = new_id) LOOP
    count := count + 1;
    new_id := 'BUG-' || LPAD(count::TEXT, 3, '0');
  END LOOP;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- GENERATE API KEY FOR APPLICATIONS
-- =============================================

CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS TEXT AS $$
DECLARE
  new_key TEXT;
  characters TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  key_length INTEGER := 32;
  i INTEGER;
BEGIN
  new_key := 'app_';

  FOR i IN 1..key_length LOOP
    new_key := new_key || substr(characters, floor(random() * length(characters) + 1)::INTEGER, 1);
  END LOOP;

  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM applications WHERE api_key = new_key) LOOP
    new_key := 'app_';
    FOR i IN 1..key_length LOOP
      new_key := new_key || substr(characters, floor(random() * length(characters) + 1)::INTEGER, 1);
    END LOOP;
  END LOOP;

  RETURN new_key;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- AUTO-ADD OWNER TO ORGANIZATION MEMBERS
-- =============================================

CREATE OR REPLACE FUNCTION add_owner_to_org_members()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.owner_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- UPDATE UPDATED_AT TIMESTAMP
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Step 4: Create 03_policies.sql**

```sql
-- Updated: 2025-01-16 - RLS policies for multi-tenant bug reporter

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_message_reads ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ORGANIZATIONS POLICIES
-- =============================================

-- Users can view organizations they're members of
CREATE POLICY "org_members_view_org"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can create organizations (they become owner)
CREATE POLICY "users_create_org"
  ON organizations FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- Only owners can update organizations
CREATE POLICY "owners_update_org"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- Only owners can delete organizations
CREATE POLICY "owners_delete_org"
  ON organizations FOR DELETE
  USING (
    id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- =============================================
-- ORGANIZATION MEMBERS POLICIES
-- =============================================

-- Members can view other members in their orgs
CREATE POLICY "members_view_members"
  ON organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Owners and admins can add members
CREATE POLICY "owners_admins_add_members"
  ON organization_members FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Owners and admins can update members
CREATE POLICY "owners_admins_update_members"
  ON organization_members FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Owners and admins can remove members (but not themselves)
CREATE POLICY "owners_admins_remove_members"
  ON organization_members FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    AND user_id != auth.uid()
  );

-- =============================================
-- APPLICATIONS POLICIES
-- =============================================

-- Members can view apps in their organization
-- Developers see only their own apps
-- Admins and owners see all apps
CREATE POLICY "members_view_apps"
  ON applications FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND (
      -- Admins/Owners see all
      EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = auth.uid()
        AND organization_id = applications.organization_id
        AND role IN ('owner', 'admin')
      )
      -- Developers see only their apps
      OR created_by_user_id = auth.uid()
    )
  );

-- Members can create apps in their organization
CREATE POLICY "members_create_apps"
  ON applications FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND created_by_user_id = auth.uid()
  );

-- App creators and admins/owners can update apps
CREATE POLICY "creators_admins_update_apps"
  ON applications FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND (
      created_by_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = auth.uid()
        AND organization_id = applications.organization_id
        AND role IN ('owner', 'admin')
      )
    )
  );

-- App creators and admins/owners can delete apps
CREATE POLICY "creators_admins_delete_apps"
  ON applications FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND (
      created_by_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = auth.uid()
        AND organization_id = applications.organization_id
        AND role IN ('owner', 'admin')
      )
    )
  );

-- =============================================
-- BUG REPORTS POLICIES
-- =============================================

-- Members can view bugs from their organization
CREATE POLICY "members_view_bugs"
  ON bug_reports FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Anyone can create bugs (for SDK submissions)
-- This will be further restricted by API key validation in application code
CREATE POLICY "public_create_bugs"
  ON bug_reports FOR INSERT
  WITH CHECK (true);

-- Members can update bugs in their organization
CREATE POLICY "members_update_bugs"
  ON bug_reports FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Only admins and owners can delete bugs
CREATE POLICY "admins_delete_bugs"
  ON bug_reports FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- =============================================
-- BUG REPORT MESSAGES POLICIES
-- =============================================

-- Participants can view messages for bugs in their org
CREATE POLICY "participants_view_messages"
  ON bug_report_messages FOR SELECT
  USING (
    bug_report_id IN (
      SELECT id FROM bug_reports
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Participants can create messages
CREATE POLICY "participants_create_messages"
  ON bug_report_messages FOR INSERT
  WITH CHECK (
    bug_report_id IN (
      SELECT id FROM bug_reports
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
    AND sender_user_id = auth.uid()
  );

-- Senders can update their own messages
CREATE POLICY "senders_update_messages"
  ON bug_report_messages FOR UPDATE
  USING (sender_user_id = auth.uid());

-- Senders can delete their own messages
CREATE POLICY "senders_delete_messages"
  ON bug_report_messages FOR DELETE
  USING (sender_user_id = auth.uid());

-- =============================================
-- BUG REPORT PARTICIPANTS POLICIES
-- =============================================

-- Org members can view participants
CREATE POLICY "members_view_participants"
  ON bug_report_participants FOR SELECT
  USING (
    bug_report_id IN (
      SELECT id FROM bug_reports
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Anyone can become a participant (auto-added when messaging)
CREATE POLICY "public_create_participants"
  ON bug_report_participants FOR INSERT
  WITH CHECK (true);

-- Users can update their own participant record
CREATE POLICY "users_update_own_participant"
  ON bug_report_participants FOR UPDATE
  USING (user_id = auth.uid());

-- =============================================
-- MESSAGE READS POLICIES
-- =============================================

-- Users can view read status for messages they can see
CREATE POLICY "users_view_reads"
  ON bug_report_message_reads FOR SELECT
  USING (
    message_id IN (
      SELECT id FROM bug_report_messages
      WHERE bug_report_id IN (
        SELECT id FROM bug_reports
        WHERE organization_id IN (
          SELECT organization_id
          FROM organization_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can mark messages as read
CREATE POLICY "users_create_reads"
  ON bug_report_message_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

**Step 5: Create 04_triggers.sql**

```sql
-- Updated: 2025-01-16 - Triggers for centralized bug reporter

-- =============================================
-- AUTO-GENERATE BUG DISPLAY ID
-- =============================================

CREATE TRIGGER set_bug_display_id
  BEFORE INSERT ON bug_reports
  FOR EACH ROW
  WHEN (NEW.display_id IS NULL)
  EXECUTE FUNCTION generate_bug_display_id();

-- =============================================
-- AUTO-GENERATE APPLICATION API KEY
-- =============================================

CREATE TRIGGER set_app_api_key
  BEFORE INSERT ON applications
  FOR EACH ROW
  WHEN (NEW.api_key IS NULL OR NEW.api_key = '')
  EXECUTE FUNCTION generate_api_key();

-- =============================================
-- AUTO-ADD OWNER TO ORG MEMBERS
-- =============================================

CREATE TRIGGER add_owner_after_org_create
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION add_owner_to_org_members();

-- =============================================
-- UPDATE TIMESTAMPS
-- =============================================

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bug_messages_updated_at
  BEFORE UPDATE ON bug_report_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 6: Create 05_views.sql**

```sql
-- Updated: 2025-01-16 - Views for centralized bug reporter

-- =============================================
-- BUG REPORTS WITH DETAILS (Enhanced with org/app)
-- =============================================

CREATE OR REPLACE VIEW bug_reports_with_details AS
SELECT
  br.*,
  p.full_name as reporter_name,
  p.email as reporter_email,
  app.name as application_name,
  app.slug as application_slug,
  org.name as organization_name,
  org.slug as organization_slug
FROM bug_reports br
LEFT JOIN profiles p ON br.reporter_user_id = p.id
LEFT JOIN applications app ON br.application_id = app.id
LEFT JOIN organizations org ON br.organization_id = org.id;

-- =============================================
-- BUG REPORTERS LEADERBOARD (Per Organization)
-- =============================================

CREATE OR REPLACE VIEW bug_reporters_leaderboard_org AS
SELECT
  br.organization_id,
  br.reporter_user_id as user_id,
  p.full_name as user_name,
  p.avatar_url,
  COUNT(br.id) as total_bugs_count,
  COUNT(CASE WHEN br.status = 'resolved' THEN 1 END) as resolved_bugs_count,
  RANK() OVER (
    PARTITION BY br.organization_id
    ORDER BY COUNT(br.id) DESC
  ) as rank
FROM bug_reports br
LEFT JOIN profiles p ON br.reporter_user_id = p.id
GROUP BY br.organization_id, br.reporter_user_id, p.full_name, p.avatar_url
ORDER BY br.organization_id, total_bugs_count DESC;

-- =============================================
-- APPLICATION STATS
-- =============================================

CREATE OR REPLACE VIEW application_stats AS
SELECT
  app.id as application_id,
  app.organization_id,
  app.name as application_name,
  COUNT(br.id) as total_bugs,
  COUNT(CASE WHEN br.status = 'resolved' THEN 1 END) as resolved_bugs,
  COUNT(CASE WHEN br.status IN ('new', 'seen', 'in_progress') THEN 1 END) as pending_bugs,
  COUNT(CASE WHEN br.status = 'wont_fix' THEN 1 END) as wont_fix_bugs,
  MAX(br.created_at) as last_bug_at
FROM applications app
LEFT JOIN bug_reports br ON app.id = br.application_id
GROUP BY app.id, app.organization_id, app.name;
```

**Step 7: Commit database schema**

```bash
git add supabase/
git commit -m "feat(db): add multi-tenant database schema"
```

---

### Task 2.2: Apply Schema to Supabase

**Step 1: Create .env.local in root**

```bash
touch .env.local
```

Add Supabase credentials:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Step 2: Apply schema via Supabase Dashboard**

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste contents of each file in order:
   - `01_tables.sql`
   - `02_functions.sql`
   - `03_policies.sql`
   - `04_triggers.sql`
   - `05_views.sql`
3. Run each one

**Step 3: Create storage bucket for bug screenshots**

In Supabase Dashboard → Storage:
1. Create new bucket: `bug-reports`
2. Set as public bucket
3. Add policy: Allow INSERT for authenticated users

**Step 4: Verify schema**

Run this query in SQL Editor:

```sql
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Expected tables: organizations, organization_members, applications, bug_reports, bug_report_messages, bug_report_participants, bug_report_message_reads

**Step 5: Commit environment template**

```bash
cp .env.local .env.example
# Remove actual values from .env.example
git add .env.example
git commit -m "chore: add environment template"
```

---

## Phase 3: SDK Package Development

### Task 3.1: Initialize SDK Package Structure

**Files:**
- Create: `packages/bug-reporter-sdk/package.json`
- Create: `packages/bug-reporter-sdk/tsconfig.json`
- Create: `packages/bug-reporter-sdk/src/index.ts`
- Create: `packages/bug-reporter-sdk/.npmrc`
- Create: `packages/bug-reporter-sdk/README.md`

**Step 1: Create SDK directory structure**

```bash
cd packages
mkdir -p bug-reporter-sdk/src/{components,api,hooks,utils,types}
cd bug-reporter-sdk
```

**Step 2: Initialize package.json**

```json
{
  "name": "@your-org/bug-reporter-sdk",
  "version": "1.0.0",
  "description": "Bug reporting SDK for centralized platform integration",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "require": "./dist/index.js",
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "bug-reporter",
    "error-tracking",
    "react"
  ],
  "author": "Your Organization",
  "license": "MIT",
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "dependencies": {
    "@bug-reporter/shared": "*",
    "html2canvas": "^1.4.1",
    "react-hot-toast": "^2.4.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .npmrc for GitHub Packages**

```
@your-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

**Step 5: Create README.md**

```markdown
# Bug Reporter SDK

React SDK for integrating centralized bug reporting into your applications.

## Installation

\`\`\`bash
npm install @your-org/bug-reporter-sdk
\`\`\`

## Setup

### 1. Get your API key

Register your application at the centralized platform to get an API key.

### 2. Add to your app

\`\`\`tsx
import { BugReporterProvider } from '@your-org/bug-reporter-sdk';

function App() {
  return (
    <BugReporterProvider
      apiKey="app_your_api_key_here"
      apiUrl="https://bugs.yourplatform.com"
    >
      <YourApp />
    </BugReporterProvider>
  );
}
\`\`\`

The floating bug button will automatically appear.

### 3. Optional: Add bug dashboard

\`\`\`tsx
import { MyBugsPanel } from '@your-org/bug-reporter-sdk';

function MyBugsPage() {
  return <MyBugsPanel />;
}
\`\`\`

## Features

- 🐛 Floating bug reporter button
- 📸 Automatic screenshot capture
- 📊 User bug dashboard
- 🔒 Secure API key authentication
- ⚡ Lightweight and performant

## License

MIT
\`\`\`

**Step 6: Commit SDK structure**

```bash
cd ../.. # back to root
git add packages/bug-reporter-sdk
git commit -m "feat(sdk): initialize SDK package structure"
```

---

### Task 3.2: Create API Client for SDK

**Files:**
- Create: `packages/bug-reporter-sdk/src/api/client.ts`
- Create: `packages/bug-reporter-sdk/src/types/config.ts`

**Step 1: Create types/config.ts**

```typescript
export interface BugReporterConfig {
  apiKey: string;
  apiUrl: string;
  enabled?: boolean;
  debug?: boolean;
  userContext?: {
    userId?: string;
    email?: string;
    name?: string;
  };
}

export interface ApiClientConfig {
  apiUrl: string;
  apiKey: string;
  debug?: boolean;
}
```

**Step 2: Create api/client.ts**

```typescript
import type {
  CreateBugReportPayload,
  BugReport,
  DetailedBugReport
} from '@bug-reporter/shared/types';
import type { ApiClientConfig } from '../types/config';

export class BugReporterApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...options.headers,
    };

    if (this.config.debug) {
      console.log('[BugReporter SDK] Request:', { url, method: options.method || 'GET' });
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `HTTP ${response.status}`);
      if (this.config.debug) {
        console.error('[BugReporter SDK] Error:', errorData);
      }
      throw error;
    }

    const data = await response.json();

    if (this.config.debug) {
      console.log('[BugReporter SDK] Response:', data);
    }

    return data;
  }

  async createBugReport(payload: CreateBugReportPayload): Promise<BugReport> {
    const response = await this.request<{ success: boolean; data: BugReport }>(
      '/api/v1/public/bug-reports',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return response.data;
  }

  async getMyBugReports(): Promise<BugReport[]> {
    const response = await this.request<BugReport[]>(
      '/api/v1/public/bug-reports/me'
    );
    return response;
  }

  async getBugReportById(id: string): Promise<DetailedBugReport> {
    const response = await this.request<DetailedBugReport>(
      `/api/v1/public/bug-reports/${id}`
    );
    return response;
  }

  async sendMessage(bugReportId: string, messageText: string): Promise<void> {
    await this.request(
      `/api/v1/public/bug-reports/${bugReportId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ message_text: messageText }),
      }
    );
  }
}
```

**Step 3: Commit API client**

```bash
git add packages/bug-reporter-sdk/src/api packages/bug-reporter-sdk/src/types
git commit -m "feat(sdk): add API client"
```

---

### Task 3.3: Create Bug Reporter Context & Provider

**Files:**
- Create: `packages/bug-reporter-sdk/src/components/BugReporterProvider.tsx`
- Create: `packages/bug-reporter-sdk/src/hooks/useBugReporter.ts`

**Step 1: Create components/BugReporterProvider.tsx**

```typescript
'use client';

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { BugReporterApiClient } from '../api/client';
import type { BugReporterConfig } from '../types/config';

interface BugReporterContextValue {
  apiClient: BugReporterApiClient | null;
  config: BugReporterConfig;
  isEnabled: boolean;
}

export const BugReporterContext = createContext<BugReporterContextValue | null>(null);

interface BugReporterProviderProps {
  children: ReactNode;
  apiKey: string;
  apiUrl: string;
  enabled?: boolean;
  debug?: boolean;
  userContext?: BugReporterConfig['userContext'];
}

export function BugReporterProvider({
  children,
  apiKey,
  apiUrl,
  enabled = true,
  debug = false,
  userContext,
}: BugReporterProviderProps) {
  const [apiClient, setApiClient] = useState<BugReporterApiClient | null>(null);

  const config: BugReporterConfig = {
    apiKey,
    apiUrl,
    enabled,
    debug,
    userContext,
  };

  useEffect(() => {
    if (enabled && apiKey && apiUrl) {
      const client = new BugReporterApiClient({
        apiUrl,
        apiKey,
        debug,
      });
      setApiClient(client);

      if (debug) {
        console.log('[BugReporter SDK] Initialized with config:', {
          apiUrl,
          enabled,
          hasUserContext: !!userContext,
        });
      }
    }
  }, [apiKey, apiUrl, enabled, debug, userContext]);

  return (
    <BugReporterContext.Provider value={{ apiClient, config, isEnabled: enabled }}>
      {children}
      {/* Auto-render BugReporterWidget */}
      {enabled && apiClient && <BugReporterWidget />}
    </BugReporterContext.Provider>
  );
}

// Import BugReporterWidget (will be created next)
// Temporary placeholder to avoid errors
function BugReporterWidget() {
  return null;
}
```

**Step 2: Create hooks/useBugReporter.ts**

```typescript
'use client';

import { useContext } from 'react';
import { BugReporterContext } from '../components/BugReporterProvider';

export function useBugReporter() {
  const context = useContext(BugReporterContext);

  if (!context) {
    throw new Error('useBugReporter must be used within BugReporterProvider');
  }

  return context;
}
```

**Step 3: Commit provider and hook**

```bash
git add packages/bug-reporter-sdk/src/components/BugReporterProvider.tsx
git add packages/bug-reporter-sdk/src/hooks/useBugReporter.ts
git commit -m "feat(sdk): add BugReporter context and provider"
```

---

### Task 3.4: Create Bug Reporter Widget Component

**Files:**
- Create: `packages/bug-reporter-sdk/src/components/BugReporterWidget.tsx`
- Create: `packages/bug-reporter-sdk/src/utils/screenshot.ts`

**Step 1: Create utils/screenshot.ts**

Copy from your existing implementation at `lib/utils/enhanced-logger.ts` and `components/bug-reporter/bug-reporter-widget.tsx`:

```typescript
import html2canvas from 'html2canvas';

function isMobileDevice(): boolean {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    (window.innerWidth <= 768 && 'ontouchstart' in window)
  );
}

export async function captureScreenshot(): Promise<string> {
  console.log('[BugReporter SDK] Starting screenshot capture...');

  const isMobile = isMobileDevice();
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  try {
    void document.body.offsetHeight;

    const options = {
      scale: Math.max(window.devicePixelRatio || 1, 2),
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      removeContainer: true,
      logging: false,
      imageTimeout: isMobile ? 15000 : 30000,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: originalScrollX,
      scrollY: originalScrollY,
      foreignObjectRendering: true,
      ignoreElements: (element: Element) => {
        if (element.classList.contains('bug-reporter-widget')) return true;
        if (element.classList.contains('bug-reporter-sdk')) return true;

        const className = element.className || '';
        if (typeof className === 'string') {
          const overlayClasses = [
            'radix-portal',
            'toast',
            'modal',
            'overlay',
            'popup',
            'dropdown',
            'tooltip',
            'popover',
            'dialog',
            'notification'
          ];
          if (overlayClasses.some((cls) => className.includes(cls))) {
            return true;
          }
        }

        const role = element.getAttribute('role');
        if (role && ['dialog', 'alertdialog', 'tooltip', 'menu'].includes(role)) {
          return true;
        }

        if (
          element.hasAttribute('data-radix-portal') ||
          element.hasAttribute('data-sonner-toaster') ||
          element.hasAttribute('data-html2canvas-ignore')
        ) {
          return true;
        }

        const computedStyle = window.getComputedStyle(element);
        if (
          computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          computedStyle.opacity === '0'
        ) {
          return true;
        }

        return false;
      },
    };

    await new Promise((resolve) => setTimeout(resolve, 800));

    const targetElement = document.querySelector('body') as HTMLElement;
    if (!targetElement) {
      throw new Error('Could not find body element');
    }

    const canvas = await html2canvas(targetElement, options as any);

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas creation failed');
    }

    const dataUrl = canvas.toDataURL('image/png', 1.0);

    console.log('[BugReporter SDK] Screenshot captured successfully');

    return dataUrl;
  } catch (error) {
    console.error('[BugReporter SDK] Screenshot capture failed:', error);
    throw error;
  }
}
```

**Step 2: Create components/BugReporterWidget.tsx**

Copy and adapt from your existing `components/bug-reporter/bug-reporter-widget.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { captureScreenshot } from '../utils/screenshot';
import { useBugReporter } from '../hooks/useBugReporter';
import toast from 'react-hot-toast';

// Simple inline styles (no Tailwind dependency for SDK)
const styles = {
  button: {
    position: 'fixed' as const,
    bottom: '1rem',
    right: '1rem',
    zIndex: 9999,
    width: '3rem',
    height: '3rem',
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '1rem',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    maxWidth: '28rem',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '0.25rem',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    marginBottom: '0.5rem',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  button: {
    padding: '0.5rem 1rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export function BugReporterWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string>('');
  const { apiClient, config } = useBugReporter();

  const handleOpenWidget = async () => {
    setIsCapturing(true);
    try {
      const captured = await captureScreenshot();
      setScreenshot(captured);
      setIsOpen(true);
      toast.success('Screenshot captured!');
    } catch (error) {
      console.error('[BugReporter SDK] Screenshot failed:', error);
      setIsOpen(true);
      toast.error('Screenshot capture failed, but you can still report the bug');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSubmit = async () => {
    if (!apiClient) {
      toast.error('Bug Reporter not initialized');
      return;
    }

    if (!description || description.trim().length < 10) {
      toast.error('Please provide at least 10 characters description');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        page_url: window.location.href,
        description: description.trim(),
        screenshot_data_url: screenshot,
        console_logs: [],
        metadata: {
          userAgent: navigator.userAgent,
          screenResolution: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
        },
        // Include user context if provided
        user_email: config.userContext?.email,
        user_name: config.userContext?.name,
        user_id: config.userContext?.userId,
      };

      await apiClient.createBugReport(payload);

      toast.success('Bug report submitted successfully!');
      setDescription('');
      setScreenshot('');
      setIsOpen(false);
    } catch (error) {
      console.error('[BugReporter SDK] Submit failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit bug report');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!config.isEnabled) return null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={handleOpenWidget}
        disabled={isCapturing}
        style={styles.button}
        className="bug-reporter-sdk"
        title="Report a Bug"
      >
        {isCapturing ? '📸' : '🐛'}
      </button>

      {/* Modal */}
      {isOpen && (
        <div style={styles.modal} className="bug-reporter-sdk">
          <div style={styles.card}>
            <div style={styles.header}>
              <h2 style={styles.title}>🐛 Report a Bug</h2>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setDescription('');
                  setScreenshot('');
                }}
                style={styles.closeButton}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={styles.label}>
                Describe the issue *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What went wrong? Please provide details..."
                style={styles.textarea}
                rows={4}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Minimum 10 characters required
              </p>
            </div>

            {screenshot && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={styles.label}>
                  ✓ Screenshot captured
                </label>
                <img
                  src={screenshot}
                  alt="Screenshot"
                  style={{
                    width: '100%',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                  }}
                />
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || description.trim().length < 10}
              style={{
                ...styles.button,
                width: '100%',
                ...(isSubmitting || description.trim().length < 10 ? styles.buttonDisabled : {}),
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

**Step 3: Update BugReporterProvider to import BugReporterWidget**

Update `packages/bug-reporter-sdk/src/components/BugReporterProvider.tsx`:

```typescript
// Replace the placeholder import with real one
import { BugReporterWidget } from './BugReporterWidget';

// Remove the placeholder function
```

**Step 4: Commit widget component**

```bash
git add packages/bug-reporter-sdk/src/components/BugReporterWidget.tsx
git add packages/bug-reporter-sdk/src/utils/screenshot.ts
git add packages/bug-reporter-sdk/src/components/BugReporterProvider.tsx
git commit -m "feat(sdk): add bug reporter widget component"
```

---

### Task 3.5: Create My Bugs Panel Component

**Files:**
- Create: `packages/bug-reporter-sdk/src/components/MyBugsPanel.tsx`

**Step 1: Create components/MyBugsPanel.tsx**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useBugReporter } from '../hooks/useBugReporter';
import type { BugReport } from '@bug-reporter/shared/types';

// Inline styles
const styles = {
  container: {
    padding: '1.5rem',
  },
  header: {
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
  },
  description: {
    color: '#6b7280',
    fontSize: '0.875rem',
  },
  loading: {
    textAlign: 'center' as const,
    padding: '2rem',
    color: '#6b7280',
  },
  error: {
    textAlign: 'center' as const,
    padding: '2rem',
    color: '#dc2626',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '3rem',
    color: '#6b7280',
  },
  bugCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  bugHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  bugId: {
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badge: (status: string) => ({
    display: 'inline-block',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '500',
    backgroundColor:
      status === 'resolved' ? '#d1fae5' :
      status === 'in_progress' ? '#fef3c7' :
      status === 'new' ? '#dbeafe' :
      '#f3f4f6',
    color:
      status === 'resolved' ? '#065f46' :
      status === 'in_progress' ? '#92400e' :
      status === 'new' ? '#1e40af' :
      '#374151',
  }),
  bugDescription: {
    fontSize: '0.875rem',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  bugFooter: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
};

export function MyBugsPanel() {
  const { apiClient, config } = useBugReporter();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBugs() {
      if (!apiClient) {
        setError('Bug Reporter not initialized');
        setIsLoading(false);
        return;
      }

      try {
        const data = await apiClient.getMyBugReports();
        setBugs(data);
        setError(null);
      } catch (err) {
        console.error('[BugReporter SDK] Failed to fetch bugs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load bug reports');
      } finally {
        setIsLoading(false);
      }
    }

    fetchBugs();
  }, [apiClient]);

  if (!config.isEnabled) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Bug Reports</h1>
        <p style={styles.description}>
          Track your submitted bug reports and their status
        </p>
      </div>

      {isLoading && (
        <div style={styles.loading}>Loading your bug reports...</div>
      )}

      {error && (
        <div style={styles.error}>Error: {error}</div>
      )}

      {!isLoading && !error && bugs.length === 0 && (
        <div style={styles.empty}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🐛</p>
          <p>No bug reports yet</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Found a bug? Click the bug button to report it!
          </p>
        </div>
      )}

      {!isLoading && !error && bugs.length > 0 && (
        <div>
          {bugs.map((bug) => (
            <div key={bug.id} style={styles.bugCard}>
              <div style={styles.bugHeader}>
                <span style={styles.bugId}>{bug.display_id}</span>
                <span style={styles.badge(bug.status)}>
                  {bug.status.replace('_', ' ')}
                </span>
              </div>
              <p style={styles.bugDescription}>
                {bug.description.length > 150
                  ? `${bug.description.substring(0, 150)}...`
                  : bug.description}
              </p>
              <div style={styles.bugFooter}>
                Reported {new Date(bug.created_at).toLocaleDateString()} •{' '}
                {bug.page_url}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit My Bugs Panel**

```bash
git add packages/bug-reporter-sdk/src/components/MyBugsPanel.tsx
git commit -m "feat(sdk): add My Bugs Panel component"
```

---

### Task 3.6: Export SDK Components

**Files:**
- Modify: `packages/bug-reporter-sdk/src/index.ts`

**Step 1: Update src/index.ts**

```typescript
// Components
export { BugReporterProvider } from './components/BugReporterProvider';
export { BugReporterWidget } from './components/BugReporterWidget';
export { MyBugsPanel } from './components/MyBugsPanel';

// Hooks
export { useBugReporter } from './hooks/useBugReporter';

// Types
export type { BugReporterConfig } from './types/config';

// Re-export shared types for convenience
export type {
  BugReport,
  BugReportStatus,
  BugReportCategory,
  DetailedBugReport,
} from '@bug-reporter/shared/types';
```

**Step 2: Build SDK package**

```bash
cd packages/bug-reporter-sdk
npm run build
```

Verify dist/ folder is created with:
- `index.js` (CommonJS)
- `index.mjs` (ESM)
- `index.d.ts` (TypeScript types)

**Step 3: Commit SDK exports**

```bash
cd ../.. # back to root
git add packages/bug-reporter-sdk/src/index.ts
git commit -m "feat(sdk): export SDK components and types"
```

---

## Phase 4: Platform Application Development

### Task 4.1: Initialize Next.js Platform App

**Files:**
- Create: `apps/platform/package.json`
- Create: `apps/platform/tsconfig.json`
- Create: `apps/platform/next.config.js`
- Create: `apps/platform/tailwind.config.ts`
- Create: `apps/platform/postcss.config.js`
- Create: `apps/platform/.env.local`

**Step 1: Create Next.js app with manual setup**

```bash
cd apps
mkdir -p platform/app
cd platform
npm init -y
```

**Step 2: Configure package.json**

```json
{
  "name": "platform",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@bug-reporter/shared": "*",
    "@supabase/ssr": "^0.1.0",
    "@supabase/supabase-js": "^2.39.0",
    "@tanstack/react-query": "^5.17.19",
    "next": "^15.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hot-toast": "^2.4.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.3"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
```

**Step 5: Create Tailwind config**

```bash
npx tailwindcss init -p
```

Update `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
export default config
```

**Step 6: Create global CSS**

```bash
mkdir -p app
```

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 7: Create .env.local**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Step 8: Install dependencies**

```bash
cd ../.. # back to root
npm install
```

**Step 9: Commit platform initialization**

```bash
git add apps/platform
git commit -m "feat(platform): initialize Next.js platform app"
```

---

---

## Phase 5: Supabase Client Setup

### Task 5.1: Create Supabase Client Utilities

**Summary:**
- Create server-side Supabase client with cookie handling
- Create client-side Supabase client
- Set up admin client for service operations
- Configure middleware for auth session management

**Files to Create:**
- `apps/platform/lib/supabase/server.ts`
- `apps/platform/lib/supabase/client.ts`
- `apps/platform/lib/supabase/admin.ts`
- `apps/platform/middleware.ts`

**Reference:** Copy from existing MyJKKN `lib/supabase/` implementation

---

## Phase 6: Platform Module Development

The platform has 6 major modules that will be implemented using the **nextjs-module-builder** skill:

### Module 1: Organizations Module
**Scope:** Organization CRUD, organization management, settings
**See:** `docs/plans/modules/2025-01-16-organizations-module.md`

### Module 2: Applications Module
**Scope:** App registration, API key management, app settings
**See:** `docs/plans/modules/2025-01-16-applications-module.md`

### Module 3: Bug Reports Module
**Scope:** Bug listing, detail view, status management, filters
**See:** `docs/plans/modules/2025-01-16-bug-reports-module.md`

### Module 4: Leaderboard Module
**Scope:** Organization leaderboard, prize configuration, rankings
**See:** `docs/plans/modules/2025-01-16-leaderboard-module.md`

### Module 5: Team Management Module
**Scope:** Member invitations, role management, permissions
**See:** `docs/plans/modules/2025-01-16-team-management-module.md`

### Module 6: Chat/Messaging Module
**Scope:** Bug report messaging, real-time chat, participants
**See:** `docs/plans/modules/2025-01-16-messaging-module.md`

---

## Phase 7: Public API Development

### Task 7.1: SDK Public API Endpoints

**Summary:**
Create API routes that the SDK uses to communicate with platform.

**Endpoints to Create:**
- `POST /api/v1/public/bug-reports` - Submit bug (API key auth)
- `GET /api/v1/public/bug-reports/me` - Get user's bugs
- `GET /api/v1/public/bug-reports/:id` - Get bug details
- `POST /api/v1/public/bug-reports/:id/messages` - Send message

**Files:**
- `apps/platform/app/api/v1/public/bug-reports/route.ts`
- `apps/platform/app/api/v1/public/bug-reports/me/route.ts`
- `apps/platform/app/api/v1/public/bug-reports/[id]/route.ts`
- `apps/platform/app/api/v1/public/bug-reports/[id]/messages/route.ts`
- `apps/platform/lib/middleware/api-key-auth.ts`

**See detailed plan:** `docs/plans/2025-01-16-public-api.md`

---

## Phase 8: Authentication & Landing Pages

### Task 8.1: Authentication Pages

**Summary:**
- Login page with Supabase Auth
- Signup page with organization creation
- Email verification flow
- Password reset

**Files:**
- `apps/platform/app/(auth)/login/page.tsx`
- `apps/platform/app/(auth)/signup/page.tsx`
- `apps/platform/app/(auth)/verify-email/page.tsx`
- `apps/platform/app/(auth)/reset-password/page.tsx`

### Task 8.2: Landing Page

**Summary:**
Marketing landing page with features, pricing, demo

**Files:**
- `apps/platform/app/page.tsx`
- `apps/platform/components/landing/Hero.tsx`
- `apps/platform/components/landing/Features.tsx`
- `apps/platform/components/landing/Pricing.tsx`

---

## Phase 9: Testing & Deployment

### Task 9.1: SDK Testing

**Summary:**
- Create demo app to test SDK integration
- Test bug submission flow
- Test My Bugs Panel
- Verify API key authentication

**Files:**
- `apps/demo-app/` - Simple Next.js app for testing

### Task 9.2: Platform Testing

**Summary:**
- Test multi-organization isolation
- Test role-based permissions
- Test bug management workflows
- Test leaderboard calculations

### Task 9.3: Deployment

**Summary:**
- Configure Vercel deployment for platform
- Set up GitHub Actions for SDK publishing
- Configure environment variables
- Set up monitoring

---

## Module Implementation Order

**Recommended sequence:**

1. ✅ **Foundation** (Phases 1-5): Monorepo, Database, SDK, Platform setup
2. 🔄 **Core Modules** (Phase 6):
   - Organizations Module (start here - everything depends on this)
   - Applications Module (depends on Organizations)
   - Bug Reports Module (depends on Applications)
   - Team Management Module (parallel with Bug Reports)
   - Leaderboard Module (depends on Bug Reports)
   - Messaging Module (depends on Bug Reports)
3. 🔄 **API Layer** (Phase 7): Public SDK endpoints
4. 🔄 **Auth & Landing** (Phase 8): Authentication & marketing
5. 🔄 **Testing & Launch** (Phase 9): End-to-end testing

---

## Next Steps

**Detailed module plans are generated using the `nextjs-module-builder` skill:**

Each module plan follows the standardized 5-layer architecture:
1. **Types Layer** - TypeScript interfaces
2. **Services Layer** - Supabase data operations
3. **Hooks Layer** - React Query hooks
4. **Components Layer** - UI components
5. **Pages Layer** - Next.js routes

Run the nextjs-module-builder skill for each module to get step-by-step implementation tasks.

**Start with:** Organizations Module (foundational module)

---

## Execution

**Plan saved to:** `docs/plans/2025-01-16-centralized-bug-reporter-platform.md`

**Module-specific plans will be saved to:** `docs/plans/modules/`

**To execute this plan:**
1. Complete Phases 1-5 (foundation setup)
2. Use `nextjs-module-builder` skill for each Phase 6 module
3. Implement Public API (Phase 7)
4. Build Auth & Landing (Phase 8)
5. Test & Deploy (Phase 9)
