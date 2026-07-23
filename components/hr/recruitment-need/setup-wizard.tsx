'use client';

/**
 * Empty State / Setup Wizard — shown when no signal data exists.
 * Guides user through data population steps with links to admin pages.
 */

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
} from 'lucide-react';

interface SetupWizardProps {
  hasNorms?: boolean;
  hasSanctionedStrength?: boolean;
  hasSpecializations?: boolean;
  className?: string;
}

const SETUP_STEPS = [
  {
    id: 'norms',
    title: 'Add Regulatory Norms',
    description: 'Define student-faculty ratio norms from AICTE, PCI, NMC, and other bodies.',
    icon: FileText,
    href: '/hr/admin/recruitment-need/norms',
    checkKey: 'hasNorms' as const,
  },
  {
    id: 'sanctioned',
    title: 'Enter Sanctioned Strength',
    description: 'Add institution program approvals with sanctioned faculty count and intake.',
    icon: Users,
    href: '/hr/admin/recruitment-need/approvals',
    checkKey: 'hasSanctionedStrength' as const,
  },
  {
    id: 'specializations',
    title: 'Tag Staff Specializations',
    description: 'Map staff to their specializations so coverage gaps can be computed.',
    icon: BookOpen,
    href: '/hr/admin/recruitment-need/specializations',
    checkKey: 'hasSpecializations' as const,
  },
];

export function SetupWizard({
  hasNorms = false,
  hasSanctionedStrength = false,
  hasSpecializations = false,
  className,
}: SetupWizardProps) {
  const checks: Record<string, boolean> = {
    hasNorms,
    hasSanctionedStrength,
    hasSpecializations,
  };

  const completedCount = Object.values(checks).filter(Boolean).length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Set Up Recruitment Need Signal
        </CardTitle>
        <CardDescription>
          The recruitment need signal requires foundational data before it can compute.
          Complete the steps below to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>{completedCount}/3 steps complete</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary rounded-full h-1.5 transition-all"
              style={{ width: `${(completedCount / 3) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {SETUP_STEPS.map((step, idx) => {
            const isComplete = checks[step.checkKey];
            const StepIcon = step.icon;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  isComplete
                    ? 'bg-green-50/50 border-green-200'
                    : 'bg-background border-input hover:bg-accent/30'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StepIcon className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-medium">
                      Step {idx + 1}: {step.title}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                </div>
                <Button asChild size="sm" variant={isComplete ? 'outline' : 'default'} className="shrink-0 h-7 text-xs">
                  <Link href={step.href}>
                    {isComplete ? 'Review' : 'Set Up'}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        {completedCount === 3 && (
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
