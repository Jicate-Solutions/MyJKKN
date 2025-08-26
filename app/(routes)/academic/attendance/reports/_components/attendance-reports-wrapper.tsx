'use client';

import { useState, useEffect, useMemo } from 'react';
import { AttendanceReportFilters } from '@/lib/services/academic/attendance-analytics-service';
import { AttendanceReportsFilters } from './attendance-reports-filters';
import { AttendanceReportsTable } from './attendance-reports-table';
import { AttendanceStatisticsCards } from './attendance-statistics-cards';
import { useAttendanceStatistics } from '@/hooks/academic/use-attendance-analytics';
import { useAuth } from '@/hooks/use-auth';
import { useStaff } from '@/hooks/academic/use-attendance-analytics';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_FILTERS: AttendanceReportFilters = {
  page: 1,
  limit: 10,
  sort_by: 'attendance_date',
  sort_order: 'desc'
};

export function AttendanceReportsWrapper() {
  const { profile, isLoading: profileLoading } = useAuth();
  const [filters, setFilters] =
    useState<AttendanceReportFilters>(DEFAULT_FILTERS);

  // Get staff info if user is faculty
  const { data: staffData, isLoading: staffLoading } = useStaff(
    profile?.institution_id || undefined,
    profile?.role === 'faculty'
  );

  // Build role-based default filters
  const roleBasedFilters = useMemo(() => {
    const baseFilters = { ...DEFAULT_FILTERS };

    if (!profile) return baseFilters;

    // Apply role-based filtering
    switch (profile.role) {
      case 'super_admin':
        // Super admin can see all data - no institution filter needed
        break;

      case 'administrator':
      case 'principal':
        // Principal/Admin can only see their institution's data
        if (profile.institution_id) {
          baseFilters.institution_id = profile.institution_id;
        }
        break;

      case 'faculty':
        // Faculty can only see their own data
        if (profile.institution_id) {
          baseFilters.institution_id = profile.institution_id;
        }

        // For faculty, we need staff data to be loaded
        // If still loading, don't set staff_id yet
        if (!staffLoading && staffData) {
          // Find staff record by matching profile_id first, then fallback to institution_email
          const staffRecord = staffData.find((staff: any) => {
            // First try to match by profile_id (most accurate)
            if (staff.profile_id && staff.profile_id === profile.id) {
              return true;
            }

            // Fallback to institution_email matching (case-insensitive)
            // Only use institution_email for authentication, not personal email
            const staffInstitutionEmail = staff.institution_email?.toLowerCase();
            const profileEmail = profile.email?.toLowerCase();
            
            return staffInstitutionEmail === profileEmail;
          });

          if (staffRecord) {
            baseFilters.staff_id = staffRecord.id;
            console.log(
              'Faculty staff_id set:',
              staffRecord.id,
              'for profile:',
              profile.id,
              'email:',
              profile.email
            );
          } else {
            console.warn(
              'No staff record found for faculty profile:',
              profile.id,
              'email:',
              profile.email
            );
            console.log(
              'Available staff records:',
              staffData?.map((s: any) => ({
                id: s.id,
                name: s.name,
                email: s.email,
                profile_id: s.profile_id
              }))
            );
          }
        } else if (staffLoading) {
          console.log('Staff data still loading for faculty user');
        }
        break;

      case 'student':
        // Students shouldn't see attendance reports
        // But if they do, limit to their institution
        if (profile.institution_id) {
          baseFilters.institution_id = profile.institution_id;
        }
        break;

      default:
        // Default to institution-based filtering
        if (profile.institution_id) {
          baseFilters.institution_id = profile.institution_id;
        }
        break;
    }

    return baseFilters;
  }, [profile, staffData, staffLoading]);

  // Update filters when role-based filters change
  useEffect(() => {
    if (profile && !profileLoading) {
      setFilters((prev) => {
        const newFilters = {
          ...prev,
          ...roleBasedFilters
        };
        console.log(
          'Filters updated for role:',
          profile.role,
          'Filters:',
          newFilters
        );
        return newFilters;
      });
    }
  }, [roleBasedFilters, profile, profileLoading]);

  // Fetch statistics based on current filters
  const { data: statistics, isLoading: loadingStats } =
    useAttendanceStatistics(filters);

  // Debug logging for faculty statistics
  useEffect(() => {
    if (profile?.role === 'faculty' && statistics) {
      console.log('Faculty Statistics Debug:', {
        filters,
        statistics,
        staffId: filters.staff_id,
        totalSessions: statistics.totalSessions
      });
    }
  }, [statistics, filters, profile]);

  const handleFiltersChange = (
    newFilters: Partial<AttendanceReportFilters>
  ) => {
    setFilters((prev) => {
      // Preserve role-based filters
      const updatedFilters = {
        ...prev,
        ...newFilters,
        // Reset page to 1 when filters change (except when changing page directly)
        ...(newFilters.page === undefined && { page: 1 })
      };

      // Ensure role-based filters are maintained (except for super_admin)
      if (profile?.role !== 'super_admin') {
        // Keep institution filter for non-super admins
        if (profile?.institution_id) {
          updatedFilters.institution_id = profile.institution_id;
        }

        // Keep staff filter for faculty
        if (profile?.role === 'faculty' && roleBasedFilters.staff_id) {
          updatedFilters.staff_id = roleBasedFilters.staff_id;
        }
      }

      return updatedFilters;
    });
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: pageSize, page: 1 }));
  };

  const handleSortChange = (sort_by: string, sort_order: 'asc' | 'desc') => {
    setFilters((prev) => ({ ...prev, sort_by, sort_order, page: 1 }));
  };

  // Show loading state while profile is loading or staff data is loading for faculty
  if (profileLoading || (profile?.role === 'faculty' && staffLoading)) {
    return (
      <div className='space-y-6'>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className='h-32' />
          ))}
        </div>
        <Skeleton className='h-24' />
        <Skeleton className='h-96' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Statistics Cards */}
      <AttendanceStatisticsCards
        statistics={statistics}
        loading={loadingStats}
      />

      {/* Filters */}
      <AttendanceReportsFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        userRole={profile?.role}
      />

      {/* Table */}
      <AttendanceReportsTable
        filters={filters}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
