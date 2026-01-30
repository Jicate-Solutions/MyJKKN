'use client';

import { AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';
import { useAtRiskStudents } from '@/hooks/dashboard/use-admin-dashboard';
import { Badge } from '@/components/ui/badge';
import { WidgetContainer } from '../shared/widget-container';

interface AtRiskStudentsWidgetProps {
  isVisible: boolean;
}

export function AtRiskStudentsWidget({ isVisible }: AtRiskStudentsWidgetProps) {
  const { data: students = [], isLoading, error } = useAtRiskStudents(10);

  if (!isVisible) return null;

  const getRiskBadgeVariant = (level: 'high' | 'medium' | 'low') => {
    const variants: Record<string, 'destructive' | 'default' | 'secondary'> = {
      high: 'destructive',
      medium: 'default',
      low: 'secondary'
    };
    return variants[level] || 'default';
  };

  const getRiskColor = (level: 'high' | 'medium' | 'low') => {
    const colors: Record<string, string> = {
      high: 'text-red-600',
      medium: 'text-yellow-600',
      low: 'text-blue-600'
    };
    return colors[level] || 'text-gray-600';
  };

  return (
    <WidgetContainer
      title='At-Risk Students'
      icon={AlertTriangle}
      isLoading={isLoading}
      error={error?.message}
      className='col-span-1 sm:col-span-2 lg:col-span-2'
    >
      <div className='space-y-3'>
        {students.length === 0 ? (
          <div className='text-center py-6 text-gray-500'>
            <AlertTriangle className='h-8 w-8 mx-auto mb-2 opacity-50' />
            <p className='text-sm'>No at-risk students found</p>
          </div>
        ) : (
          students.map((student) => (
            <div
              key={student.id}
              className='flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors'
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center space-x-2 mb-1'>
                  <p className='text-sm font-medium text-gray-900 truncate'>
                    {student.name}
                  </p>
                  <Badge variant={getRiskBadgeVariant(student.risk_level)}>
                    {student.risk_level}
                  </Badge>
                </div>
                <p className='text-xs text-gray-500 truncate'>
                  {student.student_id} • {student.institution_name}
                </p>
                <p className='text-xs text-gray-400 truncate'>
                  {student.section_name}
                </p>

                <div className='flex items-center space-x-4 mt-2'>
                  <div className='flex items-center space-x-1'>
                    <TrendingDown className={`h-3 w-3 ${getRiskColor(student.risk_level)}`} />
                    <span className='text-xs text-gray-600'>
                      {student.attendance_percentage}% attendance
                    </span>
                  </div>
                  {student.pending_fees > 0 && (
                    <div className='flex items-center space-x-1'>
                      <DollarSign className='h-3 w-3 text-red-600' />
                      <span className='text-xs text-gray-600'>
                        ${student.pending_fees.toFixed(2)} pending
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  );
}
