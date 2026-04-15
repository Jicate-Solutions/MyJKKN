'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  LogOut,
  User,
  Phone,
  CreditCard,
  MapPin,
  Clock,
  Car,
  Loader2,
} from 'lucide-react';
import { useHostelVisitor, useCheckOutVisitor } from '@/hooks/campus-living/use-hostel-visitors';

interface VisitorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function VisitorDetailPage({ params }: VisitorDetailPageProps) {
  const { id } = use(params);

  const { data: visitor, isLoading } = useHostelVisitor(id);
  const checkOutMutation = useCheckOutVisitor();

  if (isLoading || !visitor) {
    return (
      <ContentLayout title="Visitor Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Visitor Details">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/visitors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{visitor.visitor_name}</h1>
              <p className="text-muted-foreground">Visitor ID: {visitor.id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge
              className={
                visitor.status === 'checked_in'
                  ? 'bg-green-100 text-green-800 hover:bg-green-100'
                  : ''
              }
              variant={visitor.status === 'checked_out' ? 'secondary' : 'default'}
            >
              {visitor.status === 'checked_in' ? 'Currently Inside' : 'Checked Out'}
            </Badge>
            {visitor.status === 'checked_in' && (
              <Button
                variant="outline"
                disabled={checkOutMutation.isPending}
                onClick={() => checkOutMutation.mutate({ id: visitor.id })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {checkOutMutation.isPending ? 'Checking out...' : 'Check-out'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Visitor Info */}
          <Card>
            <CardHeader>
              <CardTitle>Visitor Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{visitor.visitor_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{visitor.visitor_phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">ID Proof</p>
                  <p className="font-medium">{visitor.id_proof_type || 'N/A'} {visitor.id_proof_number ? `- ${visitor.id_proof_number}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Relationship</p>
                  <p className="font-medium">{visitor.visitor_relationship}</p>
                </div>
              </div>
              {visitor.vehicle_number && (
                <div className="flex items-center gap-3">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="font-medium">{visitor.vehicle_number}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Visit Info */}
          <Card>
            <CardHeader>
              <CardTitle>Visit Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Purpose</p>
                  <p className="font-medium">{visitor.purpose}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Meeting Location</p>
                  <p className="font-medium">{visitor.meeting_location}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Check-in Time</p>
                  <p className="font-medium">{visitor.check_in_time ? new Date(visitor.check_in_time).toLocaleString() : '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Check-out Time</p>
                  <p className="font-medium">{visitor.check_out_time ? new Date(visitor.check_out_time).toLocaleString() : 'Still inside'}</p>
                </div>
              </div>
              {visitor.items_brought && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Items Brought</p>
                  <p className="text-sm bg-muted p-3 rounded-lg">{visitor.items_brought}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
