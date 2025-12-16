'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BottomNavSubmenuProps } from './types';
import { usePathname } from 'next/navigation';

export function BottomNavSubmenu({
  items,
  isOpen,
  onItemClick
}: BottomNavSubmenuProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: {
              height: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2, delay: 0.1 }
            }
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: {
              height: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.15 }
            }
          }}
          className="overflow-hidden border-t border-border bg-background/95"
        >
          <motion.div
            initial={{ y: -10 }}
            animate={{ y: 0 }}
            className="p-3 max-h-[50vh] overflow-y-auto"
          >
            <div className="grid grid-cols-3 gap-2">
              {items.map((item, index) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;

                return (
                  <motion.button
                    key={item.href}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: index * 0.03 }
                    }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onItemClick(item.href)}
                    className={cn(
                      'flex flex-col items-center justify-center p-3 rounded-lg',
                      'transition-colors duration-200',
                      'hover:bg-accent',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Icon
                      className="h-5 w-5 mb-1"
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                    <span
                      className={cn(
                        'text-[10px] text-center leading-tight line-clamp-2',
                        isActive && 'font-semibold'
                      )}
                    >
                      {item.label}
                    </span>
                    {item.parentLabel && (
                      <span className="text-[8px] text-muted-foreground/70 mt-0.5 truncate max-w-full">
                        {item.parentLabel}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
