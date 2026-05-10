'use client';

// ════════════════════════════════════════════════════════════════════════════
// Communication Tab
// WhatsApp-style chat layout for the lead detail page. Extracted from page.tsx
// as part of the monolith reduction (PR-D / phase 1).
// Pure refactor — zero behavior change.
// ════════════════════════════════════════════════════════════════════════════

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  MessageCircle,
  MessageSquare,
  Send,
  Loader2,
  Paperclip,
  XCircle,
  Film,
  FileText as FileTextIcon
} from 'lucide-react';
import { formatDateTimeDMY } from '@/lib/utils/date-format';

// CommunicationItem — preserved 1:1 from page.tsx. Renders a single message
// bubble (Personal WhatsApp chat style) or flat row (SMS / Business WA).
function CommunicationItem({
  message
}: {
  message: {
    id: string;
    content: string;
    status: string | null;
    sentAt?: string | null;
    sent_at?: string | null;
    createdAt?: string | null;
    channel?: string | { channel_name: string; channel_type: string } | null;
    phone?: string | null;
    direction?: 'inbound' | 'outbound';
    senderName?: string | null;
  };
}) {
  const channelLabel = typeof message.channel === 'string'
    ? (message.channel === 'personal_whatsapp' ? 'Personal WhatsApp'
      : message.channel === 'whatsapp' ? 'WhatsApp'
      : message.channel.toUpperCase())
    : message.channel?.channel_name || 'Message';
  const isWhatsApp = typeof message.channel === 'string'
    ? (message.channel === 'whatsapp' || message.channel === 'personal_whatsapp')
    : false;
  const isPersonalWA = typeof message.channel === 'string' && message.channel === 'personal_whatsapp';
  const isInbound = message.direction === 'inbound';

  const statusColor: Record<string, string> = {
    delivered: 'bg-green-50 text-green-700 border-green-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };

  const timeStr = (message.sentAt || message.sent_at)
    ? formatDateTimeDMY(message.sentAt || message.sent_at)
    : message.createdAt
      ? formatDateTimeDMY(message.createdAt)
      : '-';

  // Chat bubble layout for Personal WhatsApp messages
  if (isPersonalWA) {
    return (
      <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'} mb-2`}>
        <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isInbound
            ? 'bg-muted text-foreground rounded-tl-none'
            : 'bg-[#25D366] text-white rounded-tr-none'
        }`}>
          {isInbound && message.senderName && (
            <p className={`text-xs font-medium mb-0.5 ${isInbound ? 'text-green-700' : 'text-green-100'}`}>
              {message.senderName}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          <div className={`flex items-center justify-end gap-1.5 mt-1 ${isInbound ? 'text-muted-foreground' : 'text-green-100'}`}>
            <span className="text-[10px]">{timeStr}</span>
            {!isInbound && message.status && (
              <span className="text-[10px]">
                {message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : message.status === 'sent' ? '✓' : message.status === 'failed' ? '!' : '⏳'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default flat layout for SMS and Business WhatsApp
  return (
    <div className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
      <div className="flex-shrink-0">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isWhatsApp ? 'bg-green-100' : 'bg-blue-100'}`}>
          <MessageSquare className={`h-4 w-4 ${isWhatsApp ? 'text-green-600' : 'text-blue-600'}`} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{channelLabel}</p>
          {message.phone && (
            <span className="text-xs text-muted-foreground">{message.phone}</span>
          )}
          <Badge variant="outline" className={`text-xs ${statusColor[message.status || 'sent'] || ''}`}>
            {message.status || 'sent'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{message.content}</p>
        <p className="text-xs text-muted-foreground mt-1">{timeStr}</p>
      </div>
    </div>
  );
}

interface ChannelTemplate {
  id: string;
  name: string;
  content: string;
  attachment_type?: 'image' | 'video' | 'document' | null;
  attachment_url?: string | null;
}

interface CommunicationTabProps {
  leadFullName: string | null | undefined;
  leadPhone: string | null | undefined;
  leadEmail: string | null | undefined;
  leadFirstNamePart: string;
  leadLastNamePart: string;
  leadProgramName: string;
  waConnected: boolean;
  commLoading: boolean;
  communicationHistory: Array<any>;
  templateAttachment: { type: 'image' | 'video' | 'document'; url: string } | null;
  setTemplateAttachment: (
    value: { type: 'image' | 'video' | 'document'; url: string } | null
  ) => void;
  channelTemplates: ChannelTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  setSendChannel: (channel: 'sms' | 'whatsapp' | 'personal_whatsapp') => void;
  setSendMessage: (msg: string) => void;
  sendMessage: string;
  isSending: boolean;
  handleSendPersonalWA: () => void;
  replaceVariables: (
    template: string,
    variables: Record<string, string>
  ) => string;
}

export function CommunicationTab({
  leadFullName,
  leadPhone,
  leadEmail,
  leadFirstNamePart,
  leadLastNamePart,
  leadProgramName,
  waConnected,
  commLoading,
  communicationHistory,
  templateAttachment,
  setTemplateAttachment,
  channelTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  setSendChannel,
  setSendMessage,
  sendMessage,
  isSending,
  handleSendPersonalWA,
  replaceVariables,
}: CommunicationTabProps) {
  return (
    <Card className="flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
      {/* Chat Header */}
      <CardHeader className="shrink-0 pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#25D366] flex items-center justify-center">
              <MessageCircle className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{leadFullName || 'Chat'}</CardTitle>
              <CardDescription className="text-xs">{leadPhone || ''}</CardDescription>
            </div>
          </div>
          {waConnected && (
            <Badge className="bg-[#25D366] text-white text-xs">Connected</Badge>
          )}
        </div>
      </CardHeader>

      {/* Chat Messages Area */}
      <CardContent className="flex-1 overflow-y-auto p-4" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
        {commLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-3/4" />
            ))}
          </div>
        ) : communicationHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">No messages yet</p>
            <p className="text-sm mt-1">Start a conversation below</p>
          </div>
        ) : (
          <div className="space-y-1">
            {[...communicationHistory].reverse().map((message) => (
              <CommunicationItem key={message.id} message={message as any} />
            ))}
          </div>
        )}
      </CardContent>

      {/* Attachment Preview */}
      {templateAttachment && (
        <div className="shrink-0 px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            {templateAttachment.type === 'image' ? (
              <img src={templateAttachment.url} alt="Attachment" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                {templateAttachment.type === 'video' ? <Film className="h-5 w-5 text-purple-500" /> : <FileTextIcon className="h-5 w-5 text-orange-500" />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium capitalize">{templateAttachment.type} attached</p>
              <p className="text-xs text-muted-foreground truncate">{templateAttachment.url.split('/').pop()}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTemplateAttachment(null)}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Chat Input Bar — defaults to Personal WhatsApp */}
      <div className="shrink-0 border-t p-3">
        {/* Template selector row (only if templates available) */}
        {channelTemplates.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <Select
              value={selectedTemplateId}
              onValueChange={(id) => {
                setSelectedTemplateId(id);
                setSendChannel('personal_whatsapp');
                const tmpl = channelTemplates.find((t) => t.id === id);
                if (tmpl) {
                  setSendMessage(
                    replaceVariables(tmpl.content, {
                      first_name: leadFirstNamePart,
                      last_name: leadLastNamePart,
                      full_name: leadFullName || '',
                      phone: leadPhone || '',
                      email: leadEmail || '',
                      program: leadProgramName,
                    })
                  );
                  setTemplateAttachment(
                    tmpl.attachment_type && tmpl.attachment_url
                      ? { type: tmpl.attachment_type, url: tmpl.attachment_url }
                      : null
                  );
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs w-auto max-w-[200px]">
                <Paperclip className="h-3 w-3 mr-1.5" />
                <SelectValue placeholder="Use template..." />
              </SelectTrigger>
              <SelectContent>
                {channelTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Message input + send */}
        <div className="flex items-end gap-2">
          <Textarea
            value={sendMessage}
            onChange={(e) => setSendMessage(e.target.value)}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (sendMessage.trim() && !isSending) handleSendPersonalWA();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10 bg-[#25D366] hover:bg-[#1da851] text-white rounded-full"
            onClick={handleSendPersonalWA}
            disabled={isSending || !sendMessage.trim()}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
