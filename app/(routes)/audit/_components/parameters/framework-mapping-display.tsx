'use client';

// Audit parameter framework-mapping display.
// Renders a JSONB framework_mapping object as body-coded badges with criterion
// codes next to each. One parameter → many body mappings (NAAC, NBA, NIRF, etc).
//
// Used by:
//   - app/(routes)/audit/parameters/page.tsx (catalog table column)
//   - app/(routes)/audit/parameters/[code]/page.tsx (detail section)
//
// Design note: a missing-or-dash value means the parameter isn't mapped for that
// body. We skip those — don't show "NAAC —" ghost rows.

import { Badge } from '@/components/ui/badge';
import type {
  AccreditationBodyCode,
  FrameworkMapping
} from '@/lib/types/audit';

const BODY_COLORS: Record<AccreditationBodyCode, string> = {
  naac: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  nba: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  nirf: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  ugc: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  qs: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
  aicte: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
  ncte: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  dci: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  pci: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  inc: 'bg-orange-100 text-orange-800 hover:bg-orange-100'
};

interface FrameworkMappingDisplayProps {
  mapping: FrameworkMapping;
  /** 'inline' = compact one-line, 'block' = each badge on own row with label */
  variant?: 'inline' | 'block';
  /** Show a dash when no mappings present. Defaults to "—". */
  emptyLabel?: string;
}

export function FrameworkMappingDisplay({
  mapping,
  variant = 'inline',
  emptyLabel = '—'
}: FrameworkMappingDisplayProps) {
  const entries = Object.entries(mapping ?? {})
    .filter(([, code]) => code && code !== '-' && code !== '')
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return <span className='text-muted-foreground text-sm'>{emptyLabel}</span>;
  }

  if (variant === 'block') {
    return (
      <div className='space-y-2'>
        {entries.map(([body, code]) => {
          const bodyKey = body as AccreditationBodyCode;
          const colorClass =
            BODY_COLORS[bodyKey] ?? 'bg-gray-100 text-gray-800 hover:bg-gray-100';
          return (
            <div key={body} className='flex items-center gap-2'>
              <Badge variant='secondary' className={`${colorClass} font-semibold`}>
                {body.toUpperCase()}
              </Badge>
              <span className='font-mono text-sm'>{code}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className='flex flex-wrap gap-1'>
      {entries.map(([body, code]) => {
        const bodyKey = body as AccreditationBodyCode;
        const colorClass =
          BODY_COLORS[bodyKey] ?? 'bg-gray-100 text-gray-800 hover:bg-gray-100';
        return (
          <Badge
            key={body}
            variant='secondary'
            className={`${colorClass} text-xs`}
            title={`${body.toUpperCase()} criterion ${code}`}
          >
            {body.toUpperCase()}: <span className='font-mono ml-1'>{code}</span>
          </Badge>
        );
      })}
    </div>
  );
}
