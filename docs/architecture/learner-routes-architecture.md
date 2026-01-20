# Learner Routes Architecture

## Overview

MyJKKN uses a **Smart Hybrid Portal** approach for organizing learner-accessible routes. This separates core learner features from domain-specific actions while maintaining flexibility.

## Architecture Principles

### 1. Route Categories

**Portal Routes (`/learners/my-*`)**
- Core learner self-service features
- Academic/institutional data viewing
- Learner-centric experience
- Examples: my-grades, my-timetable, my-attendance

**Domain Routes (`/{module}/my-*`)**
- Domain-specific actions
- Accessible to multiple roles
- Business domain focused
- Examples: my-reservations (resources), my-bills (billing)

**Shared Routes (`/my-*`)**
- Generic user features
- Cross-cutting concerns
- Examples: my-bug-reports, notifications

### 2. Access Control Layers

**Layer 1: Authentication**
- User must be logged in
- Handled by Supabase Auth

**Layer 2: Role Check**
- User must have `role='student'`
- Must have valid `learner_id`

**Layer 3: Lifecycle Status**
- Must be `active` or `graduated`
- Validated via `StudentValidationService`

**Layer 4: Permissions (Optional)**
- Granular permission checks
- Format: `learners.my-{feature}.{action}`

### 3. Route Registry

Centralized registry at `lib/constants/learner-routes.ts`:

```typescript
export const LEARNER_ROUTES = {
  'learners-dashboard': {
    path: '/learners/dashboard',
    category: 'portal',
    permission: 'learners.dashboard.view',
    // ... metadata
  },
  // ... more routes
};
```

**Benefits:**
- Single source of truth
- Type-safe route definitions
- Migration tracking
- Helper functions for filtering

### 4. Graduated Student Access

Graduated students get **restricted access**:

✅ Allowed:
- View past grades
- View past timetables
- View attendance history
- Download academic records
- Update contact information

❌ Restricted:
- Create new attendance
- Enroll in courses
- Book physical resources
- Access active student features

## File Organization

```
app/(routes)/learners/
├── dashboard/                 # Learner home
├── my-grades/                # Personal grades
├── my-timetable/             # Personal timetable
├── my-attendance/            # Personal attendance
├── my-profile/               # Profile management
├── my-academic-records/      # Transcripts, certificates
├── profiles/                 # Admin: manage all learners
├── alumni/                   # Admin: alumni management
└── analytics/                # Admin: learner analytics
```

Each my-* page follows this structure:
```
my-{feature}/
├── page.tsx              # Server component with auth
├── _components/          # Feature-specific components
├── loading.tsx           # Loading state
└── error.tsx            # Error boundary (optional)
```

## Developer Workflow

1. **Check decision tree** in `docs/LEARNER_ROUTES_GUIDELINES.md`
2. **Update route registry** in `lib/constants/learner-routes.ts`
3. **Add permission** in `lib/constants/permissions.ts`
4. **Update sidebar menu** in `lib/sidebarMenuLink.ts`
5. **Implement page** following LearnerPageGuard pattern
6. **Test access control** with different user roles

## Migration History

| Date | Change | Routes Affected |
|------|--------|----------------|
| 2025-01-20 | Initial migration | attendance → my-attendance |
| 2025-01-20 | New pages created | dashboard, my-profile, my-academic-records |

## References

- Guidelines: `docs/LEARNER_ROUTES_GUIDELINES.md`
- Route Registry: `lib/constants/learner-routes.ts`
- Access Control: `components/auth/learner-page-guard.tsx`
- Permissions: `lib/constants/permissions.ts`
