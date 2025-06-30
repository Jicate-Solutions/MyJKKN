'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Users } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import Loading from '@/components/Loading/Loading';
import { usePermissions } from '@/hooks/use-permissions';
import { useAttendanceRoster } from '@/hooks/academic/use-attendance';
import { AttendanceFilters } from './_components/attendance-filters';
import { AttendanceRoster } from './_components/attendance-roster';
import { AttendanceEmptyState } from './_components/attendance-empty-state';

export default function AttendancePage() {
  const {
    rosterData,
    availablePeriods,
    loading,
    error,
    searchContext,
    updateSearchContext,
    fetchAttendanceRoster,
    saveAttendance
  } = useAttendanceRoster();

  const { canAccess, isSuperAdmin } = usePermissions();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  const canViewAttendance =
    isSuperAdmin || canAccess('academic.attendance', 'view');
  const canMarkAttendance =
    isSuperAdmin || canAccess('academic.attendance', 'create');

  useEffect(() => {
    // Set default date to today only if not already set
    if (!searchContext.attendance_date) {
      const today = new Date().toISOString().split('T')[0];
      updateSearchContext({ attendance_date: today });
    }
  }, []); // Empty dependency array to run only once

  // Handle period selection
  const handlePeriodSelect = async (periodOption: any) => {
    if (!searchContext.attendance_date) return;

    setSelectedPeriod(periodOption.timetable_slot_id);

    const studentFilters = {
      institution_id: searchContext.institution_id!,
      degree_id: searchContext.degree_id || undefined,
      program_id: searchContext.program_id || undefined,
      department_id: searchContext.department_id || undefined,
      semester_id: searchContext.semester_id || undefined,
      section_id: searchContext.section_id || undefined
    };

    await fetchAttendanceRoster(
      periodOption.timetable_slot_id,
      searchContext.attendance_date,
      studentFilters
    );
  };

  if (!canViewAttendance) {
    return <Loading title='Loading attendance...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Attendance'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Attendance'>
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
            <BreadcrumbPage>Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Student Attendance</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Mark and manage student attendance for scheduled classes
            </p>
          </div>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Calendar className='h-4 w-4' />
            <span>
              {searchContext.attendance_date
                ? new Date(searchContext.attendance_date).toLocaleDateString()
                : 'Select date'}
            </span>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AttendanceFilters
              searchContext={searchContext}
              onContextChange={updateSearchContext}
              availablePeriods={availablePeriods}
              selectedPeriod={selectedPeriod}
              onPeriodSelect={handlePeriodSelect}
              loading={loading}
            />

            {loading && <Loading title='Loading attendance data...' />}

            {!loading &&
              !error &&
              availablePeriods.length === 0 &&
              searchContext.attendance_date && (
                <AttendanceEmptyState
                  message='No classes scheduled for the selected date and criteria'
                  description='Try selecting a different date or adjusting your search criteria.'
                />
              )}

            {!loading &&
              !error &&
              availablePeriods.length > 0 &&
              !rosterData && (
                <AttendanceEmptyState
                  message='Select a period to view attendance'
                  description='Choose a period from the dropdown above to load the student roster.'
                />
              )}

            {!loading && !error && rosterData && (
              <AttendanceRoster
                rosterData={rosterData}
                onSave={saveAttendance}
                canMarkAttendance={canMarkAttendance}
                loading={loading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
