'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Phone,
  Send,
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Star,
  Copy,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WAPhoneNumber {
  id: string;
  institution_id: string;
  phone_number_id: string;
  business_account_id: string;
  display_number: string;
  verified_name: string | null;
  quality_rating: string;
  messaging_limit: string;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface NumberDetailSheetProps {
  number: WAPhoneNumber | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetPrimary: (id: string) => void;
}

export function NumberDetailSheet({ number, open, onOpenChange, onSetPrimary }: NumberDetailSheetProps) {
  const [testPhone, setTestPhone] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!number) return null;

  const qualityConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string; desc: string }> = {
    GREEN: { icon: CheckCircle, color: 'text-green-600', label: 'Green', desc: 'Healthy — high delivery rate' },
    YELLOW: { icon: AlertTriangle, color: 'text-yellow-600', label: 'Yellow', desc: 'Warning — delivery rate declining' },
    RED: { icon: XCircle, color: 'text-red-600', label: 'Red', desc: 'Critical — messages may be blocked' },
  };

  const quality = qualityConfig[number.quality_rating] || qualityConfig.GREEN;
  const QualityIcon = quality.icon;

  const limitLabels: Record<string, string> = {
    TIER_1K: '1,000 messages/day',
    TIER_10K: '10,000 messages/day',
    TIER_100K: '100,000 messages/day',
    UNLIMITED: 'Unlimited',
  };

  const handleTestSend = async () => {
    if (!testPhone) {
      toast.error('Enter a phone number to test');
      return;
    }
    setIsSending(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admission/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: number.phone_number_id,
          to: testPhone.replace(/\D/g, ''),
          type: 'template',
          template_name: 'contactus',
        }),
      });
      if (res.ok) {
        setTestResult({ success: true, message: 'Test message sent! Check WhatsApp.' });
        toast.success('Test message sent');
      } else {
        const err = await res.json().catch(() => ({}));
        setTestResult({ success: false, message: err.error || 'Failed to send' });
        toast.error('Test failed');
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Network error' });
    } finally {
      setIsSending(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-green-600" />
            {number.display_number}
          </SheetTitle>
          <SheetDescription>
            {number.verified_name || 'Unverified number'} — {number.is_active ? 'Active' : 'Inactive'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Status Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Quality Rating</span>
                <div className="flex items-center gap-1.5">
                  <QualityIcon className={cn('h-4 w-4', quality.color)} />
                  <span className="text-sm font-medium">{quality.label}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{quality.desc}</p>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Messaging Limit</span>
                <span className="text-sm font-medium">{limitLabels[number.messaging_limit] || number.messaging_limit}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Primary Number</span>
                {number.is_primary ? (
                  <Badge variant="outline" className="text-yellow-600 bg-yellow-50">
                    <Star className="h-3 w-3 mr-1 fill-current" /> Primary
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => onSetPrimary(number.id)}>
                    Set as Primary
                  </Button>
                )}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Verified Name</span>
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-blue-500" />
                  <span className="text-sm">{number.verified_name || '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Meta IDs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Meta Configuration</CardTitle>
              <CardDescription className="text-xs">IDs from Meta Business Manager</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Phone Number ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">{number.phone_number_id}</code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(number.phone_number_id, 'Phone Number ID')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Business Account ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">{number.business_account_id}</code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(number.business_account_id, 'WABA ID')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                <a
                  href={`https://business.facebook.com/latest/whatsapp_manager/phone_numbers/?business_id=1720903384834051`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3 mr-2" />
                  Open in Meta Business Manager
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Test Message */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Send className="h-4 w-4" />
                Send Test Message
              </CardTitle>
              <CardDescription className="text-xs">
                Send a test template message from this number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Recipient Phone Number</Label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g., 919894116664"
                  className="mt-1"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleTestSend}
                disabled={isSending || !testPhone}
              >
                {isSending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><MessageSquare className="h-4 w-4 mr-2" /> Send Test Message</>
                )}
              </Button>
              {testResult && (
                <p className={cn('text-xs', testResult.success ? 'text-green-600' : 'text-red-600')}>
                  {testResult.message}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Timestamps */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Added: {new Date(number.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p>Last updated: {new Date(number.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
