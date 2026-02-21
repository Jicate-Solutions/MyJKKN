'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEligibleDepartments, useNominations } from '@/hooks/use-department-tracker';

interface NominateDialogProps {
  onSuccess?: () => void;
}

export function NominateDialog({ onSuccess }: NominateDialogProps) {
  const [open, setOpen] = useState(false);
  const { departments, loading: loadingDepts } = useEligibleDepartments();
  const { nominate } = useNominations();

  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [reason, setReason] = useState('');
  const [capabilitiesText, setCapabilitiesText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Group eligible departments by institution
  const grouped = useMemo(() => {
    const eligible = departments.filter((d) => d.is_eligible);
    const groups: Record<string, typeof eligible> = {};
    eligible.forEach((d) => {
      if (!groups[d.institution_name]) groups[d.institution_name] = [];
      groups[d.institution_name].push(d);
    });
    return groups;
  }, [departments]);

  const ineligible = useMemo(() => departments.filter((d) => !d.is_eligible), [departments]);

  const selectedDept = useMemo(
    () => departments.find((d) => d.department_id === selectedDeptId),
    [departments, selectedDeptId]
  );

  const handleSubmit = async () => {
    if (!selectedDept || !reason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const capabilities = capabilitiesText
        .split(',')
        .map((c) => c.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean);

      await nominate({
        department_id: selectedDept.department_id,
        institution_id: selectedDept.institution_id,
        nomination_reason: reason.trim(),
        suggested_capabilities: capabilities,
      });

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setSelectedDeptId('');
        setReason('');
        setCapabilitiesText('');
        onSuccess?.();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit nomination');
    } finally {
      setSubmitting(false);
    }
  };

  const eligibleCount = Object.values(grouped).flat().length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nominate Department
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nominate Department for Solutions Hub</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <p className="text-sm font-medium">Nomination submitted successfully!</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Department selector */}
            <div className="space-y-2">
              <Label>Select Department</Label>
              {loadingDepts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading departments...
                </div>
              ) : eligibleCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <AlertCircle className="h-4 w-4" />
                  No eligible departments found. All departments are either already solution departments or excluded by eligibility criteria.
                </div>
              ) : (
                <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(grouped).map(([institution, depts]) => (
                      <div key={institution}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {institution}
                        </div>
                        {depts.map((d) => (
                          <SelectItem key={d.department_id} value={d.department_id}>
                            {d.department_name} ({d.department_code})
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Ineligible departments info */}
            {ineligible.length > 0 && (
              <details className="text-sm">
                <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                  {ineligible.length} departments excluded (view reasons)
                </summary>
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                  {ineligible.map((d) => (
                    <div key={d.department_id} className="text-xs text-muted-foreground">
                      <span className="font-medium">{d.department_name}</span>
                      <span className="ml-1">— {d.exclusion_reasons.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Nomination reason */}
            <div className="space-y-2">
              <Label>Reason for Nomination *</Label>
              <Textarea
                placeholder="Why should this department become a solution department? What commercial capabilities does it have?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>

            {/* Suggested capabilities */}
            <div className="space-y-2">
              <Label>Suggested Capabilities</Label>
              <Input
                placeholder="e.g., software-development, data-analytics, ai-ml"
                value={capabilitiesText}
                onChange={(e) => setCapabilitiesText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated. These describe what the department can deliver commercially.</p>
              {capabilitiesText && (
                <div className="flex flex-wrap gap-1">
                  {capabilitiesText
                    .split(',')
                    .map((c) => c.trim().toLowerCase().replace(/\s+/g, '-'))
                    .filter(Boolean)
                    .map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedDeptId || !reason.trim() || submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Submit Nomination
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
