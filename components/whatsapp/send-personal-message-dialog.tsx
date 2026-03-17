'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, MessageCircle, AlertCircle } from 'lucide-react';
import {
  usePersonalWhatsAppStatus,
  usePersonalWhatsAppMutations,
} from '@/hooks/admission/use-whatsapp-personal';

interface SendPersonalMessageDialogProps {
  institutionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPhone?: string;
  defaultMessage?: string;
  leadId?: string;
  recipientName?: string;
}

export function SendPersonalMessageDialog({
  institutionId,
  open,
  onOpenChange,
  defaultPhone = '',
  defaultMessage = '',
  leadId,
  recipientName,
}: SendPersonalMessageDialogProps) {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(defaultMessage);

  const { data: statusData } = usePersonalWhatsAppStatus(institutionId, {
    pollWhileConnecting: false,
  });
  const { sendMessage } = usePersonalWhatsAppMutations(institutionId);

  const isConnected = statusData?.connected === true;
  const maxLength = 4096;

  // Reset form when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      setPhone(defaultPhone);
      setMessage(defaultMessage);
    }
  }, [open, defaultPhone, defaultMessage]);

  const handleSend = async () => {
    sendMessage.mutate(
      {
        to: phone,
        message,
        lead_id: leadId,
        recipient_name: recipientName,
      },
      {
        onSuccess: (data) => {
          if (data.success) {
            onOpenChange(false);
            setMessage('');
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Send Personal WhatsApp
            {recipientName && (
              <Badge variant="outline" className="ml-2 font-normal">
                {recipientName}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {!isConnected && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Personal WhatsApp is not connected. Connect it in Settings → WhatsApp Numbers → Personal WhatsApp tab.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="+91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!isConnected || sendMessage.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Include country code (e.g., 919876543210)
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="message">Message</Label>
              <span className={`text-xs ${message.length > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>
                {message.length}/{maxLength}
              </span>
            </div>
            <Textarea
              id="message"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={maxLength}
              disabled={!isConnected || sendMessage.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendMessage.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!isConnected || !phone || !message || sendMessage.isPending || message.length > maxLength}
            className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
          >
            {sendMessage.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
