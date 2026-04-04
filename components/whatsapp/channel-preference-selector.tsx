'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Building2, Zap } from 'lucide-react';
import type { ExpoWAChannelPreference } from '@/types/whatsapp-personal';

interface ChannelPreferenceSelectorProps {
  value: ExpoWAChannelPreference;
  onChange: (value: ExpoWAChannelPreference) => void;
  personalConnected?: boolean;
  wabaConfigured?: boolean;
  disabled?: boolean;
  label?: string;
}

const CHANNEL_OPTIONS: {
  value: ExpoWAChannelPreference;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'personal',
    label: 'Personal WhatsApp',
    description: 'Send via connected personal number',
    icon: <Smartphone className="h-4 w-4 text-green-600" />,
  },
  {
    value: 'meta_waba',
    label: 'Business WhatsApp',
    description: 'Send via Meta Business API template',
    icon: <Building2 className="h-4 w-4 text-blue-600" />,
  },
  {
    value: 'both',
    label: 'Both Channels',
    description: 'Send via personal first, business as backup',
    icon: <Zap className="h-4 w-4 text-orange-500" />,
  },
  {
    value: 'none',
    label: 'No Auto-Message',
    description: 'Skip automatic WhatsApp messaging',
    icon: null,
  },
];

export function ChannelPreferenceSelector({
  value,
  onChange,
  personalConnected,
  wabaConfigured,
  disabled,
  label = 'WhatsApp Channel',
}: ChannelPreferenceSelectorProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {personalConnected !== undefined && (
          <Badge variant={personalConnected ? 'default' : 'secondary'} className="text-xs">
            {personalConnected ? 'Personal Connected' : 'Personal Offline'}
          </Badge>
        )}
        {wabaConfigured !== undefined && (
          <Badge variant={wabaConfigured ? 'default' : 'secondary'} className="text-xs">
            {wabaConfigured ? 'WABA Active' : 'WABA Not Set'}
          </Badge>
        )}
      </div>
      <Select value={value} onValueChange={onChange as (v: string) => void} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHANNEL_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex items-center gap-2">
                {opt.icon}
                <div>
                  <span className="font-medium">{opt.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
