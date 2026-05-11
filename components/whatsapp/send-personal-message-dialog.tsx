'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

interface SendPersonalMessageDialogProps {
  departmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPhone?: string;
  defaultMessage?: string;
  leadId?: string;
  recipientName?: string;
}

export function SendPersonalMessageDialog({
  departmentId,
  open,
  onOpenChange,
  defaultPhone = '',
  defaultMessage = '',
  leadId,
  recipientName,
}: SendPersonalMessageDialogProps) {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const maxLength = 4096;

  // Reset form when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      setPhone(defaultPhone);
      setMessage(defaultMessage);
    }
  }, [open, defaultPhone, defaultMessage]);

  const handleSend = async () => {
    if (!phone || !message) return;
    setSending(true);

    try {
      const res = await fetch('/api/whatsapp-personal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: departmentId,
          to: phone,
          message,
          lead_id: leadId,
          recipient_name: recipientName,
        }),
      });

      if (res.status === 503) {
        toast.error('Personal WhatsApp is not connected. Connect it in Settings → WhatsApp Numbers → Personal WhatsApp tab.');
        return;
      }

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage('');
        // Refresh communication history on the lead detail page
        if (leadId) {
          queryClient.invalidateQueries({ queryKey: ['lead-communication-history', leadId] });
        }
        // Close dialog first, then show toast after a tick (prevents unmount race)
        onOpenChange(false);
        setSending(false);
        setTimeout(() => {
          toast.success('Message sent via Personal WhatsApp!');
        }, 100);
        return;
      } else {
        toast.error(data.error || 'Failed to send message');
      }
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
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
          <DialogDescription>
            Send a message directly from your connected personal WhatsApp number.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="+91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={sending}
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
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!phone || !message || sending || message.length > maxLength}
            className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
          >
            {sending ? (
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
