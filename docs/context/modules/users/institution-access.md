# Institution Access - Multi-Tenant Context

> Multi-institution access control for users

---

## Overview

The `user_institution_access` table enables **multi-tenant access control**, allowing users to access multiple institutions with different access levels.

### Purpose
- Grant users access to multiple institutions
- Control access level (full, read-only, billing-only)
- Support cross-institution operations (e.g., group admin)
- Enable institution switching in UI

### Use Cases
- Admin managing multiple college branches
- Group-level operations across institutions
- Billing staff with billing-only access
- Read-only auditors for compliance

---

## Data Model

### Table: user_institution_access

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | Yes | - | FK to profiles.id |
| `institution_id` | UUID | Yes | - | FK to institutions.id |
| `access_type` | TEXT | Yes | `'full'` | Access level |
| `granted_by` | UUID | No | - | FK to profiles.id (who granted) |
| `granted_at` | TIMESTAMPTZ | No | `now()` | When access was granted |
| `is_active` | BOOLEAN | Yes | `true` | Access currently active |
| `created_at` | TIMESTAMPTZ | No | `now()` | Record creation time |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update time |

### Unique Constraint
`(user_id, institution_id)` - User can have only one access record per institution.

---

## Access Types

| Type | Description | Module Access |
|------|-------------|---------------|
| `full` | Full access | All modules per role permissions |
| `read_only` | View only | View operations only, no create/edit/delete |
| `billing_only` | Billing access | Only billing module operations |

### Access Type Behavior

```typescript
// Full Access
// User can perform all operations allowed by their role

// Read-Only Access
// All create/edit/delete operations blocked
// Only view/read operations allowed
// Example: Auditor reviewing data

// Billing-Only Access
// Only billing module accessible
// Other modules hidden/blocked
// Example: Billing staff for specific college
```

---

## Access Resolution Logic

### How Institution Access is Determined

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Check if Super Admin                                   │
│  → Super admins have access to ALL institutions                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (Not super admin)
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Check Primary Institution (profiles.institution_id)   │
│  → User always has full access to their primary institution    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Check Additional Access (user_institution_access)     │
│  → Query for active access records                              │
│  → Combine with primary institution                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Return Accessible Institutions with Access Types       │
│  → Primary institution marked as is_primary_institution: true   │
│  → Additional institutions with their access_type               │
└─────────────────────────────────────────────────────────────────┘
```

---

## TypeScript Types

```typescript
export interface UserInstitutionAccess {
  id: string;
  user_id: string;
  institution_id: string;
  access_type: 'full' | 'read_only' | 'billing_only';
  granted_by?: string;
  granted_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccessibleInstitution {
  institution_id: string;
  institution_name: string;
  counselling_code: string;
  access_type: string;
  is_primary_institution: boolean;
}

export interface UserInstitutionFilters {
  user_id?: string;
  institution_id?: string;
  access_type?: string;
  is_active?: boolean;
}
```

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id/institutions` | Get user's accessible institutions |
| POST | `/api/users/:id/institutions` | Grant institution access |
| PUT | `/api/users/:id/institutions/:instId` | Update access type |
| DELETE | `/api/users/:id/institutions/:instId` | Revoke access |

### Database Functions

| Function | Description |
|----------|-------------|
| `get_user_accessible_institutions(target_user_id)` | Returns all accessible institutions |
| `user_has_institution_access(target_user_id, target_institution_id)` | Check specific access |
| `grant_user_institution_access(...)` | Grant access |
| `revoke_user_institution_access(...)` | Revoke access |

### Response Examples

#### Get Accessible Institutions
```json
// GET /api/users/:id/institutions
{
  "data": [
    {
      "institution_id": "inst-uuid-1",
      "institution_name": "JKKN College of Engineering",
      "counselling_code": "3839",
      "access_type": "full",
      "is_primary_institution": true
    },
    {
      "institution_id": "inst-uuid-2",
      "institution_name": "JKKN Dental College",
      "counselling_code": "3840",
      "access_type": "read_only",
      "is_primary_institution": false
    },
    {
      "institution_id": "inst-uuid-3",
      "institution_name": "JKKN Pharmacy College",
      "counselling_code": "3841",
      "access_type": "billing_only",
      "is_primary_institution": false
    }
  ]
}
```

#### Grant Access Request
```json
// POST /api/users/:id/institutions
{
  "institution_id": "inst-uuid-2",
  "access_type": "read_only"
}
```

#### Access Record Response
```json
{
  "id": "access-uuid",
  "user_id": "user-uuid",
  "institution_id": "inst-uuid-2",
  "access_type": "read_only",
  "granted_by": "admin-uuid",
  "granted_at": "2024-06-20T10:00:00Z",
  "is_active": true,
  "institution": {
    "id": "inst-uuid-2",
    "name": "JKKN Dental College",
    "counselling_code": "3840"
  },
  "user": {
    "id": "user-uuid",
    "full_name": "John Doe",
    "email": "john@jkkn.ac.in"
  },
  "granted_by_user": {
    "id": "admin-uuid",
    "full_name": "Admin User",
    "email": "admin@jkkn.ac.in"
  }
}
```

---

## Business Rules

### Access Grant Rules
1. **No duplicate access**: User can have only one access record per institution
2. **Primary institution implicit**: User's primary institution (from profile) is always accessible
3. **Grant audit**: Always records who granted access and when
4. **Activation**: New access is active by default

### Access Revocation Rules
1. **Cannot revoke primary**: Cannot revoke access to primary institution via this table
2. **Soft deactivation**: Sets is_active to false rather than deleting
3. **Audit trail**: Maintains record for audit purposes

### Access Check Rules
1. **Super admin bypass**: Super admins access all institutions
2. **Active check**: Only active access records are considered
3. **Type enforcement**: Access type restricts available operations
4. **RLS integration**: Works with Row Level Security policies

---

## Integration with RLS

### How Institution Access Affects Data Queries

```sql
-- RLS policy pattern
CREATE POLICY "Users can view data in accessible institutions"
ON students
FOR SELECT
USING (
  institution_id IN (
    SELECT institution_id
    FROM user_institution_access
    WHERE user_id = auth.uid()
    AND is_active = true
  )
  OR
  institution_id = (
    SELECT institution_id
    FROM profiles
    WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_super_admin = true
  )
);
```

---

## UI Integration

### Institution Switcher Component

When user has access to multiple institutions:

```typescript
// Get accessible institutions for dropdown
const institutions = await UserInstitutionAccessService
  .getUserAccessibleInstitutions(userId);

// Current institution from context
const currentInstitution = useCurrentInstitution();

// Switch institution
const handleInstitutionSwitch = (newInstitutionId: string) => {
  // Update context
  setCurrentInstitution(newInstitutionId);
  // Refresh data for new institution
  queryClient.invalidateQueries();
};
```

### Access Type Indicators

```typescript
// Show access type badge in institution selector
{institutions.map(inst => (
  <SelectItem key={inst.institution_id}>
    <span>{inst.institution_name}</span>
    {inst.access_type !== 'full' && (
      <Badge variant="outline">
        {inst.access_type === 'read_only' ? 'View Only' : 'Billing Only'}
      </Badge>
    )}
    {inst.is_primary_institution && (
      <Badge variant="default">Primary</Badge>
    )}
  </SelectItem>
))}
```

---

## Service Methods

```typescript
class UserInstitutionAccessService {
  // Get all accessible institutions
  static async getUserAccessibleInstitutions(
    userId: string
  ): Promise<AccessibleInstitution[]>;

  // Check if user has access to specific institution
  static async userHasInstitutionAccess(
    userId: string,
    institutionId: string
  ): Promise<boolean>;

  // Grant institution access
  static async grantInstitutionAccess(
    userId: string,
    institutionId: string,
    accessType: 'full' | 'read_only' | 'billing_only',
    grantedBy?: string
  ): Promise<void>;

  // Revoke institution access
  static async revokeInstitutionAccess(
    userId: string,
    institutionId: string
  ): Promise<void>;

  // Get access records with details
  static async getUserInstitutionAccessRecords(
    filters: UserInstitutionFilters
  ): Promise<UserInstitutionAccessWithDetails[]>;

  // Bulk grant access
  static async bulkGrantInstitutionAccess(
    userIds: string[],
    institutionIds: string[],
    accessType: 'full' | 'read_only' | 'billing_only',
    grantedBy?: string
  ): Promise<BulkResult>;

  // Get institution IDs for filtering
  static async getUserAccessibleInstitutionIds(
    userId: string
  ): Promise<string[]>;

  // Create SQL filter for queries
  static async createInstitutionAccessFilter(
    userId: string,
    columnName?: string
  ): Promise<string>;
}
```

---

## Sample Data

### Access Record
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "institution_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "access_type": "full",
  "granted_by": "550e8400-e29b-41d4-a716-446655440001",
  "granted_at": "2024-06-15T10:00:00Z",
  "is_active": true,
  "created_at": "2024-06-15T10:00:00Z",
  "updated_at": "2024-06-15T10:00:00Z"
}
```

### Multi-Institution User Scenario
```json
{
  "user": {
    "id": "user-uuid",
    "full_name": "Group Admin",
    "role": "administrator",
    "institution_id": "engineering-college-uuid"
  },
  "accessible_institutions": [
    {
      "institution_id": "engineering-college-uuid",
      "institution_name": "JKKN College of Engineering",
      "access_type": "full",
      "is_primary_institution": true
    },
    {
      "institution_id": "dental-college-uuid",
      "institution_name": "JKKN Dental College",
      "access_type": "full",
      "is_primary_institution": false
    },
    {
      "institution_id": "pharmacy-college-uuid",
      "institution_name": "JKKN College of Pharmacy",
      "access_type": "read_only",
      "is_primary_institution": false
    }
  ]
}
```

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View Access Records | `users.institution_access.view` |
| Grant Access | `users.institution_access.grant` |
| Revoke Access | `users.institution_access.revoke` |
| Manage Own Institutions | `users.institution_access.manage` |

---

## Service Location

- **Service**: `lib/services/users/user-institution-access-service.ts`
- **Hook**: `hooks/use-user-institution-access.ts`
- **Types**: `lib/services/users/user-institution-access-service.ts` (inline)

---

*Last Updated: December 2024*
