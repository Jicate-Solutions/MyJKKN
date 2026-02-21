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
} from 'lucide-react';

interface VisitorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function VisitorDetailPage({ params }: VisitorDetailPageProps) {
  const { id } = use(params);

  // TODO: Replace with actual hook
  // const { data: visitor, isLoading } = useHostelVisitor(id);

  const visitor = {
    id,
    name: 'Mr. Ramesh Kumar',
    phone: '+91 98765 43210',
    id_type: 'Aadhaar',
    id_number: 'XXXX-XXXX-1234',
    relationship: 'Parent',
    visiting_student: 'Arun Kumar',
    student_roll: 'CS2024001',
    block: 'Block A',
    room: '101',
    purpose: 'Parent visit',
    vehicle_number: 'TN 72 AB 1234',
    check_in: '2026-02-21 10:30 AM',
    check_out: null,
    status: 'checked_in',
    num_visitors: 2,
    notes: 'Accompanied by mother. Carrying food items for student.',
    previous_visits: [
      { date: '2026-01-15', check_in: '11:00 AM', check_out: '4:00 PM' },
      { date: '2025-12-20', check_in: '10:00 AM', check_out: '3:30 PM' },
    ],
  };

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
              <h1 className="text-2xl font-bold">{visitor.name}</h1>
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
              <Button variant="outline">
                <LogOut className="mr-2 h-4 w-4" />
                Check-out
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
                  <p className="font-medium">{visitor.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{visitor.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">ID Proof</p>
                  <p className="font-medium">{visitor.id_type} - {visitor.id_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Relationship</p>
                  <p className="font-medium">{visitor.relationship}</p>
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
                  <p className="text-sm text-muted-foreground">Visiting Student</p>
                  <p className="font-medium">{visitor.visiting_student} ({visitor.student_roll})</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{visitor.block} - Room {visitor.room}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Check-in Time</p>
                  <p className="font-medium">{visitor.check_in}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Check-out Time</p>
                  <p className="font-medium">{visitor.check_out || 'Still inside'}</p>
                </div>
              </div>
              {visitor.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted p-3 rounded-lg">{visitor.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Previous Visits */}
        <Card>
          <CardHeader>
            <CardTitle>Previous Visits</CardTitle>
          </CardHeader>
          <CardContent>
            {visitor.previous_visits.length > 0 ? (
              <div className="space-y-3">
                {visitor.previous_visits.map((visit, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="font-medium">{visit.date}</span>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>In: {visit.check_in}</span>
                      <span>Out: {visit.check_out}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No previous visits recorded</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
