'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertTriangle,
  Bell,
  Clock,
  CreditCard,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  Calendar,
  TrendingUp,
  FileText,
  ExternalLink
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { BillingAlert, BillingNotification } from '@/types/learner-billing';

interface BillingAlertsProps {
  alerts: BillingAlert[];
  notifications: BillingNotification[];
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
}

export function BillingAlerts({
  alerts,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead
}: BillingAlertsProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['critical']);

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
  const warningAlerts = alerts.filter(alert => alert.severity === 'warning');
  const infoAlerts = alerts.filter(alert => alert.severity === 'info');
  const unreadNotifications = notifications.filter(notif => !notif.is_read);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'overdue_payment':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'payment_reminder':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'payment_due':
        return <Calendar className="h-5 w-5 text-orange-500" />;
      case 'partial_payment':
        return <DollarSign className="h-5 w-5 text-blue-500" />;
      case 'payment_success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'discount_available':
        return <TrendingUp className="h-5 w-5 text-purple-500" />;
      case 'document_required':
        return <FileText className="h-5 w-5 text-gray-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants = {
      critical: 'destructive',
      warning: 'secondary',
      info: 'outline'
    } as const;

    return (
      <Badge variant={variants[severity as keyof typeof variants]}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'payment_reminder':
        return <Bell className="h-4 w-4 text-yellow-500" />;
      case 'payment_confirmation':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'bill_generated':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'overdue_notice':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const AlertSection = ({
    title,
    alerts: sectionAlerts,
    severity,
    icon
  }: {
    title: string;
    alerts: BillingAlert[];
    severity: string;
    icon: React.ReactNode;
  }) => {
    if (sectionAlerts.length === 0) return null;

    const isExpanded = expandedSections.includes(severity);

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleSection(severity)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg border">
            <div className="flex items-center gap-3">
              {icon}
              <div className="text-left">
                <h3 className="font-medium">{title}</h3>
                <p className="text-sm text-gray-600">{sectionAlerts.length} alerts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getSeverityBadge(severity)}
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 p-4 pt-0">
            {sectionAlerts.map((alert) => (
              <Alert
                key={alert.id}
                variant={severity === 'critical' ? 'destructive' : 'default'}
                className="border-l-4 border-l-current"
              >
                <div className="flex items-start gap-3">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{alert.title}</h4>
                      <span className="text-xs text-gray-500">
                        {formatDate(alert.created_at)}
                      </span>
                    </div>
                    <AlertDescription className="mb-3">
                      {alert.message}
                    </AlertDescription>
                    {alert.amount && (
                      <div className="text-sm font-medium text-red-600 mb-2">
                        Amount: {formatCurrency(alert.amount)}
                      </div>
                    )}
                    {alert.due_date && (
                      <div className="text-sm text-gray-600 mb-3">
                        Due: {formatDate(alert.due_date)}
                      </div>
                    )}
                    {alert.action_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={alert.action_url} className="inline-flex items-center gap-2">
                          {alert.action_text || 'Take Action'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-6">
      {/* Notifications Section */}
      {unreadNotifications.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                Recent Notifications
                <Badge variant="destructive" className="ml-2">
                  {unreadNotifications.length} new
                </Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkAllAsRead}
              >
                Mark All as Read
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {unreadNotifications.slice(0, 5).map((notification) => (
              <div
                key={notification.id}
                className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-500"
              >
                {getNotificationIcon(notification.type)}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMarkAsRead(notification.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-700">{notification.message}</p>
                  <span className="text-xs text-gray-500">
                    {formatDate(notification.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alerts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Billing Alerts
            <Badge variant="outline" className="ml-2">
              {alerts.length} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">All Clear!</h3>
              <p className="text-gray-600">
                No billing alerts at this time. Your account is in good standing.
              </p>
            </div>
          ) : (
            <>
              <AlertSection
                title="Critical Alerts"
                alerts={criticalAlerts}
                severity="critical"
                icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
              />

              <AlertSection
                title="Warnings"
                alerts={warningAlerts}
                severity="warning"
                icon={<Clock className="h-5 w-5 text-yellow-500" />}
              />

              <AlertSection
                title="Information"
                alerts={infoAlerts}
                severity="info"
                icon={<Info className="h-5 w-5 text-blue-500" />}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Alert Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {criticalAlerts.length}
                </div>
                <div className="text-sm text-gray-600">Critical</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {warningAlerts.length}
                </div>
                <div className="text-sm text-gray-600">Warnings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {infoAlerts.length}
                </div>
                <div className="text-sm text-gray-600">Info</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}