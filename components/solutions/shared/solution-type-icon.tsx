'use client'

import { Hammer, BookOpen, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SolutionType } from '@/types/solutions'

interface SolutionTypeIconProps {
  type: SolutionType
  size?: 'sm' | 'md' | 'lg'
  withBackground?: boolean
  className?: string
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

const bgSizeMap = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string; bgColor: string }> = {
  software: {
    icon: Hammer,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  training: {
    icon: BookOpen,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  content: {
    icon: Video,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
}

export function SolutionTypeIcon({
  type,
  size = 'md',
  withBackground = false,
  className,
}: SolutionTypeIconProps) {
  const config = typeConfig[type]
  const Icon = config.icon

  if (withBackground) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg',
          bgSizeMap[size],
          config.bgColor,
          className
        )}
      >
        <Icon className={cn(sizeMap[size], config.color)} />
      </div>
    )
  }

  return <Icon className={cn(sizeMap[size], config.color, className)} />
}

// Get label for solution type
export function getSolutionTypeLabel(type: SolutionType): string {
  const labels: Record<SolutionType, string> = {
    software: 'Software Solution',
    training: 'Training Program',
    content: 'Content Production',
  }
  return labels[type]
}
