'use client';

import { Activity, Clock } from 'lucide-react';
import { WidgetContainer } from '../shared/widget-container';
import { useRecentActivity } from '@/hooks/dashboard/use-admin-dashboard';
import { formatDistanceToNow } from 'date-fns';

interface RecentActivityWidgetProps {
  isVisible: boolean;
}

export function RecentActivityWidget({ isVisible }: RecentActivityWidgetProps) {
  const { data: activities = [], isLoading, error } = useRecentActivity(10);

  if (!isVisible) return null;

  const getActivityIcon = (type: string) => {
    // You can expand this with more activity types
    return Activity;
  };

  const getActivityColor = (type: string) => {
    const colors: Record<string, string> = {
      user_login: 'text-blue-600 bg-blue-50',
      user_logout: 'text-gray-600 bg-gray-50',
      create: 'text-green-600 bg-green-50',
      update: 'text-yellow-600 bg-yellow-50',
      delete: 'text-red-600 bg-red-50',
    };
    return colors[type] || 'text-gray-600 bg-gray-50';
  };

  return (
    <WidgetContainer
      title='Recent Activity'
      icon={Activity}
      isLoading={isLoading}
      error={error?.message || 'Failed to load recent activity'}
      className='col-span-1 sm:col-span-2 lg:col-span-1'
    >
      <div className='space-y-3'>
        {activities.length === 0 ? (
          <div className='text-center py-6 text-gray-500'>
            <Activity className='h-8 w-8 mx-auto mb-2 opacity-50' />
            <p className='text-sm'>No recent activity</p>
          </div>
        ) : (
          activities.map((activity) => {
            const Icon = getActivityIcon(activity.activity_type);
            const colorClass = getActivityColor(activity.activity_type);

            return (
              <div
                key={activity.id}
                className='flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors'
              >
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Icon className='h-4 w-4' />
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium text-gray-900 truncate'>
                    {activity.description}
                  </p>
                  <p className='text-xs text-gray-500 truncate'>
                    {activity.user_name}
                  </p>
                  <div className='flex items-center mt-1 text-xs text-gray-400'>
                    <Clock className='h-3 w-3 mr-1' />
                    {formatDistanceToNow(new Date(activity.timestamp), {
                      addSuffix: true
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </WidgetContainer>
  );
}
