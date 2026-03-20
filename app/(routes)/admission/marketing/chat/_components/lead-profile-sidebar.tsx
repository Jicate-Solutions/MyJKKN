'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  Mail,
  MapPin,
  User,
  UserCheck,
  CheckCircle,
  RotateCcw,
  Tag,
  ExternalLink,
} from 'lucide-react';
import { useConversation } from '@/hooks/admission/use-conversation';
import { useChatMutations } from '@/hooks/admission/use-chat-mutations';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';

interface LeadProfileSidebarProps {
  conversationId: string | null;
}

export function LeadProfileSidebar({ conversationId }: LeadProfileSidebarProps) {
  const { conversation, isLoading } = useConversation(conversationId);
  const { resolve, reopen, isResolving, isReopening } = useChatMutations();

  if (!conversationId || !conversation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-4">
        <p className="text-sm text-center">Select a conversation to view profile</p>
      </div>
    );
  }

  const lead = conversation.lead;

  const getStageColor = (stage: string) => {
    switch (stage?.toLowerCase()) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'contacted': return 'bg-yellow-100 text-yellow-800';
      case 'qualified': return 'bg-green-100 text-green-800';
      case 'applied': return 'bg-purple-100 text-purple-800';
      case 'enrolled': return 'bg-emerald-100 text-emerald-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ScrollArea className="h-full border-l">
      <div className="p-4 space-y-5">
        {/* Contact Info */}
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-semibold text-primary mx-auto">
            {(conversation.contact_name || conversation.contact_phone || '?')
              .charAt(0)
              .toUpperCase()}
          </div>
          <h3 className="font-semibold mt-3">
            {conversation.contact_name || 'Unknown Contact'}
          </h3>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
            <Phone className="h-3 w-3" />
            {conversation.contact_phone}
          </p>
          <Badge
            variant="outline"
            className={`mt-2 ${getStageColor(conversation.status)}`}
          >
            {conversation.status}
          </Badge>
        </div>

        <Separator />

        {/* Quick Actions */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            Actions
          </h4>

          {conversation.status !== 'resolved' ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => resolve.mutate(conversation.id)}
              disabled={isResolving}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isResolving ? 'Resolving...' : 'Resolve Conversation'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => reopen.mutate(conversation.id)}
              disabled={isReopening}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isReopening ? 'Reopening...' : 'Reopen Conversation'}
            </Button>
          )}

          {lead && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              asChild
            >
              <a href={`/admission/leads/${lead.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Lead Profile
              </a>
            </Button>
          )}
        </div>

        {/* Lead Details (if linked) */}
        {lead && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                Lead Details
              </h4>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{lead.full_name}</span>
                </div>

                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground truncate">{lead.email}</span>
                  </div>
                )}

                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">{lead.phone}</span>
                  </div>
                )}

                {lead.source && (
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Source: {lead.source}</span>
                  </div>
                )}
              </div>

              {/* Stage */}
              <div>
                <span className="text-xs text-muted-foreground">Stage</span>
                <Badge className={`mt-1 ${getStageColor(lead.stage)}`}>
                  {lead.stage}
                </Badge>
              </div>

              {/* Score */}
              {lead.score != null && (
                <div>
                  <span className="text-xs text-muted-foreground">Lead Score</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, lead.score)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">{lead.score}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Assigned Counselor */}
        {conversation.assigned_profile && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                Assigned To
              </h4>
              <div className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span>{conversation.assigned_profile.full_name}</span>
              </div>
            </div>
          </>
        )}

        {/* Tags */}
        {conversation.tags && conversation.tags.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1">
                {conversation.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Conversation metadata */}
        <Separator />
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Created</span>
            <span>{new Date(conversation.created_at).toLocaleDateString('en-IN')}</span>
          </div>
          {conversation.last_inbound_at && (
            <div className="flex justify-between">
              <span>Last Reply</span>
              <span>
                {new Date(conversation.last_inbound_at).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
