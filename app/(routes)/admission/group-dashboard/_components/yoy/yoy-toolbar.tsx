'use client';

import type { ViewMode, HorizonMode } from './yoy-chart-canvas';

type Props = {
  horizonMode: HorizonMode;
  viewMode: ViewMode;
  expandedYear: number | null;
  onHorizonChange: (m: HorizonMode) => void;
  onViewModeChange: (m: ViewMode) => void;
  onCollapseExpansion: () => void;
};

/**
 * Toolbar: three segmented controls grouped tightly into one cohesive strip.
 * Sits in the chart card header, right-aligned. Each pill is mono-font for
 * tabular-feel; active state uses warm cream background to match the
 * editorial palette.
 */
export function YoYToolbar({
  horizonMode,
  viewMode,
  expandedYear,
  onHorizonChange,
  onViewModeChange,
  onCollapseExpansion,
}: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
    >
      {expandedYear !== null && (
        <button
          type="button"
          onClick={onCollapseExpansion}
          className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition"
          style={{
            borderColor: '#c8553d',
            backgroundColor: 'rgba(200, 85, 61, 0.06)',
            color: '#a8453c',
          }}
        >
          ✕ Collapse {expandedYear}-{(expandedYear + 1) % 100} institutions
        </button>
      )}

      <Segmented
        options={[
          { value: 'fair-race', label: 'Fair race' },
          { value: 'full-horizon', label: 'Full horizon' },
        ]}
        value={horizonMode}
        onChange={(v) => onHorizonChange(v as HorizonMode)}
      />

      <Segmented
        options={[
          { value: 'institution', label: 'By institution' },
          { value: 'category', label: 'By category' },
        ]}
        value={viewMode}
        onChange={(v) => onViewModeChange(v as ViewMode)}
      />
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border p-0.5"
      style={{ borderColor: '#d8d3c8', backgroundColor: '#f1ece0' }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition"
            style={{
              backgroundColor: active ? '#fafaf8' : 'transparent',
              color: active ? '#2a2624' : '#6e6760',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
