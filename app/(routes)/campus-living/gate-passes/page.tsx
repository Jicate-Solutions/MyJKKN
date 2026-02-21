'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  Search,
  Loader2,
  DoorOpen,
  Clock,
  AlertTriangle,
  CheckCircle2,
  QrCode,
  MapPin,
  ArrowRight,
  Download
} from 'lucide-react';

// Placeholder data
const useGatePasses = (institutionId: string | null) => {
  return {
    data: [
      { id: 'gp1', pass_number: 'GP-20260221-0001', student_name: 'Rahul Kumar', roll: 'CS2024001', block: 'Boys Hostel A', pass_type: 'regular_out', out_time: '2026-02-21 14:30', expected_return: '2026-02-21 18:00', actual_return: null, destination: 'City Market', status: 'active', parent_notified: true },
      { id: 'gp2', pass_number: 'GP-20260221-0002', student_name: 'Priya Sharma', roll: 'CS2024008', block: 'Girls Hostel A', pass_type: 'overnight', out_time: '2026-02-21 16:00', expected_return: '2026-02-22 08:00', actual_return: null, destination: 'Home - Coimbatore', status: 'active', parent_notified: true },
      { id: 'gp3', pass_number: 'GP-20260221-0003', student_name: 'Arjun Patel', roll: 'EC2024015', block: 'Boys Hostel A', pass_type: 'regular_out', out_time: '2026-02-21 10:00', expected_return: '2026-02-21 13:00', actual_return: '2026-02-21 12:45', destination: 'Hospital', status: 'returned', parent_notified: false },
      { id: 'gp4', pass_number: 'GP-20260221-0004', student_name: 'Meera Jain', roll: 'ME2024022', block: 'Girls Hostel A', pass_type: 'regular_out', out_time: '2026-02-21 09:00', expected_return: '2026-02-21 15:00', actual_return: null, destination: 'Shopping', status: 'overdue', parent_notified: true },
      { id: 'gp5', pass_number: 'GP-20260220-0008', student_name: 'Vikram Singh', roll: 'CE2023010', block: 'Boys Hostel B', pass_type: 'regular_out', out_time: '2026-02-20 11:00', expected_return: '2026-02-20 17:00', actual_return: '2026-02-20 16:30', destination: 'Bank', status: 'returned', parent_notified: false },
      { id: 'gp6', pass_number: 'GP-20260220-0009', student_name: 'Karthik R', roll: 'CS2023005', block: 'Boys Hostel A', pass_type: 'overnight', out_time: '2026-02-20 17:00', expected_return: '2026-02-21 08:00', actual_return: '2026-02-21 07:45', destination: 'Relative house', status: 'returned', parent_notified: true },
      { id: 'gp7', pass_number: 'GP-20260221-0005', student_name: 'Deepa M', roll: 'IT2024003', block: 'Girls Hostel B', pass_type: 'emergency', out_time: '2026-02-21 08:00', expected_return: '2026-02-21 20:00', actual_return: null, destination: 'Hospital - Emergency', status: 'active', parent_notified: true },
      { id: 'gp8', pass_number: 'GP-20260219-0012', student_name: 'Anil K', roll: 'ME2024008', block: 'Boys Hostel B', pass_type: 'regular_out', out_time: '2026-02-19 14:00', expected_return: '2026-02-19 18:00', actual_return: null, destination: 'Unknown', status: 'overdue', parent_notified: true },
    ],
    isLoading: false,
    error: null,
  };
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  issued: { label: 'Issued', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  returned: { label: 'Returned', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

const passTypeConfig: Record<string, { label: string; color: string }> = {
  regular_out: { label: 'Regular', color: 'bg-blue-100 text-blue-800' },
  overnight: { label: 'Overnight', color: 'bg-purple-100 text-purple-800' },
  emergency: { label: 'Emergency', color: 'bg-red-100 text-red-800' },
  visitor_accompanied: { label: 'Visitor', color: 'bg-green-100 text-green-800' },
};

export default function GatePassesPage() {
  const { profile } = useAuth();
  const { data: passes, isLoading } = useGatePasses(profile?.institution_id ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('active');

  const getFilteredPasses = (tab: string) => {
    return passes?.filter((p) => {
      const matchesSearch =
        p.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.roll.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.pass_number.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTab =
        tab === 'all' ? true :
        tab === 'active' ? (p.status === 'active' || p.status === 'issued') :
        tab === 'overdue' ? p.status === 'overdue' :
        tab === 'returned' ? p.status === 'returned' :
        true;
      return matchesSearch && matchesTab;
    }) ?? [];
  };

  const activeCount = passes?.filter((p) => p.status === 'active' || p.status === 'issued').length ?? 0;
  const overdueCount = passes?.filter((p) => p.status === 'overdue').length ?? 0;

  if (isLoading) {
    return (
      <ContentLayout title="Gate Passes">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Gate Passes">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Gate Passes</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track student exit and entry with QR-based gate pass system
            </p>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Overdue Alert */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-800 dark:text-red-200">
                {overdueCount} Overdue Gate Pass{overdueCount > 1 ? 'es' : ''}
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Students haven&apos;t returned by expected time. Parents have been notified.
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-red-200 text-red-700" onClick={() => setActiveTab('overdue')}>
              View Overdue
            </Button>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DoorOpen className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Currently Out</p>
              </div>
            </CardContent>
          </Card>
          <Card className={overdueCount > 0 ? 'border-red-200' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{passes?.filter((p) => p.status === 'returned').length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Returned Today</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <QrCode className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{passes?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Passes</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, roll number, pass number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger value="overdue" className={overdueCount > 0 ? 'text-red-600' : ''}>
              Overdue ({overdueCount})
            </TabsTrigger>
            <TabsTrigger value="returned">Returned</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          {['active', 'overdue', 'returned', 'all'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pass No.</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Block</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Out Time</TableHead>
                        <TableHead>Expected Return</TableHead>
                        <TableHead>Actual Return</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredPasses(tab).map((pass) => {
                        const sCfg = statusConfig[pass.status] ?? { label: pass.status, variant: 'outline' as const };
                        const ptCfg = passTypeConfig[pass.pass_type] ?? { label: pass.pass_type, color: '' };
                        return (
                          <TableRow key={pass.id} className={pass.status === 'overdue' ? 'bg-red-50/50' : ''}>
                            <TableCell className="font-mono text-xs">{pass.pass_number}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{pass.student_name}</p>
                                <p className="text-xs text-muted-foreground">{pass.roll}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{pass.block}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${ptCfg.color}`}>{ptCfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{pass.out_time}</TableCell>
                            <TableCell className="text-sm">{pass.expected_return}</TableCell>
                            <TableCell className="text-sm">
                              {pass.actual_return ?? (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/campus-living/gate-passes/${pass.id}`}>
                                  View
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {getFilteredPasses(tab).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No gate passes found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ContentLayout>
  );
}
