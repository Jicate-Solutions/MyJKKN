'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Target, Save } from 'lucide-react';
import { useDepartmentTargets } from '@/hooks/use-department-tracker';

// ============================================
// HELPERS
// ============================================

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

function getNextQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const nextQ = q === 4 ? 1 : q + 1;
  const nextYear = q === 4 ? now.getFullYear() + 1 : now.getFullYear();
  return `${nextYear}-Q${nextQ}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ============================================
// TYPES
// ============================================

interface DepartmentTargetsProps {
  solutionDepartmentId: string;
  currentRevenue: number;
}

// ============================================
// COMPONENT
// ============================================

export function DepartmentTargets({
  solutionDepartmentId,
  currentRevenue,
}: DepartmentTargetsProps) {
  const { targets, loading, error, setTarget } = useDepartmentTargets(solutionDepartmentId);

  // Form state
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [targetAmount, setTargetAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentQuarter = getCurrentQuarter();
  const nextQuarter = getNextQuarter();

  // Find the target for the current quarter
  const currentTarget = useMemo(() => {
    return targets.find((t) => t.quarter === currentQuarter) || null;
  }, [targets, currentQuarter]);

  // Calculate progress
  const targetRevenue = currentTarget?.target_revenue ?? 0;
  const progressPct = targetRevenue > 0 ? Math.min((currentRevenue / targetRevenue) * 100, 100) : 0;
  const achievementPct = targetRevenue > 0 ? (currentRevenue / targetRevenue) * 100 : 0;

  // Sort targets for history: most recent first
  const sortedTargets = useMemo(() => {
    return [...targets].sort((a, b) => b.quarter.localeCompare(a.quarter));
  }, [targets]);

  // Achievement badge color
  function getAchievementBadge(pct: number) {
    if (pct >= 100) {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-0">{pct.toFixed(1)}%</Badge>;
    }
    if (pct >= 50) {
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-0">{pct.toFixed(1)}%</Badge>;
    }
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-0">{pct.toFixed(1)}%</Badge>;
  }

  // Progress bar indicator color
  function getProgressColor(pct: number): string {
    if (pct >= 100) return 'bg-green-600';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  }

  // Handle save
  async function handleSave() {
    setFormError(null);

    const amount = parseFloat(targetAmount);
    if (!targetAmount || isNaN(amount) || amount <= 0) {
      setFormError('Target revenue must be a positive number.');
      return;
    }

    if (selectedQuarter !== currentQuarter && selectedQuarter !== nextQuarter) {
      setFormError('You can only set targets for the current or next quarter.');
      return;
    }

    try {
      setSaving(true);
      await setTarget(selectedQuarter, amount, notes || undefined);
      // Reset form after successful save
      setTargetAmount('');
      setNotes('');
    } catch (err: any) {
      setFormError(err.message || 'Failed to save target.');
    } finally {
      setSaving(false);
    }
  }

  // ============================================
  // LOADING STATE
  // ============================================

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-2 w-full" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================
  // ERROR STATE
  // ============================================

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-6">
          <p className="text-sm text-red-600">Failed to load targets: {error}</p>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-4">
      {/* Current Quarter Target Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            Current Quarter Target
          </CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {currentQuarter}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentTarget ? (
            <>
              {/* Target and Actual values */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Target Revenue</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(targetRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Actual Revenue</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(currentRevenue)}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  {getAchievementBadge(achievementPct)}
                </div>
                <Progress
                  value={progressPct}
                  className="h-3"
                  indicatorClassName={getProgressColor(achievementPct)}
                />
                <p className="text-xs text-muted-foreground">
                  {achievementPct >= 100
                    ? `Target exceeded by ${formatCurrency(currentRevenue - targetRevenue)}`
                    : `${formatCurrency(targetRevenue - currentRevenue)} remaining to reach target`}
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <Target className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No target set for {currentQuarter}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the form below to set a quarterly target.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set Target Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Set Quarterly Target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Quarter selector */}
            <div className="space-y-2">
              <Label htmlFor="quarter-select">Quarter</Label>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger id="quarter-select">
                  <SelectValue placeholder="Select quarter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentQuarter}>
                    {currentQuarter} (Current)
                  </SelectItem>
                  <SelectItem value={nextQuarter}>
                    {nextQuarter} (Next)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target revenue input */}
            <div className="space-y-2">
              <Label htmlFor="target-revenue">Target Revenue (INR)</Label>
              <Input
                id="target-revenue"
                type="number"
                min="1"
                step="1000"
                placeholder="e.g., 500000"
                value={targetAmount}
                onChange={(e) => {
                  setTargetAmount(e.target.value);
                  setFormError(null);
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="target-notes">Notes (optional)</Label>
            <Textarea
              id="target-notes"
              placeholder="Any context or goals for this quarter..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Error message */}
          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving || !targetAmount}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Save className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Target
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Target History Table */}
      {sortedTargets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Target History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Quarter</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Target</TableHead>
                    <TableHead className="whitespace-nowrap">Notes</TableHead>
                    <TableHead className="whitespace-nowrap">Set By</TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTargets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {t.quarter}
                        {t.quarter === currentQuarter && (
                          <Badge variant="outline" className="ml-2 text-xs">Current</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(t.target_revenue)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {t.notes || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.set_by || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(t.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
