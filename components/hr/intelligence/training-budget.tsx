'use client';

/**
 * HR Intelligence — Tab 3: Training Budget
 *
 * Data source: FDP / training modules (not yet built as hooks).
 * Shows structured placeholder describing what will appear once
 * training budget tracking is integrated.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, BookOpen, CalendarDays, IndianRupee } from 'lucide-react';

const PLANNED_FEATURES = [
  {
    icon: IndianRupee,
    title: 'Budget Allocation',
    description: 'Annual training budget per institution with category breakdown (FDP, workshops, certifications).',
  },
  {
    icon: CalendarDays,
    title: 'Spend to Date',
    description: 'Running total of approved and disbursed training expenses against allocated budget.',
  },
  {
    icon: BookOpen,
    title: 'Program Utilization',
    description: 'Faculty participation rate in scheduled FDPs. Number of programs offered vs attended.',
  },
  {
    icon: GraduationCap,
    title: 'Remaining Budget',
    description: 'Per-institution remaining training budget with projected burn rate for the fiscal year.',
  },
];

export function TrainingBudgetTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Training Budget Intelligence
          </CardTitle>
          <CardDescription>
            Track training and faculty development spend across all institutions.
            Budget allocation, utilization, and remaining capacity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg">
            <GraduationCap className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">Training Data Integration Pending</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              This tab will show training budget vs spend once the FDP (Faculty Development Program)
              module tracks budget allocations and expense approvals.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: FDP module with budget tracking
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Feature preview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLANNED_FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card key={feature.title} className="opacity-75">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
