'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClipboardEdit, CheckCircle2, Flag, XCircle } from 'lucide-react'
import { VerificationSheet } from './verification-sheet'
import type { EvaluatorTeamCard, VerificationStatus } from '@/types/startup-studio'

interface VerificationTableProps {
  teams: EvaluatorTeamCard[]
  onVerify: (
    team: EvaluatorTeamCard,
    status: VerificationStatus,
    data: any,
    flagReason?: string
  ) => Promise<void>
  isSubmitting: boolean
}

const statusBadge = (status: VerificationStatus | undefined) => {
  if (!status || status === 'pending') {
    return <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
  }
  if (status === 'verified') {
    return <Badge className="bg-green-500 text-xs">Verified</Badge>
  }
  if (status === 'flagged') {
    return <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">Flagged</Badge>
  }
  return <Badge variant="outline" className="text-xs text-red-600 border-red-400">Disqualified</Badge>
}

const statusIcon = (status: VerificationStatus | undefined) => {
  if (status === 'verified') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'flagged') return <Flag className="h-4 w-4 text-amber-500" />
  if (status === 'disqualified') return <XCircle className="h-4 w-4 text-red-500" />
  return null
}

export function VerificationTable({ teams, onVerify, isSubmitting }: VerificationTableProps) {
  const [selectedTeam, setSelectedTeam] = useState<EvaluatorTeamCard | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const openSheet = (team: EvaluatorTeamCard) => {
    setSelectedTeam(team)
    setSheetOpen(true)
  }

  const handleVerify = async (
    team: EvaluatorTeamCard,
    status: VerificationStatus,
    data: any,
    flagReason?: string
  ) => {
    await onVerify(team, status, data, flagReason)
    setSheetOpen(false)
  }

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 text-center">Slot</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="hidden sm:table-cell">Institution</TableHead>
              <TableHead className="text-center hidden md:table-cell">Users</TableHead>
              <TableHead className="text-center hidden md:table-cell">Active</TableHead>
              <TableHead className="text-center hidden md:table-cell">Revenue</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team, index) => {
              const sub = team.submission
              const status = team.verification?.verification_status
              return (
                <TableRow
                  key={team.registration_id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => openSheet(team)}
                >
                  <TableCell className="text-center text-sm font-mono text-muted-foreground">
                    {team.demo_slot ?? index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusIcon(status)}
                      <span className="font-medium text-sm">{team.team_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {team.institution_name}
                  </TableCell>
                  <TableCell className="text-center text-sm hidden md:table-cell font-mono">
                    {sub?.user_count ?? 0}
                  </TableCell>
                  <TableCell className="text-center text-sm hidden md:table-cell font-mono">
                    {sub?.active_users_count ?? 0}
                  </TableCell>
                  <TableCell className="text-center text-sm hidden md:table-cell font-mono">
                    ₹{sub?.mrr_amount ?? 0}
                  </TableCell>
                  <TableCell className="text-center">
                    {statusBadge(status)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); openSheet(team) }}
                    >
                      <ClipboardEdit className="h-3.5 w-3.5" />
                      Evaluate
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <VerificationSheet
        team={selectedTeam}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onVerify={handleVerify}
        isSubmitting={isSubmitting}
      />
    </>
  )
}
