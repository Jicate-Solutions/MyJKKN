'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ComplianceDepartment } from '@/types/work-pulse';

interface ComplianceTabProps {
  institutionId: string;
}

export function ComplianceTab({ institutionId }: ComplianceTabProps) {
  const [data, setData] = useState<ComplianceDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompliance() {
      try {
        const res = await fetch(
          `/api/work-pulse/compliance?institution_id=${institutionId}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json.data || []);
        }
      } catch {
        console.error('[compliance-tab] Failed to fetch');
      } finally {
        setLoading(false);
      }
    }
    fetchCompliance();
  }, [institutionId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">
            No department data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const avgRate =
    data.length > 0
      ? Math.round(data.reduce((s, d) => s + d.submission_rate, 0) / data.length)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Department Compliance — This Week
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Average submission rate: <span className="font-medium">{avgRate}%</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {data
          .sort((a, b) => b.submission_rate - a.submission_rate)
          .map((dept) => (
            <div key={dept.department_id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate max-w-[60%]">
                  {dept.department_name}
                </span>
                <span className="text-muted-foreground">
                  {dept.submitted_count}/{dept.total_staff} ({dept.submission_rate}%)
                </span>
              </div>
              <Progress
                value={dept.submission_rate}
                className="h-2"
              />
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
