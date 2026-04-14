'use client';

import { AttendanceWidget } from '../widgets/student/attendance-widget';
import { TimetableTodayWidget } from '../widgets/student/timetable-today-widget';
import { BillingWidget } from '../widgets/student/billing-widget';
import { MyCelebrationWidget } from '../widgets/student/my-celebration-widget';
import { CelebrationsTodayWidget } from '../widgets/shared/celebrations-today-widget';
import { DashboardSettingsDialog } from '../dashboard-settings-dialog';
import { StreakLevelBar } from '../widgets/student/streak-level-bar';
import { QuickActions } from '../widgets/student/quick-actions';
import { BadgeStrip } from '../widgets/student/badge-strip';
import { useStudentBilling } from '@/hooks/dashboard/use-student-dashboard';

interface StudentDashboardProps {
  userId: string;
  studentId: string;
  sectionId: string;
  role: string;
  visibilityMap: Record<string, boolean>;
}

export default function StudentDashboard({
  userId,
  studentId,
  sectionId,
  role,
  visibilityMap
}: StudentDashboardProps) {
  // Fetch billing to check for outstanding bills (for quick actions)
  const { data: billing } = useStudentBilling(studentId);
  const hasOutstandingBills = (billing?.outstanding_balance ?? 0) > 0;

  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* Dashboard Header with Customize Button */}
      <div className='flex items-center justify-between'>
        <h2 className='text-lg sm:text-xl font-semibold text-foreground'>
          My Dashboard
        </h2>
        <DashboardSettingsDialog userId={userId} role={role} />
      </div>

      {/* Streak & Level Bar — Oura-inspired hero numbers */}
      <StreakLevelBar
        studentId={studentId}
        isVisible={visibilityMap.student_streak_level ?? true}
      />

      {/* Quick Actions — navigation shortcut pills */}
      <QuickActions
        isVisible={visibilityMap.student_quick_actions ?? true}
        hasOutstandingBills={hasOutstandingBills}
      />

      {/* Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6'>
        <AttendanceWidget
          studentId={studentId}
          isVisible={visibilityMap.student_attendance ?? true}
        />

        <TimetableTodayWidget
          studentId={studentId}
          sectionId={sectionId}
          isVisible={visibilityMap.student_timetable_today ?? true}
        />

        <BillingWidget
          studentId={studentId}
          isVisible={visibilityMap.student_billing ?? true}
        />

        <MyCelebrationWidget
          userId={userId}
          isVisible={visibilityMap.my_celebration_countdown ?? true}
        />

        {/* This spans 2 columns on tablet+ */}
        <CelebrationsTodayWidget
          userId={userId}
          role={role}
          isVisible={visibilityMap.celebrations_today ?? true}
        />
      </div>

      {/* Badge Strip — recently earned PDE badges */}
      <BadgeStrip
        studentId={studentId}
        isVisible={visibilityMap.student_badges ?? true}
      />
    </div>
  );
}
