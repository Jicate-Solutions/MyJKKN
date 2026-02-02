/**
 * TIMWOOD Breakdown Component
 *
 * Visual breakdown of waste by TIMWOOD categories with bar chart and totals
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WasteCategoryBadge } from '@/components/process-excellence/waste-category-badge';
import { WASTE_LABELS, WASTE_COLORS } from '@/types/process-excellence';
import type { WasteCategory } from '@/types/process-excellence';
import { AlertTriangle, Clock, IndianRupee } from 'lucide-react';

interface WasteBreakdownItem {
  category: WasteCategory;
  label: string;
  count: number;
  total_hours_lost: number;
  total_cost_impact: number;
}

interface TimwoodBreakdownProps {
  wasteBreakdown: WasteBreakdownItem[];
}

export function TimwoodBreakdown({ wasteBreakdown }: TimwoodBreakdownProps) {
  // Calculate totals
  const totalIncidents = wasteBreakdown.reduce((sum, item) => sum + item.count, 0);
  const totalHoursLost = wasteBreakdown.reduce((sum, item) => sum + item.total_hours_lost, 0);
  const totalCostImpact = wasteBreakdown.reduce((sum, item) => sum + item.total_cost_impact, 0);

  // Find max count for scaling progress bars
  const maxCount = Math.max(...wasteBreakdown.map((item) => item.count), 1);

  if (wasteBreakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>TIMWOOD Waste Breakdown</CardTitle>
          <CardDescription>
            Transportation, Inventory, Motion, Waiting, Over-production, Over-processing, Defects,
            Talent Under-utilization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No waste incidents recorded yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>TIMWOOD Waste Breakdown</CardTitle>
        <CardDescription>
          Distribution of waste incidents across TIMWOOD categories
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3 p-4 border rounded-lg">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Incidents</p>
              <p className="text-2xl font-bold">{totalIncidents}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border rounded-lg">
            <div className="p-2 rounded-full bg-orange-500/10">
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Hours Lost</p>
              <p className="text-2xl font-bold">{totalHoursLost.toFixed(1)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border rounded-lg">
            <div className="p-2 rounded-full bg-green-500/10">
              <IndianRupee className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Cost Impact</p>
              <p className="text-2xl font-bold">
                ₹{totalCostImpact.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">By Category</h4>
          {wasteBreakdown.map((item) => {
            const percentage = totalIncidents > 0 ? (item.count / totalIncidents) * 100 : 0;
            const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

            return (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WasteCategoryBadge category={item.category} />
                    <span className="text-sm font-medium">{WASTE_LABELS[item.category]}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {item.count} incidents ({percentage.toFixed(0)}%)
                    </span>
                    {item.total_hours_lost > 0 && (
                      <span className="text-orange-500">
                        {item.total_hours_lost.toFixed(1)}h
                      </span>
                    )}
                    {item.total_cost_impact > 0 && (
                      <span className="text-green-600">
                        ₹{item.total_cost_impact.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: WASTE_COLORS[item.category]
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-3">TIMWOOD Categories:</p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            {Object.entries(WASTE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: WASTE_COLORS[key as WasteCategory] }}
                />
                <span className="text-xs">
                  <span className="font-medium">{key}</span> - {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
