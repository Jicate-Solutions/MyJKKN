'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  ShieldCheck,
  Phone,
  Calendar,
  Plus,
  Loader2,
  Moon,
  Sun,
  Clock,
  Home,
  UserCog
} from 'lucide-react';

// Placeholder data
const useBlockWardens = (blockId: string) => {
  return {
    data: [
      {
        id: 'w1',
        name: 'Dr. Rajesh Kumar',
        designation: 'warden',
        phone: '+91 98765 11111',
        email: 'rajesh.kumar@jkkn.ac.in',
        is_residential: true,
        shift: 'full_time',
        assigned_floors: [0, 1, 2, 3],
        assigned_at: '2024-07-01',
        is_active: true,
      },
      {
        id: 'w2',
        name: 'Mr. Arun Singh',
        designation: 'deputy_warden',
        phone: '+91 98765 22222',
        email: 'arun.singh@jkkn.ac.in',
        is_residential: false,
        shift: 'day',
        assigned_floors: [0, 1],
        assigned_at: '2025-01-15',
        is_active: true,
      },
      {
        id: 'w3',
        name: 'Mr. Karthik Rajan',
        designation: 'floor_supervisor',
        phone: '+91 98765 33333',
        email: 'karthik.rajan@jkkn.ac.in',
        is_residential: false,
        shift: 'day',
        assigned_floors: [2, 3],
        assigned_at: '2025-06-01',
        is_active: true,
      },
      {
        id: 'w4',
        name: 'Mr. Ravi Verma',
        designation: 'night_watcher',
        phone: '+91 98765 44444',
        email: 'ravi.verma@jkkn.ac.in',
        is_residential: true,
        shift: 'night',
        assigned_floors: [0, 1, 2, 3],
        assigned_at: '2025-03-10',
        is_active: true,
      },
    ],
    isLoading: false,
    error: null,
  };
};

const designationConfig: Record<string, { label: string; color: string }> = {
  chief_warden: { label: 'Chief Warden', color: 'bg-purple-100 text-purple-800' },
  warden: { label: 'Warden', color: 'bg-blue-100 text-blue-800' },
  deputy_warden: { label: 'Deputy Warden', color: 'bg-indigo-100 text-indigo-800' },
  floor_supervisor: { label: 'Floor Supervisor', color: 'bg-green-100 text-green-800' },
  night_watcher: { label: 'Night Watcher', color: 'bg-amber-100 text-amber-800' },
};

const shiftIcons: Record<string, React.ReactNode> = {
  day: <Sun className="h-3.5 w-3.5" />,
  night: <Moon className="h-3.5 w-3.5" />,
  full_time: <Clock className="h-3.5 w-3.5" />,
};

const floorLabels = ['Ground', '1st', '2nd', '3rd', '4th', '5th'];

export default function BlockWardensPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: wardens, isLoading } = useBlockWardens(id);

  if (isLoading) {
    return (
      <ContentLayout title="Wardens">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Warden Assignments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: 'Block Details', href: `/campus-living/blocks/${id}` },
          { label: 'Wardens' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/campus-living/blocks/${id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Warden Assignments</h1>
              <p className="text-sm text-muted-foreground">
                Manage warden and staff assignments for this block
              </p>
            </div>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Assign Warden
          </Button>
        </div>

        {/* Wardens List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wardens?.map((warden) => {
            const dCfg = designationConfig[warden.designation] ?? { label: warden.designation, color: '' };
            return (
              <Card key={warden.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{warden.name}</p>
                        <Badge className={`${dCfg.color} text-xs`}>{dCfg.label}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon">
                      <UserCog className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{warden.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Since {warden.assigned_at}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        {shiftIcons[warden.shift]}
                        <span className="capitalize">{warden.shift.replace('_', ' ')}</span>
                      </Badge>
                      {warden.is_residential && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Home className="h-3 w-3" />
                          Residential
                        </Badge>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Assigned Floors</p>
                      <div className="flex gap-1.5">
                        {warden.assigned_floors.map((floor) => (
                          <Badge key={floor} variant="secondary" className="text-xs">
                            {floorLabels[floor] ?? floor} Floor
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {(!wardens || wardens.length === 0) && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No Wardens Assigned</p>
              <p className="text-sm text-muted-foreground">Assign wardens to manage this hostel block</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
