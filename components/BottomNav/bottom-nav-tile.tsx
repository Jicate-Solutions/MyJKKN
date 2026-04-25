'use client';

/**
 * BottomNavTile
 *
 * Phone home-screen style tile: 56pt rounded-square gradient icon + 2-line label.
 * Used by BottomNavMoreMenu's flat 4-column grid.
 *
 * Props:
 *   gradient  — CSS linear-gradient string (from getTileGradient)
 *   emoji     — emoji / text icon rendered inside the gradient container
 *   label     — section name (truncated to 2 lines at 10.5px)
 *   isActive  — highlights the tile when current route is within this section
 *   onClick   — navigate handler (passed from parent)
 *
 * Example:
 *   <BottomNavTile
 *     gradient="linear-gradient(135deg, #6366f1, #4f46e5)"
 *     emoji="📅"
 *     label="Academic Management"
 *     isActive={false}
 *     onClick={() => router.push('/academic')}
 *   />
 */

import { cn } from '@/lib/utils';

interface BottomNavTileProps {
  gradient: string;
  emoji: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** data-testid / selector hook for CDP-based testing */
  'data-tile-href'?: string;
}

export function BottomNavTile({
  gradient,
  emoji,
  label,
  isActive,
  onClick,
  'data-tile-href': dataTileHref,
}: BottomNavTileProps) {
  return (
    <button
      onClick={onClick}
      data-bottom-nav-tile
      data-tile-href={dataTileHref}
      aria-label={label}
      className={cn(
        // Layout
        'flex flex-col items-center justify-start gap-1.5',
        'px-1 py-2 min-w-0 w-full',
        // Interaction
        'cursor-pointer select-none',
        'active:scale-90 transition-transform duration-75 ease-in-out',
        // Active ring
        isActive && 'opacity-100',
        !isActive && 'opacity-90',
        // Reset button defaults
        'bg-transparent border-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 rounded-xl'
      )}
    >
      {/* Gradient icon container */}
      <div
        className={cn(
          'flex items-center justify-center',
          'w-14 h-14 rounded-[14px] text-[26px] flex-shrink-0',
          'shadow-[0_4px_8px_rgba(0,0,0,0.08)]',
          // Active = subtle ring
          isActive && 'ring-2 ring-offset-1 ring-white/60'
        )}
        style={{ background: gradient }}
        aria-hidden
      >
        <span role="img" aria-hidden="true" className="leading-none select-none">
          {emoji}
        </span>
      </div>

      {/* Label — max 2 lines, 10.5px */}
      <span
        className={cn(
          'text-center font-medium',
          'max-w-[80px] w-full px-0.5',
          'leading-tight text-slate-700',
          // 2-line clamp
          'overflow-hidden',
          'line-clamp-2',
          isActive ? 'text-slate-900 font-semibold' : 'text-slate-600'
        )}
        style={{ fontSize: '10.5px', lineHeight: '1.25' }}
      >
        {label}
      </span>
    </button>
  );
}
