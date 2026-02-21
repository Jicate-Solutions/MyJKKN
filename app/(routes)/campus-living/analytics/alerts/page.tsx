'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertTriangle, CheckCircle2, Clock, Settings } from 'lucide-react';

export default function AlertsPage() {
  const alerts = [
    { id: '1', title: 'Block D plumbing SLA breach', severity: 'critical', domain: 'Maintenance', triggered: '2026-02-21 09:00 AM', status: 'active', detail: '3 plumbing requests exceeded 24-hour SLA in Block D' },
    { id: '2', title: 'Low mess rating alert', severity: 'warning', domain: 'Mess', triggered: '2026-02-20 08:00 PM', status: 'active', detail: 'Dinner rating dropped below 3.0 for 3 consecutive days' },
    { id: '3', title: 'Attendance dip - Block B', severity: 'warning', domain: 'Attendance', triggered: '2026-02-20 11:00 PM', status: 'active', detail: 'Night attendance fell below 85% in Block B' },
    { id: '4', title: 'Fire extinguisher expiry', severity: 'info', domain: 'Safety', triggered: '2026-02-18 10:00 AM', status: 'acknowledged', detail: '5 extinguishers in Block A expire within 30 days' },
    { id: '5', title: 'Fee collection below target', severity: 'warning', domain: 'Fees', triggered: '2026-02-15 09:00 AM', status: 'resolved', detail: 'February collection at 60% (target: 70% by mid-month)' },
  ];

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Critical</Badge>;
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Warning</Badge>;
      case 'info': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Info</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'acknowledged': return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'resolved': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      default: return <Bell className="h-5 w-5" />;
    }
  };

  return (
    <ContentLayout title="Risk Alerts">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Active Risk Alerts</h1>
            <p className="text-muted-foreground">Real-time alerts based on configured thresholds and anomaly detection</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/campus-living/analytics/alert-rules">
              <Settings className="mr-2 h-4 w-4" />
              Configure Rules
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active Alerts</p>
              <p className="text-2xl font-bold text-red-600">{alerts.filter(a => a.status === 'active').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Acknowledged</p>
              <p className="text-2xl font-bold text-yellow-600">{alerts.filter(a => a.status === 'acknowledged').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Resolved (this week)</p>
              <p className="text-2xl font-bold text-green-600">{alerts.filter(a => a.status === 'resolved').length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert.id} className={alert.status === 'active' ? 'border-l-4 border-l-red-500' : alert.status === 'acknowledged' ? 'border-l-4 border-l-yellow-500' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {getStatusIcon(alert.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{alert.title}</h4>
                      {getSeverityBadge(alert.severity)}
                      <Badge variant="outline">{alert.domain}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{alert.detail}</p>
                    <p className="text-xs text-muted-foreground">Triggered: {alert.triggered}</p>
                  </div>
                  {alert.status === 'active' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Acknowledge</Button>
                      <Button size="sm">Take Action</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
