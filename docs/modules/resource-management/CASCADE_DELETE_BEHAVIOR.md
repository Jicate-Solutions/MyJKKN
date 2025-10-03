# Resource Management - Cascade Delete Behavior

**Created:** 2025-01-16
**Module:** Resource Management
**Feature:** Cascade Delete for Resources

## Overview

When a resource is deleted from the system, all related data across multiple tables is automatically deleted using database-level CASCADE constraints. This ensures data consistency and prevents orphaned records.

## Cascade Delete Chain

When you delete a resource, the following happens automatically:

```
resources (DELETED)
  ├── resource_reservations (CASCADE DELETED)
  │   └── resource_approvals (CASCADE DELETED via reservation)
  └── resource_usage_logs (CASCADE DELETED)
```

## Tables Affected

### 1. Direct Cascade Deletions

#### `resource_reservations`
- **Foreign Key:** `resource_id` → `resources(id)`
- **Delete Action:** `ON DELETE CASCADE`
- **Impact:** All reservations (pending, approved, completed, cancelled) for the resource are deleted
- **Location:** `supabase/setup/06_foreign_keys.sql:640`

#### `resource_usage_logs`
- **Foreign Key:** `resource_id` → `resources(id)`
- **Delete Action:** `ON DELETE CASCADE`
- **Impact:** All usage history and logs for the resource are deleted
- **Location:** `supabase/setup/06_foreign_keys.sql:666`

### 2. Transitive Cascade Deletions

#### `resource_approvals`
- **Foreign Key:** `reservation_id` → `resource_reservations(id)`
- **Delete Action:** `ON DELETE CASCADE`
- **Impact:** When reservations are deleted, all approval records are also deleted
- **Location:** `supabase/setup/06_foreign_keys.sql:653`

## Additional Cleanup

### Image Storage
The service layer also handles cleanup of resource images stored in Supabase Storage:

```typescript
// Automatic image cleanup during deletion
if (resource.image_urls && resource.image_urls.length > 0) {
  for (const imageUrl of resource.image_urls) {
    await StorageService.deleteResourceImageByUrl(imageUrl);
  }
}
```

**Note:** Image cleanup errors do not fail the entire deletion operation.

## Implementation Details

### Service Layer
**File:** `lib/services/resource-management/resource-service.ts`

The `deleteResource()` method:
1. Retrieves the resource to get image URLs
2. Executes the DELETE query (database handles cascade)
3. Cleans up images from storage
4. Logs successful deletion

```typescript
static async deleteResource(id: string): Promise<boolean> {
  const resource = await this.getResource(id);

  // Database CASCADE handles all related data
  await this.supabase.from('resources').delete().eq('id', id);

  // Manual cleanup of storage images
  // ... image deletion logic ...

  return true;
}
```

### Previous Behavior (Removed)

Previously, the service checked for active reservations and prevented deletion:

```typescript
// ❌ OLD BEHAVIOR (removed)
const { data: activeReservations } = await this.supabase
  .from('resource_reservations')
  .select('id')
  .eq('resource_id', id)
  .in('status', ['pending', 'approved']);

if (activeReservations && activeReservations.length > 0) {
  throw new Error('Cannot delete resource with active reservations');
}
```

This check has been removed to allow cascade deletion of all reservations regardless of status.

## User Experience

### Before (With Restriction)
- ❌ User tries to delete a resource with active reservations
- ❌ Error: "Cannot delete resource because it has 5 active reservation(s)"
- User must manually cancel all reservations first
- Then delete the resource

### After (With Cascade)
- ✅ User clicks delete on a resource
- ✅ Confirmation dialog explains cascade behavior
- ✅ Resource and ALL related data deleted automatically
- ✅ Success message confirms deletion

## Database Schema

### Foreign Key Definitions

```sql
-- Resource Reservations → Resources (CASCADE)
ALTER TABLE resource_reservations
    ADD CONSTRAINT fk_reservations_resource
    FOREIGN KEY (resource_id)
    REFERENCES resources(id)
    ON DELETE CASCADE;

-- Resource Usage Logs → Resources (CASCADE)
ALTER TABLE resource_usage_logs
    ADD CONSTRAINT fk_usage_logs_resource
    FOREIGN KEY (resource_id)
    REFERENCES resources(id)
    ON DELETE CASCADE;

-- Resource Approvals → Reservations (CASCADE)
ALTER TABLE resource_approvals
    ADD CONSTRAINT fk_approvals_reservation
    FOREIGN KEY (reservation_id)
    REFERENCES resource_reservations(id)
    ON DELETE CASCADE;
```

## Data Retention Considerations

### ⚠️ Important Notes

1. **No Soft Delete:** This is a hard delete - data is permanently removed
2. **No Undo:** Once deleted, data cannot be recovered (except from backups)
3. **Historical Data:** All usage logs and reservation history are deleted
4. **Approvals:** All approval records and audit trails are deleted

### Recommendations

For production systems, consider implementing:

1. **Soft Delete Pattern**
   - Add `deleted_at` timestamp column
   - Filter out soft-deleted resources in queries
   - Allows data recovery and audit trails

2. **Archive Before Delete**
   - Create archive tables for historical data
   - Move records to archive before deletion
   - Maintain compliance with data retention policies

3. **Confirmation Dialogs**
   - Show user what will be deleted
   - Require explicit confirmation
   - Display reservation count and status

## Testing

### Test Scenarios

1. **Delete resource with no data**
   - Resource deleted successfully
   - No cascade deletions needed

2. **Delete resource with pending reservations**
   - Resource deleted
   - All pending reservations deleted
   - All approval records deleted

3. **Delete resource with completed reservations**
   - Resource deleted
   - All historical reservations deleted
   - All usage logs deleted

4. **Delete resource with images**
   - Resource deleted
   - Related data cascade deleted
   - Images removed from storage

5. **Bulk delete multiple resources**
   - Each resource processed individually
   - Cascade applies to each
   - Success/error reporting per resource

## Monitoring & Logging

The deletion operation logs:
- Resource name and ID
- Number of images deleted
- Confirmation of cascade completion
- Any errors during image cleanup

Example log output:
```
Successfully deleted 3 images for resource abc-123
Successfully deleted resource "Projector - Room 301" and all related data (reservations, usage logs, approvals)
```

## Related Files

- `supabase/setup/01_tables.sql` - Table definitions
- `supabase/setup/06_foreign_keys.sql` - Foreign key constraints with CASCADE
- `lib/services/resource-management/resource-service.ts` - Service layer implementation
- `app/(routes)/resource-management/resources/page.tsx` - UI with delete functionality

## Future Enhancements

1. Add soft delete option for resources
2. Implement data archiving before deletion
3. Add detailed deletion preview showing affected records
4. Create audit log for deletion operations
5. Add role-based permissions for deletion
6. Implement bulk archive functionality

---

**Last Updated:** 2025-01-16
**Status:** Implemented ✅
