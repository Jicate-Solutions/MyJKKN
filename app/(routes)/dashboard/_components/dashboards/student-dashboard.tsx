'use client';

import { AttendanceWidget } from '../widgets/student/attendance-widget';
import { CelebrationsTodayWidget } from '../widgets/shared/celebrations-today-widget';

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
  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6'>
        <AttendanceWidget
          studentId={studentId}
          isVisible={visibilityMap.student_attendance ?? true}
        />

        {/* TODO: Add remaining widgets in subsequent tasks */}
        {/* - TimetableTodayWidget */}
        {/* - BillingWidget */}
        {/* - MyCelebrationWidget */}

        {/* This spans 2 columns on tablet+ */}
        <CelebrationsTodayWidget
          userId={userId}
          role={role}
          isVisible={visibilityMap.celebrations_today ?? true}
        />
      </div>
    </div>
  );
}
