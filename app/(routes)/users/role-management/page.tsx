'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ArrowUp, PlusCircle } from 'lucide-react';
import { RoleManagementList } from './_components/role-management-list';
import { RoleService } from '@/lib/services/roles/role-service';
import { UserService } from '@/lib/services/users/user-service';
import { CustomRole, SYSTEM_ROLES } from '@/types/auth';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { CreateRoleDialog } from './_components/create-role-dialog';
import { PageBreadcrumb } from '@/components/navigation';
import { AuthService } from '@/lib/auth/auth-service';

export default function RoleManagementPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  // Check permissions and fetch roles
  useEffect(() => {
    const checkPermissionAndFetchRoles = async () => {
      try {
        setIsLoading(true);

        // Check if current user is super_admin
        const { data: profile } = await UserService.getCurrentUserProfile();
        if (!profile || profile.role !== SYSTEM_ROLES.SUPER_ADMIN) {
          router.push('/unauthorized');
          return;
        }

        setIsSuperAdmin(true);

        // Fetch roles
        await fetchRoles();
      } catch (error) {
        console.error('Error checking permissions:', error);
        setError('You do not have permission to access this page');
      } finally {
        setIsLoading(false);
      }
    };

    checkPermissionAndFetchRoles();
  }, [router]);

  // Fetch roles
  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const rolesData = await RoleService.getAllRoles();
      setRoles(rolesData);
    } catch (err) {
      console.error('Error fetching roles:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRole = async (role: {
    role_key: string;
    role_name: string;
    description: string;
    permissions: Record<string, boolean>;
  }) => {
    try {
      setIsLoading(true);
      await RoleService.createRole(role);
      await fetchRoles();
      setShowCreateDialog(false);
      toast.success('Role created successfully');
    } catch (error) {
      console.error('Error creating role:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create role'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRole = async (
    roleKey: string,
    updates: {
      role_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
    }
  ) => {
    console.log(
      '>>> STEP 1: handleUpdateRole in page.tsx CALLED for key:',
      roleKey
    );
    try {
      setIsLoading(true);

      // Track the update timestamp to help with debugging
      const updateTime = new Date().toISOString();

      // Force permissions to be a clean object if it exists
      const cleanUpdates = {
        ...updates,
        permissions: updates.permissions
          ? JSON.parse(JSON.stringify(updates.permissions))
          : undefined
      };

      // Call the service to update the role

      await RoleService.updateRole(roleKey, cleanUpdates);

      // Notify successful update

      toast.success(`Role "${roleKey}" updated successfully at ${updateTime}`);

      // Refresh the roles list
      await fetchRoles();
    } catch (error) {
      console.error('Page: Error updating role:', error);
      toast.error(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Failed to update role. Please check console for details.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRole = async (roleKey: string) => {
    try {
      setIsLoading(true);
      await RoleService.deleteRole(roleKey);
      await fetchRoles();
      toast.success('Role deleted successfully');
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete role'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle permissions migration
  const handleMigratePermissions = async () => {
    try {
      setIsMigrating(true);
      await RoleService.migratePermissions();
      await fetchRoles();
      toast.success('Permissions successfully migrated to new format');
    } catch (error) {
      console.error('Error migrating permissions:', error);
      toast.error('Failed to migrate permissions');
    } finally {
      setIsMigrating(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <ContentLayout title='Role Management'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Role Management'>
      <div className='space-y-6'>
        <div className='space-y-1'>
          <PageBreadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Users', href: '/users' },
              { label: 'Role Management' }
            ]}
          />
          <h2 className='text-2xl font-bold'>Role Management</h2>
          <p className='text-sm text-muted-foreground'>
            Create, view and manage roles
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <Button
            variant='outline'
            onClick={handleMigratePermissions}
            disabled={isMigrating}
            className='flex items-center gap-2'
          >
            <ArrowUp className='h-4 w-4' />
            {isMigrating ? 'Migrating...' : 'Migrate Permissions'}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <PlusCircle className='mr-2 h-4 w-4' />
            Create Role
          </Button>
        </div>

        {isLoading ? (
          <div className='flex justify-center items-center min-h-[400px]'>
            <BeatLoader color='#00e902' />
          </div>
        ) : error ? (
          <Card>
            <CardContent className='p-6'>
              <div className='text-center text-red-500'>{error}</div>
            </CardContent>
          </Card>
        ) : (
          <RoleManagementList
            roles={roles}
            onUpdateRole={handleUpdateRole}
            onDeleteRole={handleDeleteRole}
          />
        )}
      </div>

      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateRole}
      />
    </ContentLayout>
  );
}
