'use client';

// Filter bar for the Industry Partners directory.
//
// Deliberately takes its current values as PROPS from the server page rather
// than calling `useSearchParams()`. That keeps the component out of the
// "useSearchParams must be wrapped in Suspense" prerender trap and keeps a
// single source of truth: the URL the server already parsed.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PARTNERSHIP_TYPES,
  PARTNERSHIP_TYPE_LABELS,
  type PartnershipType,
} from '@/types/cdc/industry-partners';

export type PartnerStatusFilter = 'active' | 'inactive' | 'all';

interface PartnerFiltersProps {
  search: string;
  status: PartnerStatusFilter;
  partnershipType: PartnershipType | null;
}

const STATUS_OPTIONS: { value: PartnerStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

export function PartnerFilters({
  search,
  status,
  partnershipType,
}: PartnerFiltersProps) {
  const router = useRouter();
  const [term, setTerm] = useState(search);

  function apply(next: {
    q?: string;
    status?: PartnerStatusFilter;
    type?: PartnershipType | null;
  }) {
    const params = new URLSearchParams();

    const q = next.q !== undefined ? next.q : term;
    const s = next.status !== undefined ? next.status : status;
    const t = next.type !== undefined ? next.type : partnershipType;

    if (q.trim()) params.set('q', q.trim());
    if (s !== 'active') params.set('status', s);
    if (t) params.set('type', t);
    // Any filter change resets to page 1 — carrying the old page number
    // forward is how "my search returned nothing" bugs get born.

    const qs = params.toString();
    router.push(qs ? `/industry-partners?${qs}` : '/industry-partners');
  }

  const hasFilters =
    Boolean(search) || status !== 'active' || Boolean(partnershipType);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: term });
          }}
        >
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, sector, contact or city…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="pl-9"
            aria-label="Search industry partners"
          />
        </form>

        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={status === opt.value ? 'default' : 'outline'}
              onClick={() => apply({ status: opt.value })}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">
          Partnership type:
        </span>
        {PARTNERSHIP_TYPES.map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={partnershipType === t ? 'default' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => apply({ type: partnershipType === t ? null : t })}
          >
            {PARTNERSHIP_TYPE_LABELS[t]}
          </Button>
        ))}

        {hasFilters && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => {
              setTerm('');
              router.push('/industry-partners');
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
