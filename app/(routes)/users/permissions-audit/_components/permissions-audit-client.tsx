'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BeatLoader } from 'react-spinners';
import { ShieldCheck } from 'lucide-react';
import { UserService } from '@/lib/services/users/user-service';
import { SYSTEM_ROLES } from '@/types/auth';
import { SystemHealthTab } from './system-health-tab';
import { UserResolverTab } from './user-resolver-tab';
import { PermissionMatrixTab } from './permission-matrix-tab';
import { ComparisonTab } from './comparison-tab';
import { ModuleAccessTab } from './module-access-tab';

export function PermissionsAuditClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: profile } = await UserService.getCurrentUserProfile();
        if (
          !profile ||
          (profile.role !== SYSTEM_ROLES.SUPER_ADMIN && !profile.is_super_admin)
        ) {
          router.push('/unauthorized');
          return;
        }
        setIsSuperAdmin(true);
      } catch (error) {
        console.error('Error checking permissions:', error);
        router.push('/unauthorized');
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  if (isLoading || !isSuperAdmin) {
    return (
      <ContentLayout title='Permissions Audit'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#6366f1' size={12} />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Permissions Audit'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Users', href: '/users' },
            { label: 'Permissions Audit' }
          ]}
        />

        <div className='flex items-center gap-3'>
          <ShieldCheck className='h-8 w-8 text-indigo-500' />
          <div>
            <h2 className='text-2xl font-bold'>Permissions Audit Dashboard</h2>
            <p className='text-sm text-muted-foreground'>
              Inspect, compare, and troubleshoot role permissions across the
              system
            </p>
          </div>
        </div>

        <Tabs defaultValue='module-access' className='w-full'>
          <TabsList className='grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'>
            <TabsTrigger value='module-access'>Module → Roles</TabsTrigger>
            <TabsTrigger value='health'>System Health</TabsTrigger>
            <TabsTrigger value='resolver'>User Resolver</TabsTrigger>
            <TabsTrigger value='matrix'>Permission Matrix</TabsTrigger>
            <TabsTrigger value='comparison'>Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value='module-access'>
            <ModuleAccessTab />
          </TabsContent>

          <TabsContent value='health'>
            <SystemHealthTab />
          </TabsContent>

          <TabsContent value='resolver'>
            <UserResolverTab />
          </TabsContent>

          <TabsContent value='matrix'>
            <PermissionMatrixTab />
          </TabsContent>

          <TabsContent value='comparison'>
            <ComparisonTab />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
