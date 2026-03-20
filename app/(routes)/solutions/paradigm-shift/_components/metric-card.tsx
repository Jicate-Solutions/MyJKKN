'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Search,
  Lightbulb,
  Users,
  IndianRupee,
  BookOpen,
  Boxes,
  Shield,
  Rocket,
  GraduationCap,
} from 'lucide-react';
import type { DepartmentMetrics } from '@/lib/services/solutions/paradigm-shift-service';

interface MetricConfig {
  key: keyof DepartmentMetrics;
  label: string;
  icon: React.ElementType;
  format?: (v: number) => string;
}

const METRICS: MetricConfig[] = [
  { key: 'problems_identified', label: 'Problems Identified', icon: Search },
  { key: 'solutions_built', label: 'Solutions Built', icon: Lightbulb },
  { key: 'clients_engaged', label: 'Clients Engaged', icon: Users },
  {
    key: 'revenue_generated',
    label: 'Revenue',
    icon: IndianRupee,
    format: (v) =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(v),
  },
  { key: 'publications', label: 'Publications', icon: BookOpen },
  { key: 'prototypes_built', label: 'Prototypes', icon: Boxes },
  { key: 'ip_retained', label: 'IP / Patents', icon: Shield },
  { key: 'trl4_products', label: 'TRL 4+ Products', icon: Rocket },
  { key: 'training_completed', label: 'Training Participants', icon: GraduationCap },
];

export function MetricCard({
  metrics,
  average,
}: {
  metrics: DepartmentMetrics;
  average?: DepartmentMetrics;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {METRICS.map(({ key, label, icon: Icon, format }) => {
        const value = metrics[key] as number;
        const avgValue = average ? (average[key] as number) : undefined;
        const isActive = value > 0;

        return (
          <Card
            key={key}
            className={`transition-all ${
              isActive
                ? 'border-green-200 bg-green-50/50'
                : 'border-muted bg-muted/20 opacity-60'
            }`}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground truncate">{label}</span>
              </div>
              <p className="text-lg font-bold">
                {format ? format(value) : value}
              </p>
              {avgValue !== undefined && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Avg: {format ? format(avgValue) : avgValue}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export { METRICS };
