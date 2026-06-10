'use client';

import { useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SlidersHorizontal, Save, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  useWeights,
  useUpdateWeights,
} from '@/hooks/hr/recruitment-need/use-recruitment-admin';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

/** Human-friendly labels for weight keys */
const WEIGHT_LABELS: Record<string, string> = {
  'hr_recruitment.weight_sanctioned_gap': 'Sanctioned Gap',
  'hr_recruitment.weight_sfr': 'Student-Faculty Ratio',
  'hr_recruitment.weight_specialization_gap': 'Specialization Gap',
  'hr_recruitment.weight_workload': 'Faculty Workload',
  'hr_recruitment.weight_projected_intake': 'Projected Intake',
  'hr_recruitment.weight_attrition_pipeline': 'Attrition Pipeline',
  'hr_recruitment.weight_peer_benchmark': 'Peer Benchmark',
};

export default function WeightsAdminPage() {
  const { data: weights, isLoading } = useWeights();
  const updateMut = useUpdateWeights();
  const [localWeights, setLocalWeights] = useState<{ key: string; value: number }[]>([]);
  const [dirty, setDirty] = useState(false);

  // Sync fetched weights into local state
  useEffect(() => {
    if (weights) {
      setLocalWeights(weights.map((w) => ({ key: w.key, value: Number(w.value) })));
      setDirty(false);
    }
  }, [weights]);

  const sum = localWeights.reduce((acc, w) => acc + w.value, 0);
  const sumValid = sum === 100;

  const handleChange = (key: string, val: number) => {
    setLocalWeights((prev) =>
      prev.map((w) => (w.key === key ? { ...w, value: val } : w))
    );
    setDirty(true);
  };

  const handleSave = async () => {
    await updateMut.mutateAsync(
      localWeights.map((w) => ({ key: w.key, value: String(w.value) }))
    );
    setDirty(false);
  };

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Signal Weights">
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Signal Weights</h1>
            </div>
            <Button
              onClick={handleSave}
              size="sm"
              disabled={!dirty || !sumValid || updateMut.isPending}
            >
              {updateMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save Weights
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            These 7 weights control how the composite recruitment need score is
            calculated. Each weight represents a percentage contribution from
            that input signal. The total must equal exactly 100.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Weight cards */}
              <div className="space-y-3">
                {localWeights.map((w) => (
                  <Card key={w.key}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-medium">
                          {WEIGHT_LABELS[w.key] ?? w.key}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground truncate">{w.key}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          className="w-20 h-9 text-right"
                          value={w.value}
                          onChange={(e) => handleChange(w.key, Number(e.target.value))}
                        />
                        <span className="text-sm text-muted-foreground w-4">%</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Sum indicator */}
              <div
                className={`flex items-center gap-2 rounded-md border px-4 py-3 ${
                  sumValid
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {sumValid ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
                <span className="text-sm font-medium">
                  Total: {sum}%{' '}
                  {sumValid ? '(valid)' : `(must be exactly 100, off by ${sum - 100 > 0 ? '+' : ''}${sum - 100})`}
                </span>
              </div>

              {updateMut.isSuccess && (
                <p className="text-sm text-green-600">Weights saved successfully.</p>
              )}
              {updateMut.isError && (
                <p className="text-sm text-red-600">
                  Failed to save: {(updateMut.error as Error)?.message}
                </p>
              )}
            </>
          )}
        </div>
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
