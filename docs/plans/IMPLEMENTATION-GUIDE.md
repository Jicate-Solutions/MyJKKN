# Centralized Bug Reporter Platform - Implementation Guide

**Created:** 2025-01-16
**Status:** Ready for Implementation
**Estimated Total Time:** 40-60 hours

---

## 📋 Overview

This guide provides a complete roadmap for building a centralized bug reporting platform with SDK package. The platform enables development teams to integrate bug reporting into their applications and manage bugs across multiple apps with organization-specific bug bounty programs.

---

## 🏗️ Architecture Summary

**System Type:** Multi-tenant SaaS Platform + React SDK
**Tech Stack:** Next.js 15, Supabase, TypeScript, React Query, Tailwind CSS
**Repository Structure:** Monorepo (npm workspaces)

### Project Structure
```
bug-reporter-platform/
├── apps/
│   ├── platform/          # Centralized Next.js platform
│   └── demo-app/          # Demo app for SDK testing
├── packages/
│   ├── shared/            # Shared TypeScript types
│   └── bug-reporter-sdk/  # React SDK for integration
└── supabase/              # Database schema & migrations
```

---

## 📚 Documentation Index

### Main Implementation Plan
📄 **`2025-01-16-centralized-bug-reporter-platform.md`**
- Phases 1-5: Foundation setup (monorepo, database, SDK, platform init)
- Phases 6-9: Module development, API, auth, testing

### Module-Specific Plans (Phase 6)
All module plans follow the standardized 5-layer architecture:

1. **Types Layer** → TypeScript interfaces
2. **Services Layer** → Supabase operations
3. **Hooks Layer** → React Query hooks
4. **Components Layer** → UI components
5. **Pages Layer** → Next.js routes
6. **Permissions & Navigation** → Access control

#### Available Module Plans:

📄 **`modules/2025-01-16-organizations-module.md`** ✅ **START HERE**
- Organization CRUD operations
- Organization settings & bug bounty configuration
- Organization context & switching
- **Time:** 5-7 hours
- **Status:** Complete detailed plan

📄 **`modules/2025-01-16-applications-module.md`** ✅ **COMPLETE**
- Application registration
- API key generation & management
- Application settings & allowed domains
- **Time:** 4-6 hours
- **Depends on:** Organizations Module
- **Status:** Complete detailed plan

📄 **`modules/2025-01-16-bug-reports-module.md`** ✅ **COMPLETE**
- Bug listing with filters
- Bug detail view
- Status management
- **Time:** 6-8 hours
- **Depends on:** Applications Module
- **Status:** Complete detailed plan

📄 **`modules/2025-01-16-leaderboard-module.md`** ✅ **COMPLETE**
- Organization leaderboard
- Weekly/Monthly/Overall rankings
- Prize configuration
- **Time:** 3-4 hours
- **Depends on:** Bug Reports Module
- **Status:** Complete detailed plan

📄 **`modules/2025-01-16-team-management-module.md`** ✅ **COMPLETE**
- Member invitations
- Role management (Owner/Admin/Developer)
- Permission enforcement
- **Time:** 4-5 hours
- **Depends on:** Organizations Module
- **Status:** Complete detailed plan

📄 **`modules/2025-01-16-messaging-module.md`** ✅ **COMPLETE**
- Bug report chat/messaging
- Real-time updates
- Message threading
- **Time:** 5-6 hours
- **Depends on:** Bug Reports Module
- **Status:** Complete detailed plan

---

## 🚀 Implementation Sequence

### Phase 1-5: Foundation (12-16 hours)

**Goal:** Set up monorepo, database, SDK, and platform shell

**Tasks:**
1. ✅ Initialize monorepo structure (1h)
2. ✅ Create shared types package (1h)
3. ✅ Design & apply database schema (3-4h)
4. ✅ Build SDK package (4-6h)
5. ✅ Initialize Next.js platform (2-3h)
6. ✅ Set up Supabase clients (1h)

**Completion Criteria:**
- Monorepo builds without errors
- Database schema applied to Supabase
- SDK package compiles and exports components
- Platform runs on localhost

---

### Phase 6: Core Modules (28-36 hours)

**Implementation Order (Sequential):**

#### 1. Organizations Module (5-7h) ⭐ **CRITICAL PATH**
**Why First:** Everything depends on organization context

**Steps:**
1. Follow `modules/2025-01-16-organizations-module.md`
2. Implement all 6 layers
3. Test CRUD operations
4. Verify RLS policies

**Completion Criteria:**
- Can create/edit/delete organizations
- Organization switcher works
- Settings page functional
- Stats display correctly

---

#### 2. Applications Module (4-6h)
**Why Second:** Bug reports need application context

**Steps:**
1. Create module plan using `nextjs-module-builder` skill
2. Implement Types → Services → Hooks → Components → Pages
3. Add API key generation logic
4. Test application registration flow

**Completion Criteria:**
- Can register new applications
- API keys generate correctly
- Can regenerate keys
- Application list displays

---

#### 3. Bug Reports Module (6-8h)
**Why Third:** Core feature depends on Apps & Orgs

**Steps:**
1. Adapt existing MyJKKN bug report code
2. Add organization_id + application_id filters
3. Build admin dashboard with filters
4. Test multi-tenant isolation

**Completion Criteria:**
- Bug listing works with filters
- Status updates functional
- Detail view shows messages
- RLS enforces org isolation

---

#### 4. Team Management Module (4-5h) **Parallel with Bug Reports**
**Why Parallel:** Independent of bug reports

**Steps:**
1. Member invitation system
2. Role assignment UI
3. Permission checks
4. Member list page

**Completion Criteria:**
- Can invite members
- Roles assign correctly
- Permissions enforce properly

---

#### 5. Leaderboard Module (3-4h)
**Why Fifth:** Depends on bug data

**Steps:**
1. Reuse existing leaderboard UI
2. Add organization_id filter
3. Prize configuration page
4. Test ranking calculations

**Completion Criteria:**
- Leaderboard displays org-specific data
- Rankings calculate correctly
- Prize settings save

---

#### 6. Messaging Module (5-6h)
**Why Last:** Enhancement to bug reports

**Steps:**
1. Reuse existing messaging code
2. Real-time subscriptions
3. Message threading
4. Participant management

**Completion Criteria:**
- Messages send/receive
- Real-time updates work
- Threads display correctly

---

### Phase 7: Public API (6-8 hours)

**Goal:** Create SDK endpoints for bug submission

**Endpoints:**
```
POST   /api/v1/public/bug-reports
GET    /api/v1/public/bug-reports/me
GET    /api/v1/public/bug-reports/:id
POST   /api/v1/public/bug-reports/:id/messages
```

**Tasks:**
1. Create API key authentication middleware
2. Implement public bug submission endpoint
3. Add user bug retrieval endpoint
4. Test with SDK package

**Completion Criteria:**
- SDK can submit bugs via API
- API key validation works
- Bugs link to correct org/app
- User can view their bugs

---

### Phase 8: Auth & Landing (4-6 hours)

**Tasks:**
1. Login/Signup pages with Supabase Auth
2. Email verification flow
3. Password reset
4. Marketing landing page
5. Pricing page (optional)

**Completion Criteria:**
- Users can sign up
- Email verification works
- Password reset functional
- Landing page deployed

---

### Phase 9: Testing & Deployment (6-8 hours)

**Tasks:**
1. Create demo app for SDK testing
2. End-to-end testing
3. Multi-org isolation testing
4. Performance testing
5. Deploy to Vercel
6. Publish SDK to GitHub Packages
7. Set up monitoring

**Completion Criteria:**
- All features tested
- SDK published
- Platform deployed
- Monitoring active

---

## 📊 Progress Tracking

### Checklist

**Foundation (Phases 1-5)**
- [ ] Monorepo structure created
- [ ] Shared types package complete
- [ ] Database schema applied
- [ ] SDK package built & tested
- [ ] Platform initialized
- [ ] Supabase clients configured

**Core Modules (Phase 6)**
- [ ] Organizations Module complete
- [ ] Applications Module complete
- [ ] Bug Reports Module complete
- [ ] Team Management Module complete
- [ ] Leaderboard Module complete
- [ ] Messaging Module complete

**API & Auth (Phases 7-8)**
- [ ] Public API endpoints created
- [ ] API key authentication working
- [ ] Auth pages implemented
- [ ] Landing page created

**Launch (Phase 9)**
- [ ] Demo app created
- [ ] End-to-end tests passing
- [ ] Platform deployed
- [ ] SDK published
- [ ] Documentation complete

---

## 🛠️ Development Workflow

### For Each Module:

1. **Read Module Plan**
   - Understand requirements
   - Review database schema
   - Check dependencies

2. **Implement Layers Sequentially**
   - Types → Services → Hooks → Components → Pages → Permissions
   - Commit after each layer
   - Test as you go

3. **Test Module**
   - Run manual tests
   - Verify RLS policies
   - Check permissions
   - Test edge cases

4. **Mark Complete**
   - Update checklist
   - Commit final changes
   - Move to next module

### Daily Workflow:

```bash
# Start of day
git pull
npm run dev

# While developing
npm run typecheck  # Check types
npm run build      # Verify build

# End of day
git add .
git commit -m "feat(module): description"
git push
```

---

## 🔧 Common Commands

### Monorepo
```bash
# Install all packages
npm install

# Run platform
npm run dev

# Build SDK
npm run build:sdk

# Publish SDK
npm run publish:sdk

# Type check all
npm run typecheck
```

### Database
```bash
# Apply schema changes
# Go to Supabase Dashboard → SQL Editor
# Copy/paste from supabase/setup/*.sql

# Test RLS policies
# Use Supabase Dashboard → Table Editor
# Try as different users
```

### Git
```bash
# Feature branch workflow
git checkout -b feat/module-name
# ... make changes ...
git add .
git commit -m "feat(module): description"
git push origin feat/module-name
# Create PR on GitHub
```

---

## 📖 Reference Documentation

### Existing MyJKKN Code to Reuse:

**Bug Reporter Widget:**
- `components/bug-reporter/bug-reporter-widget.tsx`
- `lib/utils/enhanced-logger.ts`
- Adapt for SDK package

**Bug Reports Module:**
- `app/(routes)/admin/bug-reports/page.tsx`
- `lib/services/bug-reports/bug-report-service.ts`
- Add org/app filters

**Leaderboard:**
- `app/(routes)/bug-leaderboard/page.tsx`
- Add organization filter

**Messaging:**
- `app/(routes)/my-bug-reports/[id]/page.tsx`
- Bug report chat implementation

### Architecture Patterns:

Refer to your existing MyJKKN patterns:
- Service layer structure
- React Query hooks
- Shadcn/UI components
- RLS policy patterns
- Permission guards

---

## 🚨 Critical Success Factors

1. **Complete Organizations Module First**
   - Everything depends on it
   - Test thoroughly
   - Verify RLS policies

2. **Test Multi-Tenancy Early**
   - Create multiple orgs
   - Verify data isolation
   - Test RLS policies

3. **Incremental Testing**
   - Test each layer before moving on
   - Don't skip manual testing
   - Verify with multiple users

4. **Commit Frequently**
   - After each layer
   - Use descriptive messages
   - Push regularly

5. **Follow the 5-Layer Pattern**
   - Don't skip layers
   - Types first, Pages last
   - Consistent structure

---

## 💡 Tips & Best Practices

### TypeScript
- Use strict mode
- No `any` types
- Define DTOs for all API boundaries
- Explicit return types

### Services
- Try-catch all methods
- Console log with module prefix
- Return clean error messages
- Use admin client for server operations

### Components
- Use Shadcn/UI components
- Follow existing patterns
- Mobile-first responsive
- Accessibility (ARIA labels)

### Performance
- Use React Query caching
- Implement pagination
- Optimize Supabase queries
- Lazy load components

---

## 🎯 Next Steps

1. **Start with Foundation (Phase 1-5)**
   - Follow main plan: `2025-01-16-centralized-bug-reporter-platform.md`
   - Complete all foundation tasks
   - Verify platform runs

2. **Implement Organizations Module**
   - Follow: `modules/2025-01-16-organizations-module.md`
   - This is the critical path
   - Test thoroughly

3. **Continue with Remaining Modules**
   - Follow recommended sequence
   - Create detailed plans as needed using `nextjs-module-builder` skill
   - Test each module before moving on

4. **Build Public API**
   - Implement SDK endpoints
   - Test with demo app

5. **Launch**
   - Deploy platform
   - Publish SDK
   - Create documentation

---

## 📞 Support & Questions

If you encounter issues:

1. **Check existing MyJKKN code** - Similar patterns already implemented
2. **Review module plan** - Detailed steps provided
3. **Test incrementally** - Isolate the problem
4. **Check Supabase docs** - For RLS/auth issues

---

**Ready to start?** Begin with Phase 1 of the main implementation plan!

**Main Plan:** `docs/plans/2025-01-16-centralized-bug-reporter-platform.md`
**First Module:** `docs/plans/modules/2025-01-16-organizations-module.md`
