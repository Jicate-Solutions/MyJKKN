# Phase 1 Schools Implementation — Developer Implementation Guide

**Updated:** 2026-05-26

---

## Quick Reference: Applying Entity Type Labels

### Pattern 1: Data Table Buttons (✅ Complete)

**Files Modified:**
- `app/(routes)/organizations/programs/_components/programs-data-table.tsx`
- `app/(routes)/organizations/semesters/_components/semesters-data-table.tsx`
- `app/(routes)/organizations/courses/_components/courses-data-table.tsx`

**Pattern:**
```typescript
import { useInstitutionTypeLabels } from '@/hooks/use-institution-type-labels';

export function MyDataTable() {
  const { label } = useInstitutionTypeLabels();
  
  return <Button>+ Add {label("program")}</Button>;
  // For college: "Add Program"
  // For school: "Add Class"
}
```

---

## Phase 1.2 Tasks (Ready to Implement)

### Task 1: BottomNav Sidebar Filtering

**File:** `components/BottomNav/bottom-navbar.tsx`

**What to Do:**
1. Import the hook and filter:
   ```typescript
   import { useInstitutionTypeLabels } from '@/hooks/use-institution-type-labels';
   import { filterMenuByEntityType } from '@/lib/sidebarMenuLink';
   import { useAuth } from '@/providers/auth-provider';
   ```

2. After `GetRoleBasedPages()` returns, filter the pages:
   ```typescript
   const { user } = useAuth();
   const entityType = user?.institutions?.entity_type ?? 'institution';
   
   const allMenus = GetRoleBasedPages(pathname, roleData);
   
   // Apply entity_type filter to each menu group
   const filteredMenus = allMenus.map(group => ({
     ...group,
     menus: filterMenuByEntityType(group.menus, entityType)
   })).filter(group => group.menus.length > 0);
   ```

3. Use `filteredMenus` instead of `allMenus` in the render logic

**Expected Result:** Schools won't see "Degrees" or "Course Mappings" in mobile/responsive bottom navbar

**Testing:**
- Resize to mobile viewport
- Log in as school admin
- Verify degree/course-mapping links are hidden

---

### Task 2: Form Field Label Application

**Files Affected:**
- `app/(routes)/organizations/programs/_components/program-form.tsx`
- `app/(routes)/organizations/semesters/_components/semester-form.tsx`
- `app/(routes)/organizations/courses/_components/course-form.tsx`

**What to Do:**

For form fields that display "Program Name", "Semester Name", etc., add the hook and wrap labels:

```typescript
import { useInstitutionTypeLabels } from '@/hooks/use-institution-type-labels';

export function ProgramForm({ program, isEditing }: ProgramFormProps) {
  const { label } = useInstitutionTypeLabels();
  
  return (
    <FormField
      name="program_name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label('program')} Name</FormLabel>
          {/* Rest of field... */}
        </FormItem>
      )}
    />
  );
}
```

**Expected Labels:**
- College: "Program Name", "Semester Name", "Course Name"
- School: "Class Name", "Term Name", "Subject Name"

---

### Task 3: Data Table Column Headers (Optional)

**Challenge:** Columns are defined as a constant array, can't use hooks directly

**Solution A: Convert to Component** (Preferred)
```typescript
// OLD: constant export
export const columns: ColumnDef<Program>[] = [...]

// NEW: export a function
export function getColumns(labels: Record<string, string>) {
  return [
    {
      accessorKey: 'program_name',
      header: ({ column }) => (
        <DataTableColumnHeader 
          column={column} 
          title={`${labels.program} Name`}
        />
      ),
      // ...
    }
  ] as ColumnDef<Program>[];
}
```

Then in the data table component:
```typescript
const { labels } = useInstitutionTypeLabels();
const columns = getColumns(labels);
```

**Solution B: Keep Constant, Pass at Render Time** (Simpler)
Keep columns as constant, but wrap in a context provider that consumers read from.

---

### Task 4: Student Auto-Fill Logic (Phase 1.2)

**Current State:** Degree/department fields are hidden for schools

**What's Needed:**
1. Create virtual degree/department records:
   ```sql
   -- Add to each school institution
   INSERT INTO degrees (institution_id, degree_name, code, is_active)
   VALUES ('school-id', 'K-12 Program', 'K12', true);
   
   INSERT INTO departments (degree_id, department_name, code, is_active)
   VALUES (degree_id, 'Academic', 'ACAD', true);
   ```

2. Fetch defaults in student form:
   ```typescript
   // In CourseSelectionSection
   const selectedInstitution = institutions?.find(...);
   
   useEffect(() => {
     if (selectedInstitution?.entity_type === 'school') {
       const defaults = await StudentService.getSchoolDefaults(selectedInstitution.id);
       form.setValue('degree_id', defaults.degree_id);
       form.setValue('department_id', defaults.department_id);
     }
   }, [selectedInstitution]);
   ```

3. Service-layer enforcement:
   ```typescript
   // In StudentService or AdmissionService
   if (institution.entity_type === 'school') {
     // Auto-populate and prevent manual changes
     data.degree_id = schoolDefaults.degree_id;
     data.department_id = schoolDefaults.department_id;
     // Validation: reject requests with different values
   }
   ```

---

## Testing Checklist

### Unit Test Execution
```bash
# Test label mappings
npx vitest __tests__/lib/institution-type-labels.test.ts

# Test sidebar filtering
npx vitest __tests__/lib/sidebar-filter.test.ts

# All tests
npx vitest
```

### Integration Testing
See `docs/PHASE1-INTEGRATION-TESTING.md` for manual scenarios

**Key Scenarios:**
- [ ] College admin sees "Add Program", school admin sees "Add Class"
- [ ] College admin sees "Degrees" in sidebar, school admin doesn't
- [ ] Delete dialogs use correct terminology
- [ ] Student form hides degree/department for schools
- [ ] No regressions in existing functionality

---

## Code Conventions

### Label Keys (Use Sparingly)
Valid label keys (defined in `lib/constants/institution-type-labels.ts`):
- `'program'` → Program / Class
- `'semester'` → Semester / Term
- `'course'` → Course / Subject
- `'degree'` → Degree / Stream
- `'department'` → Department / Wing

### Import Pattern
```typescript
// Always import from the hook
import { useInstitutionTypeLabels } from '@/hooks/use-institution-type-labels';

// NOT from constants directly (unless testing)
// import { INSTITUTION_TYPE_LABELS } from '@/lib/constants/institution-type-labels';
```

### Fallback Behavior
All label functions have sensible defaults:
- If `entity_type` is null or invalid → defaults to `'institution'` (college)
- If label key not found → returns the constant from `INSTITUTION_TYPE_LABELS`

---

## Rollback / Troubleshooting

### If Labels Don't Change
1. Check that user is logged in and has a valid institution
2. Verify `institution.entity_type` is set correctly in Supabase
3. Check browser console for hook errors
4. Verify `useAuth()` is returning the institution

### If Sidebar Items Still Show
1. Verify `filterMenuByEntityType()` is being called
2. Check that the function is receiving correct `entityType`
3. Ensure filter is applied to ALL menu groups (not just top-level)

### If Tests Fail
1. Verify vitest and dependencies are installed: `npm install`
2. Check that test files are in correct location: `__tests__/lib/`
3. Run with verbose output: `npx vitest --reporter=verbose`

---

## Performance Notes

- **Hook calls:** Safe to call multiple times (React optimization)
- **Filter function:** O(n) where n = number of menu items (~20-30), negligible cost
- **Label lookups:** O(1) constant time (object key access)
- **No external API calls:** All label mappings are client-side constants

---

## Documentation References

- **Complete Implementation:** `docs/PHASE1-FINAL-SUMMARY.md`
- **Testing Guide:** `docs/PHASE1-INTEGRATION-TESTING.md`
- **Label Constants:** `lib/constants/institution-type-labels.ts`
- **Sidebar Filter:** `lib/sidebarMenuLink.ts` → `filterMenuByEntityType()`
- **Hook:** `hooks/use-institution-type-labels.ts`

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feat/phase-1-2-bottom-nav

# Make changes following patterns above
# Test locally with integration testing guide

# Commit
git add .
git commit -m "feat: apply entity_type filter to bottom navbar"

# Push and create PR
git push origin feat/phase-1-2-bottom-nav
```

**Commit Message Format:**
- `feat: [feature description]` - New feature
- `fix: [bug fix description]` - Bug fix
- `test: [test description]` - Test addition/fix
- `docs: [doc update description]` - Documentation
- `refactor: [refactor description]` - Code reorganization

---

## Questions?

Refer to the comprehensive files:
1. `docs/PHASE1-FINAL-SUMMARY.md` - Complete overview
2. `docs/PHASE1-INTEGRATION-TESTING.md` - Testing guide
3. `lib/constants/institution-type-labels.ts` - Label definitions
4. `__tests__/lib/*.test.ts` - Test examples
