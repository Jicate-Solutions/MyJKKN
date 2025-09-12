'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Calendar,
  Users,
  BookOpen,
  TrendingUp
} from 'lucide-react';
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';
import type { DashboardFilters } from '@/types/attendance-dashboard';
import { format } from 'date-fns';

interface PendingStatisticsCardsProps {
  filters: {
    institutionId?: string;
    academicYearId?: string;
    degreeId?: string;
    departmentId?: string;
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    attendanceDate?: string;
  };
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  refreshTrigger?: number;
}

interface PendingStats {
  totalPeriods: number;
  pendingPeriods: number;
  completedPeriods: number;
  sections: number;
  subjects: number;
  staff: number;
}

export function PendingStatisticsCards({
  filters,
  userInstitutionId,
  canViewAllInstitutions,
  refreshTrigger = 0
}: PendingStatisticsCardsProps) {
  const [stats, setStats] = useState<PendingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build filters for the API call
        const apiFilters: DashboardFilters = {
          userInstitutionId: filters.institutionId || userInstitutionId,
          page: 1,
          limit: 1000, // Get all for counting
          sortBy: 'attendance_date',
          sortDirection: 'desc',
          startDate: filters.attendanceDate || new Date().toISOString().split('T')[0],
          endDate: filters.attendanceDate || new Date().toISOString().split('T')[0],
          institutionId: filters.institutionId,
          academicYearId: filters.academicYearId,
          degreeId: filters.degreeId,
          departmentId: filters.departmentId,
          programId: filters.programId,
          semesterId: filters.semesterId,
          sectionId: filters.sectionId,
        };

        console.log('🔍 Fetching pending stats with filters:', apiFilters);

        const result = await AttendanceDashboardService.getTodayPendingAttendance(apiFilters);
        const periods = result.data || [];

        // Calculate statistics
        const uniqueSections = new Set(periods.map(p => p.section_id)).size;
        const uniqueSubjects = new Set(periods.map(p => p.course_id)).size;
        const uniqueStaff = new Set(periods.map(p => p.primary_staff_id).filter(Boolean)).size;

        setStats({
          totalPeriods: periods.length,
          pendingPeriods: periods.length, // All fetched periods are pending
          completedPeriods: 0, // For now, we only fetch pending
          sections: uniqueSections,
          subjects: uniqueSubjects,
          staff: uniqueStaff
        });
      } catch (err) {
        console.error('Error fetching pending statistics:', err);
        setError('Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [
    filters,
    userInstitutionId,
    canViewAllInstitutions,
    refreshTrigger
  ]);

  if (loading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className='border-0 shadow-lg'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-4 w-4' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-7 w-16 mb-1' />
              <Skeleton className='h-3 w-32' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className='border-red-200 bg-red-50'>
        <CardContent className='pt-6'>
          <div className='flex items-center gap-2 text-red-600'>
            <AlertTriangle className='h-4 w-4' />
            <span className='text-sm'>{error || 'Unable to load statistics'}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedDate = filters.attendanceDate 
    ? format(new Date(filters.attendanceDate + 'T00:00:00'), 'MMM dd, yyyy')
    : 'Today';

  const completionRate = stats.totalPeriods > 0 
    ? Math.round((stats.completedPeriods / stats.totalPeriods) * 100) 
    : 0;

  const cards = [
    {
      title: 'Total Periods',
      value: stats.totalPeriods,
      description: `Scheduled for ${selectedDate}`,
      icon: Calendar,
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-50 to-blue-100',
      iconBg: 'bg-blue-500'
    },
    {
      title: 'Pending Periods',
      value: stats.pendingPeriods,
      description: 'Awaiting attendance',
      icon: Clock,
      gradient: 'from-orange-500 to-orange-600',
      bgGradient: 'from-orange-50 to-orange-100',
      iconBg: 'bg-orange-500'
    },
    {
      title: 'Active Sections',
      value: stats.sections,
      description: 'With scheduled periods',
      icon: Users,
      gradient: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-50 to-purple-100',
      iconBg: 'bg-purple-500'
    },
    {
      title: 'Subjects',
      value: stats.subjects,
      description: 'Unique courses',
      icon: BookOpen,
      gradient: 'from-green-500 to-green-600',
      bgGradient: 'from-green-50 to-green-100',
      iconBg: 'bg-green-500'
    }
  ];

  return (
    <div className='space-y-4'>
      {/* Header with summary */}
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold'>Attendance Overview</h3>
        <Badge variant='outline' className='px-3 py-1'>
          <TrendingUp className='h-3 w-3 mr-1' />
          {selectedDate}
        </Badge>
      </div>

      {/* Statistics Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {cards.map((card, index) => (
          <Card 
            key={index} 
            className={`border-0 shadow-lg bg-gradient-to-br ${card.bgGradient} hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}
          >
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium text-gray-700'>
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${card.iconBg} text-white shadow-lg`}>
                <card.icon className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-1'>
                <div className={`text-2xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                  {card.value.toLocaleString()}
                </div>
                <p className='text-xs text-gray-600'>
                  {card.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Summary */}
      <Card className='border-0 shadow-md bg-gradient-to-r from-gray-50 to-gray-100'>
        <CardContent className='pt-4'>
          <div className='flex items-center justify-between text-sm'>
            <span className='text-gray-600'>
              {stats.staff} staff members have periods scheduled for {selectedDate.toLowerCase()}
            </span>
            {stats.pendingPeriods > 0 && (
              <Badge variant='secondary' className='bg-orange-100 text-orange-800'>
                {stats.pendingPeriods} periods need attention
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}