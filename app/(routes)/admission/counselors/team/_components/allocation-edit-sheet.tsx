'use client';

// allocation-edit-sheet.tsx
// Right-side Sheet that opens from the Edit pencil on each Allocation tab card.
// Lets admin replace the counselor's institution + source-master allocation set
// in one flow. Both writes diff-upsert (CounselorAllocationService); the sheet
// fires them in parallel via Promise.all and shows a single combined toast.
//
// Pre-population data: the existing useCounselorSources hook reads a column
// (`source`) that doesn't exist in the production schema (table stores
// `source_id`), so we can't rely on it for the Sheet's pre-pop. Instead the
// Sheet runs its own scoped fetch for the open counselor when it mounts.
// This is intentional read-hook isolation per PR-Y scope (mutation hooks only,
// no read-hook touch).

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useActiveLeadSources } from '@/hooks/admission/use-active-lead-sources';
import {
  useUpdateCounselorInstitutions,
  useUpdateCounselorSources,
} from '@/hooks/admission/use-counselor-team-data';

interface AllocationEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counselorId: string;
  counselorName: string;
}

export function AllocationEditSheet({
  open,
  onOpenChange,
  counselorId,
  counselorName,
}: AllocationEditSheetProps) {
  const { institutions, loading: instLoading } = useInstitutionsWithAccess();
  const { options: sourceOptions, isLoading: srcLoading } =
    useActiveLeadSources();

  const [selectedInstitutionIds, setSelectedInstitutionIds] = useState<
    string[]
  >([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [prepopLoading, setPrepopLoading] = useState(false);
  const [prepopError, setPrepopError] = useState<string | null>(null);

  const updateInstitutions = useUpdateCounselorInstitutions(counselorId);
  const updateSources = useUpdateCounselorSources(counselorId);
  const isSaving = updateInstitutions.isPending || updateSources.isPending;

  // Fetch the counselor's current allocations when the sheet opens.
  // Scoped to this counselor only (no read-hook reuse — see header comment).
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPrepopLoading(true);
    setPrepopError(null);

    (async () => {
      const supabase = createClientSupabaseClient();
      const [instRes, srcRes] = await Promise.all([
        (supabase as any)
          .from('admission_counselor_institutions')
          .select('institution_id')
          .eq('counselor_id', counselorId),
        (supabase as any)
          .from('admission_counselor_sources')
          .select('source_id')
          .eq('counselor_id', counselorId),
      ]);

      if (cancelled) return;

      if (instRes.error) {
        setPrepopError(instRes.error.message);
        setPrepopLoading(false);
        return;
      }
      if (srcRes.error && srcRes.error.code !== '42P01') {
        setPrepopError(srcRes.error.message);
        setPrepopLoading(false);
        return;
      }

      const currentInstIds = ((instRes.data ?? []) as {
        institution_id: string;
      }[]).map((r) => r.institution_id);
      const currentSrcIds = ((srcRes.data ?? []) as { source_id: string }[])
        .map((r) => r.source_id)
        .filter((v): v is string => !!v);

      setSelectedInstitutionIds(currentInstIds);
      setSelectedSourceIds(currentSrcIds);
      setPrepopLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, counselorId]);

  const toggleInstitution = (id: string) => {
    setSelectedInstitutionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    try {
      await Promise.all([
        updateInstitutions.mutateAsync(selectedInstitutionIds),
        updateSources.mutateAsync(selectedSourceIds),
      ]);
      toast.success(`Allocation updated for ${counselorName}`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(`Failed to update allocation: ${msg}`);
      // sheet stays open so user can retry
    }
  };

  const dataLoading = instLoading || srcLoading || prepopLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Allocation</SheetTitle>
          <SheetDescription>
            Choose which institutions and lead sources route to{' '}
            <span className="font-medium">{counselorName}</span>.
          </SheetDescription>
        </SheetHeader>

        {prepopError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Failed to load current allocation: {prepopError}
          </div>
        )}

        <div className="mt-6 space-y-6">
          {/* Institutions */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4" />
              Institutions
              {selectedInstitutionIds.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({selectedInstitutionIds.length} selected)
                </span>
              )}
            </div>
            {dataLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : institutions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No institutions accessible.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-md border p-2">
                {institutions.map((inst) => {
                  const checked = selectedInstitutionIds.includes(inst.id);
                  return (
                    <label
                      key={inst.id}
                      className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleInstitution(inst.id)}
                      />
                      <span className="text-sm">{inst.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Lead Sources */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4" />
              Lead Sources
              {selectedSourceIds.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({selectedSourceIds.length} selected)
                </span>
              )}
            </div>
            {dataLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : sourceOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No active lead sources.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-md border p-2">
                {sourceOptions.map((src) => {
                  const checked = selectedSourceIds.includes(src.masterId);
                  return (
                    <label
                      key={src.masterId}
                      className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSource(src.masterId)}
                      />
                      <span className="text-sm">{src.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Leave all unchecked to receive leads from all sources (wildcard
              fallback).
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-end gap-2 border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || dataLoading}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
