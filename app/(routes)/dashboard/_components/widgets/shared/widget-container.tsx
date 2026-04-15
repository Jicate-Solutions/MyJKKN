'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface WidgetContainerProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  error?: string | null;
  doubleSpan?: boolean;
  onClick?: () => void;
}

export function WidgetContainer({
  title,
  icon: Icon,
  children,
  className,
  isLoading = false,
  error = null,
  doubleSpan = false,
  onClick,
}: WidgetContainerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'glass-card rounded-xl p-4 sm:p-6 transition-all duration-300',
        doubleSpan && 'col-span-1 md:col-span-2',
        onClick && 'cursor-pointer hover:shadow-lg hover:scale-[1.02]',
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
        )}
        <h3 className="text-sm sm:text-base font-semibold text-foreground">
          {title}
        </h3>
      </div>

      {/* Content */}
      <div className="relative min-h-[120px]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-xs sm:text-sm text-destructive font-medium">
                Failed to load data
              </p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </motion.div>
  );
}
