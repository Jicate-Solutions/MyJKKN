'use client'

import { Rocket, Building2, Briefcase, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TRACKS } from '@/lib/constants/startup-studio/tracks'
import type { TrackId } from '@/types/startup-studio'

const ICON_MAP = {
  Rocket,
  Building2,
  Briefcase,
  CheckCircle,
}

const COLOR_BORDER: Record<string, string> = {
  green: 'border-green-500 bg-green-50 dark:bg-green-950/30',
  blue: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
  purple: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30',
  gray: 'border-gray-400 bg-gray-50 dark:bg-gray-900/30',
}

const COLOR_RING: Record<string, string> = {
  green: 'ring-2 ring-green-500',
  blue: 'ring-2 ring-blue-500',
  purple: 'ring-2 ring-purple-500',
  gray: 'ring-2 ring-gray-400',
}

interface TrackCardProps {
  trackId: TrackId
  selected: boolean
  onSelect: (id: TrackId) => void
  disabled?: boolean
}

export function TrackCard({ trackId, selected, onSelect, disabled }: TrackCardProps) {
  const track = TRACKS.find(t => t.id === trackId)!
  const Icon = ICON_MAP[track.icon as keyof typeof ICON_MAP]

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(trackId)}
      className={cn(
        'w-full text-left rounded-xl border-2 p-4 transition-all',
        COLOR_BORDER[track.color],
        selected && COLOR_RING[track.color],
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{track.label}</p>
          <p className="text-xs text-muted-foreground mb-2">{track.sublabel}</p>
          <p className="text-sm text-foreground/80">{track.description}</p>
          <ul className="mt-2 space-y-1">
            {track.benefits.map(b => (
              <li key={b} className="text-xs text-muted-foreground flex gap-1">
                <span>•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  )
}
