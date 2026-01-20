# Learner Routes Organization Guidelines

## Quick Decision Tree

When adding a new learner-accessible feature, follow this decision tree:

```
┌─────────────────────────────────────────────────┐
│ Is this feature for learner role users ONLY?   │
└─────────────┬───────────────────────────────────┘
              │
        ┌─────┴─────┐
        │           │
       YES         NO → Put in appropriate module with role check
        │
        ▼
┌─────────────────────────────────────────────────┐
│ Is it viewing PERSONAL ACADEMIC/INSTITUTIONAL   │
│ data? (grades, attendance, timetable, profile)  │
└─────────────┬───────────────────────────────────┘
              │
        ┌─────┴─────┐
        │           │
       YES         NO
        │           │
        ▼           ▼
    PORTAL      DOMAIN ACTION
        │           │
        ▼           ▼
┌──────────────┐  ┌──────────────────────────────┐
│ /learners/   │  │ /{module}/my-{feature}       │
│ my-{feature} │  │                              │
│              │  │ Examples:                    │
│ Examples:    │  │ - /billing/my-bills          │
│ - my-grades  │  │ - /resources/.../            │
│ - my-        │  │   my-reservations            │
│   timetable  │  │ - /applications/             │
│ - my-        │  │   my-applications            │
│   attendance │  │                              │
└──────────────┘  └──────────────────────────────┘
```

## Detailed Guidelines

### 1. Learner Portal Routes (`/learners/my-*`)

**USE WHEN:**
- ✅ Feature is for viewing/managing personal academic data
- ✅ It's a core learner experience (grades, attendance, timetable)
- ✅ Data comes from academic/institutional systems
- ✅ Feature is learner self-service focused

**EXAMPLES:**
```
✅ /learners/my-grades          → Personal grade viewing
✅ /learners/my-timetable       → Personal class schedule
✅ /learners/my-attendance      → Personal attendance records
✅ /learners/my-profile         → Learner profile management
✅ /learners/my-academic-records → Transcripts, certificates
✅ /learners/my-achievements    → Badges, awards, accomplishments
✅ /learners/dashboard          → Learner home dashboard
```

**FILE STRUCTURE:**
```
app/(routes)/learners/my-{feature}/
├── page.tsx                    # Server component with auth
├── _components/                # Feature-specific components
│   ├── {feature}-main.tsx
│   ├── {feature}-filters.tsx
│   └── {feature}-stats.tsx
├── loading.tsx                 # Loading state
└── error.tsx                   # Error boundary (optional)
```

**REQUIRED IMPLEMENTATION:**
```typescript
// page.tsx template
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';

export default async function MyFeaturePage() {
  const supabase = await createClient();

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // 2. Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // 3. Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  return <MyFeatureContent />;
}
```

---

### 2. Domain-Specific Routes (`/{module}/my-*`)

**USE WHEN:**
- ✅ Feature is performing a domain-specific action
- ✅ Not exclusively for learners (other roles might have similar features)
- ✅ Feature belongs to a specific business domain
- ✅ Service layer is tightly coupled to the module

**EXAMPLES:**
```
✅ /resource-management/reservations/my-reservations
   → Booking resources (domain: resource management)

✅ /billing/my-bills
   → Managing bills (domain: billing/finance)

✅ /applications/my-applications
   → Tracking applications (domain: admissions)

✅ /library/my-borrowed-books
   → Library checkouts (domain: library)
```

**FILE STRUCTURE:**
```
app/(routes)/{module}/my-{feature}/
├── page.tsx                    # Server component with auth
├── _components/                # Feature-specific components
├── loading.tsx
└── error.tsx
```

---

### 3. Shared User Features (`/my-*` at root)

**USE WHEN:**
- ✅ Feature is for ANY authenticated user (not learner-specific)
- ✅ Cross-cutting concern (notifications, bug reports, settings)
- ✅ Not tied to any specific business domain

**EXAMPLES:**
```
✅ /my-bug-reports      → All users can report bugs
✅ /notifications       → System-wide notifications
✅ /my-account          → General account settings
```

---

### 4. Naming Conventions

**Route Naming:**
```
✅ CORRECT:
- /learners/my-grades
- /learners/my-timetable
- /billing/my-bills
- /my-bug-reports

❌ INCORRECT:
- /learners/grades (missing "my-" prefix)
- /student/my-grades (use "learners" not "student")
- /my-learner-profile (should be /learners/my-profile)
```

**Component Naming:**
```
✅ CORRECT:
- my-grades-table.tsx
- my-timetable-grid.tsx
- my-attendance-calendar.tsx

❌ INCORRECT:
- grades-table.tsx (missing "my-" prefix for clarity)
- student-timetable.tsx (use "my-" instead of "student")
```

**Service Naming:**
```
✅ CORRECT:
// lib/services/learners/my-grades-service.ts
export class MyGradesService {
  static async getMyGrades(learnerId: string) { ... }
}

❌ INCORRECT:
// lib/services/learners/grades-service.ts (ambiguous)
```

---

### 5. Permission Naming Convention

**Pattern:** `learners.my-{feature}.{action}`

```typescript
✅ CORRECT:
'learners.my-grades.view'
'learners.my-timetable.view'
'learners.my-attendance.view'
'learners.my-profile.edit'
'learners.dashboard.view'

❌ INCORRECT:
'learners.grades.view' (missing "my-")
'student.my-grades.view' (use "learners" not "student")
'my-grades.view' (missing module prefix)
```

---

### 6. Migration Checklist

When moving existing pages to new structure:

- [ ] Update route path in file system
- [ ] Update imports in related components
- [ ] Update `LEARNER_ROUTES` registry in `lib/constants/learner-routes.ts`
- [ ] Update `MENU_PERMISSIONS` in `lib/sidebarMenuLink.ts`
- [ ] Update permission constants in `lib/constants/permissions.ts`
- [ ] Add redirect from old route to new route (if needed)
- [ ] Update any hardcoded links in components
- [ ] Update tests (if any)
- [ ] Update documentation
- [ ] Test access control still works

---

### 7. Common Mistakes to Avoid

❌ **MISTAKE 1:** Putting domain actions in learner portal
```
❌ /learners/my-reservations
✅ /resource-management/reservations/my-reservations
```

❌ **MISTAKE 2:** Using "student" instead of "learners"
```
❌ /student/my-grades
✅ /learners/my-grades
```

❌ **MISTAKE 3:** Forgetting "my-" prefix for self-service pages
```
❌ /learners/grades
✅ /learners/my-grades
```

❌ **MISTAKE 4:** Creating duplicate permission checks
```
❌ Each page has different validation logic
✅ Use LearnerPageGuard component or consistent pattern
```

❌ **MISTAKE 5:** Not updating route registry
```
❌ Add route but forget to update LEARNER_ROUTES
✅ Always update registry when adding/moving routes
```

---

### 8. Quick Reference Table

| Feature Type | Location | Example | Permission Format |
|--------------|----------|---------|------------------|
| **Academic Data** | `/learners/my-*` | my-grades, my-timetable | `learners.my-{feature}.view` |
| **Domain Action** | `/{module}/my-*` | my-reservations, my-bills | `{module}.my-{feature}.view` |
| **Shared Feature** | `/my-*` | my-bug-reports | User-specific or generic |

---

### 9. Examples by Use Case

**Use Case: Adding "My Assignments" Feature**

1. **Decision:** Academic data → Learner portal
2. **Route:** `/learners/my-assignments`
3. **Permission:** `learners.my-assignments.view`
4. **File:** `app/(routes)/learners/my-assignments/page.tsx`
5. **Update Registry:** Add to `LEARNER_ROUTES` in `lib/constants/learner-routes.ts`

**Use Case: Adding "My Loan Requests" Feature**

1. **Decision:** Domain action (library) → Domain route
2. **Route:** `/library/my-loan-requests`
3. **Permission:** `library.my-loan-requests.view`
4. **File:** `app/(routes)/library/my-loan-requests/page.tsx`
5. **Update Registry:** Add to `LEARNER_ROUTES` in `lib/constants/learner-routes.ts`

---

### 10. Testing Checklist

When implementing learner routes, verify:

- [ ] Only learners with `role='student'` can access
- [ ] Lifecycle status is validated (`active` or `graduated`)
- [ ] Graduated learners have appropriate restricted access
- [ ] Permission checks work correctly
- [ ] Sidebar shows/hides menu items correctly
- [ ] Redirects work for unauthorized access
- [ ] Mobile responsive (learner features are mobile-first)
- [ ] Loading states work properly
- [ ] Error boundaries handle failures gracefully

---

## Questions?

If you're unsure where a feature belongs:
1. Check the decision tree at the top
2. Look at similar existing features in `LEARNER_ROUTES` registry
3. Ask: "Is this viewing personal academic data or performing a domain action?"
4. When in doubt, prefer domain routes over portal routes
