'use client';

import { useState } from 'react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { ChevronDown, Check, Building2 } from 'lucide-react';

type Props = {
  /** Currently selected institution_id, or null/undefined for "All institutions" (group view). */
  selectedInstitutionId: string | null;
  onChange: (institutionId: string | null) => void;
};

/**
 * Institution dropdown picker for the YoY chart. When a specific institution
 * is chosen, ALL views (trajectory, drill-down sheet, excluded panel, verdict
 * banner, future actionable-insights cards) scope to that institution's data.
 *
 * Super-admins see all 8 colleges + "All institutions" option.
 * Counsellors/principals with restricted scope see only their accessible
 * institutions in the list (the access hook handles RLS filtering upstream).
 */
export function YoYInstitutionPicker({ selectedInstitutionId, onChange }: Props) {
  const { institutions, loading } = useUserInstitutionAccess();
  const [open, setOpen] = useState(false);

  const selected = institutions.find((i) => i.institution_id === selectedInstitutionId);
  const label = selected ? shortenInstitutionName(selected.institution_name) : 'All institutions';

  if (loading) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11.5px]"
        style={{
          borderColor: '#d8d3c8',
          backgroundColor: '#f1ece0',
          color: '#6e6760',
          fontFamily: 'var(--font-ibm-plex-mono)',
        }}
      >
        <Building2 size={13} />
        Loading…
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11.5px] transition hover:bg-[#ece8de]"
        style={{
          borderColor: '#d8d3c8',
          backgroundColor: selectedInstitutionId ? '#fff8ec' : '#f1ece0',
          color: '#2a2624',
          fontFamily: 'var(--font-ibm-plex-mono)',
        }}
      >
        <Building2 size={13} style={{ color: selectedInstitutionId ? '#a8453c' : '#6e6760' }} />
        <span
          className="font-medium tabular-nums"
          style={{ color: selectedInstitutionId ? '#a8453c' : '#2a2624' }}
        >
          {label}
        </span>
        <ChevronDown
          size={12}
          className="transition-transform"
          style={{
            color: '#6e6760',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <>
          {/* click-away overlay */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute right-0 z-20 mt-1 w-[280px] overflow-hidden rounded-md border shadow-lg"
            style={{
              backgroundColor: '#fafaf8',
              borderColor: '#d8d3c8',
              fontFamily: 'var(--font-ibm-plex-sans)',
            }}
          >
            <PickerItem
              label="All institutions"
              sublabel="Group-wide view across all colleges"
              active={!selectedInstitutionId}
              isAggregate
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            <div className="border-t" style={{ borderColor: '#e7e2d8' }} />
            {institutions.map((i) => (
              <PickerItem
                key={i.institution_id}
                label={shortenInstitutionName(i.institution_name)}
                sublabel={i.institution_name}
                active={selectedInstitutionId === i.institution_id}
                onClick={() => {
                  onChange(i.institution_id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PickerItem({
  label,
  sublabel,
  active,
  isAggregate,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  isAggregate?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-[#f4efe3]"
      style={{
        backgroundColor: active ? '#fff8ec' : 'transparent',
        color: '#2a2624',
      }}
    >
      <div className="mt-0.5 w-3">
        {active && <Check size={12} style={{ color: '#a8453c' }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-[12.5px] font-medium leading-tight"
          style={{
            color: isAggregate && !active ? '#6e6760' : '#2a2624',
          }}
        >
          {label}
        </div>
        {sublabel !== label && (
          <div
            className="text-[10.5px] leading-tight mt-0.5"
            style={{ color: '#9a948a' }}
          >
            {sublabel}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Strip "JKKN College of" / "JKKN " prefix for compact pill label display.
 * Full name stays in the sublabel for disambiguation.
 */
function shortenInstitutionName(name: string): string {
  return name
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '')
    .replace(/and Technology$/, 'Tech')
    .replace(/and Research$/, '')
    .replace(/and Hospital$/, '')
    .replace(/Sciences$/, 'Sci')
    .trim();
}
