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

// Helper to safely access joined Supabase relations
const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';

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

  const alloc = allocation as any;
  const blockName = getJoined(alloc, 'hostel_blocks', 'name');
  const blockCode = getJoined(alloc, 'hostel_blocks', 'code');
  const roomNumber = getJoined(alloc, 'hostel_rooms', 'room_number');
  const roomType = getJoined(alloc, 'hostel_rooms', 'room_type');
  const bedNumber = getJoined(alloc, 'hostel_beds', 'bed_number');
  const bedType = getJoined(alloc, 'hostel_beds', 'bed_type');
  const sCfg = statusConfig[allocation.status] ?? { label: allocation.status, variant: 'outline' as const };

  return (
    <ContentLayout title="Allocation Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: `${blockName} - ${roomNumber}` },
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
                <h1 className="text-2xl font-bold">Allocation Details</h1>
                <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Learner: {allocation.learner_id}
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
                    <p className="font-medium mt-1">{blockName}</p>
                    <p className="text-xs text-muted-foreground">{blockCode}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Room</p>
                    <p className="font-medium mt-1">{roomNumber}</p>
                    <p className="text-xs text-muted-foreground capitalize">{roomType}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Bed</p>
                    <p className="font-medium mt-1">Bed {bedNumber}</p>
                    <p className="text-xs text-muted-foreground capitalize">{bedType}</p>
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
                      <p className="font-medium">{allocation.expected_vacate_date ?? 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Allocated By</p>
                      <p className="font-medium">{allocation.allocated_by ?? 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Allocation Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Additional Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Learner ID</p>
                    <p className="font-medium">{allocation.learner_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Food Preference</p>
                    <p className="font-medium capitalize">{(allocation.food_preference ?? '').replace('_', ' ') || 'N/A'}</p>
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
                  <Link href={`/campus-living/blocks/${allocation.block_id}/rooms/${allocation.room_id}`}>
                    <BedDouble className="mr-2 h-4 w-4" />
                    View Room
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href={`/campus-living/blocks/${allocation.block_id}`}>
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
