'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Users,
  UserPlus,
  Shield,
  ClipboardCheck,
  IndianRupee,
  ArrowRight,
  FileText,
} from 'lucide-react';

export default function ReportsPage() {
  const reports = [
    {
      title: 'Occupancy Report',
      desc: 'Room-wise occupancy status with vacancy details',
      href: '/campus-living/reports/occupancy',
      icon: Building2,
      compliance: null,
    },
    {
      title: 'NCPCR Attendance Register',
      desc: 'Daily attendance register as per NCPCR guidelines',
      href: '/campus-living/reports/attendance-register',
      icon: Users,
      compliance: 'NCPCR',
    },
    {
      title: 'NCPCR Visitor Register',
      desc: 'Visitor log as per NCPCR requirements',
      href: '/campus-living/reports/visitor-register',
      icon: UserPlus,
      compliance: 'NCPCR',
    },
    {
      title: 'Anti-Ragging Compliance',
      desc: 'UGC annual compliance report for anti-ragging measures',
      href: '/campus-living/reports/anti-ragging-compliance',
      icon: Shield,
      compliance: 'UGC',
    },
    {
      title: 'Safety Audit Report',
      desc: 'Annual safety audit report with inspection summaries',
      href: '/campus-living/reports/safety-audit',
      icon: ClipboardCheck,
      compliance: null,
    },
    {
      title: 'Fee Collection Report',
      desc: 'Fee collection status and defaulter list',
      href: '/campus-living/reports/fee-collection',
      icon: IndianRupee,
      compliance: null,
    },
  ];

  return (
    <ContentLayout title="Reports">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            Generate regulatory compliance and operational reports
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <Link key={report.href} href={report.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <report.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      {report.compliance && (
                        <Badge variant="outline" className="text-xs">{report.compliance}</Badge>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1">{report.title}</h3>
                  <p className="text-sm text-muted-foreground">{report.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
