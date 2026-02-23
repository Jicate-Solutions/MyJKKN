'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import {
  useOnboardingChecklist,
  useUpdateOnboardingItem,
  useCompleteOnboardingChecklist,
} from '@/hooks/campus-living/use-onboarding';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Circle,
  SkipForward,
  User,
  Building2,
  BedDouble,
  DoorOpen,
  FileText,
  Package,
  Compass,
  Phone,
  BookOpen,
  CreditCard,
  UtensilsCrossed,
  Wifi,
  Wrench,
  ClipboardCheck,
  AlertCircle,
} from 'lucide-react';
import type { OnboardingChecklistItem, OnboardingItemType } from '@/types/campus-living';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  not_started: { label: 'Not Started', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'outline' },
};

const itemTypeIcons: Record<OnboardingItemType, typeof DoorOpen> = {
  room_readiness: DoorOpen,
  document_collection: FileText,
  welcome_kit: Package,
  orientation: Compass,
  emergency_contact: Phone,
  rules_acknowledgment: BookOpen,
  id_card: CreditCard,
  mess_registration: UtensilsCrossed,
  wifi_setup: Wifi,
  custom: Wrench,
};

// Helper to safely access joined Supabase relations
const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';

const getNestedJoined = (row: any, relation: string, nested: string, field: string): string =>
  row?.[relation]?.[nested]?.[field] ?? '';

export default function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: checklist, isLoading } = useOnboardingChecklist(id);
  const updateItem = useUpdateOnboardingItem();
  const completeChecklist = useCompleteOnboardingChecklist();
  const [notes, setNotes] = useState('');

  if (isLoading || !checklist) {
    return (
      <ContentLayout title="Onboarding Checklist">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const cl = checklist as any;
  const studentName = getJoined(cl, 'profiles', 'full_name') || 'Unknown Student';
  const studentEmail = getJoined(cl, 'profiles', 'email');
  const studentPhone = getJoined(cl, 'profiles', 'phone');
  const blockName = getNestedJoined(cl, 'hostel_allocations', 'hostel_blocks', 'name');
  const roomNumber = getNestedJoined(cl, 'hostel_allocations', 'hostel_rooms', 'room_number');
  const bedNumber = getNestedJoined(cl, 'hostel_allocations', 'hostel_beds', 'bed_number');

  const items: OnboardingChecklistItem[] = cl.items ?? [];
  const totalItems = items.length;
  const doneItems = items.filter((i) => i.status === 'done').length;
  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const allRequiredDone = items
    .filter((item) => item.required)
    .every((item) => item.status === 'done' || item.status === 'skipped');

  const isCompleted = cl.status === 'completed';

  const handleMarkDone = (itemIndex: number) => {
    updateItem.mutate({
      checklistId: id,
      itemIndex,
      status: 'done',
      completedBy: profile?.id ?? '',
    });
  };

  const handleSkip = (itemIndex: number) => {
    updateItem.mutate({
      checklistId: id,
      itemIndex,
      status: 'skipped',
      completedBy: profile?.id ?? '',
    });
  };

  const handleCompleteOnboarding = () => {
    completeChecklist.mutate({
      id,
      completedBy: profile?.id ?? '',
    });
  };

  const sCfg = statusConfig[cl.status] ?? { label: cl.status, variant: 'outline' as const };

  return (
    <ContentLayout title="Onboarding Checklist">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Onboarding', href: '/campus-living/allocations/onboarding' },
          { label: studentName },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/allocations/onboarding">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Onboarding Checklist</h1>
              <p className="text-sm text-muted-foreground">
                Track and complete onboarding steps for this resident
              </p>
            </div>
          </div>
          <Badge variant={sCfg.variant} className="text-sm px-3 py-1">
            {sCfg.label}
          </Badge>
        </div>

        {/* Student Info Card */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Student</p>
                  <p className="font-medium">{studentName}</p>
                  {studentEmail && <p className="text-xs text-muted-foreground">{studentEmail}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Block</p>
                  <p className="font-medium">{blockName || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DoorOpen className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Room</p>
                  <p className="font-medium">{roomNumber || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <BedDouble className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Bed</p>
                  <p className="font-medium">{bedNumber || '-'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {doneItems} of {totalItems} items completed ({progressPct}%)
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Checklist Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Checklist Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map((item, index) => {
                const IconComponent = itemTypeIcons[item.type] ?? Wrench;
                const isDone = item.status === 'done';
                const isSkipped = item.status === 'skipped';
                const isPending = item.status === 'pending';

                return (
                  <div
                    key={index}
                    className={`flex items-start gap-4 p-4 ${isDone ? 'bg-green-50/50' : isSkipped ? 'bg-amber-50/50' : ''}`}
                  >
                    {/* Status Icon */}
                    <div className="pt-0.5">
                      {isDone && <CheckCircle2 className="h-6 w-6 text-green-600" />}
                      {isSkipped && <SkipForward className="h-6 w-6 text-amber-500" />}
                      {isPending && <Circle className="h-6 w-6 text-gray-300" />}
                    </div>

                    {/* Item Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <span className={`font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                          {item.title}
                        </span>
                        {item.required && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Required
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {item.type.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      {/* Completion info */}
                      {isDone && item.completed_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Completed on {new Date(item.completed_at).toLocaleString()}
                        </p>
                      )}
                      {isSkipped && (
                        <p className="text-xs text-amber-600 mt-1">
                          Skipped
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          Note: {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {isPending && !isCompleted && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleMarkDone(index)}
                          disabled={updateItem.isPending}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Done
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSkip(index)}
                          disabled={updateItem.isPending}
                        >
                          <SkipForward className="mr-1 h-3.5 w-3.5" />
                          Skip
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {items.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                  <p>No checklist items found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {!isCompleted && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add any notes about this onboarding process..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        )}

        {cl.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{cl.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Complete Onboarding Button */}
        {!isCompleted && (
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleCompleteOnboarding}
              disabled={!allRequiredDone || completeChecklist.isPending}
            >
              {completeChecklist.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Complete Onboarding
            </Button>
            {!allRequiredDone && (
              <p className="text-xs text-muted-foreground ml-3 self-center">
                All required items must be completed first
              </p>
            )}
          </div>
        )}

        {isCompleted && cl.completed_at && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">Onboarding Completed</p>
                  <p className="text-sm text-green-700">
                    Completed on {new Date(cl.completed_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
