'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StaffPlanDetailsPage } from '../_components/staff-plan-details';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import Loading from '@/components/Loading/Loading';
import { ContentLayout } from '@/components/layout/content-layout';

interface StaffPlanPageProps {
  params: Promise<{ id: string }>;
}

export default function StaffPlanPage({ params }: StaffPlanPageProps) {
  const resolvedParams = use(params);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'view');

  useEffect(() => {
    if (!permissionsLoading) {
      if (!canViewStaffPlans) {
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to view staff plans.',
          variant: 'destructive'
        });
        router.push('/academic/staff-planning');
      }
      setIsCheckingPermissions(false);
    }
  }, [permissionsLoading, canViewStaffPlans, router, toast]);

  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Loading...' />;
  }

  if (!canViewStaffPlans) {
    return <Loading title='Redirecting...' />;
  }

  return (
    <StaffPlanDetailsPage
      id={resolvedParams.id}
      canEdit={isSuperAdmin || canAccess('academic.staff.planning', 'edit')}
      canDelete={
        isSuperAdmin || canAccess('academic.staff.planning', 'delete')
      }
    />
  );
}
