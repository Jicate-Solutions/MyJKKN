# 🐛 Bug Tracker Platform - Complete Development Guide

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Database Design](#database-design)
3. [Parent App Development](#parent-app-development)
4. [Child App Widget Development](#child-app-widget-development)
5. [API Development](#api-development)
6. [Deployment Guide](#deployment-guide)
7. [Security Implementation](#security-implementation)
8. [Testing Strategy](#testing-strategy)

---

## 1. System Architecture Overview

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MyJKKN (Parent App)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  OAuth Provider │ User Management │ Authentication  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ OAuth 2.0
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 BUG TRACKER PLATFORM (Child App)            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Dashboard │ Analytics │ Teams │ Apps │ Settings    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ▲                                 │
│                           │ API                             │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SUPABASE DATABASE                       │   │
│  │  • Apps Registry                                     │   │
│  │  • Bug Reports                                       │   │
│  │  • Teams & Organizations                             │   │
│  │  • Analytics                                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS/WebSocket
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────▼────────┐  ┌───────────────┐  ┌──────────▼────────┐
│   Client App 1  │  │  Client App 2  │  │   Client App 3    │
│  ┌───────────┐  │  │  ┌───────────┐ │  │  ┌───────────┐   │
│  │  Widget   │  │  │  │  Widget   │ │  │  │  Widget   │   │
│  └───────────┘  │  │  └───────────┘ │  │  └───────────┘   │
└─────────────────┘  └───────────────┘  └───────────────────┘
```

### Tech Stack

- **Authentication**: MyJKKN OAuth 2.0 (Parent App Authentication)
- **Bug Tracker App**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Shadcn/ui
- **Database**: Supabase (PostgreSQL) - Data storage only
- **Storage**: Supabase Storage - Screenshots and attachments
- **Real-time**: Supabase Realtime - Live updates
- **Widget**: Vanilla JS/TypeScript (Framework agnostic)
- **State Management**: React Query (TanStack Query)
- **Deployment**: Vercel/Railway

---

## 2. Database Design

### 2.1 Create Supabase Project

```bash
# 1. Go to https://supabase.com
# 2. Create new project: "bug-tracker-platform"
# 3. Save these credentials:
#    - Project URL
#    - Anon Key
#    - Service Role Key
```

### 2.2 Database Schema

Create file: `supabase/migrations/001_initial_schema.sql`

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Organizations (Companies/Institutions using the platform)
-- Links to MyJKKN institutions
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  myjkkn_institution_id UUID, -- Links to MyJKKN institution
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  domain VARCHAR(255),
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  subscription_plan VARCHAR(50) DEFAULT 'free',
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams within organizations
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- Cached user data from MyJKKN
-- This table stores user information from MyJKKN for performance
CREATE TABLE cached_users (
  id UUID PRIMARY KEY, -- MyJKKN user ID
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50), -- From MyJKKN: super_admin, admin, faculty, student, etc.
  institution_id UUID, -- MyJKKN institution ID
  department_id UUID, -- MyJKKN department ID
  metadata JSONB DEFAULT '{}',
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User organization membership
-- Links MyJKKN users to bug tracker organizations
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- MyJKKN user ID (references cached_users)
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- bug tracker specific role
  permissions JSONB DEFAULT '{}',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id),
  FOREIGN KEY (user_id) REFERENCES cached_users(id) ON DELETE CASCADE
);

-- Team members
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- MyJKKN user ID
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, user_id),
  FOREIGN KEY (user_id) REFERENCES cached_users(id) ON DELETE CASCADE
);

-- =====================================================
-- APP REGISTRY
-- =====================================================

-- Registered applications
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  app_url TEXT NOT NULL,
  app_type VARCHAR(50), -- web, mobile, desktop, api
  platform VARCHAR(50), -- react, angular, vue, nextjs, etc
  api_key UUID DEFAULT uuid_generate_v4(),
  secret_key UUID DEFAULT uuid_generate_v4(),
  allowed_domains TEXT[], -- Array of allowed domains
  webhook_url TEXT,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- App environments (dev, staging, production)
CREATE TABLE app_environments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(application_id, name)
);

-- =====================================================
-- BUG REPORTS
-- =====================================================

-- Bug reports from all applications
CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id VARCHAR(50) NOT NULL,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  environment VARCHAR(50) DEFAULT 'production',
  reporter_user_id UUID REFERENCES cached_users(id) ON DELETE SET NULL, -- MyJKKN user ID
  reporter_email VARCHAR(255),
  reporter_name VARCHAR(255),
  reporter_metadata JSONB DEFAULT '{}', -- Store external user info

  -- Bug details
  title VARCHAR(500),
  description TEXT NOT NULL,
  page_url TEXT NOT NULL,
  screenshot_url TEXT,

  -- Technical details
  console_logs JSONB,
  network_logs JSONB,
  browser_info JSONB,
  device_info JSONB,
  session_info JSONB,
  error_stack TEXT,

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'new', -- new, acknowledged, in_progress, resolved, closed, wont_fix
  priority VARCHAR(20) DEFAULT 'medium', -- critical, high, medium, low
  severity VARCHAR(20) DEFAULT 'minor', -- blocker, critical, major, minor, trivial
  category VARCHAR(100), -- ui, functionality, performance, security, etc
  tags TEXT[],

  -- Assignment
  assigned_to UUID REFERENCES cached_users(id) ON DELETE SET NULL, -- MyJKKN user ID
  assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,

  -- Metrics
  resolution_time_hours INTEGER,

  UNIQUE(application_id, display_id)
);

-- Bug report messages/comments
CREATE TABLE bug_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES cached_users(id) ON DELETE SET NULL, -- MyJKKN user ID
  sender_name VARCHAR(255),
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'comment', -- comment, status_change, assignment, etc
  is_internal BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bug report attachments
CREATE TABLE bug_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bug report activity log
CREATE TABLE bug_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ANALYTICS & METRICS
-- =====================================================

-- Application metrics
CREATE TABLE app_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_bugs INTEGER DEFAULT 0,
  new_bugs INTEGER DEFAULT 0,
  resolved_bugs INTEGER DEFAULT 0,
  avg_resolution_time_hours DECIMAL(10,2),
  active_users INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(application_id, date)
);

-- User contribution metrics
CREATE TABLE user_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, yearly
  period_date DATE NOT NULL,
  bugs_reported INTEGER DEFAULT 0,
  bugs_resolved INTEGER DEFAULT 0,
  bugs_verified INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, organization_id, period_type, period_date)
);

-- =====================================================
-- GAMIFICATION
-- =====================================================

-- Leaderboard
CREATE TABLE leaderboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type VARCHAR(20) NOT NULL, -- weekly, monthly, all_time
  period_date DATE,
  total_bugs INTEGER DEFAULT 0,
  resolved_bugs INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id, period_type, period_date)
);

-- Rewards and achievements
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url TEXT,
  points INTEGER DEFAULT 0,
  criteria JSONB NOT NULL, -- Rules for earning
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- =====================================================
-- WEBHOOKS & INTEGRATIONS
-- =====================================================

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  response_status INTEGER,
  response_body TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Performance indexes
CREATE INDEX idx_bug_reports_app_id ON bug_reports(application_id);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_assigned_to ON bug_reports(assigned_to);
CREATE INDEX idx_bug_reports_created_at ON bug_reports(created_at DESC);
CREATE INDEX idx_bug_messages_report_id ON bug_messages(bug_report_id);
CREATE INDEX idx_applications_org_id ON applications(organization_id);
CREATE INDEX idx_applications_api_key ON applications(api_key);
CREATE INDEX idx_teams_org_id ON teams(organization_id);

-- Full text search
CREATE INDEX idx_bug_reports_search ON bug_reports USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate unique display_id for bug reports
CREATE OR REPLACE FUNCTION generate_bug_display_id()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_prefix VARCHAR(10);
BEGIN
  -- Get application prefix (first 3 letters of app name)
  SELECT UPPER(LEFT(name, 3)) INTO v_prefix FROM applications WHERE id = NEW.application_id;

  -- Count existing bugs for this app
  SELECT COUNT(*) + 1 INTO v_count FROM bug_reports WHERE application_id = NEW.application_id;

  -- Generate display_id
  NEW.display_id = v_prefix || '-' || LPAD(v_count::TEXT, 5, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_bug_display_id_trigger
  BEFORE INSERT ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION generate_bug_display_id();

-- Calculate resolution time
CREATE OR REPLACE FUNCTION calculate_resolution_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = NOW();
    NEW.resolution_time_hours = EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 3600;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_resolution_time_trigger
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION calculate_resolution_time();

-- Log activity
CREATE OR REPLACE FUNCTION log_bug_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO bug_activity_log (
    bug_report_id,
    user_id,
    action,
    old_value,
    new_value,
    metadata
  ) VALUES (
    NEW.id,
    current_setting('app.current_user_id', true)::UUID,
    TG_OP,
    to_jsonb(OLD),
    to_jsonb(NEW),
    jsonb_build_object('table_name', TG_TABLE_NAME)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_bug_activity_trigger
  AFTER INSERT OR UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION log_bug_activity();

-- =====================================================
-- VIEWS
-- =====================================================

-- Bug report dashboard view
CREATE VIEW bug_reports_dashboard AS
SELECT
  br.*,
  a.name as app_name,
  a.slug as app_slug,
  o.name as organization_name,
  t.name as team_name,
  u.full_name as assigned_to_name,
  u.avatar_url as assigned_to_avatar,
  (SELECT COUNT(*) FROM bug_messages WHERE bug_report_id = br.id) as message_count,
  (SELECT COUNT(*) FROM bug_attachments WHERE bug_report_id = br.id) as attachment_count
FROM bug_reports br
LEFT JOIN applications a ON br.application_id = a.id
LEFT JOIN organizations o ON a.organization_id = o.id
LEFT JOIN teams t ON br.assigned_team_id = t.id
LEFT JOIN users u ON br.assigned_to = u.id;

-- Leaderboard view
CREATE VIEW leaderboard_view AS
SELECT
  l.*,
  u.full_name,
  u.email,
  u.avatar_url,
  o.name as organization_name
FROM leaderboard l
JOIN users u ON l.user_id = u.id
JOIN organizations o ON l.organization_id = o.id
ORDER BY l.points DESC, l.total_bugs DESC;

-- App statistics view
CREATE VIEW app_statistics AS
SELECT
  a.id,
  a.name,
  a.slug,
  COUNT(DISTINCT br.id) as total_bugs,
  COUNT(DISTINCT CASE WHEN br.status = 'new' THEN br.id END) as new_bugs,
  COUNT(DISTINCT CASE WHEN br.status = 'in_progress' THEN br.id END) as in_progress_bugs,
  COUNT(DISTINCT CASE WHEN br.status = 'resolved' THEN br.id END) as resolved_bugs,
  AVG(br.resolution_time_hours) as avg_resolution_time
FROM applications a
LEFT JOIN bug_reports br ON a.id = br.application_id
GROUP BY a.id, a.name, a.slug;

-- =====================================================
-- SEED DATA (Optional - for testing)
-- =====================================================

-- Insert default organization
INSERT INTO organizations (id, name, slug, domain) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Organization', 'demo-org', 'demo.example.com');

-- Insert default admin user
INSERT INTO users (id, email, full_name) VALUES
  ('00000000-0000-0000-0000-000000000002', 'admin@example.com', 'Admin User');

-- Link admin to organization
INSERT INTO organization_members (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'admin');
```

### 2.3 Storage Buckets Setup

```sql
-- Create storage buckets (Run in Supabase SQL Editor)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('bug-screenshots', 'bug-screenshots', true),
  ('bug-attachments', 'bug-attachments', true),
  ('app-logos', 'app-logos', true);
```

---

## 3. Parent App Development

### 3.1 Initialize Next.js Project

```bash
# Create new Next.js project
npx create-next-app@latest bug-tracker-platform --typescript --tailwind --app

cd bug-tracker-platform

# Install dependencies
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install lucide-react clsx tailwind-merge
npm install date-fns recharts
npm install react-hook-form zod @hookform/resolvers
npm install sonner cmdk vaul
npm install html2canvas

# Install Shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card dialog form input label select
npx shadcn-ui@latest add table tabs textarea toast dropdown-menu
npx shadcn-ui@latest add avatar badge separator skeleton
npx shadcn-ui@latest add command popover calendar
npx shadcn-ui@latest add chart alert-dialog sheet
```

### 3.2 Environment Configuration

Create `.env.local`:

```env
# MyJKKN Parent App Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://jkkn.ai
NEXT_PUBLIC_APP_ID=your_bug_tracker_app_id
NEXT_PUBLIC_API_KEY=your_api_key_from_myjkkn
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# Supabase Configuration (for database and storage only)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Bug Tracker Platform
NEXT_PUBLIC_WIDGET_CDN_URL=http://localhost:3000/widget/bug-tracker-widget.js

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### 3.3 Project Structure

```
bug-tracker-platform/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── apps/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── bugs/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── teams/
│   │   │   └── page.tsx
│   │   ├── analytics/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── apps/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       └── route.ts
│   │   ├── bugs/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── messages/
│   │   │           └── route.ts
│   │   ├── widget/
│   │   │   └── report/
│   │   │       └── route.ts
│   │   ├── webhooks/
│   │   │   └── route.ts
│   │   └── auth/
│   │       └── route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── footer.tsx
│   ├── apps/
│   │   ├── app-card.tsx
│   │   ├── app-form.tsx
│   │   └── app-settings.tsx
│   ├── bugs/
│   │   ├── bug-list.tsx
│   │   ├── bug-detail.tsx
│   │   ├── bug-filters.tsx
│   │   └── bug-status-badge.tsx
│   ├── analytics/
│   │   ├── stats-card.tsx
│   │   ├── chart-card.tsx
│   │   └── leaderboard.tsx
│   └── ui/
│       └── (shadcn components)
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── api/
│   │   ├── apps.ts
│   │   ├── bugs.ts
│   │   └── teams.ts
│   ├── hooks/
│   │   ├── use-apps.ts
│   │   ├── use-bugs.ts
│   │   └── use-auth.ts
│   ├── utils/
│   │   ├── file-upload.ts
│   │   ├── validators.ts
│   │   └── formatters.ts
│   └── types/
│       ├── database.ts
│       ├── api.ts
│       └── widget.ts
├── public/
│   ├── widget/
│   │   └── bug-tracker-widget.js
│   └── images/
├── styles/
│   └── globals.css
└── package.json
```

### 3.4 Core Implementation Files

#### Authentication with MyJKKN OAuth

```typescript
// lib/auth/parent-auth-service.ts
import Cookies from 'js-cookie';

interface AuthConfig {
  parentAppUrl: string;
  appId: string;
  redirectUri: string;
  scopes: string[];
}

interface UserSession {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    institution_id?: string;
    department_id?: string;
    permissions?: Record<string, boolean>;
  };
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class ParentAuthService {
  private static instance: ParentAuthService;
  private config: AuthConfig;
  private refreshTimer?: NodeJS.Timeout;

  private constructor() {
    this.config = {
      parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai',
      appId: process.env.NEXT_PUBLIC_APP_ID || '',
      redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || window.location.origin + '/auth/callback',
      scopes: ['read', 'write', 'profile']
    };
  }

  static getInstance(): ParentAuthService {
    if (!ParentAuthService.instance) {
      ParentAuthService.instance = new ParentAuthService();
    }
    return ParentAuthService.instance;
  }

  // Initialize OAuth2 authentication flow
  async initiateLogin(state?: string): Promise<void> {
    const authUrl = new URL(`${this.config.parentAppUrl}/auth/child-app/consent`);

    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', this.config.appId);
    authUrl.searchParams.append('app_id', this.config.appId);
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('scope', this.config.scopes.join(' '));
    authUrl.searchParams.append('state', state || this.generateState());

    if (!state) {
      sessionStorage.setItem('oauth_state', authUrl.searchParams.get('state')!);
    }

    window.location.href = authUrl.toString();
  }

  // Handle OAuth callback with authorization code
  async handleCallback(code: string, state: string): Promise<UserSession> {
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter');
    }

    const response = await fetch(`${this.config.parentAppUrl}/api/auth/child-app/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        child_app_id: this.config.appId,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const session = await response.json();
    this.saveSession(session);

    // Sync user data to local database
    await this.syncUserToDatabase(session.user);

    sessionStorage.removeItem('oauth_state');
    return session;
  }

  // Sync user data to local cached_users table
  private async syncUserToDatabase(user: any): Promise<void> {
    await fetch('/api/auth/sync-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Cookies.get('access_token')}`
      },
      body: JSON.stringify(user)
    });
  }

  private saveSession(session: UserSession): void {
    const expiresAt = new Date(Date.now() + session.expires_in * 1000);

    Cookies.set('access_token', session.access_token, {
      expires: expiresAt,
      secure: true,
      sameSite: 'strict'
    });

    Cookies.set('refresh_token', session.refresh_token, {
      expires: 30,
      secure: true,
      sameSite: 'strict'
    });

    localStorage.setItem('user_data', JSON.stringify(session.user));
  }

  getSession(): UserSession | null {
    const accessToken = Cookies.get('access_token');
    const refreshToken = Cookies.get('refresh_token');
    const userData = localStorage.getItem('user_data');

    if (!accessToken || !refreshToken || !userData) {
      return null;
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: JSON.parse(userData),
      expires_in: 3600
    };
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

export default ParentAuthService.getInstance();
```

#### Supabase Client (for database only)

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import parentAuthService from '@/lib/auth/parent-auth-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client without auth (database only)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Helper to get user from MyJKKN session
export function getCurrentUser() {
  const session = parentAuthService.getSession();
  return session?.user || null;
}

// Helper to check if user is authenticated
export function isAuthenticated(): boolean {
  return !!parentAuthService.getSession();
}
```

#### `lib/types/database.ts`

```typescript
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          domain: string | null
          logo_url: string | null
          settings: any
          subscription_plan: string
          subscription_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Organizations['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Organizations['Insert']>
      }
      applications: {
        Row: {
          id: string
          organization_id: string
          team_id: string | null
          name: string
          slug: string
          description: string | null
          app_url: string
          app_type: string | null
          platform: string | null
          api_key: string
          secret_key: string
          allowed_domains: string[]
          webhook_url: string | null
          settings: any
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Applications['Row'], 'id' | 'api_key' | 'secret_key' | 'created_at' | 'updated_at'>
        Update: Partial<Applications['Insert']>
      }
      bug_reports: {
        Row: {
          id: string
          display_id: string
          application_id: string
          environment: string
          reporter_user_id: string | null
          reporter_email: string | null
          reporter_name: string | null
          reporter_metadata: any
          title: string | null
          description: string
          page_url: string
          screenshot_url: string | null
          console_logs: any
          network_logs: any
          browser_info: any
          device_info: any
          session_info: any
          error_stack: string | null
          status: string
          priority: string
          severity: string
          category: string | null
          tags: string[]
          assigned_to: string | null
          assigned_team_id: string | null
          created_at: string
          updated_at: string
          acknowledged_at: string | null
          resolved_at: string | null
          closed_at: string | null
          resolution_time_hours: number | null
        }
        Insert: Omit<BugReports['Row'], 'id' | 'display_id' | 'created_at' | 'updated_at'>
        Update: Partial<BugReports['Insert']>
      }
      // Add other tables...
    }
  }
}
```

---

## 4. Child App Widget Development

### 4.1 Widget Implementation (MyJKKN Auth)

Create `public/widget/bug-tracker-widget.js`:

```javascript
(function() {
  'use strict';

  // Configuration
  const WIDGET_CONFIG = {
    apiKey: '',        // Your app's API key from Bug Tracker Platform
    apiUrl: '',        // Bug Tracker Platform URL
    myJkknUrl: '',     // MyJKKN OAuth Provider URL
    appId: '',         // Your app ID
    appSecret: '',     // Your app secret
    position: 'bottom-right',
    theme: 'light',
    captureScreenshot: true,
    captureConsole: true,
    captureNetwork: true,
    captureDevice: true,
    user: null
  };

  // Widget styles
  const WIDGET_STYLES = `
    .bug-tracker-widget {
      position: fixed;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .bug-tracker-button {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .bug-tracker-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    }

    .bug-tracker-button svg {
      width: 24px;
      height: 24px;
      fill: white;
    }

    .bug-tracker-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
    }

    .bug-tracker-modal.open {
      display: flex;
    }

    .bug-tracker-content {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }

    .bug-tracker-header {
      padding: 24px;
      border-bottom: 1px solid #e5e7eb;
      position: relative;
    }

    .bug-tracker-title {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }

    .bug-tracker-close {
      position: absolute;
      top: 24px;
      right: 24px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
    }

    .bug-tracker-body {
      padding: 24px;
    }

    .bug-tracker-form-group {
      margin-bottom: 20px;
    }

    .bug-tracker-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    }

    .bug-tracker-input,
    .bug-tracker-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .bug-tracker-input:focus,
    .bug-tracker-textarea:focus {
      outline: none;
      border-color: #667eea;
    }

    .bug-tracker-textarea {
      min-height: 100px;
      resize: vertical;
    }

    .bug-tracker-screenshot {
      margin-top: 8px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid #d1d5db;
    }

    .bug-tracker-screenshot img {
      width: 100%;
      height: auto;
      display: block;
    }

    .bug-tracker-actions {
      display: flex;
      gap: 12px;
      padding: 24px;
      border-top: 1px solid #e5e7eb;
    }

    .bug-tracker-btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
      border: none;
    }

    .bug-tracker-btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      flex: 1;
    }

    .bug-tracker-btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .bug-tracker-btn:hover {
      opacity: 0.9;
    }

    .bug-tracker-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .bug-tracker-success {
      padding: 24px;
      text-align: center;
    }

    .bug-tracker-success-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bug-tracker-success-icon svg {
      width: 32px;
      height: 32px;
      fill: white;
    }

    .bug-tracker-success-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 8px;
    }

    .bug-tracker-success-message {
      color: #6b7280;
      font-size: 14px;
    }

    @media (max-width: 640px) {
      .bug-tracker-content {
        width: 95%;
        max-height: 95vh;
      }
    }
  `;

  // Console log capture
  const consoleLogs = [];
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  function captureConsole() {
    ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
      console[method] = function(...args) {
        consoleLogs.push({
          type: method,
          timestamp: new Date().toISOString(),
          message: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch (e) {
              return String(arg);
            }
          }).join(' ')
        });

        // Keep last 100 logs
        if (consoleLogs.length > 100) {
          consoleLogs.shift();
        }

        originalConsole[method].apply(console, args);
      };
    });
  }

  // Network request capture
  const networkLogs = [];

  function captureNetwork() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const startTime = Date.now();
      const request = {
        url: args[0],
        method: args[1]?.method || 'GET',
        timestamp: new Date().toISOString()
      };

      return originalFetch.apply(this, args)
        .then(response => {
          networkLogs.push({
            ...request,
            status: response.status,
            duration: Date.now() - startTime,
            type: 'fetch'
          });

          // Keep last 50 requests
          if (networkLogs.length > 50) {
            networkLogs.shift();
          }

          return response;
        })
        .catch(error => {
          networkLogs.push({
            ...request,
            error: error.message,
            duration: Date.now() - startTime,
            type: 'fetch'
          });
          throw error;
        });
    };

    // Capture XHR
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;

      xhr.open = function(method, url, ...args) {
        xhr._requestInfo = {
          method,
          url,
          timestamp: new Date().toISOString()
        };
        return originalOpen.apply(xhr, [method, url, ...args]);
      };

      xhr.send = function(...args) {
        const startTime = Date.now();

        xhr.addEventListener('loadend', function() {
          if (xhr._requestInfo) {
            networkLogs.push({
              ...xhr._requestInfo,
              status: xhr.status,
              duration: Date.now() - startTime,
              type: 'xhr'
            });

            if (networkLogs.length > 50) {
              networkLogs.shift();
            }
          }
        });

        return originalSend.apply(xhr, args);
      };

      return xhr;
    };
  }

  // Screenshot capture using html2canvas
  async function captureScreenshot() {
    return new Promise((resolve) => {
      // Check if html2canvas is loaded
      if (typeof html2canvas === 'undefined') {
        // Load html2canvas dynamically
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => {
          takeScreenshot(resolve);
        };
        script.onerror = () => {
          resolve(null);
        };
        document.head.appendChild(script);
      } else {
        takeScreenshot(resolve);
      }
    });
  }

  function takeScreenshot(callback) {
    html2canvas(document.body, {
      scale: 0.5, // Reduce quality for smaller file size
      logging: false,
      useCORS: true,
      allowTaint: false
    }).then(canvas => {
      callback(canvas.toDataURL('image/png'));
    }).catch(() => {
      callback(null);
    });
  }

  // Device information
  function getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookiesEnabled: navigator.cookieEnabled,
      onlineStatus: navigator.onLine
    };
  }

  // Browser information
  function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';

    if (ua.indexOf('Firefox') > -1) {
      browser = 'Firefox';
      version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Chrome') > -1) {
      browser = 'Chrome';
      version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Safari') > -1) {
      browser = 'Safari';
      version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Edge') > -1) {
      browser = 'Edge';
      version = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
    }

    return {
      name: browser,
      version: version,
      userAgent: ua
    };
  }

  // Session information
  function getSessionInfo() {
    return {
      sessionId: sessionStorage.getItem('bug_tracker_session_id') || generateSessionId(),
      pageViews: parseInt(sessionStorage.getItem('bug_tracker_page_views') || '0') + 1,
      sessionStart: sessionStorage.getItem('bug_tracker_session_start') || new Date().toISOString(),
      referrer: document.referrer,
      currentUrl: window.location.href
    };
  }

  function generateSessionId() {
    const id = Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('bug_tracker_session_id', id);
    sessionStorage.setItem('bug_tracker_session_start', new Date().toISOString());
    return id;
  }

  // Widget initialization
  class BugTrackerWidget {
    constructor(config) {
      this.config = { ...WIDGET_CONFIG, ...config };
      this.isOpen = false;
      this.screenshot = null;
      this.authToken = null;
      this.currentUser = null;

      if (!this.config.apiKey || !this.config.apiUrl || !this.config.myJkknUrl) {
        console.error('BugTracker: API key, API URL, and MyJKKN URL are required');
        return;
      }

      this.init();
    }

    async init() {
      // Inject styles
      const style = document.createElement('style');
      style.textContent = WIDGET_STYLES;
      document.head.appendChild(style);

      // Start capturing
      if (this.config.captureConsole) {
        captureConsole();
      }

      if (this.config.captureNetwork) {
        captureNetwork();
      }

      // Authenticate with MyJKKN
      await this.authenticateUser();

      // Create widget
      this.createWidget();

      // Track page views
      const pageViews = parseInt(sessionStorage.getItem('bug_tracker_page_views') || '0');
      sessionStorage.setItem('bug_tracker_page_views', String(pageViews + 1));
    }

    async authenticateUser() {
      // Check for existing MyJKKN token
      const token = localStorage.getItem('myjkkn_token');
      if (token) {
        const isValid = await this.validateToken(token);
        if (isValid) {
          this.authToken = token;
          await this.fetchUserProfile();
          return;
        }
      }

      // Check for OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        await this.exchangeCodeForToken(code);
        // Clean URL after auth
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    async validateToken(token) {
      try {
        const response = await fetch(`${this.config.myJkknUrl}/api/auth/child-app/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token,
            client_id: this.config.appId
          })
        });

        return response.ok;
      } catch (error) {
        console.error('Token validation failed:', error);
        return false;
      }
    }

    async exchangeCodeForToken(code) {
      try {
        const response = await fetch(`${this.config.myJkknUrl}/api/auth/child-app/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: this.config.appId,
            client_secret: this.config.appSecret,
            redirect_uri: window.location.origin + window.location.pathname
          })
        });

        if (!response.ok) {
          throw new Error('Token exchange failed');
        }

        const data = await response.json();
        this.authToken = data.access_token;
        localStorage.setItem('myjkkn_token', this.authToken);

        // Sync user data with bug tracker
        await this.syncUserWithTracker(data.user);
        await this.fetchUserProfile();
      } catch (error) {
        console.error('OAuth token exchange failed:', error);
      }
    }

    async syncUserWithTracker(userData) {
      try {
        await fetch(`${this.config.apiUrl}/api/auth/sync-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`,
            'X-App-ID': this.config.appId
          },
          body: JSON.stringify(userData)
        });
      } catch (error) {
        console.error('User sync failed:', error);
      }
    }

    async fetchUserProfile() {
      try {
        const response = await fetch(`${this.config.myJkknUrl}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${this.authToken}`
          }
        });

        if (response.ok) {
          this.currentUser = await response.json();
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      }
    }

    createWidget() {
      // Create container
      this.container = document.createElement('div');
      this.container.className = 'bug-tracker-widget';

      // Position widget
      switch(this.config.position) {
        case 'bottom-right':
          this.container.style.bottom = '20px';
          this.container.style.right = '20px';
          break;
        case 'bottom-left':
          this.container.style.bottom = '20px';
          this.container.style.left = '20px';
          break;
        case 'top-right':
          this.container.style.top = '20px';
          this.container.style.right = '20px';
          break;
        case 'top-left':
          this.container.style.top = '20px';
          this.container.style.left = '20px';
          break;
      }

      // Create button
      this.button = document.createElement('button');
      this.button.className = 'bug-tracker-button';
      this.button.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.42.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
        </svg>
      `;
      this.button.onclick = () => this.open();

      // Create modal
      this.modal = document.createElement('div');
      this.modal.className = 'bug-tracker-modal';
      this.modal.innerHTML = `
        <div class="bug-tracker-content">
          <div class="bug-tracker-header">
            <h2 class="bug-tracker-title">Report a Bug</h2>
            <button class="bug-tracker-close">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div class="bug-tracker-body">
            <form id="bug-tracker-form">
              <div class="bug-tracker-form-group">
                <label class="bug-tracker-label">Title (Optional)</label>
                <input type="text" class="bug-tracker-input" name="title" placeholder="Brief summary of the issue">
              </div>

              <div class="bug-tracker-form-group">
                <label class="bug-tracker-label">Description *</label>
                <textarea class="bug-tracker-textarea" name="description" placeholder="Please describe the issue in detail..." required></textarea>
              </div>

              <div class="bug-tracker-form-group">
                <label class="bug-tracker-label">Your Email (Optional)</label>
                <input type="email" class="bug-tracker-input" name="email" placeholder="your@email.com">
              </div>

              <div class="bug-tracker-form-group" id="screenshot-preview" style="display: none;">
                <label class="bug-tracker-label">Screenshot</label>
                <div class="bug-tracker-screenshot">
                  <img id="screenshot-img" src="" alt="Screenshot">
                </div>
              </div>
            </form>
          </div>
          <div class="bug-tracker-actions">
            <button class="bug-tracker-btn bug-tracker-btn-secondary" onclick="BugTracker.close()">Cancel</button>
            <button class="bug-tracker-btn bug-tracker-btn-primary" onclick="BugTracker.submit()">Submit Report</button>
          </div>
        </div>
      `;

      // Append to DOM
      this.container.appendChild(this.button);
      document.body.appendChild(this.container);
      document.body.appendChild(this.modal);

      // Setup close button
      this.modal.querySelector('.bug-tracker-close').onclick = () => this.close();

      // Close on backdrop click
      this.modal.onclick = (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      };
    }

    async open() {
      this.isOpen = true;
      this.modal.classList.add('open');

      // Capture screenshot
      if (this.config.captureScreenshot) {
        this.screenshot = await captureScreenshot();
        if (this.screenshot) {
          document.getElementById('screenshot-preview').style.display = 'block';
          document.getElementById('screenshot-img').src = this.screenshot;
        }
      }
    }

    close() {
      this.isOpen = false;
      this.modal.classList.remove('open');
      this.modal.querySelector('form').reset();
      document.getElementById('screenshot-preview').style.display = 'none';
    }

    async submit() {
      // Check if user is authenticated
      if (!this.authToken) {
        // Redirect to MyJKKN login
        const authUrl = new URL(`${this.config.myJkknUrl}/api/auth/child-app/authorize`);
        authUrl.searchParams.append('client_id', this.config.appId);
        authUrl.searchParams.append('redirect_uri', window.location.href);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('scope', 'profile,bug_report');

        if (confirm('Please login with MyJKKN to submit bug reports. You will be redirected to login.')) {
          window.location.href = authUrl.toString();
        }
        return;
      }

      const form = document.getElementById('bug-tracker-form');
      const formData = new FormData(form);

      // Get form values
      const title = formData.get('title');
      const description = formData.get('description');
      const email = formData.get('email') || this.currentUser?.email;

      if (!description) {
        alert('Please provide a description');
        return;
      }

      // Disable submit button
      const submitBtn = this.modal.querySelector('.bug-tracker-btn-primary');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      // Prepare data
      const bugData = {
        api_key: this.config.apiKey,
        app_id: this.config.appId,
        title: title || null,
        description: description,
        reporter_email: email,
        reporter_name: this.currentUser?.full_name || null,
        reporter_metadata: {
          ...this.config.user,
          myjkkn_user_id: this.currentUser?.id,
          myjkkn_role: this.currentUser?.role,
          myjkkn_institution_id: this.currentUser?.institution_id,
          myjkkn_department_id: this.currentUser?.department_id
        },
        page_url: window.location.href,
        screenshot_url: this.screenshot,
        environment: this.config.environment || 'production',
        console_logs: this.config.captureConsole ? consoleLogs : [],
        network_logs: this.config.captureNetwork ? networkLogs : [],
        browser_info: getBrowserInfo(),
        device_info: this.config.captureDevice ? getDeviceInfo() : {},
        session_info: getSessionInfo(),
        error_stack: window.lastError || null
      };

      try {
        const response = await fetch(`${this.config.apiUrl}/api/widget/report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`,
            'X-API-Key': this.config.apiKey,
            'X-MyJKKN-Token': this.authToken
          },
          body: JSON.stringify(bugData)
        });

        if (!response.ok) {
          throw new Error('Failed to submit bug report');
        }

        const result = await response.json();

        // Show success message
        this.showSuccess(result.display_id);

      } catch (error) {
        console.error('Failed to submit bug report:', error);
        alert('Failed to submit bug report. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
      }
    }

    showSuccess(bugId) {
      const body = this.modal.querySelector('.bug-tracker-body');
      const actions = this.modal.querySelector('.bug-tracker-actions');

      body.innerHTML = `
        <div class="bug-tracker-success">
          <div class="bug-tracker-success-icon">
            <svg viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
          <div class="bug-tracker-success-title">Bug Report Submitted!</div>
          <div class="bug-tracker-success-message">
            Your report has been submitted successfully.<br>
            Reference ID: <strong>${bugId}</strong>
          </div>
        </div>
      `;

      actions.innerHTML = `
        <button class="bug-tracker-btn bug-tracker-btn-primary" onclick="BugTracker.close()">Close</button>
      `;

      // Auto close after 5 seconds
      setTimeout(() => {
        this.close();
        // Reset form
        setTimeout(() => {
          this.createWidget();
        }, 500);
      }, 5000);
    }
  }

  // Global error handler
  window.addEventListener('error', (event) => {
    window.lastError = {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack
    };
  });

  // Initialize widget
  window.BugTracker = new BugTrackerWidget(window.BugTrackerConfig || {});

})();
```

### 4.2 Widget Integration Guide

Create `WIDGET_INTEGRATION.md`:

````markdown
# Bug Tracker Widget Integration Guide

## Quick Start

### 1. Basic Integration

Add this code before the closing `</body>` tag of your HTML:

```html
<!-- Bug Tracker Widget -->
<script>
  window.BugTrackerConfig = {
    apiKey: 'YOUR_API_KEY',
    apiUrl: 'https://your-bug-tracker.com',
    appId: 'YOUR_APP_ID'
  };
</script>
<script src="https://your-bug-tracker.com/widget/bug-tracker-widget.js"></script>
````

### 2. React Integration

```jsx
// components/BugTracker.jsx
import { useEffect } from 'react';

export function BugTracker({ user }) {
  useEffect(() => {
    // Configure widget
    window.BugTrackerConfig = {
      apiKey: process.env.REACT_APP_BUG_TRACKER_API_KEY,
      apiUrl: process.env.REACT_APP_BUG_TRACKER_URL,
      appId: process.env.REACT_APP_BUG_TRACKER_APP_ID,
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name
      }
    };

    // Load widget script
    const script = document.createElement('script');
    script.src = `${process.env.REACT_APP_BUG_TRACKER_URL}/widget/bug-tracker-widget.js`;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup
      document.body.removeChild(script);
      if (window.BugTracker) {
        window.BugTracker.destroy();
      }
    };
  }, [user]);

  return null;
}

// Usage in App.jsx
import { BugTracker } from './components/BugTracker';

function App() {
  const user = useAuth();

  return (
    <>
      {/* Your app content */}
      <BugTracker user={user} />
    </>
  );
}
```

### 3. Next.js Integration

```jsx
// components/BugTracker.tsx
import { useEffect } from 'react';
import Script from 'next/script';

interface BugTrackerProps {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export function BugTracker({ user }: BugTrackerProps) {
  useEffect(() => {
    window.BugTrackerConfig = {
      apiKey: process.env.NEXT_PUBLIC_BUG_TRACKER_API_KEY!,
      apiUrl: process.env.NEXT_PUBLIC_BUG_TRACKER_URL!,
      appId: process.env.NEXT_PUBLIC_BUG_TRACKER_APP_ID!,
      user: user || null
    };
  }, [user]);

  return (
    <Script
      src={`${process.env.NEXT_PUBLIC_BUG_TRACKER_URL}/widget/bug-tracker-widget.js`}
      strategy="lazyOnload"
    />
  );
}

// app/layout.tsx
import { BugTracker } from '@/components/BugTracker';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <BugTracker />
      </body>
    </html>
  );
}
```

### 4. Vue.js Integration

```vue
<!-- components/BugTracker.vue -->
<template>
  <div></div>
</template>

<script>
export default {
  name: 'BugTracker',
  props: {
    user: Object
  },
  mounted() {
    // Configure widget
    window.BugTrackerConfig = {
      apiKey: import.meta.env.VITE_BUG_TRACKER_API_KEY,
      apiUrl: import.meta.env.VITE_BUG_TRACKER_URL,
      appId: import.meta.env.VITE_BUG_TRACKER_APP_ID,
      user: this.user || null
    };

    // Load widget script
    const script = document.createElement('script');
    script.src = `${import.meta.env.VITE_BUG_TRACKER_URL}/widget/bug-tracker-widget.js`;
    script.async = true;
    document.body.appendChild(script);
  },
  beforeUnmount() {
    if (window.BugTracker) {
      window.BugTracker.destroy();
    }
  }
};
</script>

<!-- App.vue -->
<template>
  <div id="app">
    <!-- Your app content -->
    <BugTracker :user="currentUser" />
  </div>
</template>
```

### 5. Angular Integration

```typescript
// bug-tracker.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BugTrackerService {
  private scriptLoaded = false;

  initialize(user?: any): void {
    if (this.scriptLoaded) return;

    // Configure widget
    (window as any).BugTrackerConfig = {
      apiKey: environment.bugTrackerApiKey,
      apiUrl: environment.bugTrackerUrl,
      appId: environment.bugTrackerAppId,
      user: user || null
    };

    // Load widget script
    const script = document.createElement('script');
    script.src = `${environment.bugTrackerUrl}/widget/bug-tracker-widget.js`;
    script.async = true;
    document.body.appendChild(script);

    this.scriptLoaded = true;
  }

  destroy(): void {
    if ((window as any).BugTracker) {
      (window as any).BugTracker.destroy();
    }
  }
}

// app.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { BugTrackerService } from './services/bug-tracker.service';

@Component({
  selector: 'app-root',
  template: `<router-outlet></router-outlet>`
})
export class AppComponent implements OnInit, OnDestroy {
  constructor(private bugTracker: BugTrackerService) {}

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.bugTracker.initialize(user);
  }

  ngOnDestroy() {
    this.bugTracker.destroy();
  }
}
```

## Configuration Options

```javascript
window.BugTrackerConfig = {
  // Required
  apiKey: 'YOUR_API_KEY',        // Your API key from the dashboard
  apiUrl: 'https://...',         // Bug tracker platform URL
  appId: 'YOUR_APP_ID',          // Your application ID

  // Optional
  position: 'bottom-right',      // Widget position: bottom-right, bottom-left, top-right, top-left
  theme: 'light',                // Theme: light, dark, auto
  captureScreenshot: true,       // Auto-capture screenshot
  captureConsole: true,          // Capture console logs
  captureNetwork: true,          // Capture network requests
  captureDevice: true,           // Capture device information
  environment: 'production',     // Environment: development, staging, production

  // User information (if available)
  user: {
    id: '123',
    email: 'user@example.com',
    name: 'John Doe',
    // Any additional metadata
    role: 'admin',
    plan: 'premium'
  }
};
```

## API Methods

```javascript
// Open bug report modal programmatically
window.BugTracker.open();

// Close bug report modal
window.BugTracker.close();

// Submit bug report programmatically
window.BugTracker.submit({
  title: 'Custom Bug Title',
  description: 'Bug description',
  metadata: {
    custom: 'data'
  }
});

// Update user information
window.BugTracker.setUser({
  id: '123',
  email: 'user@example.com',
  name: 'John Doe'
});

// Destroy widget
window.BugTracker.destroy();
```

## Styling Customization

You can customize the widget appearance by overriding CSS variables:

```css
:root {
  --bug-tracker-primary: #667eea;
  --bug-tracker-primary-dark: #764ba2;
  --bug-tracker-text: #111827;
  --bug-tracker-border: #e5e7eb;
  --bug-tracker-background: #ffffff;
  --bug-tracker-button-size: 56px;
}
```

## Security Considerations

1. **API Key Security**: Never expose your secret key. Use only the public API key in frontend code.

2. **Domain Restrictions**: Configure allowed domains in your dashboard to prevent unauthorized usage.

3. **Rate Limiting**: The API implements rate limiting to prevent abuse.

4. **Data Privacy**: Sensitive data in console logs and network requests is automatically filtered.

## Troubleshooting

### Widget Not Appearing

1. Check browser console for errors
2. Verify API key and app ID are correct
3. Ensure domain is whitelisted in dashboard
4. Check if script is loaded correctly

### Screenshot Not Capturing

1. Ensure `captureScreenshot: true` is set
2. Check for CORS issues with external images
3. Verify html2canvas library is loading

### API Errors

- `401`: Invalid API key
- `403`: Domain not allowed
- `404`: App ID not found
- `429`: Rate limit exceeded
- `500`: Server error

## Support

- Documentation: https://your-bug-tracker.com/docs
- Support Email: support@your-bug-tracker.com
- GitHub Issues: https://github.com/your-org/bug-tracker-widget

````

---

## 5. API Development

### 5.1 Widget Report API (MyJKKN Auth)

Create `app/api/widget/report/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

const reportSchema = z.object({
  api_key: z.string(),
  app_id: z.string(),
  title: z.string().nullable(),
  description: z.string().min(10),
  reporter_email: z.string().email().nullable(),
  reporter_name: z.string().nullable(),
  reporter_metadata: z.object({}).nullable(),
  page_url: z.string().url(),
  screenshot_url: z.string().nullable(),
  environment: z.string(),
  console_logs: z.array(z.any()),
  network_logs: z.array(z.any()),
  browser_info: z.object({}),
  device_info: z.object({}),
  session_info: z.object({}),
  error_stack: z.string().nullable()
});

export async function POST(request: NextRequest) {
  try {
    // Get MyJKKN token from headers
    const authHeader = request.headers.get('authorization');
    const myJkknToken = request.headers.get('x-myjkkn-token');

    if (!authHeader || !myJkknToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate token with MyJKKN
    const tokenValidationResponse = await fetch(
      `${process.env.MYJKKN_API_URL}/api/auth/child-app/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: myJkknToken,
          client_id: request.headers.get('x-app-id')
        })
      }
    );

    if (!tokenValidationResponse.ok) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const userData = await tokenValidationResponse.json();

    // Parse request body
    const body = await request.json();

    // Validate data
    const data = reportSchema.parse(body);

    // Verify API key
    const supabase = await createServerSupabaseClient();

    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('*, organization:organizations(*)')
      .eq('api_key', data.api_key)
      .eq('id', data.app_id)
      .eq('is_active', true)
      .single();

    if (appError || !app) {
      return NextResponse.json(
        { error: 'Invalid API key or app ID' },
        { status: 401 }
      );
    }

    // Check domain restriction
    const origin = request.headers.get('origin');
    if (app.allowed_domains?.length > 0) {
      const isAllowed = app.allowed_domains.some(domain =>
        origin?.includes(domain)
      );

      if (!isAllowed) {
        return NextResponse.json(
          { error: 'Domain not allowed' },
          { status: 403 }
        );
      }
    }

    // Upload screenshot if provided
    let screenshotUrl = null;
    if (data.screenshot_url) {
      // Convert base64 to file and upload to storage
      const base64Data = data.screenshot_url.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${app.id}/${Date.now()}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('bug-screenshots')
        .upload(fileName, buffer, {
          contentType: 'image/png',
          cacheControl: '3600'
        });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('bug-screenshots')
          .getPublicUrl(fileName);

        screenshotUrl = publicUrl;
      }
    }

    // Create bug report
    const { data: bugReport, error: bugError } = await supabase
      .from('bug_reports')
      .insert({
        application_id: app.id,
        environment: data.environment,
        reporter_email: data.reporter_email,
        reporter_metadata: data.reporter_metadata,
        title: data.title,
        description: data.description,
        page_url: data.page_url,
        screenshot_url: screenshotUrl,
        console_logs: data.console_logs,
        network_logs: data.network_logs,
        browser_info: data.browser_info,
        device_info: data.device_info,
        session_info: data.session_info,
        error_stack: data.error_stack,
        status: 'new',
        priority: 'medium'
      })
      .select()
      .single();

    if (bugError) {
      console.error('Bug report creation error:', bugError);
      return NextResponse.json(
        { error: 'Failed to create bug report' },
        { status: 500 }
      );
    }

    // Send webhook if configured
    if (app.webhook_url) {
      // Fire and forget webhook
      fetch(app.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bug-Tracker': 'true'
        },
        body: JSON.stringify({
          event: 'bug.created',
          data: bugReport
        })
      }).catch(console.error);
    }

    // Return success response
    return NextResponse.json({
      success: true,
      display_id: bugReport.display_id,
      message: 'Bug report submitted successfully'
    });

  } catch (error) {
    console.error('Widget API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// CORS headers for widget
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-MyJKKN-Token, X-App-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}
````

### 5.2 User Sync API

Create `app/api/auth/sync-user/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

const userSyncSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  role: z.string(),
  institution_id: z.string().uuid().nullable(),
  department_id: z.string().uuid().nullable(),
  metadata: z.object({}).optional()
});

export async function POST(request: NextRequest) {
  try {
    // Validate MyJKKN token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Validate token with MyJKKN
    const tokenValidationResponse = await fetch(
      `${process.env.MYJKKN_API_URL}/api/auth/child-app/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          client_id: request.headers.get('x-app-id')
        })
      }
    );

    if (!tokenValidationResponse.ok) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Parse user data
    const body = await request.json();
    const userData = userSyncSchema.parse(body);

    // Sync user to cached_users table
    const supabase = await createServerSupabaseClient();

    const { data: cachedUser, error } = await supabase
      .from('cached_users')
      .upsert({
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        institution_id: userData.institution_id,
        department_id: userData.department_id,
        metadata: userData.metadata || {},
        last_synced_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (error) {
      console.error('User sync error:', error);
      return NextResponse.json(
        { error: 'Failed to sync user data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: cachedUser
    });
  } catch (error) {
    console.error('User sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## 6. Deployment Guide (MyJKKN OAuth)

### 6.1 Environment Configuration

Create `.env.local`:

```env
# Supabase (Database & Storage only)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MyJKKN OAuth Provider
MYJKKN_API_URL=https://myjkkn.example.com
MYJKKN_CLIENT_ID=your-client-id
MYJKKN_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_MYJKKN_API_URL=https://myjkkn.example.com
NEXT_PUBLIC_MYJKKN_CLIENT_ID=your-client-id

# Application
NEXT_PUBLIC_APP_URL=https://bugtracker.example.com
NEXT_PUBLIC_API_KEY=your-api-key

# Widget CDN
NEXT_PUBLIC_WIDGET_URL=https://bugtracker.example.com/widget/bug-tracker-widget.js
```

### 6.2 MyJKKN OAuth Setup

1. **Register Your App in MyJKKN**:

   - Go to MyJKKN Admin Panel > OAuth Applications
   - Create new application with:
     - Name: "Bug Tracker Platform"
     - Redirect URIs: `https://bugtracker.example.com/api/auth/callback`
     - Scopes: `profile`, `bug_report`, `institution_read`
   - Save Client ID and Client Secret

2. **Configure OAuth Endpoints**:
   - Authorization: `/api/auth/child-app/authorize`
   - Token Exchange: `/api/auth/child-app/token`
   - Token Validation: `/api/auth/child-app/validate`
   - User Info: `/api/auth/me`

### 6.3 Parent App Deployment (Vercel)

```bash
# Build and deploy to Vercel
vercel --prod

# Environment variables to set in Vercel:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - NEXT_PUBLIC_APP_URL
# - NEXT_PUBLIC_WIDGET_CDN_URL
```

### 6.2 Widget CDN Setup

1. **Option 1: Serve from Parent App**

   - Widget file is at `/public/widget/bug-tracker-widget.js`
   - Accessible at `https://your-app.com/widget/bug-tracker-widget.js`

2. **Option 2: CDN Deployment**

   ```bash
   # Upload to CDN (e.g., Cloudflare, AWS S3)
   aws s3 cp public/widget/bug-tracker-widget.js s3://your-bucket/widget/
   aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/widget/*"
   ```

3. **Option 3: NPM Package**
   ```json
   // package.json for widget
   {
     "name": "@your-org/bug-tracker-widget",
     "version": "1.0.0",
     "main": "dist/bug-tracker-widget.js",
     "files": ["dist"],
     "scripts": {
       "build": "webpack --mode production"
     }
   }
   ```

---

## 7. Security Implementation

### 7.1 MyJKKN Token Validation

```typescript
// lib/auth/token-validator.ts
import { NextRequest } from 'next/server';

export async function validateMyJKKNToken(
  request: NextRequest
): Promise<{ isValid: boolean; user?: any }> {
  const authHeader = request.headers.get('authorization');
  const myJkknToken = request.headers.get('x-myjkkn-token');

  if (!authHeader || !myJkknToken) {
    return { isValid: false };
  }

  try {
    const response = await fetch(
      `${process.env.MYJKKN_API_URL}/api/auth/child-app/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: myJkknToken,
          client_id: process.env.MYJKKN_CLIENT_ID
        })
      }
    );

    if (!response.ok) {
      return { isValid: false };
    }

    const user = await response.json();
    return { isValid: true, user };
  } catch (error) {
    console.error('Token validation error:', error);
    return { isValid: false };
  }
}

// Middleware to protect API routes
export async function requireAuth(request: NextRequest) {
  const { isValid, user } = await validateMyJKKNToken(request);

  if (!isValid) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401 }
    );
  }

  return { user };
}
```

### 7.2 API Key Management

```typescript
// lib/api/security.ts
import crypto from 'crypto';

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateSecretKey(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export async function verifyApiKey(
  apiKey: string,
  appId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('applications')
    .select('id')
    .eq('api_key', apiKey)
    .eq('id', appId)
    .eq('is_active', true)
    .single();

  return !error && !!data;
}
```

### 7.2 Rate Limiting

```typescript
// lib/api/rate-limit.ts
import { LRUCache } from 'lru-cache';

const rateLimitCache = new LRUCache<string, number>({
  max: 500,
  ttl: 1000 * 60 // 1 minute
});

export function rateLimit(
  identifier: string,
  limit: number = 10
): boolean {
  const current = rateLimitCache.get(identifier) || 0;

  if (current >= limit) {
    return false;
  }

  rateLimitCache.set(identifier, current + 1);
  return true;
}

// Usage in API route
export async function POST(request: NextRequest) {
  const identifier = request.headers.get('x-api-key') || 'anonymous';

  if (!rateLimit(identifier, 30)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  // Continue with request...
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// __tests__/api/widget.test.ts
import { POST } from '@/app/api/widget/report/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server');

describe('Widget Report API', () => {
  it('should create bug report with valid data', async () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'app-123', api_key: 'test-key' },
        error: null
      }),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: { id: 'bug-123', display_id: 'BUG-001' },
        error: null
      })
    };

    (createServerSupabaseClient as jest.Mock).mockResolvedValue(mockSupabase);

    const request = new Request('http://localhost:3000/api/widget/report', {
      method: 'POST',
      body: JSON.stringify({
        api_key: 'test-key',
        app_id: 'app-123',
        description: 'Test bug description',
        page_url: 'https://example.com',
        // ... other fields
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.display_id).toBe('BUG-001');
  });

  it('should reject invalid API key', async () => {
    // Test implementation...
  });
});
```

### 8.2 Integration Tests

```typescript
// __tests__/integration/bug-flow.test.ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BugReportPage from '@/app/(dashboard)/bugs/page';

describe('Bug Report Flow', () => {
  it('should display bug reports list', async () => {
    render(<BugReportPage />);

    await waitFor(() => {
      expect(screen.getByText('Bug Reports')).toBeInTheDocument();
    });

    // Test filters
    const statusFilter = screen.getByRole('combobox', { name: /status/i });
    fireEvent.change(statusFilter, { target: { value: 'new' } });

    await waitFor(() => {
      expect(screen.getAllByText('New')).toHaveLength.greaterThan(0);
    });
  });

  it('should update bug status', async () => {
    // Test implementation...
  });
});
```

### 8.3 E2E Tests

```typescript
// e2e/bug-widget.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Bug Widget', () => {
  test('should open bug report modal', async ({ page }) => {
    // Navigate to test app with widget
    await page.goto('http://localhost:3001');

    // Click widget button
    await page.click('.bug-tracker-button');

    // Check modal is visible
    await expect(page.locator('.bug-tracker-modal')).toBeVisible();

    // Fill form
    await page.fill('[name="description"]', 'Test bug description');
    await page.fill('[name="email"]', 'test@example.com');

    // Submit
    await page.click('text=Submit Report');

    // Check success message
    await expect(page.locator('.bug-tracker-success')).toBeVisible();
  });
});
```

---

## Summary

This comprehensive guide provides everything needed to build a production-ready bug tracking platform with MyJKKN OAuth authentication:

### Key Features:

1. **MyJKKN OAuth Integration** - Centralized authentication through MyJKKN
2. **Multi-tenant architecture** - Supporting multiple organizations and apps
3. **Embeddable widget** - Framework-agnostic JavaScript widget with MyJKKN auth
4. **Real-time updates** - Using Supabase subscriptions for live data
5. **Gamification features** - Leaderboards, achievements, and weekly prizes
6. **Advanced analytics** - Comprehensive bug metrics and reporting
7. **Security features** - MyJKKN token validation, API key management, rate limiting
8. **User data caching** - Efficient cached_users table for MyJKKN user data

### Technology Stack:

- **Authentication**: MyJKKN OAuth 2.0
- **Database**: Supabase PostgreSQL (database only, not auth)
- **Storage**: Supabase Storage for screenshots
- **Backend**: Next.js 14 with App Router
- **Frontend**: React with TypeScript
- **State Management**: React Query
- **Deployment**: Vercel

### Getting Started:

1. **Register your app in MyJKKN** - Get Client ID and Secret
2. **Set up Supabase** - Create project and run migrations
3. **Configure environment** - Add MyJKKN OAuth credentials
4. **Deploy parent app** - Deploy to Vercel with proper env vars
5. **Integrate widget** - Add widget to child apps with MyJKKN auth config
6. **Start tracking** - Users authenticate via MyJKKN and submit bug reports

### MyJKKN OAuth Flow:

1. Widget checks for existing MyJKKN token
2. If not authenticated, redirects to MyJKKN login
3. After successful auth, token is validated with MyJKKN
4. User data is synced to cached_users table
5. Bug reports are submitted with authenticated user context

This architecture ensures seamless integration with the MyJKKN ecosystem while maintaining a scalable, secure bug tracking platform.
