'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, GraduationCap, Hammer, Package } from 'lucide-react';

interface AdoptionKPICardsProps {
  stats: {
    registered_users: number;
    active_users: number;
    courses_completed: number;
    ss_projects: number;
    sh_products: number;
    last_snapshot_date: string | null;
  } | null;
  isLoading: boolean;
}

const KPI_CONFIG = [
  {
    key: 'registered_users' as const,
    label: 'Registered Users',
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    target: 10000,
  },
  {
    key: 'active_users' as const,
    label: 'Active Users',
    icon: Activity,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    key: 'courses_completed' as const,
    label: 'Courses Completed',
    icon: GraduationCap,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    target: 100,
  },
  {
    key: 'ss_projects' as const,
    label: 'Startup Studio Projects',
    icon: Hammer,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    target: 5,
  },
  {
    key: 'sh_products' as const,
    label: 'Solution Hub Products',
    icon: Package,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    target: 1,
  },
];

export function AdoptionKPICards({ stats, isLoading }: AdoptionKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {KPI_CONFIG.map((kpi) => {
        const Icon = kpi.icon;
        const value = stats?.[kpi.key] ?? 0;
        const target = 'target' in kpi ? kpi.target : undefined;

        return (
          <Card key={kpi.key}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${kpi.bgColor}`}>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              {isLoading ? (
                <div className="h-8 bg-muted animate-pulse rounded" />
              ) : (
                <div>
                  <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                  {target && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Target: {target.toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
