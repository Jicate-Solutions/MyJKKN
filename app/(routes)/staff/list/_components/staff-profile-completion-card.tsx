'use client';
// ============================================
// STAFF PROFILE COMPLETION CARD
// ============================================
// The staff analogue of the learner ProfileCompletionCard
// (app/(routes)/learners/my-profile/_components/profile-completion-card.tsx).
// Shown on /staff/list for `own_records` users (faculty et al.) so an
// individual staff member can see how complete their own record is, with a
// section breakdown and the specific fields still missing.
// ============================================

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileCompletionResult, getCompletionVariant } from '@/lib/utils/profile-completion';

interface StaffProfileCompletionCardProps {
  completion: ProfileCompletionResult;
  /** When the viewer can edit this record, render the "Complete Profile" CTA. */
  canEdit: boolean;
  /** Destination for the CTA (the staff edit page for this record). */
  editHref: string;
}

export function StaffProfileCompletionCard({
  completion,
  canEdit,
  editHref,
}: StaffProfileCompletionCardProps) {
  const [showMissing, setShowMissing] = useState(false);
  const { overallPercentage, completed, totalRequired, sections, missingFields } = completion;
  const variant = getCompletionVariant(overallPercentage);

  return (
    <Card className="mb-6" id="staff-profile-completion-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              Profile Completion Status
              {overallPercentage === 100 && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            </CardTitle>
            <CardDescription>
              {completed} of {totalRequired} fields completed
            </CardDescription>
          </div>
          {canEdit && overallPercentage < 100 && (
            <Button asChild>
              <Link href={editHref}>Complete Profile</Link>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Progress</span>
            <Badge
              variant={
                variant === 'success'
                  ? 'default'
                  : variant === 'destructive'
                  ? 'destructive'
                  : 'secondary'
              }
              className={cn(
                variant === 'success' && 'bg-green-600 hover:bg-green-700',
                variant === 'default' && 'bg-yellow-600 hover:bg-yellow-700'
              )}
            >
              {overallPercentage}%
            </Badge>
          </div>
          <Progress
            value={overallPercentage}
            className={cn(
              'h-4',
              overallPercentage >= 80 && '[&>div]:bg-green-600',
              overallPercentage >= 51 && overallPercentage < 80 && '[&>div]:bg-yellow-600',
              overallPercentage < 51 && '[&>div]:bg-red-600'
            )}
          />
        </div>

        {/* Section Breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Completion by Section</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section) => (
              <div key={section.name} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium">{section.name}</span>
                  <span className="text-muted-foreground">
                    {section.completed}/{section.total}
                  </span>
                </div>
                <Progress
                  value={section.percentage}
                  className={cn(
                    'h-2',
                    section.percentage === 100 && '[&>div]:bg-green-600',
                    section.percentage >= 50 &&
                      section.percentage < 100 &&
                      '[&>div]:bg-yellow-600',
                    section.percentage < 50 && '[&>div]:bg-red-600'
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Missing Fields (Collapsible) */}
        {missingFields.length > 0 && (
          <Collapsible open={showMissing} onOpenChange={setShowMissing}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <span>
                    {missingFields.length} field{missingFields.length > 1 ? 's' : ''} need attention
                  </span>
                </div>
                {showMissing ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="space-y-2">
                {missingFields.map((field) => (
                  <div
                    key={field.field}
                    className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-sm"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {field.section}
                    </Badge>
                    <span className="text-muted-foreground">{field.label}</span>
                  </div>
                ))}
              </div>
              {canEdit && (
                <Button asChild className="w-full mt-4">
                  <Link href={editHref}>Fill Missing Fields</Link>
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Completion Message */}
        {overallPercentage === 100 && (
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-sm font-medium">Your profile is complete! 🎉</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
