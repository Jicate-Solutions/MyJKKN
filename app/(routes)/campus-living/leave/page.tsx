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
import { useHostelLeaveRequests } from '@/hooks/campus-living/use-hostel-leave';
import {
  Plus,
  Search,
  Loader2,
  CalendarOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Download,
  User
} from 'lucide-react';


const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; icon: React.ReactNode }> = {
  draft: { label: 'Draft', variant: 'outline', icon: <Calendar className="h-3.5 w-3.5" /> },
  pending_parent: { label: 'Pending Parent', variant: 'default', icon: <Clock className="h-3.5 w-3.5" /> },
  pending_warden: { label: 'Pending Warden', variant: 'default', icon: <Clock className="h-3.5 w-3.5" /> },
  pending_chief: { label: 'Pending Chief', variant: 'default', icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: 'Approved', variant: 'success', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected: { label: 'Rejected', variant: 'destructive', icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: <XCircle className="h-3.5 w-3.5" /> },
  expired: { label: 'Expired', variant: 'outline', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
};

const leaveTypeConfig: Record<string, { label: string; color: string }> = {
  home_visit: { label: 'Home Visit', color: 'bg-blue-100 text-blue-800' },
  weekend: { label: 'Weekend', color: 'bg-green-100 text-green-800' },
  vacation: { label: 'Vacation', color: 'bg-purple-100 text-purple-800' },
  emergency: { label: 'Emergency', color: 'bg-red-100 text-red-800' },
  medical: { label: 'Medical', color: 'bg-orange-100 text-orange-800' },
  academic: { label: 'Academic', color: 'bg-indigo-100 text-indigo-800' },
  night_out: { label: 'Night Out', color: 'bg-amber-100 text-amber-800' },
};

export default function LeaveRequestsPage() {
  const { profile } = useAuth();
  const { data: requestsData, isLoading } = useHostelLeaveRequests(profile?.institution_id ?? '');
  const requests = (requestsData as any)?.data ?? [] as any[];
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  const getFilteredRequests = (tab: string) => {
    return requests.filter((r: any) => {
      const matchesSearch =
        ((r as any).learner?.full_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.learner_id ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTab =
        tab === 'all' ? true :
        tab === 'pending' ? r.status.startsWith('pending') :
        tab === 'approved' ? r.status === 'approved' :
        tab === 'rejected' ? r.status === 'rejected' || r.status === 'cancelled' :
        true;
      return matchesSearch && matchesTab;
    }) ?? [];
  };

  const pendingCount = requests?.filter((r) => r.status.startsWith('pending')).length ?? 0;
  const approvedCount = requests?.filter((r) => r.status === 'approved').length ?? 0;

  if (isLoading) {
    return (
      <ContentLayout title="Leave Requests">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Leave Requests">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Leave Requests' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Leave Requests</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage hostel leave requests with parent consent and warden approval
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/leave/new">
              <Plus className="mr-2 h-4 w-4" />
              New Leave Request
            </Link>
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CalendarOff className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{requests?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total This Month</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{requests?.filter((r) => r.leave_type === 'emergency').length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Emergency</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          {['pending', 'approved', 'rejected', 'all'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredRequests(tab).map((req) => {
                        const sCfg = statusConfig[req.status] ?? { label: req.status, variant: 'outline' as const, icon: null };
                        const ltCfg = leaveTypeConfig[req.leave_type] ?? { label: req.leave_type, color: '' };
                        return (
                          <TableRow key={req.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{(req as any).learner?.full_name ?? 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground">{req.learner_id?.slice(0, 8) ?? ''} &middot; {(req as any).block?.name ?? ''}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${ltCfg.color}`}>{ltCfg.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <p>{req.from_date}</p>
                                <p className="text-xs text-muted-foreground">to {req.to_date}</p>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{req.destination}</TableCell>
                            <TableCell>
                              <Badge
                                variant={req.parent_consent_status === 'approved' ? 'success' : req.parent_consent_status === 'rejected' ? 'destructive' : req.parent_consent_status === 'not_required' ? 'outline' : 'default'}
                                className="text-xs"
                              >
                                {req.parent_consent_status === 'not_required' ? 'N/A' : req.parent_consent_status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={sCfg.variant} className="flex items-center gap-1 w-fit">
                                {sCfg.icon}
                                {sCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/campus-living/leave/${req.id}`}>
                                  View
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {getFilteredRequests(tab).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No leave requests found
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
