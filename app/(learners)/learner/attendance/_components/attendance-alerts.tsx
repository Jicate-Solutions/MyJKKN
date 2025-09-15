'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  AlertCircle,
  XCircle,
  Info,
  X,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import type { AttendanceAlert } from '@/types/learner-attendance';

interface AttendanceAlertsProps {
  alerts: AttendanceAlert[];
  onDismissAlert?: (alertId: string) => void;
  loading?: boolean;
}

export function AttendanceAlerts({ alerts, onDismissAlert, loading = false }: AttendanceAlertsProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className='h-4 w-4' />;
      case 'high':
        return <AlertTriangle className='h-4 w-4' />;
      case 'medium':
        return <AlertCircle className='h-4 w-4' />;
      case 'low':
        return <Info className='h-4 w-4' />;
      default:
        return <Info className='h-4 w-4' />;
    }
  };

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'low_attendance':
        return 'Low Attendance';
      case 'consecutive_absence':
        return 'Consecutive Absence';
      case 'course_critical':
        return 'Course Critical';
      case 'semester_warning':
        return 'Semester Warning';
      default:
        return 'Alert';
    }
  };

  if (loading) {
    return (
      <Card className='animate-pulse'>
        <CardHeader>
          <div className='h-6 bg-gray-200 rounded w-1/3'></div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[...Array(2)].map((_, i) => (
              <div key={i} className='h-16 bg-gray-200 rounded'></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <AlertCircle className='h-5 w-5 text-green-600' />
            Attendance Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className='border-green-200 bg-green-50'>
            <Info className='h-4 w-4 text-green-600' />
            <AlertDescription className='text-green-800'>
              Great job! You have no attendance alerts. Keep up the good work!
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-red-500' />
            Attendance Alerts
            <Badge variant='destructive' className='text-xs'>
              {alerts.length}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {alerts.map((alert) => (
            <Alert
              key={alert.id}
              className={`relative ${
                alert.severity === 'critical' ? 'border-red-500 bg-red-50' :
                alert.severity === 'high' ? 'border-orange-500 bg-orange-50' :
                alert.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                'border-blue-500 bg-blue-50'
              }`}
            >
              <div className='flex items-start gap-3'>
                <div className={`
                  ${alert.severity === 'critical' ? 'text-red-600' :
                    alert.severity === 'high' ? 'text-orange-600' :
                    alert.severity === 'medium' ? 'text-yellow-600' :
                    'text-blue-600'
                  }
                `}>
                  {getSeverityIcon(alert.severity)}
                </div>

                <div className='flex-1 space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <h4 className='font-semibold text-sm'>
                        {alert.title}
                      </h4>
                      <Badge variant={getSeverityColor(alert.severity)} className='text-xs'>
                        {getAlertTypeLabel(alert.type)}
                      </Badge>
                      {alert.course_name && (
                        <Badge variant='outline' className='text-xs'>
                          {alert.course_name}
                        </Badge>
                      )}
                    </div>

                    {onDismissAlert && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => onDismissAlert(alert.id)}
                        className='h-6 w-6 p-0 hover:bg-transparent'
                      >
                        <X className='h-3 w-3' />
                      </Button>
                    )}
                  </div>

                  <AlertDescription className={`
                    ${alert.severity === 'critical' ? 'text-red-800' :
                      alert.severity === 'high' ? 'text-orange-800' :
                      alert.severity === 'medium' ? 'text-yellow-800' :
                      'text-blue-800'
                    }
                  `}>
                    {alert.message}
                  </AlertDescription>

                  {alert.suggested_action && (
                    <div className='bg-white/50 rounded p-2 border'>
                      <p className='text-xs font-medium text-gray-700 mb-1'>
                        Suggested Action:
                      </p>
                      <p className='text-xs text-gray-600'>
                        {alert.suggested_action}
                      </p>
                    </div>
                  )}

                  <div className='flex items-center justify-between text-xs text-gray-500'>
                    <span>
                      {format(new Date(alert.created_at), 'MMM dd, yyyy at hh:mm a')}
                    </span>
                    {alert.course_id && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-auto p-0 text-xs hover:underline'
                      >
                        View Course Details
                        <ExternalLink className='h-3 w-3 ml-1' />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Alert>
          ))}

          {/* Help Text */}
          <div className='pt-4 border-t'>
            <Alert>
              <Info className='h-4 w-4' />
              <AlertDescription className='text-sm'>
                <strong>Need help improving your attendance?</strong>
                <br />
                • Contact your faculty advisor for guidance
                • Review your schedule and plan ahead
                • Set reminders for important classes
                • Consider study groups to stay motivated
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}