'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { LeaveCalendar } from './_components/leave-calendar';
import { CalendarLegend } from './_components/calendar-legend';
import { CalendarFilters } from './_components/calendar-filters';
import { usePermissions } from '@/hooks/use-permissions';

export default function LeaveCalendarPage() {
  const { userProfile, isSuperAdmin } = usePermissions();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedInstitution, setSelectedInstitution] = useState<string | undefined>(
    userProfile?.institution_id || undefined
  );
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>();
  const [selectedSemester, setSelectedSemester] = useState<string | undefined>();
  const [selectedSection, setSelectedSection] = useState<string | undefined>();

  // Update selected institution when user profile loads
  useEffect(() => {
    if (userProfile?.institution_id && !selectedInstitution) {
      setSelectedInstitution(userProfile.institution_id);
    }
  }, [userProfile?.institution_id, selectedInstitution]);

  // For non-super admins, use their own institution
  const effectiveInstitutionId = isSuperAdmin
    ? selectedInstitution
    : userProfile?.institution_id ?? undefined;

  // Reset dependent filters when institution changes
  useEffect(() => {
    setSelectedDepartment(undefined);
    setSelectedSemester(undefined);
    setSelectedSection(undefined);
  }, [selectedInstitution]);

  const handleMonthChange = (newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
  };

  return (
    <PermissionGuard module='academic.leaves' action='view'>
      <ContentLayout title='Leave Calendar'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Leave Calendar</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Filters */}
          <Card>
            <CardContent className='p-4'>
              <CalendarFilters
                isSuperAdmin={isSuperAdmin}
                selectedInstitution={selectedInstitution}
                selectedDepartment={selectedDepartment}
                selectedSemester={selectedSemester}
                selectedSection={selectedSection}
                onInstitutionChange={setSelectedInstitution}
                onDepartmentChange={setSelectedDepartment}
                onSemesterChange={setSelectedSemester}
                onSectionChange={setSelectedSection}
              />
            </CardContent>
          </Card>

          <div className='grid gap-6 lg:grid-cols-4'>
            {/* Calendar */}
            <div className='lg:col-span-3'>
              <Card>
                <CardHeader>
                  <CardTitle>Academic Leave Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                  <LeaveCalendar
                    institutionId={effectiveInstitutionId || null}
                    year={year}
                    month={month}
                    departmentId={selectedDepartment}
                    semesterId={selectedSemester}
                    sectionId={selectedSection}
                    onMonthChange={handleMonthChange}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Legend */}
            <div className='lg:col-span-1'>
              <CalendarLegend institutionId={effectiveInstitutionId || null} />
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
