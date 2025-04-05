# MyJKKN - Role-Based Access Control System

## Role-Based Access Control Implementation Guide

The application implements a comprehensive role-based access control (RBAC) system that allows fine-grained control over user permissions. This guide explains how to implement and extend RBAC for new modules.

### 1. Define Permissions in Constants

Add new permission categories and permissions in `lib/constants/profile.ts`:

```typescript
// lib/constants/profile.ts

export const PERMISSION_CATEGORIES = [
  // ... existing categories
  {
    name: 'Your New Module',
    permissions: [
      { key: 'view_module', label: 'View Module' },
      { key: 'create_module_items', label: 'Create Items' },
      { key: 'edit_module_items', label: 'Edit Items' },
      { key: 'delete_module_items', label: 'Delete Items' }
    ]
  }
];
```

### 2. Update Sidebar Menu Permissions Map

Map menu paths to required permissions in `lib/sidebarMenuLink.ts`:

```typescript
// lib/sidebarMenuLink.ts

export const MENU_PERMISSIONS: MenuPermissions = {
  // ... existing mappings
  '/your-module': 'view_module',
  '/your-module/new': 'create_module_items',
  '/your-module/edit': 'edit_module_items'
};
```

### 3. Implement Server-Side Protection

For API routes, check permissions in your route handlers:

```typescript
// app/api/your-module/route.ts

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Database } from '@/types/auth';

export async function POST(req: Request) {
  try {
    // Get user profile from session
    const supabase = createServerComponentClient<Database>({ cookies });
    const session = await supabase.auth.getSession();

    if (!session?.data.session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.data.session.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get user's role and permissions
    const { data: role } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('role_key', profile.role)
      .single();

    // Check for required permission
    if (!role?.permissions?.create_module_items) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Process request
    // ...

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 4. Implement Client-Side Permission Checks

Create a reusable permissions hook:

```typescript
// hooks/use-permissions.ts

import { useState, useEffect } from 'react';
import { UserService } from '@/lib/services/users/user-service';
import { RoleService } from '@/lib/services/roles/role-service';

export function usePermissions(requiredPermissions: string[] = []) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current user profile
        const { data: profile, error: profileError } =
          await UserService.getCurrentUserProfile();

        if (profileError) throw profileError;
        if (!profile) throw new Error('User profile not found');

        // Get role permissions
        const role = await RoleService.getRoleByKey(profile.role);

        if (!role) throw new Error(`Role ${profile.role} not found`);

        setPermissions(role.permissions || {});
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  // Check if user has all required permissions
  const hasAllPermissions = !isLoading && !error &&
    requiredPermissions.every(perm => permissions[perm]);

  // Check if user has any of the required permissions
  const hasAnyPermission = !isLoading && !error &&
    requiredPermissions.some(perm => permissions[perm]);

  return {
    permissions,
    isLoading,
    error,
    hasAllPermissions,
    hasAnyPermission,
    // Helper to check a specific permission
    can: (permission: string) => permissions[permission] || false
  };
}
```

### 5. Use the Permissions Hook in Components

```typescript
// app/(routes)/your-module/page.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorMessage } from '@/components/ui/error-message';

export default function YourModulePage() {
  const router = useRouter();
  const {
    permissions,
    isLoading,
    error,
    can
  } = usePermissions([
    'view_module',
    'create_module_items',
    'edit_module_items'
  ]);

  // Redirect if no access
  useEffect(() => {
    if (!isLoading && !can('view_module')) {
      router.push('/unauthorized');
    }
  }, [isLoading, can, router]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <h1>Module Dashboard</h1>

      {can('create_module_items') && (
        <Button onClick={() => router.push('/your-module/new')}>
          Create New Item
        </Button>
      )}

      {/* Item list with conditional actions */}
      <ItemList
        items={items}
        canEdit={can('edit_module_items')}
        canDelete={can('delete_module_items')}
      />
    </div>
  );
}
```

### 6. Create Permission-Aware UI Components

```typescript
// components/your-module/item-actions.tsx

import { Pencil, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ItemActionsProps {
  item: YourItemType;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (item: YourItemType) => void;
  onDelete: (itemId: string) => void;
}

export function ItemActions({
  item,
  canEdit,
  canDelete,
  onEdit,
  onDelete
}: ItemActionsProps) {
  return (
    <div className="flex space-x-2">
      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(item)}
        >
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
      )}

      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(item.id)}
        >
          <Trash className="h-4 w-4 mr-1" />
          Delete
        </Button>
      )}
    </div>
  );
}
```

### 7. Best Practices and Tips

1. **Always Check Permissions at Multiple Levels**:

   - UI level (what users can see/interact with)
   - Route level (page access)
   - API level (data operations)

2. **Super Admin Special Handling**:

   - The super_admin role has all permissions and can't have its permissions modified
   - Other system roles can have editable permissions

3. **Default to Deny**:

   - Assume users don't have permissions unless explicitly granted
   - Implement "fail-closed" security patterns

4. **Consistent Permission Naming**:

   - Use verb_noun format (e.g., view_users, edit_posts)
   - Group related permissions into categories

5. **Testing**:

   - Test with different user roles to verify correct access control
   - Create test cases for both allowed and denied scenarios

6. **Error Handling**:
   - Provide clear, user-friendly messages for permission denials
   - Log unauthorized access attempts for security monitoring


