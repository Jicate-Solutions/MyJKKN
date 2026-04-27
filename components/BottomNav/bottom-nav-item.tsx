'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNavItemProps } from './types';

// Fast spring for snappy interactions
const tapSpring = {
  type: 'spring' as const,
  stiffness: 600,
  damping: 25
};

// Smooth spring for icon animations
const iconSpring = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 20
};

// Very fast spring for indicator
const indicatorSpring = {
  type: 'spring' as const,
  stiffness: 600,
  damping: 30
};

export function BottomNavItem({
  id,
  icon: Icon,
  label,
  isActive,
  hasSubmenu,
  badgeCount,
  hideIndicator = false,
  customColor,
  onClick,
  variant = 'strip',
  tileGradient
}: BottomNavItemProps) {
  // --- TILE VARIANT: 4-col grid tile for the More-drawer ---
  if (variant === 'tile') {
    return (
      <motion.button
        onClick={onClick}
        className={cn(
          // min-h-[100px] keeps the 4-col grid aligned regardless of whether
          // a label wraps to 1 or 2 lines. Pre-fix tiles ragged in their row.
          // items-start + justify-start anchors content to the top so icons
          // line up across all tiles in a row, and the label spans whatever
          // height it needs without pushing the icon out of position.
          'flex flex-col items-center justify-start gap-2 p-2 rounded-xl min-h-[100px]',
          'transition-colors duration-150',
          isActive
            ? 'bg-primary/10 ring-1 ring-primary/20'
            : 'active:bg-accent'
        )}
        whileTap={{ scale: 0.92 }}
        transition={tapSpring}
        aria-label={label}
        aria-pressed={isActive}
      >
        {/* 56×56 Liquid Glass tile — cue-stack approach (UX synthesis 2026-04-27).
            Goal: trigger the brain's object-recognition pathway via convergent
            depth cues, achieving "premium polished Apple" perceptual reading
            at compositor-level GPU cost (works on low-RAM Android targets).
            Cues layered (bottom → top):
              1. Base gradient (existing tileGradient or fallback) — the color
              2. Outer cast shadow → "elevated above surface"
              3. Inset top-edge sheen → "light hits soft top edge from above"
              4. 1px white inset ring → crisp luminous boundary, light refraction
              5. Specular highlight overlay (::before equivalent <span>) →
                 single static "light source upper-left" — primary depth cue
              6. Icon with drop-shadow → "icon suspended above the glass"
              7. whileTap on parent button → tactile press compression
            No backdrop-blur (catastrophic at 22 tiles × ~5ms on weak GPUs).
            All cues are GPU-cheap: gradients, static shadows, transforms. */}
        <motion.div
          className={cn(
            'relative w-14 h-14 rounded-2xl flex items-center justify-center',
            tileGradient ?? 'bg-gradient-to-br from-primary/70 to-primary',
            'shadow-[0_4px_14px_-2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.35)]',
            'ring-1 ring-inset ring-white/15',
            isActive && 'ring-2 ring-primary/30 ring-offset-1'
          )}
          animate={{ scale: isActive ? 1.08 : 1 }}
          transition={iconSpring}
        >
          {/* Specular highlight — static cue reading as "light source upper-left".
              Sibling order matters: this paints first, icon paints on top. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/25 via-white/0 to-transparent"
          />
          <Icon
            className="relative h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
            strokeWidth={isActive ? 2.5 : 2}
          />
          {/* Multi-module disclosure affordance — tells the user "this tile
              has multiple modules underneath; tap to drill into the list."
              Small chevron in the bottom-right corner of the gradient
              container, white-on-translucent so it reads against any
              gradient color. Single-module tiles render no chevron and
              navigate directly on tap (existing behavior). */}
          {hasSubmenu && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/95 flex items-center justify-center shadow-sm"
              aria-hidden="true"
            >
              <ChevronRight className="h-3 w-3 text-foreground" strokeWidth={2.5} />
            </span>
          )}
        </motion.div>

        {/* 2-line label */}
        <span
          className={cn(
            'text-[10px] text-center leading-tight line-clamp-2 w-full',
            isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </motion.button>
    );
  }

  // --- STRIP VARIANT (default): existing bottom-nav strip rendering ---
  // Determine the color class based on custom color or default behavior
  const colorClass = customColor
    ? customColor
    : isActive
      ? 'text-primary'
      : 'text-muted-foreground';

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center px-2 py-2 min-w-[64px] flex-1',
        'transition-colors duration-150',
        colorClass
      )}
      whileTap={{ scale: 0.92 }}
      transition={tapSpring}
    >
      <motion.div
        className="relative"
        animate={{
          scale: isActive ? 1.15 : 1,
          y: isActive ? -3 : 0
        }}
        transition={iconSpring}
      >
        <motion.div
          animate={{
            rotate: isActive ? [0, -5, 5, 0] : 0
          }}
          transition={{
            duration: 0.3,
            ease: 'easeOut'
          }}
        >
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        </motion.div>

        {/* Badge for notifications */}
        {badgeCount !== undefined && badgeCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 700, damping: 20 }}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </motion.span>
        )}
      </motion.div>

      <motion.span
        className={cn(
          'text-[10px] mt-1 font-medium truncate max-w-full',
          isActive && 'font-semibold'
        )}
        animate={{
          opacity: isActive ? 1 : 0.7,
          y: isActive ? 1 : 0
        }}
        transition={{ duration: 0.15 }}
      >
        {label}
      </motion.span>

      {/* Active indicator with smooth slide */}
      {isActive && !hideIndicator && (
        <motion.div
          layoutId="bottomNavActiveIndicator"
          className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary"
          transition={indicatorSpring}
        />
      )}
    </motion.button>
  );
}
