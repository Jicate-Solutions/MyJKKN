'use client';

import { useState, useEffect, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Target,
  ClipboardCheck,
  ArrowLeft,
  Send,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useAllMyOKRs } from '@/hooks/okr/use-learner-okrs';
import {
  useCurrentCheckIn,
  useGetOrCreateCheckIn,
  useSubmitCheckIn,
  useCurrentWeek
} from '@/hooks/okr/use-check-ins';
import { useIsUserBlocked } from '@/hooks/okr/use-compliance';
import { KRStatus, CreateOKRCheckInDTO } from '@/types/okr';
import { format, startOfWeek, endOfWeek } from 'date-fns';

// ============================================================================
// ZOD VALIDATION SCHEMA
// ============================================================================

const checkInFormSchema = z.object({
  notes: z.string().max(2000, 'Notes cannot exceed 2000 characters').optional(),
  hasBlocker: z.boolean(),
  blockerDescription: z.string().max(1000, 'Blocker description cannot exceed 1000 characters').optional(),
  confirmAccurate: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm the information is accurate' })
  })
}).refine(
  (data) => !data.hasBlocker || (data.blockerDescription && data.blockerDescription.trim().length > 0),
  {
    message: 'Please describe the blocker',
    path: ['blockerDescription']
  }
);

type CheckInFormData = z.infer<typeof checkInFormSchema>;

interface KRUpdate {
  kr_id: string;
  kr_type: 'core' | 'elective';
  old_value: number;
  new_value: number;
  status: KRStatus;
}

interface KRUpdateDTO {
  key_result_id: string;
  new_value: number;
  exception_flagged?: boolean;
  exception_note?: string;
}

export default function WeeklyCheckInPage() {
  const router = useRouter();
  const weekData = useCurrentWeek();

  // Calculate week info with dates
  const weekInfo = useMemo(() => {
    const now = new Date();
    return {
      weekNumber: weekData.week,
      year: weekData.year,
      startDate: startOfWeek(now, { weekStartsOn: 1 }), // Monday
      endDate: endOfWeek(now, { weekStartsOn: 1 }) // Sunday
    };
  }, [weekData.week, weekData.year]);

  const { data: myOKRs, isLoading: okrsLoading } = useAllMyOKRs();
  const { data: currentCheckIn, isLoading: checkInLoading } = useCurrentCheckIn();
  const { data: isBlocked } = useIsUserBlocked();
  const getOrCreateCheckIn = useGetOrCreateCheckIn();
  const submitCheckIn = useSubmitCheckIn();

  // Form state
  const [updates, setUpdates] = useState<Record<string, KRUpdate>>({});
  const [notes, setNotes] = useState('');
  const [hasBlocker, setHasBlocker] = useState(false);
  const [blockerDescription, setBlockerDescription] = useState('');
  const [confirmAccurate, setConfirmAccurate] = useState(false);

  // Initialize updates from current OKRs
  useEffect(() => {
    if (myOKRs) {
      const initialUpdates: Record<string, KRUpdate> = {};

      // Core OKRs
      myOKRs.core.forEach((okr) => {
        initialUpdates[okr.id] = {
          kr_id: okr.id,
          kr_type: 'core',
          old_value: okr.current_value,
          new_value: okr.current_value,
          status: okr.status
        };
      });

      // Elective OKRs
      myOKRs.elective.forEach((okr) => {
        initialUpdates[okr.id] = {
          kr_id: okr.id,
          kr_type: 'elective',
          old_value: okr.current_value,
          new_value: okr.current_value,
          status: okr.status
        };
      });

      setUpdates(initialUpdates);
    }
  }, [myOKRs]);

  // Check if check-in is already submitted
  const isSubmitted = currentCheckIn?.is_completed === true;

  // Handle value change
  const handleValueChange = (okrId: string, newValue: number) => {
    setUpdates((prev) => ({
      ...prev,
      [okrId]: {
        ...prev[okrId],
        new_value: newValue
      }
    }));
  };

  // Handle status change
  const handleStatusChange = (okrId: string, status: KRStatus) => {
    setUpdates((prev) => ({
      ...prev,
      [okrId]: {
        ...prev[okrId],
        status
      }
    }));
  };

  // Submit check-in with Zod validation
  const handleSubmit = async () => {
    // Validate form with Zod
    const formData = {
      notes,
      hasBlocker,
      blockerDescription,
      confirmAccurate
    };

    const result = checkInFormSchema.safeParse(formData);

    if (!result.success) {
      const errors = result.error.errors;
      const firstError = errors[0];
      toast.error(firstError.message);
      return;
    }

    // Get or create check-in first if needed
    try {
      let checkIn = currentCheckIn;
      if (!checkIn) {
        checkIn = await getOrCreateCheckIn.mutateAsync();
      }

      // Convert updates to DTO format
      const krUpdates: KRUpdateDTO[] = Object.values(updates)
        .filter((u) => u.new_value !== u.old_value)
        .map((u) => ({
          key_result_id: u.kr_id,
          new_value: u.new_value
        }));

      const data: CreateOKRCheckInDTO = {
        overall_notes: notes || undefined,
        blocker_flagged: hasBlocker,
        blocker_description: hasBlocker ? blockerDescription : undefined,
        kr_updates: krUpdates
      };

      await submitCheckIn.mutateAsync(data);
      toast.success('Check-in submitted successfully!');
      router.push('/okr');
    } catch (error) {
      console.error('Error submitting check-in:', error);
      toast.error('Failed to submit check-in. Please try again.');
    }
  };

  const isLoading = okrsLoading || checkInLoading;
  const isSubmitting = getOrCreateCheckIn.isPending || submitCheckIn.isPending;

  return (
    <ContentLayout title="Weekly Check-in">
      <OKRErrorBoundary>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back Link */}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/okr">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to OKRs
          </Link>
        </Button>

        {/* Week Info Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" style={{ color: '#0b6d41' }} />
                  Week {weekInfo.weekNumber} Check-in
                </CardTitle>
                <CardDescription>
                  {format(weekInfo.startDate, 'MMM d')} - {format(weekInfo.endDate, 'MMM d, yyyy')}
                </CardDescription>
              </div>
              {isSubmitted ? (
                <Badge className="bg-emerald-500">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Submitted
                </Badge>
              ) : (
                <Badge variant="outline">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              )}
            </div>
          </CardHeader>
          {isSubmitted && (
            <CardContent>
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Check-in Complete</AlertTitle>
                <AlertDescription>
                  You've already submitted your check-in for this week.
                  Your next check-in is due by Sunday 5 PM.
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>

        {/* Blocked Warning */}
        {isBlocked && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>You are blocked</AlertTitle>
            <AlertDescription>
              Please complete this check-in to regain access to other features.
            </AlertDescription>
          </Alert>
        )}

        {!isSubmitted && (
          <>
            {/* Core OKRs Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-5 w-5" style={{ color: '#0b6d41' }} />
                  Core OKRs Update
                </CardTitle>
                <CardDescription>Update your progress on required objectives</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : myOKRs?.core && myOKRs.core.length > 0 ? (
                  myOKRs.core.map((okr) => (
                    <div key={okr.id} className="p-4 border rounded-lg space-y-3">
                      <div>
                        <h4 className="font-medium">{okr.core_okr?.kr_title || 'Core OKR'}</h4>
                        {okr.core_okr?.kr_description && (
                          <p className="text-sm text-muted-foreground">{okr.core_okr.kr_description}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Current Value</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={updates[okr.id]?.new_value ?? okr.current_value}
                              onChange={(e) => handleValueChange(okr.id, parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                              / {okr.core_okr?.target_value} {okr.core_okr?.unit}
                            </span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                            value={updates[okr.id]?.status ?? okr.status}
                            onChange={(e) => handleStatusChange(okr.id, e.target.value as KRStatus)}
                          >
                            <option value="on_track">On Track</option>
                            <option value="at_risk">At Risk</option>
                            <option value="behind">Behind</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </div>

                      <Progress
                        value={Math.min(
                          100,
                          ((updates[okr.id]?.new_value ?? okr.current_value) / (okr.core_okr?.target_value || 1)) * 100
                        )}
                        className="h-2"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No core OKRs assigned</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Elective OKRs Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" style={{ color: '#0b6d41' }} />
                  Elective OKRs Update
                </CardTitle>
                <CardDescription>Update your personal goals progress</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : myOKRs?.elective && myOKRs.elective.length > 0 ? (
                  myOKRs.elective.map((okr) => (
                    <div key={okr.id} className="p-4 border rounded-lg space-y-3">
                      <div>
                        <h4 className="font-medium">{okr.title}</h4>
                        {okr.description && (
                          <p className="text-sm text-muted-foreground">{okr.description}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Current Value</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={updates[okr.id]?.new_value ?? okr.current_value}
                              onChange={(e) => handleValueChange(okr.id, parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                              / {okr.target_value} {okr.unit}
                            </span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                            value={updates[okr.id]?.status ?? okr.status}
                            onChange={(e) => handleStatusChange(okr.id, e.target.value as KRStatus)}
                          >
                            <option value="on_track">On Track</option>
                            <option value="at_risk">At Risk</option>
                            <option value="behind">Behind</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </div>

                      <Progress
                        value={Math.min(
                          100,
                          ((updates[okr.id]?.new_value ?? okr.current_value) / (okr.target_value || 1)) * 100
                        )}
                        className="h-2"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No elective OKRs set</p>
                    <Button size="sm" variant="outline" className="mt-2" asChild>
                      <Link href="/okr/objectives/new">Create One</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes & Blockers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Additional Notes</CardTitle>
                <CardDescription>Add context or report any blockers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="notes">Weekly Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any highlights, achievements, or context for this week..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1.5"
                    rows={3}
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasBlocker"
                      checked={hasBlocker}
                      onCheckedChange={(checked) => setHasBlocker(checked as boolean)}
                    />
                    <label
                      htmlFor="hasBlocker"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I have a blocker that needs attention
                    </label>
                  </div>

                  {hasBlocker && (
                    <div>
                      <Label htmlFor="blockerDescription">Describe the blocker</Label>
                      <Textarea
                        id="blockerDescription"
                        placeholder="What's blocking your progress? Who can help?"
                        value={blockerDescription}
                        onChange={(e) => setBlockerDescription(e.target.value)}
                        className="mt-1.5"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Submit Section */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start space-x-2 mb-4">
                  <Checkbox
                    id="confirmAccurate"
                    checked={confirmAccurate}
                    onCheckedChange={(checked) => setConfirmAccurate(checked as boolean)}
                  />
                  <label
                    htmlFor="confirmAccurate"
                    className="text-sm leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I confirm that the progress updates above accurately reflect my work this week
                  </label>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!confirmAccurate || isSubmitting}
                  style={{ backgroundColor: confirmAccurate ? '#0b6d41' : undefined }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Check-in
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-3">
                  Check-ins are due every Sunday by 5 PM. Missing the deadline will result in a blocked status.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
