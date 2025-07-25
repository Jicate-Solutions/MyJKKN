# Institution Cache Update Fix

## Problem Analysis

The institution table was not updating immediately after editing an institution. Users had to refresh the page to see changes. This was caused by improper React Query cache invalidation.

### Root Causes Identified

1. **Query Key Mismatch**:

   - Hook used: `['institutions', filters]`
   - Invalidation used: `['institutions']`
   - Complex filter objects prevented proper cache invalidation

2. **Missing Query Key Factory**:

   - No structured approach like the students module
   - Manual cache management in detail pages

3. **Inconsistent Cache Management**:
   - Different pages used different data fetching patterns
   - No centralized query key management

## Solution Implemented

### 1. Query Key Factory Pattern

Created a structured query key factory in `use-institutions.ts`:

```typescript
export const institutionKeys = {
  all: ['institutions'] as const,
  lists: () => [...institutionKeys.all, 'list'] as const,
  list: (filters: InstitutionFilters) => [...institutionKeys.lists(), filters] as const,
  details: () => [...institutionKeys.all, 'detail'] as const,
  detail: (id: string) => [...institutionKeys.details(), id] as const,
  names: () => [...institutionKeys.all, 'names'] as const,
  stats: () => [...institutionKeys.all, 'stats'] as const
} as const;
```

### 2. Updated Institution Form Cache Invalidation

Changed from:

```typescript
await queryClient.invalidateQueries({ queryKey: ['institutions'] });
```

To:

```typescript
await queryClient.invalidateQueries({ queryKey: institutionKeys.lists() });
await queryClient.invalidateQueries({ queryKey: institutionKeys.names() });

// If editing, also invalidate specific detail
if (isEditing && institution) {
  await queryClient.invalidateQueries({
    queryKey: institutionKeys.detail(institution.id)
  });
}
```

### 3. Converted Manual Data Fetching to React Query

**Before** (Institution Detail Page):

```typescript
const [data, setData] = useState(null);
useEffect(() => {
  // Manual API call and state management
}, [id]);
```

**After**:

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: institutionKeys.detail(id),
  queryFn: () => OrganizationService.getInstitution(id),
});
```

### 4. Enhanced Delete Operations

Updated both bulk and single delete functions to properly invalidate caches:

```typescript
// Invalidate specific institution detail cache
await queryClient.invalidateQueries({
  queryKey: institutionKeys.detail(institution.id)
});
await queryClient.invalidateQueries({ queryKey: institutionKeys.lists() });
await queryClient.invalidateQueries({ queryKey: institutionKeys.names() });
```

## Files Modified

1. `hooks/organization/use-institutions.ts` - Added query key factory and useInstitutionNames hook
2. `app/(routes)/organizations/institutions/_components/institution-form.tsx` - Updated cache invalidation
3. `app/(routes)/organizations/institutions/[id]/page.tsx` - Converted to React Query
4. `app/(routes)/organizations/institutions/[id]/edit/page.tsx` - Converted to React Query
5. `app/(routes)/organizations/institutions/_components/institution-list.tsx` - Updated delete operations

## Benefits

1. **Immediate UI Updates**: Table updates instantly after editing
2. **Consistent Caching**: All institution-related queries use the same key structure
3. **Better Performance**: Proper cache management reduces unnecessary API calls
4. **Maintainable Code**: Centralized query key management
5. **Future-Proof**: Pattern can be replicated for other modules

## Testing

To test the fix:

1. Edit an institution
2. Verify the list updates immediately without page refresh
3. Check that institution names dropdown updates across the app
4. Confirm detail pages reflect changes instantly

The implementation follows React Query best practices and patterns used in the students module.
