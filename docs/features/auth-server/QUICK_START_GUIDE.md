# Centralized Auth Server - Quick Start Guide

**🚀 Get started with implementing the Centralized Auth Server**

---

## 📖 5-Minute Overview

### What Are We Building?

Extracting MyJKKN's child app authentication into a standalone server for:

- Better performance
- Independent scaling
- Enhanced security
- Easier maintenance

### Key Facts

- **Timeline**: 7 weeks
- **Team**: 2-3 developers + QA + DevOps
- **Migration**: Zero downtime, gradual rollout
- **Child Apps**: 50+ apps, no code changes needed

---

## 🗂️ Documentation Structure

```
docs/auth/
├── README.md                                      ← Project overview
├── QUICK_START_GUIDE.md (this file)              ← You are here
├── Centralized_Auth_Server_System_Updated_PRD.md ← Complete PRD
├── Centralized_Auth_Server_Implementation_Plan.md ← Implementation details
└── Centralized Auth Server System.md             ← Original reference
```

**Read in this order:**

1. **README.md** - Understand the project
2. **This guide** - Get started quickly
3. **Updated PRD** - Deep dive into architecture
4. **Implementation Plan** - Execute the project

---

## 🎯 Quick Reference

### Current State (MyJKKN)

**Supabase Project**: `hhprjbgknupaplivtoib`  
**Region**: `ap-south-1`

**Tables to Migrate:**

```sql
applications                    → auth_server.applications
child_app_unified_sessions      → auth_server.auth_sessions
child_app_auth_codes_bucket     → auth_server.auth_codes_bucket
child_app_analytics             → auth_server.analytics
```

**Code to Migrate:**

```
MyJKKN/app/api/auth/child-app/*     → auth-server/app/api/auth/*
MyJKKN/lib/services/*child-app*     → auth-server/lib/services/*
```

### Target State (Auth Server)

**Supabase Project**: `nhiniwzkarxqyvgglmiy` ✅  
**Region**: `ap-southeast-1`  
**Domain**: `auth.jkkn.ai` (to configure)

---

## 🚀 Getting Started

### Prerequisites

```bash
# Check you have access to:
- MyJKKN Supabase (hhprjbgknupaplivtoib)
- Auth Server Supabase (nhiniwzkarxqyvgglmiy)
- Vercel account
- GitHub repository access

# Required tools:
node >= 18.17.0
npm >= 9.6.7
supabase CLI
vercel CLI
```

### Week 1: Setup (Day 1)

#### Step 1: Clone & Setup

```bash
# 1. Create new Next.js project
npx create-next-app@latest myjkkn-auth-server \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir

cd myjkkn-auth-server

# 2. Install dependencies
npm install @supabase/supabase-js @supabase/ssr jose zod
npm install -D @types/node

# 3. Copy Supabase client setup from MyJKKN
cp ../MyJKKN/lib/supabase/*.ts lib/supabase/
```

#### Step 2: Configure Environment

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://nhiniwzkarxqyvgglmiy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

JWT_SECRET=your-jwt-secret-min-32-chars
JWT_ALGORITHM=HS256

MYJKKN_URL=https://myjkkn.example.com
MYJKKN_API_KEY=your-api-key
```

#### Step 3: Create Database Schema

```sql
-- Run in Auth Server Supabase (nhiniwzkarxqyvgglmiy)

-- 1. Users Table (synced from MyJKKN)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL UNIQUE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  institution_id UUID,
  app_permissions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Applications Table
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  api_key_hash VARCHAR,
  allowed_redirect_uris TEXT[] NOT NULL,
  allowed_scopes VARCHAR[] DEFAULT ARRAY['read', 'write', 'profile'],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions Table
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  app_sessions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 4. Auth Codes Table
CREATE TABLE auth_codes_bucket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key VARCHAR UNIQUE NOT NULL,
  codes JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Analytics Table
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id VARCHAR NOT NULL,
  analytics_date DATE NOT NULL,
  daily_summary JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_users_parent_id ON users(parent_user_id);
CREATE INDEX idx_applications_app_id ON applications(app_id);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
```

#### Step 4: Deploy to Vercel

```bash
# 1. Initialize Git
git init
git add .
git commit -m "Initial auth server setup"

# 2. Push to GitHub
gh repo create myjkkn-auth-server --private
git remote add origin https://github.com/yourusername/myjkkn-auth-server.git
git push -u origin main

# 3. Deploy to Vercel
vercel --prod

# 4. Configure domain
vercel domains add auth.jkkn.ai
```

---

## 📋 Week-by-Week Checklist

### ✅ Week 1: Infrastructure

- [ ] Next.js app created
- [ ] Database schema created
- [ ] Deployed to Vercel staging
- [ ] Environment variables configured
- [ ] Domain configured

### ✅ Week 2: Code Migration

- [ ] Copy session service from MyJKKN
- [ ] Copy auth codes service
- [ ] Copy analytics service
- [ ] Migrate authorize route
- [ ] Migrate token route
- [ ] Migrate validate route
- [ ] Create sync-user endpoint

### ✅ Week 3: Data Migration

- [ ] Backup MyJKKN tables
- [ ] Migrate applications table
- [ ] Migrate users (from profiles)
- [ ] Migrate sessions
- [ ] Migrate analytics
- [ ] Verify data integrity

### ✅ Week 4: Sync Setup

- [ ] Create webhook in MyJKKN
- [ ] Create fallback cron job
- [ ] Test sync mechanism
- [ ] Load test sync

### ✅ Week 5: Pilot

- [ ] Choose 1 low-traffic app
- [ ] Update app to use auth server
- [ ] Monitor for 1 week
- [ ] Fix issues
- [ ] Document learnings

### ✅ Week 6: Rollout

- [ ] Day 1: 10% of apps
- [ ] Day 2: 25% of apps
- [ ] Day 3: 50% of apps
- [ ] Day 4: 75% of apps
- [ ] Day 5: 100% of apps

### ✅ Week 7: Cleanup

- [ ] Remove auth code from MyJKKN
- [ ] Drop migrated tables
- [ ] Update documentation
- [ ] Final testing
- [ ] Retrospective

---

## 🔧 Common Tasks

### How to Migrate a Service

```typescript
// 1. Copy service from MyJKKN
cp MyJKKN/lib/services/child-app-auth-session-manager.ts \
   auth-server/lib/services/session-service.ts

// 2. Update imports
// Change: from '@/lib/supabase/client'
// To:     from '@/lib/supabase/client'

// 3. Update Supabase client calls
// Change: supabase (MyJKKN client)
// To:     createServiceClient() (Auth server client)

// 4. Test
npm run test:unit -- session-service.test.ts
```

### How to Migrate an API Route

```typescript
// 1. Copy route from MyJKKN
cp MyJKKN/app/api/auth/child-app/token/route.ts \
   auth-server/app/api/auth/token/route.ts

// 2. Update database queries
// Change table references:
// - applications → applications (same)
// - child_app_unified_sessions → auth_sessions
// - child_app_auth_codes_bucket → auth_codes_bucket

// 3. Update imports
// - SessionManagerService → SessionService
// - AuthCodesService → AuthCodesService

// 4. Test
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "test-code",
    "app_id": "test-app",
    "api_key": "test-key"
  }'
```

### How to Test Migration

```typescript
// Create test file
// tests/integration/auth-flow.test.ts

import { describe, it, expect } from 'vitest';

describe('Auth Flow', () => {
  it('should complete authorization code flow', async () => {
    // 1. Request auth code
    const authRes = await fetch('/api/auth/authorize?...');
    const code = new URL(authRes.url).searchParams.get('code');

    // 2. Exchange for tokens
    const tokenRes = await fetch('/api/auth/token', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        app_id: 'test-app',
        api_key: 'test-key'
      })
    });

    expect(tokenRes.ok).toBe(true);

    const { access_token } = await tokenRes.json();

    // 3. Validate token
    const validateRes = await fetch('/api/auth/validate', {
      method: 'POST',
      body: JSON.stringify({
        access_token,
        child_app_id: 'test-app'
      })
    });

    expect(validateRes.ok).toBe(true);
  });
});
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue 1: Supabase connection fails**

```bash
# Check environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY

# Test connection
curl https://nhiniwzkarxqyvgglmiy.supabase.co/rest/v1/ \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

**Issue 2: JWT token invalid**

```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET

# Test token generation
node -e "
const { SignJWT } = require('jose');
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
new SignJWT({ sub: 'test' })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('1h')
  .sign(secret)
  .then(token => console.log(token));
"
```

**Issue 3: Sync not working**

```bash
# Check webhook endpoint
curl -X POST https://auth.jkkn.ai/api/auth/sync-user \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MYJKKN_API_KEY" \
  -d '{
    "parent_user_id": "test-user-id",
    "email": "test@example.com",
    "full_name": "Test User",
    "role": "student"
  }'

# Check MyJKKN trigger
-- In MyJKKN Supabase:
SELECT * FROM pg_trigger
WHERE tgname = 'user_sync_trigger';
```

---

## 📊 Monitoring

### Key Metrics Dashboard

```typescript
// Create monitoring dashboard
// app/admin/dashboard/page.tsx

export default async function MonitoringDashboard() {
  const metrics = await getMetrics();

  return (
    <div>
      <MetricCard
        title="Auth Response Time"
        value={metrics.avgResponseTime}
        target="<150ms"
        status={metrics.avgResponseTime < 150 ? 'good' : 'warning'}
      />

      <MetricCard
        title="Error Rate"
        value={`${metrics.errorRate}%`}
        target="<0.5%"
        status={metrics.errorRate < 0.5 ? 'good' : 'error'}
      />

      <MetricCard
        title="Active Sessions"
        value={metrics.activeSessions}
        info="Across all child apps"
      />

      <MetricCard
        title="Sync Status"
        value={metrics.lastSyncTime}
        status={isRecentSync(metrics.lastSyncTime) ? 'good' : 'warning'}
      />
    </div>
  );
}
```

### Alerts Setup

```typescript
// lib/monitoring/alerts.ts

export async function checkAndAlert() {
  const metrics = await getMetrics();

  // Alert on high error rate
  if (metrics.errorRate > 1) {
    await sendAlert({
      severity: 'critical',
      title: 'High Error Rate',
      message: `Error rate: ${metrics.errorRate}%`,
      action: 'Check logs and consider rollback'
    });
  }

  // Alert on slow response
  if (metrics.avgResponseTime > 200) {
    await sendAlert({
      severity: 'warning',
      title: 'Slow Response Time',
      message: `Avg response: ${metrics.avgResponseTime}ms`,
      action: 'Check database performance'
    });
  }

  // Alert on sync failures
  if (metrics.syncFailures > 10) {
    await sendAlert({
      severity: 'warning',
      title: 'Sync Failures',
      message: `${metrics.syncFailures} users failed to sync`,
      action: 'Check webhook configuration'
    });
  }
}
```

---

## 🚨 Emergency Procedures

### Rollback to MyJKKN

```bash
# 1. Update child apps (< 5 minutes)
# Change .env in all child apps:
AUTH_URL=https://myjkkn.example.com/api/auth/child-app

# 2. Update DNS (if using custom domain)
# Point auth.jkkn.ai back to MyJKKN

# 3. Notify team
# Send alert to Slack/Teams

# 4. Investigate
# Check auth server logs:
vercel logs --follow

# Check MyJKKN logs:
# Dashboard → Logs

# 5. Fix and redeploy
# Make fixes in auth server
vercel --prod

# 6. Gradual re-rollout
# Start with 10% again
```

### Data Recovery

```bash
# If data corruption detected:

# 1. Stop all writes to auth server
# Disable webhook in MyJKKN

# 2. Restore from backup
pg_restore -h AUTH_SERVER_HOST -U postgres \
  -d postgres \
  myjkkn_auth_backup.sql

# 3. Re-run migration script
npm run migrate:data

# 4. Verify data
npm run verify:data

# 5. Resume operations
# Re-enable webhook
```

---

## 📞 Support Contacts

### Who to Contact

**Technical Issues:**

- Tech Lead: [Name] - [Slack/Email]
- Backend Lead: [Name] - [Slack/Email]

**Infrastructure:**

- DevOps: [Name] - [Slack/Email]

**Deployment:**

- Vercel Admin: [Name] - [Email]

**Database:**

- Supabase Admin: [Name] - [Email]

### Escalation Path

```
Level 1: Developer (self-service)
   ↓
Level 2: Tech Lead (< 30 min)
   ↓
Level 3: Engineering Manager (< 1 hour)
   ↓
Level 4: CTO (critical only)
```

---

## ✅ Daily Checklist (During Migration)

### Morning (9 AM)

- [ ] Check overnight metrics
- [ ] Review error logs
- [ ] Check sync status (last 12 hours)
- [ ] Verify all child apps healthy
- [ ] Review rollout plan for today

### During Work (Throughout Day)

- [ ] Monitor response times
- [ ] Track error rate
- [ ] Check user complaints
- [ ] Update team in standup
- [ ] Document any issues

### Evening (5 PM)

- [ ] Review day's metrics
- [ ] Document progress
- [ ] Update stakeholders
- [ ] Plan tomorrow's tasks
- [ ] Set up monitoring for overnight

---

## 🎯 Success Criteria

### Go-Live Checklist

Before considering migration complete:

- [ ] All 50+ child apps migrated
- [ ] Error rate < 1% for 1 week
- [ ] Response time < 150ms (p95)
- [ ] Zero data loss verified
- [ ] All analytics preserved
- [ ] Sync working reliably
- [ ] Monitoring dashboards live
- [ ] Team trained
- [ ] Documentation complete
- [ ] Rollback plan tested
- [ ] Stakeholders satisfied
- [ ] No user complaints

---

## 📚 Additional Resources

### Documentation

- [Complete PRD](./Centralized_Auth_Server_System_Updated_PRD.md)
- [Implementation Plan](./Centralized_Auth_Server_Implementation_Plan.md)
- [Project README](./README.md)

### Code References

- MyJKKN Auth Code: `app/api/auth/child-app/`
- MyJKKN Services: `lib/services/*child-app*.ts`
- Supabase Setup: `supabase/setup/`

### External Links

- [Supabase Docs](https://supabase.com/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [OAuth 2.0 Spec](https://oauth.net/2/)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)

---

## 🎉 Quick Wins

### Easy Optimizations

1. **Enable Caching**

```typescript
// Add Redis caching for token validation
const cachedUser = await redis.get(`user:${userId}`);
if (cachedUser) return cachedUser;
```

2. **Database Indexing**

```sql
-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_auth_sessions_app_id
  ON auth_sessions((app_sessions->>'app_id'));
```

3. **Response Compression**

```typescript
// next.config.ts
export default {
  compress: true,
  poweredByHeader: false
};
```

---

**Happy Coding! 🚀**

Remember: Start small, test thoroughly, roll out gradually, and monitor closely.

Questions? Check the full PRD or contact the tech lead.
