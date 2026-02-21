'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  AlertTriangle,
  ClipboardCheck,
  DoorOpen,
  Clock,
  Phone,
  FileText,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useHostelIncidents } from '@/hooks/campus-living/use-hostel-incidents';

export default function SafetyDashboardPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data: incidentData, isLoading } = useHostelIncidents(institutionId);
  const incidents = incidentData?.data || [];

  const openIncidents = incidents.filter((i) => i.status === 'reported' || i.status === 'under_investigation');
  const investigatingCount = incidents.filter((i) => i.status === 'under_investigation').length;

  if (isLoading) {
    return (
      <ContentLayout title="Safety & Compliance">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Safety & Compliance">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety & Compliance</h1>
            <p className="text-muted-foreground">
              Incident management, inspections, and regulatory compliance
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/safety/incidents/new">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Report Incident
            </Link>
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{openIncidents.length}</div>
              <p className="text-xs text-muted-foreground">{investigatingCount} under investigation</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
              <Shield className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">92%</div>
              <p className="text-xs text-muted-foreground">NCPCR / UGC compliant</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Next Inspection</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Mar 5</div>
              <p className="text-xs text-muted-foreground">Fire safety audit</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Anti-Ragging</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">96%</div>
              <p className="text-xs text-muted-foreground">affidavits submitted</p>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Status */}
        <Card>
          <CardHeader>
            <CardTitle>Compliance Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'Anti-Ragging Affidavits', status: 'partial', detail: '402/420 submitted', action: '/campus-living/safety/anti-ragging' },
                { name: 'Fire Safety Inspection', status: 'compliant', detail: 'Last: Jan 2026, Score: 95/100', action: '/campus-living/safety/inspections' },
                { name: 'NCPCR Visitor Register', status: 'compliant', detail: 'Up to date', action: '/campus-living/reports/visitor-register' },
                { name: 'NCPCR Attendance Register', status: 'compliant', detail: 'Daily register maintained', action: '/campus-living/reports/attendance-register' },
                { name: 'Emergency Contact List', status: 'compliant', detail: 'Updated Feb 2026', action: '/campus-living/safety/emergency-contacts' },
                { name: 'Curfew Monitoring', status: 'compliant', detail: 'Active 10 PM - 6 AM', action: '/campus-living/safety/curfew-exceptions' },
              ].map((item) => (
                <Link key={item.name} href={item.action}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {item.status === 'compliant' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : item.status === 'partial' ? (
                        <Clock className="h-5 w-5 text-yellow-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Inspections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Inspections</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/safety/inspections">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'Fire Safety Audit', date: 'Mar 5, 2026', type: 'External', priority: 'high' },
                { name: 'Electrical Safety Check', date: 'Mar 15, 2026', type: 'Internal', priority: 'medium' },
                { name: 'Water Quality Test', date: 'Mar 20, 2026', type: 'External', priority: 'medium' },
              ].map((inspection) => (
                <div key={inspection.name} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">{inspection.name}</p>
                    <p className="text-sm text-muted-foreground">{inspection.date} | {inspection.type}</p>
                  </div>
                  <Badge variant={inspection.priority === 'high' ? 'destructive' : 'secondary'}>
                    {inspection.priority}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'Incidents', desc: 'View and manage safety incidents', href: '/campus-living/safety/incidents', icon: AlertTriangle },
            { title: 'Inspections', desc: 'Schedule and track safety inspections', href: '/campus-living/safety/inspections', icon: ClipboardCheck },
            { title: 'Anti-Ragging', desc: 'Affidavit tracking and compliance', href: '/campus-living/safety/anti-ragging', icon: Shield },
            { title: 'Access Log', desc: 'Gate entry/exit records', href: '/campus-living/safety/access-log', icon: DoorOpen },
            { title: 'Curfew Exceptions', desc: 'Manage curfew exception requests', href: '/campus-living/safety/curfew-exceptions', icon: Clock },
            { title: 'Emergency Contacts', desc: 'Emergency protocol and contacts', href: '/campus-living/safety/emergency-contacts', icon: Phone },
          ].map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <link.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{link.title}</h3>
                    <p className="text-sm text-muted-foreground">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
