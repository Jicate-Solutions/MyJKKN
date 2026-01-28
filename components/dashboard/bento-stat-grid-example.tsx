/**
 * ============================================
 * BENTO STAT GRID EXAMPLE
 * ============================================
 * Created: 2025-01-28
 * Purpose: Example usage of BentoStatGrid components with sample data
 * ============================================
 */

'use client';

import {
  Users,
  GraduationCap,
  Building,
  IndianRupee,
  TrendingUp,
  Activity,
  FileText,
  Zap
} from 'lucide-react';
import { BentoStatGrid, MasonryBentoGrid, FeaturedBentoGrid } from './bento-stat-grid';

/**
 * Sample data for demonstration
 */
const sampleStats = [
  {
    id: '1',
    title: 'Total Students',
    value: 2847,
    trend: {
      direction: 'up' as const,
      percentage: 12
    },
    icon: GraduationCap,
    gradient: 'from-green-500 to-emerald-500',
    additionalInfo: [
      { label: 'Active', value: 2654 },
      { label: 'New', value: 193 }
    ],
    variant: 'glass' as const
  },
  {
    id: '2',
    title: 'Total Revenue',
    value: '₹45.2L',
    trend: {
      direction: 'up' as const,
      percentage: 8
    },
    icon: IndianRupee,
    gradient: 'from-yellow-500 to-orange-500',
    additionalInfo: [
      { label: 'Collected', value: '₹42L' },
      { label: 'Pending', value: '₹3.2L' }
    ],
    variant: 'glass' as const
  },
  {
    id: '3',
    title: 'Active Users',
    value: 456,
    trend: {
      direction: 'up' as const,
      percentage: 5
    },
    icon: Users,
    gradient: 'from-blue-500 to-cyan-500',
    additionalInfo: [
      { label: 'Staff', value: 89 },
      { label: 'Students', value: 367 }
    ],
    variant: 'glass' as const
  },
  {
    id: '4',
    title: 'Institutions',
    value: 12,
    trend: {
      direction: 'stable' as const,
      percentage: 0
    },
    icon: Building,
    gradient: 'from-purple-500 to-pink-500',
    variant: 'glass' as const
  },
  {
    id: '5',
    title: 'Applications',
    value: 234,
    trend: {
      direction: 'up' as const,
      percentage: 15
    },
    icon: FileText,
    gradient: 'from-teal-500 to-cyan-500',
    additionalInfo: [
      { label: 'Pending', value: 45 },
      { label: 'Approved', value: 189 }
    ],
    variant: 'glass' as const
  },
  {
    id: '6',
    title: 'System Load',
    value: '42%',
    trend: {
      direction: 'down' as const,
      percentage: 3
    },
    icon: Zap,
    gradient: 'from-indigo-500 to-blue-500',
    variant: 'glass' as const
  }
];

/**
 * Example 1: Standard Bento Grid
 * - First card is large (2x2)
 * - Responsive layout with attractive spacing
 */
export function BentoGridExample() {
  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-2xl font-bold mb-2'>Standard Bento Grid</h2>
        <p className='text-sm text-muted-foreground mb-4'>
          First card is featured (large), rest adapt to available space
        </p>
      </div>
      <BentoStatGrid stats={sampleStats} />
    </div>
  );
}

/**
 * Example 2: Masonry Grid
 * - Pinterest-style layout
 * - Natural flowing columns
 */
export function MasonryGridExample() {
  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-2xl font-bold mb-2'>Masonry Bento Grid</h2>
        <p className='text-sm text-muted-foreground mb-4'>
          Pinterest-style layout with natural flowing columns
        </p>
      </div>
      <MasonryBentoGrid stats={sampleStats} />
    </div>
  );
}

/**
 * Example 3: Featured Grid
 * - First card is extra large
 * - Rest are smaller and uniform
 */
export function FeaturedGridExample() {
  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-2xl font-bold mb-2'>Featured Bento Grid</h2>
        <p className='text-sm text-muted-foreground mb-4'>
          First card is featured (extra large), rest are uniform smaller cards
        </p>
      </div>
      <FeaturedBentoGrid stats={sampleStats} />
    </div>
  );
}

/**
 * Example 4: Different Variants
 * - Showing glass, gradient, and neon styles
 */
export function VariantExample() {
  const variantStats = [
    { ...sampleStats[0], variant: 'glass' as const },
    { ...sampleStats[1], variant: 'gradient' as const },
    { ...sampleStats[2], variant: 'neon' as const },
    { ...sampleStats[3], variant: 'glass' as const }
  ];

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-2xl font-bold mb-2'>Different Variants</h2>
        <p className='text-sm text-muted-foreground mb-4'>
          Glass, Gradient, and Neon styles
        </p>
      </div>
      <BentoStatGrid stats={variantStats} />
    </div>
  );
}

/**
 * Example 5: All Variants Demo
 * - Complete demo page showing all grid types
 */
export function AllVariantsDemo() {
  return (
    <div className='space-y-12 p-6'>
      <BentoGridExample />
      <hr className='border-white/20 dark:border-white/10' />
      <MasonryGridExample />
      <hr className='border-white/20 dark:border-white/10' />
      <FeaturedGridExample />
      <hr className='border-white/20 dark:border-white/10' />
      <VariantExample />
    </div>
  );
}
