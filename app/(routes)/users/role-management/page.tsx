'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import {
  ArrowUp,
  PlusCircle,
  AlertCircle,
  Users,
  GraduationCap,
  Building2
} from 'lucide-react';
import { RoleManagementList } from './_components/role-management-list';
import { RoleService } from '@/lib/services/roles/role-service';
import { CustomRole } from '@/types/auth';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { CreateRoleDialog } from './_components/create-role-dialog';
import { PageBreadcrumb } from '@/components/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScholarshipPermissionManager } from '@/app/(routes)/billing/discounts/_components/scholarship-permission-manager';
import { UserInstitutionAccessManager } from './_components/user-institution-access-manager';

export default function RoleManagementPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [activeTab, setActiveTab] = useState('roles');

  const {
    hasAllPermissions,
    isLoading: permLoading,
    userProfile,
  } = usePermissions(['roles.create']);

  // Check permissions then fetch roles
  useEffect(() => {
    if (permLoading) return;
    if (!userProfile) return; // profile not loaded yet — don't redirect
    if (!hasAllPermissions) {
      router.push('/unauthorized');
      return;
    }
    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, hasAllPermissions, userProfile, router]);

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

  if (permLoading || !userProfile || !hasAllPermissions) {
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
            Create, view and manage roles and permissions
          </p>
        </div>

        <Alert className='mb-6 border-blue-500 bg-blue-50'>
          <AlertCircle className='h-4 w-4 text-blue-500' />
          <AlertTitle>Improved Permission Management</AlertTitle>
          <AlertDescription>
            We&apos;ve updated the role editor with a new &quot;Pages&quot; tab
            that makes it easier to manage permissions. First enable access to a
            page, then configure the specific actions allowed for that page.
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='roles' className='flex items-center gap-2'>
              <Users className='h-4 w-4' />
              Role Management
            </TabsTrigger>
            <TabsTrigger
              value='scholarships'
              className='flex items-center gap-2'
            >
              <GraduationCap className='h-4 w-4' />
              Scholarship Permissions
            </TabsTrigger>
            <TabsTrigger
              value='institutions'
              className='flex items-center gap-2'
            >
              <Building2 className='h-4 w-4' />
              Institution Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value='roles' className='space-y-6'>
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
          </TabsContent>

          <TabsContent value='scholarships' className='space-y-6'>
            <ScholarshipPermissionManager />
          </TabsContent>

          <TabsContent value='institutions' className='space-y-6'>
            <UserInstitutionAccessManager />
          </TabsContent>
        </Tabs>
      </div>

      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateRole}
      />
    </ContentLayout>
  );
}
