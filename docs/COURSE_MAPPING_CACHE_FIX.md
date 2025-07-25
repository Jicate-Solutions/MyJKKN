# Course Mapping Cache Update Fix

## Problem Analysis

The course mapping edit functionality was not fetching and showing existing data properly. Users would see empty forms or outdated data when trying to edit course mappings. This was caused by the same cache management issues we found in the institution module.

### Root Causes Identified

1. **Manual Data Fetching**:

   - Edit page used `useEffect` + `useState` instead of React Query
   - No proper cache management for individual course mapping details

2. **Query Key Mismatch**:

   - Hook used: `['course-mappings', memoizedFilters]`
   - Invalidation used: `['course-mappings']`
   - Complex filter objects prevented proper cache invalidation

3. **Missing Query Key Factory**:

   - No structured approach like we implemented for institutions
   - Manual cache management in detail pages

4. **Inconsistent Cache Management**:
   - Different pages used different data fetching patterns
   - No centralized query key management

## Solution Implemented

### 1. Query Key Factory Pattern

Created a structured query key factory in `use-course-mappings.ts`:

```typescript
export const courseMappingKeys = {
  all: ['course-mappings'] as const,
  lists: () => [...courseMappingKeys.all, 'list'] as const,
  list: (filters: CourseMappingFilters) => [...courseMappingKeys.lists(), filters] as const,
  details: () => [...courseMappingKeys.all, 'detail'] as const,
  detail: (id: string) => [...courseMappingKeys.details(), id] as const,
  stats: () => [...courseMappingKeys.all, 'stats'] as const
} as const;
```

### 2. Added Individual Course Mapping Detail Hook

Created a new hook for fetching individual course mapping details:

```typescript
export function useCourseMappingDetail(id: string) {
  return useQuery({
    queryKey: courseMappingKeys.detail(id),
    queryFn: () => CourseMappingService.getCourseMapping(id),
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  });
}
```

### 3. Updated Course Mapping Form Cache Invalidation

Changed from:

```typescript
await queryClient.invalidateQueries({ queryKey: ['course-mappings'] });
```

To:

```typescript
await queryClient.invalidateQueries({ queryKey: courseMappingKeys.lists() });

// If editing, also invalidate specific detail
if (isEditing && courseMapping) {
  await queryClient.invalidateQueries({
    queryKey: courseMappingKeys.detail(courseMapping.id)
  });
}
```

### 4. Converted Edit Page to React Query

**Before** (Edit Page):

```typescript
const [courseMapping, setCourseMapping] = useState<CourseMapping | null>(null);
useEffect(() => {
  // Manual API call and state management
}, [id]);
```

**After**:

```typescript
const { data: courseMapping, isLoading, error } = useCourseMappingDetail(id);
```

### 5. Enhanced Delete Operations

Updated both bulk and single delete functions to properly invalidate caches:

```typescript
// Invalidate specific course mapping detail cache
await queryClient.invalidateQueries({
  queryKey: courseMappingKeys.detail(mapping.id)
});
await queryClient.invalidateQueries({ queryKey: courseMappingKeys.lists() });
```

### 6. Updated Main List Hook

Changed the main list hook to use the new query key factory:

```typescript
// Before
queryKey: ['course-mappings', memoizedFilters],

// After
queryKey: courseMappingKeys.list(memoizedFilters),
```

## Files Modified

1. `hooks/organization/use-course-mappings.ts` - Added query key factory and useCourseMappingDetail hook
2. `app/(routes)/organizations/courses/mappings/[id]/edit/page.tsx` - Converted to React Query
3. `app/(routes)/organizations/courses/mappings/_components/course-mapping-form.tsx` - Updated cache invalidation
4. `app/(routes)/organizations/courses/mappings/_components/course-mapping-list.tsx` - Updated delete operations

## Benefits

1. **Proper Data Loading**: Edit forms now properly fetch and display existing data
2. **Immediate UI Updates**: List updates instantly after editing/deleting
3. **Consistent Caching**: All course mapping-related queries use the same key structure
4. **Better Performance**: Proper cache management reduces unnecessary API calls
5. **Maintainable Code**: Centralized query key management
6. **Future-Proof**: Pattern consistent with institution module

## Testing

To test the fix:

1. Click "Edit" on any course mapping
2. Verify the form loads with existing data (institution, degree, department, program, semester, course)
3. Make changes and save
4. Confirm the list updates immediately without page refresh
5. Test delete operations to ensure immediate removal from list

## Key Differences from Institution Fix

While following the same pattern as institutions, course mappings had additional complexity:

- Multi-step cascade loading (institution → degree → department → program → semester)
- Course selection with search functionality
- Bulk operations for creating multiple mappings

The fix ensures all these complex interactions work properly with React Query caching.

## Future Improvements

Consider applying this same pattern to other organization modules:

- Courses
- Degrees
- Departments
- Programs
- Semesters
- Sections

This will provide consistent cache management across the entire organization module.
