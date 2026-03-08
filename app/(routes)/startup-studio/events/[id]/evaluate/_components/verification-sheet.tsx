'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { VerificationCard } from './verification-card'
import type { EvaluatorTeamCard, VerificationStatus } from '@/types/startup-studio'

interface VerificationSheetProps {
  team: EvaluatorTeamCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerify: (
    team: EvaluatorTeamCard,
    status: VerificationStatus,
    data: any,
    flagReason?: string
  ) => Promise<void>
  isSubmitting: boolean
}

export function VerificationSheet({
  team,
  open,
  onOpenChange,
  onVerify,
  isSubmitting,
}: VerificationSheetProps) {
  if (!team) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">
            {team.demo_slot != null ? `Slot ${team.demo_slot}: ` : ''}
            {team.team_name}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-2">
          <VerificationCard
            team={team}
            onVerify={(status, data, flagReason) =>
              onVerify(team, status, data, flagReason)
            }
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
