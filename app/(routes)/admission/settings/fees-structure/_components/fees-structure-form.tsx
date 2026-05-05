'use client';

// fees-structure-form.tsx
//
// Right-pane editor. When all 8 dims are selected, looks up an existing
// structure via FeeStructureService.findByDimensions. If not found,
// renders NewStructureForm; if found, renders ExistingStructureEditor.
// (Plan 2 / Task 14 — full implementation lands in Task 14 commit.)

import { useEffect, useState } from 'react';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
} from '@/types/admission';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';

interface Props {
  dims: Partial<FeeStructureMatrixDimensions>;
  onChanged?: () => void;
}

export function FeesStructureForm({ dims, onChanged: _onChanged }: Props) {
  const [structure, setStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isFullDims(dims)) {
      setStructure(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    FeeStructureService.findByDimensions(dims as FeeStructureMatrixDimensions)
      .then((s) => {
        if (!cancelled) setStructure(s);
      })
      .catch((err) => console.error('Failed to load fee structure', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dims]);

  if (!isFullDims(dims)) {
    return (
      <p className="text-muted-foreground text-sm">
        Pick a leaf in the tree (drill all the way down to an admission year) to view
        or create a fee structure.
      </p>
    );
  }
  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  return (
    <div className="text-sm">
      {structure ? (
        <p className="text-muted-foreground">
          Structure exists: <span className="font-medium">{structure.name}</span>{' '}
          ({structure.items.length} item{structure.items.length === 1 ? '' : 's'}).
        </p>
      ) : (
        <p className="text-muted-foreground">
          No fee structure for this combination yet — editor coming in Task 14.
        </p>
      )}
    </div>
  );
}

function isFullDims(d: Partial<FeeStructureMatrixDimensions>): boolean {
  return !!(
    d.institution_id &&
    d.degree_id &&
    d.department_id &&
    d.programme_id &&
    d.quota_id &&
    d.community_category_id &&
    d.accommodation_type_id &&
    d.admission_year_id
  );
}
