'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BottomNavItemProps } from './types';

export function BottomNavItem({
  id,
  icon: Icon,
  label,
  isActive,
  hasSubmenu,
  badgeCount,
  onClick
}: BottomNavItemProps) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center px-2 py-2 min-w-[64px] flex-1',
        'transition-colors duration-200',
        isActive ? 'text-primary' : 'text-muted-foreground'
      )}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="relative"
        animate={{
          scale: isActive ? 1.1 : 1,
          y: isActive ? -2 : 0
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 17
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />

        {/* Badge for notifications */}
        {badgeCount !== undefined && badgeCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
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
          opacity: isActive ? 1 : 0.8
        }}
      >
        {label}
      </motion.span>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="bottomNavActiveIndicator"
          className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary"
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30
          }}
        />
      )}
    </motion.button>
  );
}
