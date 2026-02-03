'use client'

import {
  Phone,
  Mail,
  MessageSquare,
  Users,
  StickyNote,
  ArrowDownLeft,
  ArrowUpRight,
  Paperclip,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SHClientCommunication, CommunicationType, CommunicationDirection } from '@/types/solutions'

interface CommunicationTimelineProps {
  communications: SHClientCommunication[]
  getSolutionCode?: (solutionId: string | null) => string | undefined
  onEdit?: (communication: SHClientCommunication) => void
  onDelete?: (id: string) => void
}

const typeIcons: Record<CommunicationType, React.ElementType> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  meeting: Users,
  note: StickyNote,
}

const typeColors: Record<CommunicationType, string> = {
  call: 'bg-green-100 text-green-600',
  email: 'bg-blue-100 text-blue-600',
  whatsapp: 'bg-emerald-100 text-emerald-600',
  meeting: 'bg-purple-100 text-purple-600',
  note: 'bg-yellow-100 text-yellow-600',
}

const typeLabels: Record<CommunicationType, string> = {
  call: 'Phone Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting',
  note: 'Note',
}

const directionLabels: Record<CommunicationDirection, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
}

export function CommunicationTimeline({
  communications,
  getSolutionCode,
  onEdit,
  onDelete,
}: CommunicationTimelineProps) {
  // Group communications by date
  const groupedCommunications = communications.reduce(
    (groups, comm) => {
      const date = new Date(comm.communication_date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(comm)
      return groups
    },
    {} as Record<string, SHClientCommunication[]>
  )

  return (
    <div className="space-y-8">
      {Object.entries(groupedCommunications).map(([date, comms]) => (
        <div key={date}>
          <div className="sticky top-0 z-10 bg-background py-2">
            <span className="text-sm font-medium text-muted-foreground">{date}</span>
          </div>

          <div className="space-y-4 ml-4 border-l pl-6 relative">
            {comms.map((comm) => {
              const Icon = comm.communication_type ? typeIcons[comm.communication_type] : StickyNote
              const colorClass = comm.communication_type ? typeColors[comm.communication_type] : typeColors.note
              const time = new Date(comm.communication_date).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })
              const solutionCode = getSolutionCode?.(comm.solution_id)

              return (
                <div key={comm.id} className="relative">
                  {/* Timeline dot */}
                  <div
                    className={`absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full ${colorClass}`}
                  >
                    <Icon className="h-3 w-3" />
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {comm.communication_type && typeLabels[comm.communication_type]}
                          </span>
                          <span className="text-sm text-muted-foreground">{time}</span>
                          {comm.direction && (
                            <Badge variant="outline" className="text-xs gap-1">
                              {comm.direction === 'inbound' ? (
                                <ArrowDownLeft className="h-3 w-3" />
                              ) : (
                                <ArrowUpRight className="h-3 w-3" />
                              )}
                              {directionLabels[comm.direction]}
                            </Badge>
                          )}
                          {solutionCode && (
                            <Badge variant="secondary" className="text-xs">
                              {solutionCode}
                            </Badge>
                          )}
                        </div>

                        {comm.subject && (
                          <p className="font-medium text-sm">{comm.subject}</p>
                        )}

                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {comm.summary}
                        </p>

                        {/* Participants */}
                        {comm.participants && comm.participants.length > 0 && (
                          <div className="flex items-center gap-2 pt-2">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <div className="flex flex-wrap gap-1">
                              {comm.participants.map((p, i) => (
                                <span key={i} className="text-xs text-muted-foreground">
                                  {p.name}
                                  {p.role && ` (${p.role})`}
                                  {i < comm.participants.length - 1 && ','}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Attachments */}
                        {comm.attachments_urls && comm.attachments_urls.length > 0 && (
                          <div className="flex items-center gap-2 pt-2">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {comm.attachments_urls.length} attachment
                              {comm.attachments_urls.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      {(onEdit || onDelete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onEdit && (
                              <DropdownMenuItem onClick={() => onEdit(comm)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {onDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => onDelete(comm.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
