'use client';

// map-row-dialog.tsx
// Maps a DQR row to a canonical lookup value. The lookup catalogue is chosen
// based on the column referenced by the DQR row (quota → quotas,
// community → community_categories, accommodation_type → accommodation_types).

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { DqrService, type DqrRow } from '@/lib/services/admission/dqr-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import type {
  AdmissionFeeQuota,
  AdmissionFeeCommunityCategory,
  AdmissionFeeAccommodationType,
} from '@/types/admission';

type FkColumnName = 'quota_id' | 'community_category_id' | 'accommodation_type_id';

interface CanonicalOption {
  id: string;
  code: string;
  name: string;
}

interface MapRowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DqrRow;
  /**
   * Optional override for the institution context used when fetching
   * accommodation_types. Falls back to "all institutions" by trying common
   * profile fields if needed; if the row is for a quota or community category,
   * this is ignored.
   */
  institutionId?: string;
  onSuccess?: () => void;
}

/**
 * Infer (a) which canonical lookup table to load and (b) which FK column on
 * the parent table to write, from the DQR row's column_name.
 */
function inferCanonicalContext(columnName: string): {
  catalogue: 'quota' | 'community' | 'accommodation';
  fkColumnName: FkColumnName;
} | null {
  const lc = columnName.toLowerCase();
  if (lc.includes('quota')) {
    return { catalogue: 'quota', fkColumnName: 'quota_id' };
  }
  if (lc.includes('community') || lc.includes('community_category')) {
    return { catalogue: 'community', fkColumnName: 'community_category_id' };
  }
  if (lc.includes('accommodation') || lc.includes('residential')) {
    return { catalogue: 'accommodation', fkColumnName: 'accommodation_type_id' };
  }
  return null;
}

export function MapRowDialog({
  open,
  onOpenChange,
  row,
  institutionId,
  onSuccess,
}: MapRowDialogProps) {
  const ctx = useMemo(() => inferCanonicalContext(row.column_name), [row.column_name]);

  const [options, setOptions] = useState<CanonicalOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load options when dialog opens
  useEffect(() => {
    if (!open || !ctx) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        let opts: CanonicalOption[] = [];
        if (ctx.catalogue === 'quota') {
          const items: AdmissionFeeQuota[] = await LookupService.listQuotas(true);
          opts = items.map((q) => ({ id: q.id, code: q.code, name: q.name }));
        } else if (ctx.catalogue === 'community') {
          const items: AdmissionFeeCommunityCategory[] =
            await LookupService.listCommunityCategories(true);
          opts = items.map((c) => ({ id: c.id, code: c.code, name: c.name }));
        } else if (ctx.catalogue === 'accommodation') {
          if (!institutionId) {
            // Best-effort: load nothing — admin must pick institution context first.
            opts = [];
          } else {
            const items: AdmissionFeeAccommodationType[] =
              await LookupService.listAccommodationTypes(institutionId, true);
            opts = items.map((a) => ({ id: a.id, code: a.code, name: a.name }));
          }
        }
        if (!cancelled) setOptions(opts);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load canonical values';
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ctx, institutionId]);

  // Reset state when dialog opens for a new row
  useEffect(() => {
    if (open) {
      setSelectedId('');
      setNotes('');
    }
  }, [open, row.id]);

  const handleSubmit = async () => {
    if (!ctx) {
      toast.error(
        `Cannot infer canonical catalogue from column "${row.column_name}". Edit the DQR row manually.`,
      );
      return;
    }
    if (!selectedId) {
      toast.error('Pick a canonical value first');
      return;
    }
    setSubmitting(true);
    try {
      await DqrService.mapToCanonical({
        dqrId: row.id,
        canonicalLookupId: selectedId,
        fkColumnName: ctx.fkColumnName,
        notes: notes.trim() || undefined,
      });
      toast.success('Mapped to canonical value');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to map DQR row';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Map to Canonical Value</DialogTitle>
          <DialogDescription>
            Choose the canonical lookup value that &ldquo;{row.observed_value}&rdquo; should
            resolve to. Mapping updates {row.occurrence_count} parent row
            {row.occurrence_count === 1 ? '' : 's'} and marks this DQR row as resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Source</Label>
              <p className="font-mono text-sm">
                {row.table_name}.{row.column_name}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Observed</Label>
              <p>
                <span className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium">
                  {row.observed_value}
                </span>
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Occurrences</Label>
              <p className="text-sm">{row.occurrence_count}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Catalogue</Label>
              <p className="text-sm capitalize">
                {ctx ? ctx.catalogue.replace('_', ' ') : 'Unknown'}
              </p>
            </div>
          </div>

          {!ctx ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Could not infer the canonical catalogue from column
              &ldquo;{row.column_name}&rdquo;. Use the Ignore action instead, or update the
              DQR row manually.
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="canonical-select">Canonical Value *</Label>
                <Select
                  value={selectedId}
                  onValueChange={setSelectedId}
                  disabled={loading || submitting || options.length === 0}
                >
                  <SelectTrigger id="canonical-select">
                    <SelectValue
                      placeholder={
                        loading
                          ? 'Loading canonical values...'
                          : options.length === 0
                            ? ctx.catalogue === 'accommodation' && !institutionId
                              ? 'Pick institution context first'
                              : 'No canonical values available'
                            : 'Pick a canonical value'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {opt.code}
                          </span>
                          <span>{opt.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loadError && (
                  <p className="text-xs text-destructive">{loadError}</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional reviewer notes (e.g. why this mapping)"
                  className="min-h-[60px]"
                  disabled={submitting}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !ctx || !selectedId}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Map
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
