'use client';

import { Building2, Users, GraduationCap, Briefcase } from 'lucide-react';
import { WidgetContainer } from '../shared/widget-container';
import { useSystemOverview } from '@/hooks/dashboard/use-admin-dashboard';

interface SystemOverviewWidgetProps {
  isVisible: boolean;
}

export function SystemOverviewWidget({ isVisible }: SystemOverviewWidgetProps) {
  const { data: overview, isLoading, error } = useSystemOverview();

  if (!isVisible) return null;

  const stats = [
    {
      label: 'Institutions',
      value: overview?.total_institutions || 0,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      label: 'Users',
      value: overview?.total_users || 0,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      label: 'Students',
      value: overview?.total_students || 0,
      icon: GraduationCap,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      label: 'Staff',
      value: overview?.total_staff || 0,
      icon: Briefcase,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ];

  return (
    <WidgetContainer
      title='System Overview'
      icon={Building2}
      isLoading={isLoading}
      error={error?.message}
      className='col-span-1 sm:col-span-2 lg:col-span-3'
    >
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className='flex items-center space-x-3 p-3 sm:p-4 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow'
            >
              <div className={`p-2 sm:p-3 rounded-lg ${stat.bgColor}`}>
                <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${stat.color}`} />
              </div>
              <div>
                <p className='text-xs sm:text-sm text-gray-600'>{stat.label}</p>
                <p className='text-xl sm:text-2xl font-bold text-gray-900'>
                  {stat.value.toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetContainer>
  );
}
