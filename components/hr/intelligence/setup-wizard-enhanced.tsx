'use client';

/**
 * Enhanced Setup Wizard — 5-step guide for populating intelligence prerequisites.
 *
 * Auto-checks each step's completion by querying Supabase directly.
 * Shows progress bar with overall completion percentage.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Users,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Circle,
  Sparkles,
  Clock,
  Loader2,
  Building,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface StepStatus {
  loaded: boolean;
  complete: boolean;
  count: number;
  /**
   * The count query itself failed. Distinct from `count: 0`, which means the
   * table was read and is genuinely empty. Conflating the two is what hid two
   * wrong table names here for months: both steps read "0 of N required" and
   * looked exactly like work nobody had done yet.
   */
  failed?: boolean;
}

const SETUP_STEPS = [
  {
    id: 'regulatory-bodies',
    title: 'Add Regulatory Bodies',
    description: 'Add regulatory bodies (AICTE, PCI, NMC, etc.) that govern your institutions.',
    icon: Building,
    // Was `regulatory_bodies` (no such table) and pointed at the norms screen.
    // The table is `hr_regulatory_bodies` and there is a dedicated /bodies page.
    href: '/hr/admin/recruitment-need/bodies',
    table: 'hr_regulatory_bodies' as const,
    threshold: 8,
  },
  {
    id: 'norms',
    title: 'Configure Regulatory Norms',
    description: 'Define student-faculty ratio norms from each regulatory body.',
    icon: FileText,
    href: '/hr/admin/recruitment-need/norms',
    // Was `hr_recruitment_signal_norms` — no such table. It is `hr_regulatory_norms`.
    table: 'hr_regulatory_norms' as const,
    threshold: 1,
  },
  {
    id: 'sanctioned',
    title: 'Enter Sanctioned Strength',
    description: 'Add institution program approvals with sanctioned faculty count and intake.',
    icon: Users,
    href: '/hr/admin/recruitment-need/approvals',
    table: 'institution_program_approvals' as const,
    threshold: 1,
  },
  {
    id: 'specializations',
    title: 'Tag Staff Specializations',
    description: 'Map staff to their specializations so coverage gaps can be computed.',
    icon: BookOpen,
    href: '/hr/admin/recruitment-need/specializations',
    table: 'staff_specializations' as const,
    threshold: 1,
  },
  {
    id: 'workload',
    title: 'Enter Faculty Workload',
    description: 'Record or import faculty workload data for workload balance scoring.',
    icon: Clock,
    // /hr/admin/recruitment-need/workload has never existed — this step's
    // "Set Up" button led to a 404, so the last step of the wizard could not be
    // reached at all. The real screen is /hr/workload, which is fully built:
    // Add Workload, Import from Excel, and a downloadable template.
    href: '/hr/workload',
    table: 'hr_faculty_workload' as const,
    threshold: 1,
  },
] as const;

interface SetupWizardEnhancedProps {
  className?: string;
}

export function SetupWizardEnhanced({ className }: SetupWizardEnhancedProps) {
  const [steps, setSteps] = useState<Record<string, StepStatus>>(() => {
    const init: Record<string, StepStatus> = {};
    for (const step of SETUP_STEPS) {
      init[step.id] = { loaded: false, complete: false, count: 0 };
    }
    return init;
  });
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAll() {
      setIsChecking(true);
      const supabase = createClientSupabaseClient();
      const results: Record<string, StepStatus> = {};

      for (const step of SETUP_STEPS) {
        try {
          const { count, error } = await supabase
            .from(step.table)
            .select('*', { count: 'exact', head: true });

          if (!cancelled) {
            const n = count ?? 0;
            results[step.id] = {
              loaded: true,
              complete: !error && n >= step.threshold,
              count: n,
              failed: !!error,
            };
          }
        } catch {
          if (!cancelled) {
            results[step.id] = { loaded: true, complete: false, count: 0, failed: true };
          }
        }
      }

      if (!cancelled) {
        setSteps(results);
        setIsChecking(false);
      }
    }

    checkAll();
    return () => { cancelled = true; };
  }, []);

  const totalSteps = SETUP_STEPS.length;
  const completedCount = Object.values(steps).filter((s) => s.complete).length;
  const pct = Math.round((completedCount / totalSteps) * 100);

  // Determine the current step (first incomplete)
  const currentStepIdx = SETUP_STEPS.findIndex((s) => !steps[s.id]?.complete);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Set Up HR Intelligence
        </CardTitle>
        <CardDescription>
          The intelligence module requires foundational data before it can compute signals.
          Complete the steps below to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              {completedCount}/{totalSteps} steps complete
            </span>
            <span className="font-medium text-primary">{pct}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary rounded-full h-2 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-3">
          {SETUP_STEPS.map((step, idx) => {
            const status = steps[step.id];
            const isComplete = status?.complete ?? false;
            const isCurrent = idx === currentStepIdx;
            const StepIcon = step.icon;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  isComplete
                    ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                    : isCurrent
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-background border-input'
                }`}
              >
                {/* Step indicator */}
                <div className="mt-0.5 shrink-0">
                  {isChecking && !status?.loaded ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  ) : isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <div className={`flex items-center justify-center h-5 w-5 rounded-full border-2 text-[10px] font-bold ${
                      isCurrent
                        ? 'border-primary text-primary'
                        : 'border-muted-foreground/40 text-muted-foreground/40'
                    }`}>
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StepIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <h4 className="text-sm font-medium">
                      Step {idx + 1}: {step.title}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                  {status?.loaded && (
                    <p className="text-xs mt-1">
                      {isComplete ? (
                        <span className="text-green-600">
                          {status.count} {status.count === 1 ? 'record' : 'records'} found
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {status.failed
                            ? 'Could not be checked'
                            : `${status.count} of ${step.threshold} required`}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {/* Action button */}
                <Button
                  asChild
                  size="sm"
                  variant={isComplete ? 'outline' : isCurrent ? 'default' : 'ghost'}
                  className="shrink-0 h-8 text-xs min-w-[48px] min-h-[48px] sm:min-h-0 sm:min-w-0"
                >
                  <Link href={step.href}>
                    {isComplete ? 'Review' : 'Set Up'}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        {completedCount === totalSteps && (
          <div className="mt-4 p-3 bg-primary/5 rounded-lg text-center">
            <p className="text-sm font-medium text-primary">
              All prerequisites met! Signal computation will begin automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
