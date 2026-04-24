'use client';

// Dialog: add a new External Auditor (Time-Boxed).
// Email + expires_at + institution_ids[]. On submit → POST /api/audit/external-auditors.

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useCreateExternalAuditor } from '@/hooks/audit/use-external-auditors';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Default +14 days, rounded to end of day, formatted for datetime-local input.
function defaultExpiryLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setHours(23, 59, 0, 0);
  // datetime-local wants YYYY-MM-DDTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddExternalAuditorDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState('');
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiryLocal());
  const [selectedInstitutionIds, setSelectedInstitutionIds] = useState<string[]>([]);

  const { institutions, loading: instLoading } = useInstitutionsWithAccess();
  const createMutation = useCreateExternalAuditor();

  // "All institutions" convenience — pre-select everything once loaded.
  const allIds = useMemo(() => institutions.map((i) => i.id), [institutions]);
  const allSelected = selectedInstitutionIds.length > 0 && selectedInstitutionIds.length === allIds.length;

  const toggleInstitution = (id: string) => {
    setSelectedInstitutionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const toggleAll = () => {
    setSelectedInstitutionIds(allSelected ? [] : allIds);
  };

  const isValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    expiresLocal.length > 0 &&
    selectedInstitutionIds.length > 0 &&
    new Date(expiresLocal).getTime() > Date.now();

  const handleSubmit = async () => {
    if (!isValid) return;
    try {
      await createMutation.mutateAsync({
        email: email.trim().toLowerCase(),
        expires_at: new Date(expiresLocal).toISOString(),
        institution_ids: selectedInstitutionIds,
      });
      toast.success('External auditor added');
      setEmail('');
      setExpiresLocal(defaultExpiryLocal());
      setSelectedInstitutionIds([]);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add external auditor');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add External Auditor (Time-Boxed)</DialogTitle>
          <DialogDescription>
            Grants read-only audit access (cycles, findings, attestations, parameters) to the
            specified email across the selected institutions until the expiry timestamp.
            Typically used for external peer-team visits (e.g. Aassaan Aug 2026).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ext-auditor-email">Email</Label>
            <Input
              id="ext-auditor-email"
              type="email"
              placeholder="external.auditor@example.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              If this email doesn&apos;t yet have an account, a pre-registered profile is staged
              and linked on first login.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ext-auditor-expires">Expires At</Label>
            <Input
              id="ext-auditor-expires"
              type="datetime-local"
              value={expiresLocal}
              onChange={(e) => setExpiresLocal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Default +14 days. Maximum recommended: 90 days.</p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Institutions ({selectedInstitutionIds.length}/{allIds.length})</Label>
              <button
                type="button"
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={toggleAll}
                disabled={instLoading || allIds.length === 0}
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
              {instLoading && <p className="text-sm text-muted-foreground">Loading institutions…</p>}
              {!instLoading && institutions.length === 0 && (
                <p className="text-sm text-muted-foreground">No institutions available.</p>
              )}
              {institutions.map((inst) => (
                <label
                  key={inst.id}
                  className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedInstitutionIds.includes(inst.id)}
                    onCheckedChange={() => toggleInstitution(inst.id)}
                  />
                  <span>{inst.name}</span>
                </label>
              ))}
            </div>
          </div>

          {!isValid && email.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Provide a valid email, a future expiry timestamp, and select at least one institution.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Auditor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
