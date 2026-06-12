'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Info } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { DaySessionAttendance } from './_components/day-session-attendance';

/**
 * Day-wise (FN & AN) attendance — for school session_wise classes, marked by
 * the class incharge per date/session (not per course/period).
 */
export default function DayAttendancePage() {
  const { profile, isLoading: authLoading } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [staffId, setStaffId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  const role = profile?.role;
  const allowOverride =
    isSuperAdmin ||
    role === 'hod' ||
    role === 'principal' ||
    role === 'administrator';

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile?.email) {
        if (!authLoading) setResolving(false);
        return;
      }
      try {
        setResolving(true);
        const id = await FacultyAttendanceService.getStaffIdByEmail(
          profile.email
        );
        if (active) setStaffId(id);
      } catch (error) {
        logger.error('academic/attendance', 'Error resolving staff id for day attendance', error);
      } finally {
        if (active) setResolving(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.email, authLoading]);

  return (
    <ContentLayout title='Day Attendance'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/attendance'>Attendance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Day Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Day-wise Attendance</h1>
          <p className='text-sm text-muted-foreground'>
            Mark Forenoon (FN) &amp; Afternoon (AN) attendance for your class.
            Both present = full day, one = half day.
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            {authLoading || resolving ? (
              <div className='flex items-center justify-center py-10'>
                <Loader2 className='h-6 w-6 animate-spin mr-2' />
                <span>Loading…</span>
              </div>
            ) : !staffId && !allowOverride ? (
              <Alert>
                <Info className='h-4 w-4' />
                <AlertDescription>
                  Your account is not linked to a staff record, so day-wise
                  classes cannot be loaded. Please contact the administrator.
                </AlertDescription>
              </Alert>
            ) : (
              <DaySessionAttendance
                staffId={staffId}
                allowOverride={allowOverride}
                // Super-admin: undefined = every school. Admin/HOD: their own.
                institutionId={
                  isSuperAdmin ? undefined : profile?.institution_id || undefined
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
