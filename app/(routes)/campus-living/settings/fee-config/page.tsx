'use client';

/**
 * Fee Configuration — /campus-living/settings/fee-config
 *
 * Wired 2026-04-24 (Agent D — settings real-save). Before today this page
 * had THREE fake-save buttons ("Add Room Type", "Edit", "Save Changes")
 * that only showed a warning toast. Wardens believed they were editing
 * hostel/mess fees for 2+ months; nothing persisted. Now persists to
 * `hostel_fee_config` via CampusLivingSettings service + react-query hooks.
 *
 * Permission gate: `campus_living.settings.edit` (or super-admin).
 */

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Edit, IndianRupee, Trash2, Loader2, Info } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAcademicYears } from '@/hooks/use-academic-years';
import {
  useHostelFeeConfigs,
  useDeleteHostelFeeConfig,
} from '@/hooks/campus-living/use-hostel-fee-config';
import { FeeConfigDialog, type FeeConfigRow } from './_components/fee-config-dialog';

const formatCurrency = (amount?: number | null) => {
  if (amount == null) return '—';
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
};

const roomTypeLabel = (t: string) => {
  const labels: Record<string, string> = {
    single: 'Single',
    double: 'Double',
    triple: 'Triple',
    quad: 'Quad',
    dormitory: 'Dormitory',
  };
  return labels[t] ?? t;
};

const acStatusLabel = (s: string) => {
  const labels: Record<string, string> = {
    ac: 'AC',
    non_ac: 'Non-AC',
    cooler: 'Cooler',
  };
  return labels[s] ?? s;
};

export default function FeeConfigPage() {
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const { data: academicYears, isLoading: loadingYears } = useAcademicYears(
    isSuperAdmin ? undefined : institutionId,
  );

  const [selectedYearId, setSelectedYearId] = useState<string | undefined>(undefined);
  const effectiveYearId = selectedYearId ?? academicYears?.data?.[0]?.id ?? undefined;

  const {
    data: feeConfigs,
    isLoading,
    isError,
    error,
  } = useHostelFeeConfigs(institutionId, effectiveYearId);

  const [editingRow, setEditingRow] = useState<FeeConfigRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const deleteMut = useDeleteHostelFeeConfig();

  const rows = useMemo(() => feeConfigs ?? [], [feeConfigs]);

  const handleAdd = () => {
    setEditingRow(null);
    setDialogOpen(true);
  };

  const handleEdit = (row: FeeConfigRow) => {
    setEditingRow(row);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this fee configuration? This cannot be undone.')) return;
    try {
      await deleteMut.mutateAsync(id);
    } catch {
      // handled by mutation
    }
  };

  return (
    <ContentLayout title="Fee Configuration">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fee Configuration</h1>
            <p className="text-muted-foreground">
              Hostel fees by room type / AC status for the selected academic year
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Academic Year</Label>
              <Select
                value={effectiveYearId ?? ''}
                onValueChange={(v) => setSelectedYearId(v)}
                disabled={loadingYears || !academicYears?.data?.length}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears?.data?.map((y: { id: string; academic_year_name?: string; year?: string }) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.academic_year_name ?? y.year ?? y.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canEdit && effectiveYearId ? (
              <Button onClick={handleAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add Fee Config
              </Button>
            ) : null}
          </div>
        </div>

        {!canEdit ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              You can view fee configurations but editing requires the{' '}
              <code>campus_living.settings.edit</code> permission.
            </AlertDescription>
          </Alert>
        ) : null}

        {!effectiveYearId && !loadingYears ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>No academic year</AlertTitle>
            <AlertDescription>
              No active academic years found. Create one under Organizations before configuring hostel fees.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Fee Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading fee configurations...
              </div>
            ) : isError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load fee configs</AlertTitle>
                <AlertDescription>{(error as Error)?.message ?? 'Unknown error'}</AlertDescription>
              </Alert>
            ) : rows.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No fee configurations for this academic year yet.
                {canEdit && effectiveYearId ? ' Click "Add Fee Config" to create the first one.' : ''}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room Type</TableHead>
                    <TableHead>AC</TableHead>
                    <TableHead>Annual Fee</TableHead>
                    <TableHead>Semester Fee</TableHead>
                    <TableHead>Monthly Fee</TableHead>
                    <TableHead>Deposit</TableHead>
                    <TableHead>Mess (sem)</TableHead>
                    <TableHead>Mess (month)</TableHead>
                    {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{roomTypeLabel(row.room_type)}</TableCell>
                      <TableCell>{acStatusLabel(row.ac_status)}</TableCell>
                      <TableCell>{formatCurrency(row.annual_fee)}</TableCell>
                      <TableCell>{formatCurrency(row.semester_fee)}</TableCell>
                      <TableCell>{formatCurrency(row.monthly_fee)}</TableCell>
                      <TableCell>{formatCurrency(row.deposit_amount)}</TableCell>
                      <TableCell>{formatCurrency(row.mess_fee_semester)}</TableCell>
                      <TableCell>{formatCurrency(row.mess_fee_monthly)}</TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(row as FeeConfigRow)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(row.id)}
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Requires schema extension</AlertTitle>
              <AlertDescription>
                Late-fee, due-date, and installment settings are not yet persisted — they require
                additional columns on <code>hostel_fee_config</code> (or a new
                <code>hostel_payment_settings</code> table). Tracked separately with the migrations
                team; this section will come online once those columns exist.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {institutionId && effectiveYearId ? (
        <FeeConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          institutionId={institutionId}
          academicYearId={effectiveYearId}
          initialValue={editingRow}
        />
      ) : null}
    </ContentLayout>
  );
}
