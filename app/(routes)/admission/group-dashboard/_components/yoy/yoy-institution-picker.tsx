'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

type Institution = { id: string; name: string };

type Props = {
  /** Currently selected institution_id, or null for "All institutions" (group view). */
  selectedInstitutionId: string | null;
  onChange: (institutionId: string | null) => void;
};

/**
 * Institution dropdown for the YoY chart. Lists ONLY the 8 JKKN colleges
 * involved in admissions — excludes Main Office, Testing, Incubation Forum,
 * Matric School, Jicate Solutions (none of which are part of the admission
 * cycle YoY story).
 *
 * Director-flagged 2026-06-03 07:25 IST: the prior version used
 * useUserInstitutionAccess which returned a mix of irrelevant institutions
 * AND was missing key colleges (Allied Health Sciences, Arts & Sci Self/Aided)
 * for super-admins. This version queries the institutions table directly with
 * a name-pattern filter, then RLS handles per-user visibility downstream
 * (counsellors at one institution will see only their accessible ones).
 */
export function YoYInstitutionPicker({ selectedInstitutionId, onChange }: Props) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();
    (async () => {
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .like('name', 'JKKN%')
        .order('name');
      if (cancelled) return;
      if (error) {
        setInstitutions([]);
      } else {
        // Exclude non-admission entities by name pattern
        const filtered = (data ?? []).filter((i) => {
          const n = i.name;
          return (
            !n.includes('Main Office') &&
            !n.includes('Testing') &&
            !n.includes('Nattraja') &&
            !n.includes('Matric') &&
            !n.includes('Jicate')
          );
        });
        setInstitutions(filtered);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = institutions.find((i) => i.id === selectedInstitutionId);
  const label = selected ? shortenInstitutionName(selected.name) : 'All institutions';

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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="absolute right-0 z-20 mt-1 w-[300px] overflow-hidden rounded-md border shadow-lg"
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
                key={i.id}
                label={shortenInstitutionName(i.name)}
                sublabel={i.name}
                active={selectedInstitutionId === i.id}
                onClick={() => {
                  onChange(i.id);
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
