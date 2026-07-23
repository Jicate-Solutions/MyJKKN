'use client';

/**
 * Per-Input Threshold Admin — manage amber/red thresholds per signal input.
 *
 * 7 inputs x 2 thresholds (amber, red) = up to 14 policy rows in platform_policies.
 * Policy keys: hr_recruitment.threshold_amber_{input_key}, hr_recruitment.threshold_red_{input_key}
 *
 * Validation: amber must be > red for each input (amber = "warning zone" is a higher %,
 * red = "critical" is a lower %).
 */

import { useEffect, useState, useMemo } from 'react';
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

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

const INPUT_KEYS: SignalInputKey[] = [
  'sanctioned_gap',
  'sfr',
  'specialization_gap',
  'workload',
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

  // Validation: amber > red for each input
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    rows.forEach((row) => {
      if (row.amber <= row.red) {
        errors[row.input_key] = 'Amber must be greater than Red';
      }
      if (row.amber < 0 || row.amber > 100) {
        errors[`${row.input_key}_amber`] = 'Must be 0-100';
      }
      if (row.red < 0 || row.red > 100) {
        errors[`${row.input_key}_red`] = 'Must be 0-100';
      }
    });
    return errors;
  }, [rows]);

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
            Set amber (warning) and red (critical) thresholds for each signal input.
            When an input&apos;s percentage-of-norm falls below these thresholds, it
            triggers the corresponding status. Amber must be higher than red.
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
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={100}
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
                              max={100}
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
                              <AlertTriangle className="h-4 w-4 text-red-500" title={error} />
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
                      Fix validation errors before saving. Amber must be greater than Red for each input.
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
