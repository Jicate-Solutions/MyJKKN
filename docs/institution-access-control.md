# Institution Access Control System

This document explains how to implement and use the institution-based access control system throughout the application.

## Overview

The institution access control system ensures that users can only see and interact with data from institutions they have been granted access to. This provides multi-tenant functionality where different institutions can use the same application while maintaining data isolation.

## Components of the System

### 1. Database Layer

- **User Institution Access Table**: `user_institution_access` - Maps users to institutions with access types
- **Row Level Security (RLS)**: Database-level policies restrict data access based on user permissions
- **Institution Foreign Keys**: Most tables have `institution_id` columns linking to the institutions table

### 2. Service Layer

- **UserInstitutionAccessService**: Core service for managing user-institution relationships
- **Organization Service**: Updated to respect user institution access when fetching institutions
- **API Institution Filter**: Utility for applying institution filtering in API routes

### 3. Frontend Components

- **useUserInstitutionAccess Hook**: Provides institution access data and utilities
- **InstitutionAccessGuard**: Component for protecting routes/components based on institution access
- **Enhanced Organization Service**: Updated to support user-based filtering

## Usage Guide

### For API Routes

Use the `createApiInstitutionFilter` utility to add institution filtering to your API routes:

```typescript
import { createApiInstitutionFilter, applyInstitutionFilterToQuery } from '@/lib/auth/api-institution-filter';

export async function GET(request: NextRequest) {
  try {
    // Apply institution filtering
    const institutionFilter = await createApiInstitutionFilter(request);

    if (!institutionFilter.isAllowed) {
      return NextResponse.json(
        { error: `Access denied: ${institutionFilter.reason}` },
        { status: 403 }
      );
    }

    // Build your query
    let query = supabase.from('your_table').select('*');

    // Apply institution filtering to the query
    query = applyInstitutionFilterToQuery(query, institutionFilter);

    const { data, error } = await query;
    // ... rest of your logic
  } catch (error) {
    // Handle errors
  }
}
```

### For Frontend Components

#### Using the Institution Access Hook

```typescript
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';

function MyComponent() {
  const {
    institutions,
    loading,
    hasAccessToInstitution,
    getAccessibleInstitutionIds,
    canAccessAllInstitutions,
    createInstitutionFilter,
    isUserRestrictedToInstitutions
  } = useUserInstitutionAccess();

  // Check if user has access to a specific institution
  const hasAccess = hasAccessToInstitution('institution-id');

  // Filter an array of items by institution access
  const filteredItems = createInstitutionFilter(allItems);

  // Get accessible institution IDs for API calls
  const accessibleIds = getAccessibleInstitutionIds();

  return (
    <div>
      {canAccessAllInstitutions ? (
        <p>You can access all institutions</p>
      ) : (
        <p>You have access to {institutions.length} institutions</p>
      )}
    </div>
  );
}
```

#### Using the Institution Access Guard

Protect entire components or routes:

```typescript
import { InstitutionAccessGuard } from '@/components/auth/institution-access-guard';

function ProtectedComponent() {
  return (
    <InstitutionAccessGuard
      requireAnyInstitutionAccess={true}
      errorMessage="You need institution access to view this content"
    >
      <YourComponent />
    </InstitutionAccessGuard>
  );
}
```

Protect access to a specific institution:

```typescript
<InstitutionAccessGuard
  requiredInstitutionId="specific-institution-id"
  redirectTo="/unauthorized"
>
  <InstitutionSpecificContent />
</InstitutionAccessGuard>
```

### For Service Classes

Update your service classes to use the enhanced Organization service:

```typescript
import { OrganizationService } from '@/lib/services/organization/organization-service';

// Fetch institutions with user-based filtering
const { data: institutions } = await OrganizationService.getInstitutions({
  isActive: true,
  userId: currentUser.id, // Applies institution filtering
  page: 1,
  limit: 10
});

// Bypass institution filtering for super admin operations
const { data: allInstitutions } = await OrganizationService.getInstitutions({
  isActive: true,
  userId: currentUser.id,
  bypassInstitutionFilter: true // Super admin can see all
});
```

### For Filter Components

Update filter components to respect user institution access:

```typescript
function InstitutionFilter() {
  const { user } = useAuth();
  const { isSuperAdmin, userProfile } = usePermissions();
  const [institutions, setInstitutions] = useState([]);

  useEffect(() => {
    async function fetchInstitutions() {
      if (isSuperAdmin) {
        // Super admin sees all institutions
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } else {
        // Regular users see only accessible institutions
        const { data } = await OrganizationService.getInstitutions({
          isActive: true,
          userId: user?.id
        });
        const mapped = data.map(inst => ({
          id: inst.id,
          name: inst.name,
          counselling_code: inst.counselling_code
        }));
        setInstitutions(mapped);
      }
    }

    fetchInstitutions();
  }, [user?.id, isSuperAdmin]);

  // Auto-set institution filter for non-super-admin users
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id && !selectedInstitution) {
      setSelectedInstitution(userProfile.institution_id);
    }
  }, [isSuperAdmin, userProfile?.institution_id, selectedInstitution]);

  return (
    // Your filter UI
  );
}
```

## Updated Organization Services

All organization services have been enhanced with institution-based access control. Each service now supports:

- **`userId` parameter**: Automatically filters data based on user's accessible institutions
- **`bypassInstitutionFilter` flag**: Allows super admins to access all data
- **Consistent filtering patterns**: All services follow the same access control logic

### Available Services

#### DegreeService

```typescript
import { DegreeService } from '@/lib/services/organization/degree-service';

// Get degrees with institution filtering
const { data: degrees } = await DegreeService.getDegrees({
  userId: currentUser.id, // Filters by user's accessible institutions
  isActive: true,
  page: 1,
  limit: 10
});

// Super admin bypass
const { data: allDegrees } = await DegreeService.getDegrees({
  userId: currentUser.id,
  bypassInstitutionFilter: true // See all degrees
});
```

#### DepartmentService

```typescript
import { DepartmentService } from '@/lib/services/organization/department-service';

const { data: departments } = await DepartmentService.getDepartments({
  userId: currentUser.id,
  degree_id: selectedDegreeId,
  isActive: true
});
```

#### ProgramService

```typescript
import { ProgramService } from '@/lib/services/organization/program-service';

const { data: programs } = await ProgramService.getPrograms({
  userId: currentUser.id,
  department_id: selectedDepartmentId,
  isActive: true
});
```

#### SemesterService

```typescript
import { SemesterService } from '@/lib/services/organization/semester-service';

const { data: semesters } = await SemesterService.getSemesters({
  userId: currentUser.id,
  program_id: selectedProgramId,
  isActive: true
});
```

#### SectionService

```typescript
import { SectionService } from '@/lib/services/organization/section-service';

const { data: sections } = await SectionService.getSections({
  userId: currentUser.id,
  semester_id: selectedSemesterId,
  isActive: true
});
```

#### CourseService

```typescript
import { CourseService } from '@/lib/services/organization/course-service';

const { data: courses } = await CourseService.getCourses({
  userId: currentUser.id,
  isActive: true
});
```

#### CourseMappingService

```typescript
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';

const { data: mappings } = await CourseMappingService.getCourseMappings({
  userId: currentUser.id,
  semester_id: selectedSemesterId,
  isActive: true
});
```

### Key Features

- **Automatic filtering**: When `userId` is provided, services automatically filter data by user's accessible institutions
- **Super admin bypass**: Set `bypassInstitutionFilter: true` to allow super admins to see all data
- **Consistent behavior**: All services follow the same filtering pattern for predictable behavior
- **Zero access handling**: If user has no accessible institutions, services return empty results instead of errors
- **Backwards compatibility**: Services work without `userId` parameter for internal/service contexts

## Access Control Rules

The system enforces strict institution-based access control:

### **Role-Based Access:**

| Role              | Access Level              | Description                                                                  |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------- |
| **Super Admin**   | All institutions          | Complete access to all organizational data across all institutions           |
| **Administrator** | Own institution only      | Access limited to their assigned institution data                            |
| **Faculty**       | Own institution only      | Access limited to their assigned institution data                            |
| **Regular Users** | Granted institutions only | Access only to institutions explicitly granted via `user_institution_access` |

### **Access Types:**

The system supports different types of institution access grants:

- **full**: Complete access to all institution data
- **read_only**: Read-only access to institution data
- **billing_only**: Access limited to billing-related data

## Best Practices

### 1. Always Use Institution Filtering in API Routes

```typescript
// ✅ Good - Uses institution filtering
const institutionFilter = await createApiInstitutionFilter(request);
query = applyInstitutionFilterToQuery(query, institutionFilter);

// ❌ Bad - No institution filtering
const { data } = await supabase.from('students').select('*');
```

### 2. Respect User Permissions in Frontend

```typescript
// ✅ Good - Respects user institution access
const { data } = await OrganizationService.getInstitutions({
  userId: user.id
});

// ❌ Bad - Shows all institutions regardless of access
const data = await OrganizationService.getInstitutionNames();
```

### 3. Use Guards for Route Protection

```typescript
// ✅ Good - Protected route
<InstitutionAccessGuard requireAnyInstitutionAccess>
  <InstitutionManagement />
</InstitutionAccessGuard>

// ❌ Bad - Unprotected sensitive component
<InstitutionManagement />
```

### 4. Handle Loading and Error States

```typescript
const { institutions, loading, error } = useUserInstitutionAccess();

if (loading) return <LoadingState />;
if (error) return <ErrorState message={error} />;
if (institutions.length === 0) return <NoAccessState />;

return <YourComponent />;
```

## Testing Institution Access

### Testing Different User Roles

1. **Super Admin**: Should see all institutions regardless of access grants
2. **Faculty with Institution**: Should only see their assigned institution
3. **User with Multiple Access**: Should see all institutions they have access to
4. **User with No Access**: Should see appropriate error messages

### Test Scenarios

1. User tries to access data from institution they don't have access to
2. User with read-only access tries to modify data
3. Super admin bypasses all restrictions
4. API endpoints properly filter data based on user access

## Troubleshooting

### Common Issues

1. **User sees no institutions**: Check if user has institution access grants
2. **API returns empty results**: Verify institution filtering is correctly applied
3. **Permission denied errors**: Ensure user has appropriate access type
4. **Super admin restrictions**: Verify bypass flags are set correctly
5. **Database function errors**:
   - **RESOLVED**: "column reference 'user_id' is ambiguous" error
   - **Fix applied**: Migration `022_fix_institution_access_functions.sql`
   - This error affected non-super-admin users when fetching institutions

### Debugging

Use the institution access hook to debug access issues:

```typescript
const {
  institutions,
  canAccessAllInstitutions,
  isUserRestrictedToInstitutions
} = useUserInstitutionAccess();

console.log('Institution Access Debug:', {
  accessibleInstitutions: institutions,
  canAccessAll: canAccessAllInstitutions,
  isRestricted: isUserRestrictedToInstitutions
});
```

## Migration Guide

If updating existing components to use the new institution access system:

1. **API Routes**: Add `createApiInstitutionFilter` and `applyInstitutionFilterToQuery`
2. **Components**: Replace direct service calls with access-aware versions
3. **Filters**: Update to respect user institution access
4. **Guards**: Add `InstitutionAccessGuard` where appropriate
5. **Testing**: Verify all access scenarios work correctly

## Security Considerations

- Always validate institution access on the server side
- Use RLS policies as the primary security mechanism
- Frontend restrictions are for UX only, not security
- Log access attempts for audit purposes
- Regularly review user institution access grants
