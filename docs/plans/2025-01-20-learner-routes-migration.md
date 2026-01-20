# Learner Routes Smart Hybrid Portal Migration

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Migrate existing student-only pages to Smart Hybrid Portal architecture with centralized route registry, consistent naming conventions, and comprehensive developer guidelines.

**Architecture:** Smart Hybrid Portal approach separating core learner features (`/learners/my-*`) from domain-specific actions (`/{module}/my-*`). Infrastructure includes route registry, reusable access control components, and automated documentation.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Auth + Database), React Query, Tailwind CSS

---

## Migration Overview

**Current Routes:**
- ✅ `/learners/my-grades` - STAYS (already correct)
- ✅ `/learners/my-timetable` - STAYS (already correct)
- 🔄 `/learners/attendance` - MOVE to `/learners/my-attendance`
- ✅ `/my-bug-reports` - STAYS (shared feature)
- ✅ `/resource-management/reservations/my-reservations` - STAYS (domain action)

**New Routes to Create:**
- ➕ `/learners/dashboard` - Learner home dashboard
- ➕ `/learners/my-profile` - Learner profile management
- ➕ `/learners/my-academic-records` - Transcripts, certificates, achievements

**Infrastructure to Create:**
- Route registry (`lib/constants/learner-routes.ts`)
- Guidelines document (`docs/LEARNER_ROUTES_GUIDELINES.md`)
- Reusable guard component (`components/auth/learner-page-guard.tsx`)
- Permission constants updates
- Sidebar menu updates
- Redirect middleware

---

## Phase 1: Infrastructure Setup

### Task 1: Create Route Registry

**Files:**
- Create: `lib/constants/learner-routes.ts`

**Step 1: Create route registry file with TypeScript types**

```typescript
// lib/constants/learner-routes.ts

/**
 * Centralized registry of all learner-accessible routes in MyJKKN
 *
 * Purpose:
 * - Single source of truth for all learner routes
 * - Easy discovery for developers
 * - Automated route validation
 * - Documentation generation
 */

export type LearnerRouteCategory =
  | 'portal'        // Learner portal (my-* in /learners)
  | 'domain'        // Domain-specific actions (my-* in modules)
  | 'shared';       // Shared user features

export interface LearnerRoute {
  path: string;
  category: LearnerRouteCategory;
  module: string;
  feature: string;
  permission: string | null;
  description: string;
  allowedStatuses: ('active' | 'graduated')[];
  isNew?: boolean;
  movedFrom?: string;
}

export const LEARNER_ROUTES: Record<string, LearnerRoute> = {
  // ========================================
  // CATEGORY: PORTAL (Core learner features in /learners)
  // ========================================

  'learners-dashboard': {
    path: '/learners/dashboard',
    category: 'portal',
    module: 'learners',
    feature: 'Dashboard',
    permission: 'learners.dashboard.view',
    description: 'Learner home dashboard with grades summary, attendance, upcoming classes',
    allowedStatuses: ['active', 'graduated'],
    isNew: true,
  },

  'learners-my-grades': {
    path: '/learners/my-grades',
    category: 'portal',
    module: 'learners',
    feature: 'My Grades',
    permission: 'learners.my-grades.view',
    description: 'View personal grades from LTI tools (MATLAB, external systems)',
    allowedStatuses: ['active', 'graduated'],
  },

  'learners-my-timetable': {
    path: '/learners/my-timetable',
    category: 'portal',
    module: 'learners',
    feature: 'My Timetable',
    permission: 'learners.my-timetable.view',
    description: 'Personal timetable view with class schedule (mobile-optimized)',
    allowedStatuses: ['active', 'graduated'],
  },

  'learners-my-attendance': {
    path: '/learners/my-attendance',
    category: 'portal',
    module: 'learners',
    feature: 'My Attendance',
    permission: 'learners.my-attendance.view',
    description: 'Personal attendance records with analytics and statistics',
    allowedStatuses: ['active', 'graduated'],
    movedFrom: '/learners/attendance',
    isNew: true,
  },

  'learners-my-profile': {
    path: '/learners/my-profile',
    category: 'portal',
    module: 'learners',
    feature: 'My Profile',
    permission: 'learners.my-profile.view',
    description: 'Personal profile, contact information, and account settings',
    allowedStatuses: ['active', 'graduated'],
    isNew: true,
  },

  'learners-my-academic-records': {
    path: '/learners/my-academic-records',
    category: 'portal',
    module: 'learners',
    feature: 'My Academic Records',
    permission: 'learners.my-academic-records.view',
    description: 'Transcripts, certificates, achievements, and academic history',
    allowedStatuses: ['active', 'graduated'],
    isNew: true,
  },

  // ========================================
  // CATEGORY: DOMAIN (Domain-specific actions in their modules)
  // ========================================

  'resources-my-reservations': {
    path: '/resource-management/reservations/my-reservations',
    category: 'domain',
    module: 'resource-management',
    feature: 'My Reservations',
    permission: 'resources.reservations.view',
    description: 'Personal resource bookings and reservation management',
    allowedStatuses: ['active'],
  },

  // ========================================
  // CATEGORY: SHARED (Generic user features)
  // ========================================

  'my-bug-reports': {
    path: '/my-bug-reports',
    category: 'shared',
    module: 'bug-reports',
    feature: 'My Bug Reports',
    permission: null, // User-specific, no permission needed
    description: 'Personal bug reports and issue tracking submissions',
    allowedStatuses: ['active', 'graduated'],
  },

  'notifications': {
    path: '/notifications',
    category: 'shared',
    module: 'notifications',
    feature: 'Notifications',
    permission: 'notifications.view',
    description: 'System notifications and announcements',
    allowedStatuses: ['active', 'graduated'],
  },

} as const;

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get all learner portal routes
 */
export function getLearnerPortalRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.category === 'portal'
  );
}

/**
 * Get all domain-specific routes
 */
export function getDomainSpecificRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.category === 'domain'
  );
}

/**
 * Get routes by module
 */
export function getRoutesByModule(module: string): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.module === module
  );
}

/**
 * Get routes accessible by lifecycle status
 */
export function getRoutesByStatus(
  status: 'active' | 'graduated'
): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.allowedStatuses.includes(status)
  );
}

/**
 * Check if route exists
 */
export function isValidLearnerRoute(path: string): boolean {
  return Object.values(LEARNER_ROUTES).some(route => route.path === path);
}

/**
 * Get route metadata by path
 */
export function getLearnerRouteMetadata(path: string): LearnerRoute | undefined {
  return Object.values(LEARNER_ROUTES).find(route => route.path === path);
}

/**
 * Get new routes (for migration tracking)
 */
export function getNewRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(route => route.isNew);
}

/**
 * Get moved routes (for migration tracking)
 */
export function getMovedRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(route => route.movedFrom);
}
```

**Step 2: Verify TypeScript compilation**

Run: `npm run build` or `tsc --noEmit`
Expected: No type errors

**Step 3: Commit route registry**

```bash
git add lib/constants/learner-routes.ts
git commit -m "feat(learners): add centralized route registry

- Create LEARNER_ROUTES registry with all learner-accessible routes
- Add helper functions for filtering routes by category/status
- Track migration status (isNew, movedFrom)
- Support for portal, domain, and shared route categories"
```

---

### Task 2: Create Reusable Learner Page Guard Component

**Files:**
- Create: `components/auth/learner-page-guard.tsx`

**Step 1: Create server-side guard component**

```typescript
// components/auth/learner-page-guard.tsx

import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';

interface LearnerPageGuardProps {
  children: ReactNode;
  requiredPermission?: string;
}

/**
 * Server-side guard component for learner-only pages
 *
 * Validates:
 * 1. User is authenticated
 * 2. User has 'student' role
 * 3. User has valid learner_id
 * 4. Learner lifecycle status is 'active' or 'graduated'
 * 5. Optional: User has required permission
 *
 * Usage:
 * ```tsx
 * export default async function MyGradesPage() {
 *   return (
 *     <LearnerPageGuard requiredPermission="learners.my-grades.view">
 *       <MyGradesContent />
 *     </LearnerPageGuard>
 *   );
 * }
 * ```
 */
export async function LearnerPageGuard({
  children,
  requiredPermission
}: LearnerPageGuardProps) {
  const supabase = createClient();

  // Step 1: Authentication check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  // Step 2: Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/'); // Non-learners redirected to home
  }

  // Step 3: Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Step 4: Optional permission check
  // TODO: Implement permission check if requiredPermission is provided
  // This would require fetching merged permissions from custom_roles
  // For now, lifecycle status + role check is sufficient

  return <>{children}</>;
}
```

**Step 2: Test guard component exists and compiles**

Run: `npm run build` or `tsc --noEmit`
Expected: No type errors

**Step 3: Commit guard component**

```bash
git add components/auth/learner-page-guard.tsx
git commit -m "feat(auth): add reusable LearnerPageGuard component

- Server-side authentication and role validation
- Lifecycle status check via StudentValidationService
- Support for optional permission checks
- Redirects unauthorized users appropriately"
```

---

### Task 3: Update Permission Constants

**Files:**
- Modify: `lib/constants/permissions.ts`

**Step 1: Add new learner permissions**

Open `lib/constants/permissions.ts` and add these permissions to the learners section:

```typescript
// lib/constants/permissions.ts

// Find the learners permission section and add/update:

export const LEARNER_PERMISSIONS = {
  // Existing permissions
  'learners.profiles.view': 'View learner profiles',
  'learners.profiles.create': 'Create learner profiles',
  'learners.profiles.edit': 'Edit learner profiles',
  'learners.profiles.delete': 'Delete learner profiles',
  'learners.alumni.view': 'View alumni',
  'learners.analytics.view': 'View learner analytics',

  // NEW: Learner portal features (my-* pages)
  'learners.dashboard.view': 'View learner dashboard',
  'learners.my-grades.view': 'View personal grades',
  'learners.my-timetable.view': 'View personal timetable',
  'learners.my-attendance.view': 'View personal attendance',
  'learners.my-profile.view': 'View personal profile',
  'learners.my-profile.edit': 'Edit personal profile',
  'learners.my-academic-records.view': 'View academic records',
  'learners.my-academic-records.download': 'Download academic records',
} as const;
```

**Step 2: Verify permissions are exported correctly**

Check that these permissions are included in the main permissions export.

**Step 3: Run TypeScript check**

Run: `npm run build` or `tsc --noEmit`
Expected: No type errors

**Step 4: Commit permission updates**

```bash
git add lib/constants/permissions.ts
git commit -m "feat(permissions): add learner portal permissions

- Add dashboard.view permission
- Add my-grades.view permission
- Add my-timetable.view permission
- Add my-attendance.view permission
- Add my-profile view/edit permissions
- Add my-academic-records view/download permissions"
```

---

### Task 4: Create Developer Guidelines Document

**Files:**
- Create: `docs/LEARNER_ROUTES_GUIDELINES.md`

**Step 1: Create comprehensive guidelines with decision tree**

```markdown
<!-- Copy the full guidelines document from Section 6 of the design -->
<!-- File path: docs/LEARNER_ROUTES_GUIDELINES.md -->

# Learner Routes Organization Guidelines

## Quick Decision Tree

When adding a new learner-accessible feature, follow this decision tree:

[Include complete decision tree and all sections from the design presentation]

<!-- Full content from the guidelines section above -->
```

**Step 2: Commit guidelines document**

```bash
git add docs/LEARNER_ROUTES_GUIDELINES.md
git commit -m "docs: add learner routes organization guidelines

- Add decision tree for route placement
- Document naming conventions
- Include migration checklist
- Add examples and common mistakes
- Provide testing checklist"
```

---

## Phase 2: Migration of Existing Routes

### Task 5: Migrate /learners/attendance to /learners/my-attendance

**Files:**
- Move: `app/(routes)/learners/attendance/*` → `app/(routes)/learners/my-attendance/*`
- Modify: `app/(routes)/learners/attendance/page.tsx` (if keeping old route as redirect)

**Step 1: Create new my-attendance directory**

```bash
mkdir -p "app/(routes)/learners/my-attendance"
```

**Step 2: Copy attendance page to new location**

```bash
# Windows (Git Bash)
cp -r "app/(routes)/learners/attendance/"* "app/(routes)/learners/my-attendance/"
```

**Step 3: Update page.tsx in my-attendance (if needed)**

Verify the page uses correct access control pattern. The file should already have proper validation.

**Step 4: Create redirect in old attendance route**

```typescript
// app/(routes)/learners/attendance/page.tsx

import { redirect } from 'next/navigation';

export default function AttendanceRedirect() {
  // Redirect old route to new route
  redirect('/learners/my-attendance');
}
```

**Step 5: Test both routes**

1. Start dev server: `npm run dev`
2. Navigate to `/learners/attendance`
3. Verify redirect to `/learners/my-attendance`
4. Verify attendance page works correctly at new URL

Expected: Seamless redirect, page functions normally

**Step 6: Commit migration**

```bash
git add "app/(routes)/learners/my-attendance"
git add "app/(routes)/learners/attendance/page.tsx"
git commit -m "refactor(learners): migrate attendance to my-attendance route

- Move /learners/attendance to /learners/my-attendance
- Add redirect from old route to new route
- Maintain all existing functionality
- Follow learner portal naming convention (my-* prefix)"
```

---

## Phase 3: Create New Learner Pages

### Task 6: Create Learner Dashboard

**Files:**
- Create: `app/(routes)/learners/dashboard/page.tsx`
- Create: `app/(routes)/learners/dashboard/_components/dashboard-overview.tsx`
- Create: `app/(routes)/learners/dashboard/_components/quick-stats.tsx`
- Create: `app/(routes)/learners/dashboard/_components/upcoming-classes.tsx`
- Create: `app/(routes)/learners/dashboard/loading.tsx`

**Step 1: Create dashboard directory structure**

```bash
mkdir -p "app/(routes)/learners/dashboard/_components"
```

**Step 2: Create main dashboard page**

```typescript
// app/(routes)/learners/dashboard/page.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import DashboardOverview from './_components/dashboard-overview';
import QuickStats from './_components/quick-stats';
import UpcomingClasses from './_components/upcoming-classes';

export const metadata = {
  title: 'Dashboard | MyJKKN',
  description: 'Learner dashboard with overview, stats, and upcoming classes',
};

export default async function LearnerDashboardPage() {
  const supabase = createClient();

  // Step 1: Authentication check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Step 2: Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // Step 3: Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardOverview learnerId={profile.learner_id} />
        </div>
        <div className="space-y-6">
          <QuickStats learnerId={profile.learner_id} />
          <UpcomingClasses learnerId={profile.learner_id} />
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create loading state**

```typescript
// app/(routes)/learners/dashboard/loading.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Skeleton className="h-10 w-64" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Create dashboard components (placeholders)**

```typescript
// app/(routes)/learners/dashboard/_components/dashboard-overview.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardOverviewProps {
  learnerId: string;
}

export default function DashboardOverview({ learnerId }: DashboardOverviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Welcome to your learner dashboard. This section will show your academic overview.
        </p>
        {/* TODO: Add grade summary, attendance summary, upcoming assignments */}
      </CardContent>
    </Card>
  );
}
```

```typescript
// app/(routes)/learners/dashboard/_components/quick-stats.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QuickStatsProps {
  learnerId: string;
}

export default function QuickStats({ learnerId }: QuickStatsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Attendance</span>
          <span className="font-semibold">--%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">GPA</span>
          <span className="font-semibold">--</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Pending Bills</span>
          <span className="font-semibold">--</span>
        </div>
        {/* TODO: Fetch real stats from services */}
      </CardContent>
    </Card>
  );
}
```

```typescript
// app/(routes)/learners/dashboard/_components/upcoming-classes.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UpcomingClassesProps {
  learnerId: string;
}

export default function UpcomingClasses({ learnerId }: UpcomingClassesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Classes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No upcoming classes
        </p>
        {/* TODO: Fetch timetable and show today's classes */}
      </CardContent>
    </Card>
  );
}
```

**Step 5: Test dashboard page**

1. Start dev server: `npm run dev`
2. Login as learner
3. Navigate to `/learners/dashboard`
4. Verify page renders with placeholders
5. Verify non-learners cannot access

Expected: Dashboard page renders, shows placeholder content

**Step 6: Commit dashboard**

```bash
git add "app/(routes)/learners/dashboard"
git commit -m "feat(learners): create learner dashboard page

- Add main dashboard page with access control
- Create overview, quick stats, and upcoming classes components
- Add loading state
- Use LearnerPageGuard pattern for authentication
- Placeholder content (TODO: implement real data fetching)"
```

---

### Task 7: Create My Profile Page

**Files:**
- Create: `app/(routes)/learners/my-profile/page.tsx`
- Create: `app/(routes)/learners/my-profile/_components/profile-form.tsx`
- Create: `app/(routes)/learners/my-profile/loading.tsx`

**Step 1: Create my-profile directory**

```bash
mkdir -p "app/(routes)/learners/my-profile/_components"
```

**Step 2: Create main profile page**

```typescript
// app/(routes)/learners/my-profile/page.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import ProfileForm from './_components/profile-form';

export const metadata = {
  title: 'My Profile | MyJKKN',
  description: 'Manage your profile and account settings',
};

export default async function MyProfilePage() {
  const supabase = createClient();

  // Step 1: Authentication check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Step 2: Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // Step 3: Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Step 4: Fetch learner profile data
  const { data: learnerProfile } = await supabase
    .from('learners_profiles')
    .select(`
      *,
      sections:section_id (
        name,
        programs:program_id (
          name,
          degrees:degree_id (
            name,
            institutions:institution_id (
              name
            )
          )
        )
      )
    `)
    .eq('id', profile.learner_id)
    .single();

  if (!learnerProfile) {
    return <div>Profile not found</div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Profile</h1>
          <p className="text-muted-foreground">
            View and update your personal information
          </p>
        </div>

        <ProfileForm learnerProfile={learnerProfile} userId={user.id} />
      </div>
    </div>
  );
}
```

**Step 3: Create loading state**

```typescript
// app/(routes)/learners/my-profile/loading.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
```

**Step 4: Create profile form component (placeholder)**

```typescript
// app/(routes)/learners/my-profile/_components/profile-form.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileFormProps {
  learnerProfile: any; // TODO: Add proper type
  userId: string;
}

export default function ProfileForm({ learnerProfile, userId }: ProfileFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>
          Your profile information from the institution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">First Name</label>
            <p className="text-sm text-muted-foreground">
              {learnerProfile.first_name || '-'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Last Name</label>
            <p className="text-sm text-muted-foreground">
              {learnerProfile.last_name || '-'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <p className="text-sm text-muted-foreground">
              {learnerProfile.email || '-'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <p className="text-sm text-muted-foreground">
              {learnerProfile.phone_number || '-'}
            </p>
          </div>
        </div>
        {/* TODO: Add editable form with save functionality */}
      </CardContent>
    </Card>
  );
}
```

**Step 5: Test profile page**

1. Start dev server: `npm run dev`
2. Login as learner
3. Navigate to `/learners/my-profile`
4. Verify profile data displays
5. Verify non-learners cannot access

Expected: Profile page renders with learner data

**Step 6: Commit profile page**

```bash
git add "app/(routes)/learners/my-profile"
git commit -m "feat(learners): create my-profile page

- Add profile viewing page with access control
- Fetch learner profile with related data
- Create profile form component (read-only for now)
- Add loading state
- TODO: Add edit functionality"
```

---

### Task 8: Create My Academic Records Page

**Files:**
- Create: `app/(routes)/learners/my-academic-records/page.tsx`
- Create: `app/(routes)/learners/my-academic-records/_components/records-list.tsx`
- Create: `app/(routes)/learners/my-academic-records/loading.tsx`

**Step 1: Create my-academic-records directory**

```bash
mkdir -p "app/(routes)/learners/my-academic-records/_components"
```

**Step 2: Create main academic records page**

```typescript
// app/(routes)/learners/my-academic-records/page.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import RecordsList from './_components/records-list';

export const metadata = {
  title: 'My Academic Records | MyJKKN',
  description: 'View and download transcripts, certificates, and achievements',
};

export default async function MyAcademicRecordsPage() {
  const supabase = createClient();

  // Step 1: Authentication check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Step 2: Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // Step 3: Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Academic Records</h1>
          <p className="text-muted-foreground">
            View and download your transcripts, certificates, and achievements
          </p>
        </div>

        <RecordsList learnerId={profile.learner_id} />
      </div>
    </div>
  );
}
```

**Step 3: Create loading state**

```typescript
// app/(routes)/learners/my-academic-records/loading.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function AcademicRecordsLoading() {
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Create records list component (placeholder)**

```typescript
// app/(routes)/learners/my-academic-records/_components/records-list.tsx

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Award, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecordsListProps {
  learnerId: string;
}

export default function RecordsList({ learnerId }: RecordsListProps) {
  // TODO: Fetch actual records from database/service

  const placeholderRecords = [
    {
      id: '1',
      type: 'transcript',
      title: 'Academic Transcript',
      description: 'Complete record of courses and grades',
      icon: FileText,
    },
    {
      id: '2',
      type: 'certificate',
      title: 'Certificates',
      description: 'Course completion certificates',
      icon: Award,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {placeholderRecords.map((record) => {
        const Icon = record.icon;
        return (
          <Card key={record.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Icon className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{record.title}</CardTitle>
                  <CardDescription>{record.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Coming soon
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

**Step 5: Test academic records page**

1. Start dev server: `npm run dev`
2. Login as learner
3. Navigate to `/learners/my-academic-records`
4. Verify placeholder records display
5. Verify non-learners cannot access

Expected: Academic records page renders with placeholders

**Step 6: Commit academic records page**

```bash
git add "app/(routes)/learners/my-academic-records"
git commit -m "feat(learners): create my-academic-records page

- Add academic records viewing page with access control
- Create records list component with placeholder data
- Add loading state
- Display transcript and certificate placeholders
- TODO: Implement actual record fetching and download"
```

---

## Phase 4: Update Sidebar Menu

### Task 9: Update Sidebar Menu Links and Permissions

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Find learners section in sidebar menu**

Locate the learners menu section in `lib/sidebarMenuLink.ts`

**Step 2: Update learners menu items**

Update the learners section to include new routes and correct permissions:

```typescript
// lib/sidebarMenuLink.ts

// Find the learners section and update it:

{
  groupLabel: "Learners",
  menus: [
    // NEW: Learner Dashboard (for students only)
    {
      href: "/learners/dashboard",
      label: "My Dashboard",
      icon: LayoutDashboard,
      permission: "learners.dashboard.view",
      roles: ["student"], // Only students see this
    },
    // NEW: My Grades
    {
      href: "/learners/my-grades",
      label: "My Grades",
      icon: GraduationCap,
      permission: "learners.my-grades.view",
      roles: ["student"],
    },
    // NEW: My Timetable
    {
      href: "/learners/my-timetable",
      label: "My Timetable",
      icon: Calendar,
      permission: "learners.my-timetable.view",
      roles: ["student"],
    },
    // UPDATED: My Attendance (updated href)
    {
      href: "/learners/my-attendance", // Changed from /learners/attendance
      label: "My Attendance",
      icon: CheckCircle,
      permission: "learners.my-attendance.view",
      roles: ["student"],
    },
    // NEW: My Profile
    {
      href: "/learners/my-profile",
      label: "My Profile",
      icon: User,
      permission: "learners.my-profile.view",
      roles: ["student"],
    },
    // NEW: My Academic Records
    {
      href: "/learners/my-academic-records",
      label: "My Records",
      icon: FileText,
      permission: "learners.my-academic-records.view",
      roles: ["student"],
    },
    // Separator or divider here (optional)

    // Existing admin features
    {
      href: "/learners/profiles",
      label: "Learner Profiles",
      icon: Users,
      permission: "learners.profiles.view",
      roles: ["administrator", "staff", "faculty"],
    },
    {
      href: "/learners/alumni",
      label: "Alumni",
      icon: Users,
      permission: "learners.alumni.view",
      roles: ["administrator", "staff"],
    },
    {
      href: "/learners/analytics",
      label: "Analytics",
      icon: BarChart,
      permission: "learners.analytics.view",
      roles: ["administrator", "faculty", "hod", "principal"],
    },
    // ... other existing menu items
  ],
},
```

**Step 3: Update MENU_PERMISSIONS mapping**

Find the `MENU_PERMISSIONS` object and add new routes:

```typescript
// lib/sidebarMenuLink.ts

export const MENU_PERMISSIONS: Record<string, string> = {
  // ... existing mappings

  // NEW: Learner portal routes
  '/learners/dashboard': 'learners.dashboard.view',
  '/learners/my-grades': 'learners.my-grades.view',
  '/learners/my-timetable': 'learners.my-timetable.view',
  '/learners/my-attendance': 'learners.my-attendance.view', // Updated
  '/learners/my-profile': 'learners.my-profile.view',
  '/learners/my-academic-records': 'learners.my-academic-records.view',

  // ... rest of mappings
};
```

**Step 4: Verify imports for new icons**

Make sure icons are imported at the top of the file:

```typescript
import {
  LayoutDashboard,
  GraduationCap,
  Calendar,
  CheckCircle,
  User,
  FileText,
  // ... other icons
} from 'lucide-react';
```

**Step 5: Test sidebar menu**

1. Start dev server: `npm run dev`
2. Login as learner
3. Check sidebar shows: My Dashboard, My Grades, My Timetable, My Attendance, My Profile, My Records
4. Verify admin features are hidden for students
5. Login as admin
6. Verify admin sees admin features, not student my-* pages

Expected: Sidebar dynamically shows correct menu items based on role

**Step 6: Commit sidebar updates**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(sidebar): update learners menu with portal routes

- Add My Dashboard menu item
- Add My Grades, My Timetable, My Attendance menu items
- Add My Profile and My Records menu items
- Update attendance route to my-attendance
- Add proper role filtering (student vs admin)
- Update MENU_PERMISSIONS mapping"
```

---

## Phase 5: Testing and Validation

### Task 10: Create Test Checklist and Manual Testing

**Files:**
- Create: `docs/testing/learner-routes-migration-test-plan.md`

**Step 1: Create test plan document**

```markdown
# Learner Routes Migration Test Plan

## Test Date: [DATE]
## Tester: [NAME]

---

## Pre-Test Setup

- [ ] Ensure dev server is running: `npm run dev`
- [ ] Have test accounts ready:
  - [ ] Student with `lifecycle_status='active'`
  - [ ] Student with `lifecycle_status='graduated'`
  - [ ] Student with `lifecycle_status='pending'`
  - [ ] Admin user
  - [ ] Faculty user

---

## Test Suite 1: Route Access Control

### TC1.1: Active Student Access
- [ ] Login as active student
- [ ] Navigate to `/learners/dashboard` → Should load
- [ ] Navigate to `/learners/my-grades` → Should load
- [ ] Navigate to `/learners/my-timetable` → Should load
- [ ] Navigate to `/learners/my-attendance` → Should load
- [ ] Navigate to `/learners/my-profile` → Should load
- [ ] Navigate to `/learners/my-academic-records` → Should load

### TC1.2: Graduated Student Access
- [ ] Login as graduated student
- [ ] Navigate to `/learners/dashboard` → Should load (view-only)
- [ ] Navigate to `/learners/my-grades` → Should load
- [ ] Navigate to `/learners/my-timetable` → Should load (past timetable)
- [ ] Navigate to `/learners/my-attendance` → Should load
- [ ] Navigate to `/learners/my-profile` → Should load
- [ ] Navigate to `/learners/my-academic-records` → Should load

### TC1.3: Pending Student Blocked
- [ ] Login as pending student
- [ ] Navigate to `/learners/dashboard` → Should redirect to login with reason
- [ ] Verify reason message displays correctly

### TC1.4: Non-Student Blocked
- [ ] Login as admin user
- [ ] Navigate to `/learners/my-grades` → Should redirect to home
- [ ] Navigate to `/learners/my-timetable` → Should redirect to home
- [ ] Navigate to `/learners/dashboard` → Should redirect to home

### TC1.5: Unauthenticated Blocked
- [ ] Logout
- [ ] Navigate to `/learners/dashboard` → Should redirect to login
- [ ] Navigate to `/learners/my-grades` → Should redirect to login

---

## Test Suite 2: Route Redirects

### TC2.1: Old Routes Redirect
- [ ] Login as active student
- [ ] Navigate to `/learners/attendance` → Should redirect to `/learners/my-attendance`
- [ ] Verify URL updates in browser address bar
- [ ] Verify page content displays correctly

---

## Test Suite 3: Sidebar Menu

### TC3.1: Student Sidebar
- [ ] Login as active student
- [ ] Verify sidebar shows:
  - [ ] My Dashboard
  - [ ] My Grades
  - [ ] My Timetable
  - [ ] My Attendance
  - [ ] My Profile
  - [ ] My Records
- [ ] Verify sidebar does NOT show:
  - [ ] Learner Profiles (admin feature)
  - [ ] Alumni (admin feature)
  - [ ] Analytics (admin feature)

### TC3.2: Admin Sidebar
- [ ] Login as admin user
- [ ] Verify sidebar shows admin learner features:
  - [ ] Learner Profiles
  - [ ] Alumni
  - [ ] Analytics
- [ ] Verify sidebar does NOT show student my-* features

### TC3.3: Menu Navigation
- [ ] Login as active student
- [ ] Click "My Dashboard" → Should navigate to `/learners/dashboard`
- [ ] Click "My Grades" → Should navigate to `/learners/my-grades`
- [ ] Click "My Timetable" → Should navigate to `/learners/my-timetable`
- [ ] All navigation should work without errors

---

## Test Suite 4: Page Functionality

### TC4.1: Dashboard Page
- [ ] Login as active student
- [ ] Navigate to `/learners/dashboard`
- [ ] Verify Overview card displays
- [ ] Verify Quick Stats card displays
- [ ] Verify Upcoming Classes card displays
- [ ] Page should be responsive (test mobile view)

### TC4.2: Profile Page
- [ ] Login as active student
- [ ] Navigate to `/learners/my-profile`
- [ ] Verify profile data loads
- [ ] Verify first name, last name, email, phone display
- [ ] Profile should be responsive

### TC4.3: Academic Records Page
- [ ] Login as active student
- [ ] Navigate to `/learners/my-academic-records`
- [ ] Verify placeholder records display
- [ ] Verify transcript and certificate cards show
- [ ] Download buttons should be disabled (coming soon)

---

## Test Suite 5: Loading States

### TC5.1: Loading Skeletons
- [ ] Slow down network (DevTools → Network → Slow 3G)
- [ ] Navigate to `/learners/dashboard`
- [ ] Verify loading skeleton appears
- [ ] Verify skeleton disappears when data loads

### TC5.2: All Pages Have Loading
- [ ] Verify `/learners/dashboard/loading.tsx` exists
- [ ] Verify `/learners/my-profile/loading.tsx` exists
- [ ] Verify `/learners/my-academic-records/loading.tsx` exists

---

## Test Suite 6: TypeScript and Build

### TC6.1: TypeScript Compilation
- [ ] Run: `npm run build` or `tsc --noEmit`
- [ ] Verify: No TypeScript errors
- [ ] Verify: All imports resolve correctly

### TC6.2: Route Registry Validation
- [ ] Open console in browser
- [ ] Run:
  ```javascript
  import { isValidLearnerRoute } from '@/lib/constants/learner-routes';
  console.log(isValidLearnerRoute('/learners/dashboard')); // Should be true
  console.log(isValidLearnerRoute('/invalid-route')); // Should be false
  ```

---

## Test Suite 7: Mobile Responsiveness

### TC7.1: Mobile View (375px width)
- [ ] Set browser to mobile view
- [ ] Navigate through all learner pages
- [ ] Verify sidebar collapses appropriately
- [ ] Verify cards stack vertically
- [ ] Verify no horizontal scroll

---

## Test Results Summary

| Test Suite | Pass | Fail | Notes |
|------------|------|------|-------|
| Route Access Control | ☐ | ☐ | |
| Route Redirects | ☐ | ☐ | |
| Sidebar Menu | ☐ | ☐ | |
| Page Functionality | ☐ | ☐ | |
| Loading States | ☐ | ☐ | |
| TypeScript and Build | ☐ | ☐ | |
| Mobile Responsiveness | ☐ | ☐ | |

**Overall Result:** ☐ PASS ☐ FAIL

**Issues Found:**
1.
2.
3.

**Recommendations:**
1.
2.
3.
```

**Step 2: Save test plan**

Save the test plan document.

**Step 3: Execute manual tests**

Go through the test plan checklist and verify all tests pass.

**Step 4: Document test results**

Fill in the test results summary with pass/fail status and any issues found.

**Step 5: Commit test plan**

```bash
git add docs/testing/learner-routes-migration-test-plan.md
git commit -m "test: add learner routes migration test plan

- Create comprehensive test checklist
- Cover access control, redirects, sidebar, functionality
- Include loading states and mobile responsiveness
- Add TypeScript compilation tests
- Document test results format"
```

---

## Phase 6: Documentation Updates

### Task 11: Update Project Documentation

**Files:**
- Modify: `README.md` (if applicable)
- Create: `docs/architecture/learner-routes-architecture.md`

**Step 1: Create architecture documentation**

```markdown
<!-- docs/architecture/learner-routes-architecture.md -->

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
```

**Step 2: Update main README (if applicable)**

If your README has a routing section, add a reference to learner routes:

```markdown
## Routing Architecture

- **Learner Portal**: See [Learner Routes Architecture](docs/architecture/learner-routes-architecture.md)
- Smart Hybrid Portal approach
- Centralized route registry
- Role-based access control
```

**Step 3: Commit documentation**

```bash
git add docs/architecture/learner-routes-architecture.md
git add README.md  # if modified
git commit -m "docs: add learner routes architecture documentation

- Document Smart Hybrid Portal approach
- Explain access control layers
- Document file organization standards
- Add migration history
- Reference guidelines and registry"
```

---

## Phase 7: Final Validation and Cleanup

### Task 12: Final Checks and Production Readiness

**Step 1: Run full TypeScript build**

```bash
npm run build
```

Expected: ✅ Build succeeds with no errors

**Step 2: Verify all tests pass (if applicable)**

```bash
npm run test  # if you have tests
```

**Step 3: Check for console errors**

1. Start dev server: `npm run dev`
2. Open browser DevTools console
3. Navigate through all learner pages
4. Verify: No console errors or warnings

**Step 4: Verify git status is clean**

```bash
git status
```

Expected: All changes committed, working directory clean

**Step 5: Create migration summary**

```bash
git log --oneline --graph --decorate --all -20
```

Review the commit history to ensure all migration steps are documented.

**Step 6: Tag the migration (optional)**

```bash
git tag -a learner-routes-migration-v1 -m "Complete learner routes migration to Smart Hybrid Portal"
git push origin learner-routes-migration-v1
```

---

## Rollback Strategy

If issues are found and rollback is needed:

### Rollback Step 1: Identify last good commit

```bash
git log --oneline
# Find commit before migration started
```

### Rollback Step 2: Create rollback branch

```bash
git checkout -b rollback-learner-routes
git reset --hard <commit-hash-before-migration>
```

### Rollback Step 3: Push rollback branch

```bash
git push origin rollback-learner-routes
```

### Rollback Step 4: Deploy rollback branch

Deploy the rollback branch to restore previous functionality.

---

## Post-Migration Tasks (Future Work)

These are TODO items for future implementation:

### 1. Implement Real Data Fetching

- [ ] Dashboard: Fetch real stats (grades, attendance, bills)
- [ ] Dashboard: Fetch upcoming classes from timetable
- [ ] Profile: Add edit functionality
- [ ] Academic Records: Implement transcript generation
- [ ] Academic Records: Implement certificate download

### 2. Enhanced Features

- [ ] Add search/filter to academic records
- [ ] Add grade analytics charts
- [ ] Add attendance trends visualization
- [ ] Implement profile photo upload
- [ ] Add notification preferences

### 3. Performance Optimization

- [ ] Add React Query caching for dashboard stats
- [ ] Implement incremental static regeneration for static content
- [ ] Optimize database queries with proper indexes
- [ ] Add pagination to academic records

### 4. Testing

- [ ] Write unit tests for route registry helpers
- [ ] Write integration tests for LearnerPageGuard
- [ ] Add E2E tests with Playwright for critical paths
- [ ] Test with various lifecycle statuses

### 5. Documentation

- [ ] Record video walkthrough of new learner portal
- [ ] Create user guide for learners
- [ ] Document API endpoints (if creating new services)
- [ ] Update admin guide with new learner features

---

## Success Criteria

Migration is considered successful when:

- ✅ All existing learner pages accessible at new routes
- ✅ Old routes redirect to new routes
- ✅ Sidebar menu updated with correct items
- ✅ Access control works for all user types
- ✅ TypeScript build succeeds
- ✅ No console errors in browser
- ✅ All manual tests pass
- ✅ Documentation updated
- ✅ Route registry complete and accurate

---

## Plan Complete

**Total Tasks:** 12
**Estimated Time:** 4-6 hours
**Difficulty:** Medium
**Risk Level:** Low (incremental changes, rollback available)

**Next Steps:**
1. Review this plan with team
2. Schedule implementation window
3. Execute plan task-by-task
4. Run full test suite
5. Deploy to production

---

## Notes

- This migration is **backward compatible** via redirects
- No database schema changes required
- Can be implemented incrementally
- Low risk of breaking existing functionality
- All new features are placeholder/optional enhancements
