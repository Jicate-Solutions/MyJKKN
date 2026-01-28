'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EnhancedStatCard } from './enhanced-stat-card';

interface StatItem {
  id: string;
  title: string;
  value: number | string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  additionalInfo?: Array<{ label: string; value: string | number }>;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'gradient' | 'glass' | 'neon';
  gridArea?: string;
}

interface BentoStatGridProps {
  stats: StatItem[];
  className?: string;
}

/**
 * Bento Grid Layout for Dashboard Stats
 *
 * Responsive grid that adapts to different screen sizes:
 * - Mobile: Single column
 * - Tablet: 2 columns
 * - Desktop: 4 columns with varied sizes (bento style)
 * - Large screens: 6 columns with complex bento layout
 */
export function BentoStatGrid({ stats, className }: BentoStatGridProps) {
  // Pre-defined bento grid patterns based on number of items
  const getBentoGridClasses = (index: number, total: number) => {
    // For 4-6 items, create an attractive bento layout
    if (total >= 4) {
      const patterns = [
        // First item (large feature card)
        'col-span-1 sm:col-span-2 lg:col-span-2 lg:row-span-2',
        // Second item (medium)
        'col-span-1 sm:col-span-1 lg:col-span-2',
        // Third item (medium)
        'col-span-1 sm:col-span-1 lg:col-span-2',
        // Fourth item (small)
        'col-span-1 sm:col-span-1 lg:col-span-1',
        // Fifth item (small)
        'col-span-1 sm:col-span-1 lg:col-span-1',
        // Additional items (flexible)
        'col-span-1 sm:col-span-1 lg:col-span-2'
      ];
      return patterns[index] || patterns[patterns.length - 1];
    }

    // For fewer items, use simpler layout
    return 'col-span-1 sm:col-span-1 lg:col-span-1';
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      variants={container}
      initial='hidden'
      animate='show'
      className={cn(
        'grid gap-4 sm:gap-5 lg:gap-6',
        // Responsive grid columns
        'grid-cols-1',
        'sm:grid-cols-2',
        'lg:grid-cols-4',
        'xl:grid-cols-4',
        // Auto rows for bento layout
        'auto-rows-auto',
        className
      )}
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.id}
          variants={item}
          className={cn(
            'group',
            getBentoGridClasses(index, stats.length)
          )}
        >
          <EnhancedStatCard
            title={stat.title}
            value={stat.value}
            trend={stat.trend}
            icon={stat.icon}
            gradient={stat.gradient}
            additionalInfo={stat.additionalInfo}
            size={index === 0 && stats.length >= 4 ? 'large' : 'medium'}
            variant={stat.variant || 'glass'}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * Alternative: Masonry-style Bento Grid
 * For more dynamic, Pinterest-like layouts
 */
export function MasonryBentoGrid({ stats, className }: BentoStatGridProps) {
  return (
    <div
      className={cn(
        'columns-1 sm:columns-2 lg:columns-3 xl:columns-4',
        'gap-4 sm:gap-5 lg:gap-6',
        'space-y-4 sm:space-y-5 lg:space-y-6',
        className
      )}
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className='break-inside-avoid mb-4 sm:mb-5 lg:mb-6'
        >
          <EnhancedStatCard
            title={stat.title}
            value={stat.value}
            trend={stat.trend}
            icon={stat.icon}
            gradient={stat.gradient}
            additionalInfo={stat.additionalInfo}
            size={stat.size || 'medium'}
            variant={stat.variant || 'glass'}
          />
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Featured Bento Grid
 * First card is extra large, rest are smaller
 */
export function FeaturedBentoGrid({ stats, className }: BentoStatGridProps) {
  if (stats.length === 0) return null;

  const [featured, ...rest] = stats;

  return (
    <div className={cn('space-y-4 sm:space-y-5 lg:space-y-6', className)}>
      {/* Featured large card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className='w-full'
      >
        <EnhancedStatCard
          title={featured.title}
          value={featured.value}
          trend={featured.trend}
          icon={featured.icon}
          gradient={featured.gradient}
          additionalInfo={featured.additionalInfo}
          size='large'
          variant={featured.variant || 'glass'}
        />
      </motion.div>

      {/* Smaller cards in grid */}
      {rest.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6'
        >
          {rest.map((stat, index) => (
            <motion.div
              key={stat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
            >
              <EnhancedStatCard
                title={stat.title}
                value={stat.value}
                trend={stat.trend}
                icon={stat.icon}
                gradient={stat.gradient}
                additionalInfo={stat.additionalInfo}
                size='small'
                variant={stat.variant || 'glass'}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
