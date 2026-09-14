'use client';

/**
 * Per-Input Threshold Admin — manage amber/red thresholds per signal input.
 *
 * 7 inputs x 2 thresholds (amber, red) = up to 14 policy rows in platform_policies.
 * Policy keys: hr_recruitment.threshold_amber_{input_key}, hr_recruitment.threshold_red_{input_key}
 *
 * Validation is direction-aware (see threshold-direction.ts): for a
 * lower-is-worse input amber > red; for a higher-is-worse input (SFR, projected
 * intake, attrition pipeline) red > amber and values may exceed 100.
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Gauge, Save, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  useThresholds,
  useUpdateThresholds,
} from '@/hooks/hr/recruitment-need/use-recruitment-admin';
import type { SignalInputKey } from '@/types/hr-recruitment-need';
import {
  THRESHOLD_DIRECTION,
  validateThresholdRows,
} from '@/lib/services/hr/recruitment-need/threshold-direction';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

// 'workload' is deliberately absent: its bands are set PER INSTITUTION on
// /hr/workload/settings.
const INPUT_KEYS: SignalInputKey[] = [
  'sanctioned_gap',
  'sfr',
  'specialization_gap',
  'projected_intake',
  'attrition_pipeline',
  'peer_benchmark',
];

const INPUT_LABELS: Record<SignalInputKey, string> = {
  sanctioned_gap: 'Sanctioned Gap',
  sfr: 'Student-Faculty Ratio',
  specialization_gap: 'Specialization Coverage',
  workload: 'Faculty Workload',
  projected_intake: 'Projected Intake',
  attrition_pipeline: 'Attrition Pipeline',
  peer_benchmark: 'Peer Benchmark',
};

interface ThresholdRow {
  input_key: SignalInputKey;
  amber: number;
  red: number;
}

export default function ThresholdsAdminPage() {
  const { data: policies, isLoading } = useThresholds();
  const updateMut = useUpdateThresholds();
  const [rows, setRows] = useState<ThresholdRow[]>([]);
  const [dirty, setDirty] = useState(false);

  // Parse policy rows into structured threshold rows
  useEffect(() => {
    if (!policies) return;

    const parsed: ThresholdRow[] = INPUT_KEYS.map((key) => {
      const amberPolicy = policies.find(
        (p) => p.key === `hr_recruitment.threshold_amber_${key}`
      );
      const redPolicy = policies.find(
        (p) => p.key === `hr_recruitment.threshold_red_${key}`
      );

      return {
        input_key: key,
        amber: amberPolicy ? Number(amberPolicy.value) : 80,
        red: redPolicy ? Number(redPolicy.value) : 60,
      };
    });

    setRows(parsed);
    setDirty(false);
  }, [policies]);

  // Validation: direction-aware per input (amber > red for lower-is-worse,
  // red > amber for higher-is-worse)
  const validationErrors = useMemo(() => validateThresholdRows(rows), [rows]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  function handleChange(inputKey: SignalInputKey, field: 'amber' | 'red', value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.input_key === inputKey ? { ...r, [field]: value } : r
      )
    );
    setDirty(true);
  }

  async function handleSave() {
    const thresholds = rows.flatMap((r) => [
      { key: `hr_recruitment.threshold_amber_${r.input_key}`, value: String(r.amber) },
      { key: `hr_recruitment.threshold_red_${r.input_key}`, value: String(r.red) },
    ]);

    await updateMut.mutateAsync(thresholds);
    setDirty(false);
  }

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Signal Thresholds">
        <div className="space-y-6 max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Per-Input Thresholds</h1>
            </div>
            <Button
              onClick={handleSave}
              size="sm"
              disabled={!dirty || hasErrors || updateMut.isPending}
            >
              {updateMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save Thresholds
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Set amber (warning) and red (critical) thresholds for each signal input,
            as a percentage of norm. Amber fires first: for a &quot;lower is worse&quot;
            input amber must be higher than red; for a &quot;higher is worse&quot; input
            red must be higher than amber.
            Senior Learner workload limits are set per institution on{' '}
            <Link href="/hr/workload/settings" className="underline">Workload Settings</Link>.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Signal Input</TableHead>
                      <TableHead className="text-right">
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-300 text-[10px]"
                        >
                          Amber Threshold (%)
                        </Badge>
                      </TableHead>
                      <TableHead className="text-right">
                        <Badge
                          variant="outline"
                          className="text-red-600 border-red-300 text-[10px]"
                        >
                          Red Threshold (%)
                        </Badge>
                      </TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const error = validationErrors[row.input_key];
                      return (
                        <TableRow key={row.input_key}>
                          <TableCell className="font-medium text-sm">
                            {INPUT_LABELS[row.input_key]}
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {THRESHOLD_DIRECTION[row.input_key] === 'higher-is-worse'
                                ? 'higher is worse'
                                : 'lower is worse'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-20 h-8 text-right ml-auto"
                              value={row.amber}
                              onChange={(e) =>
                                handleChange(row.input_key, 'amber', Number(e.target.value))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-20 h-8 text-right ml-auto"
                              value={row.red}
                              onChange={(e) =>
                                handleChange(row.input_key, 'red', Number(e.target.value))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {error ? (
                              <span title={error}>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              </span>
                            ) : dirty ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {hasErrors && (
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      Fix validation errors before saving:{' '}
                      {Array.from(new Set(Object.values(validationErrors))).join('; ')}.
                    </span>
                  </div>
                )}

                {updateMut.isSuccess && !dirty && (
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Thresholds saved successfully.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
