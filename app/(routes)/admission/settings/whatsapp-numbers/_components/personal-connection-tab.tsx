'use client';

import { PersonalConnect } from '@/components/whatsapp/personal-connect';

interface PersonalConnectionTabProps {
  institutionId: string;
}

export function PersonalConnectionTab({ institutionId }: PersonalConnectionTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Personal WhatsApp Connection</h3>
        <p className="text-sm text-muted-foreground">
          Connect your personal WhatsApp account to send messages directly. Messages will appear as sent from your phone number.
        </p>
      </div>

      <PersonalConnect
        institutionId={institutionId}
        onConnected={(phone) => {
          console.info('[admission/settings] Personal WhatsApp connected:', phone);
        }}
        onDisconnected={() => {
          console.info('[admission/settings] Personal WhatsApp disconnected');
        }}
      />

      <div className="rounded-lg border p-4 space-y-2">
        <h4 className="text-sm font-medium">How it works</h4>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Click &quot;Connect WhatsApp&quot; to generate a QR code</li>
          <li>Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</li>
          <li>Scan the QR code to connect</li>
          <li>Once connected, counselors can send messages from leads and followup cards</li>
          <li>Messages are sent from your personal phone number (not a business number)</li>
        </ul>
      </div>
    </div>
  );
}
