'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useHostelAllocation } from '@/hooks/campus-living/use-hostel-allocations';
import {
  ArrowLeft,
  User,
  Building2,
  BedDouble,
  Phone,
  Calendar,
  ArrowRightLeft,
  LogOut,
  Loader2,
  MapPin,
  Heart,
  AlertTriangle,
  CreditCard
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  active: { label: 'Active', variant: 'success' },
  vacated: { label: 'Vacated', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'outline' },
  suspended: { label: 'Suspended', variant: 'destructive' },
};

export default function AllocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: allocation, isLoading } = useHostelAllocation(id);

  if (isLoading || !allocation) {
    return (
      <ContentLayout title="Allocation Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const sCfg = statusConfig[allocation.status] ?? { label: allocation.status, variant: 'outline' as const };

  return (
    <ContentLayout title="Allocation Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: allocation.student.name },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/allocations">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{allocation.student.name}</h1>
                <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {allocation.student.roll_number} &middot; {allocation.student.department}
              </p>
            </div>
          </div>
          {allocation.status === 'active' && (
            <div className="flex gap-2">
              <Button variant="outline">
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Transfer
              </Button>
              <Button variant="destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Vacate
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Room Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Room Assignment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Block</p>
                    <p className="font-medium mt-1">{allocation.block.name}</p>
                    <p className="text-xs text-muted-foreground">{allocation.block.code}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Room</p>
                    <p className="font-medium mt-1">{allocation.room.room_number}</p>
                    <p className="text-xs text-muted-foreground capitalize">{allocation.room.room_type}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Bed</p>
                    <p className="font-medium mt-1">Bed {allocation.bed.bed_number}</p>
                    <p className="text-xs text-muted-foreground capitalize">{allocation.bed.bed_type}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Allocation Type</p>
                    <p className="font-medium mt-1 capitalize">{allocation.allocation_type}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Allocated</p>
                      <p className="font-medium">{allocation.allocation_date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Expected Vacate</p>
                      <p className="font-medium">{allocation.expected_vacate_date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Allocated By</p>
                      <p className="font-medium">{allocation.allocated_by}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Student Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Student Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{allocation.student.phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{allocation.student.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Semester</p>
                    <p className="font-medium">{allocation.student.semester}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Food Preference</p>
                    <p className="font-medium capitalize">{allocation.food_preference.replace('_', ' ')}</p>
                  </div>
                  {allocation.medical_conditions && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" /> Medical Conditions
                      </p>
                      <p className="font-medium">{allocation.medical_conditions}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Allocation History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allocation.history.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{entry.action}</p>
                          <p className="text-xs text-muted-foreground">{entry.date}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.details}</p>
                        <p className="text-xs text-muted-foreground mt-1">By: {entry.by}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Emergency Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{allocation.emergency_contact_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{allocation.emergency_contact_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Relation</p>
                  <p className="font-medium capitalize">{allocation.emergency_contact_relation}</p>
                </div>
              </CardContent>
            </Card>

            {/* Fee Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Fee Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fee Status</span>
                  <Badge variant={allocation.fee_status === 'paid' ? 'success' : 'destructive'} className="capitalize">
                    {allocation.fee_status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Deposit Paid</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(allocation.deposit_paid)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href={`/campus-living/blocks/${allocation.block.id}/rooms/${allocation.room.id}`}>
                    <BedDouble className="mr-2 h-4 w-4" />
                    View Room
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href={`/campus-living/blocks/${allocation.block.id}`}>
                    <Building2 className="mr-2 h-4 w-4" />
                    View Block
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href="/campus-living/leave/new">
                    <Calendar className="mr-2 h-4 w-4" />
                    Apply Leave
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
