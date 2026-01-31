'use client';

import { SystemOverviewWidget } from '../widgets/admin/system-overview-widget';
import { RecentActivityWidget } from '../widgets/admin/recent-activity-widget';
import { AtRiskStudentsWidget } from '../widgets/admin/at-risk-students-widget';
import { CelebrationsTodayWidget } from '../widgets/shared/celebrations-today-widget';
import { DashboardSettingsDialog } from '../dashboard-settings-dialog';
import { ADMIN_WIDGETS } from '../widget-registry';

interface AdminDashboardProps {
  userId: string;
  role: string;
  visibilityMap: Record<string, boolean>;
}

export default function AdminDashboard({
  userId,
  role,
  visibilityMap
}: AdminDashboardProps) {
  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* Dashboard Header with Customize Button */}
      <div className='flex items-center justify-between'>
        <h2 className='text-lg sm:text-xl font-semibold text-foreground'>
          Admin Overview
        </h2>
        <DashboardSettingsDialog userId={userId} role={role} />
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6'>
        <SystemOverviewWidget
          isVisible={visibilityMap.admin_system_overview ?? true}
        />

        <RecentActivityWidget
          isVisible={visibilityMap.admin_recent_activity ?? true}
        />

        <AtRiskStudentsWidget
          isVisible={visibilityMap.admin_at_risk_students ?? true}
        />

        <CelebrationsTodayWidget
          userId={userId}
          role={role}
          isVisible={visibilityMap.celebrations_today ?? true}
        />
      </div>
    </div>
  );
}
