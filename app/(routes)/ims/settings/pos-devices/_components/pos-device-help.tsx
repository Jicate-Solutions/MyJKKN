'use client';

import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function PosDeviceHelp() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex gap-3">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Setting up a terminal</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                <strong>Add</strong> it against the store&apos;s selling counter. The serial number is
                printed on the device (label on the back or underside).
              </li>
              <li>
                <strong>Save credentials</strong> — the username and app key Razorpay POS issued.
              </li>
              <li>
                <strong>Send ₹1 test</strong> — the amount appears on the terminal and is withdrawn
                straight away.
              </li>
              <li>
                <strong>Activate</strong> — the counter then pushes bills to it. One active terminal per
                store.
              </li>
            </ol>
            <p>
              New terminals start in <strong>Demo</strong>: they talk to demo.ezetap.com and the money is
              simulated. Once Razorpay issues the production app key, deactivate the terminal, switch it
              to <strong>Live</strong>, save the production credentials, test, and activate again.
            </p>
            <p className="text-xs">
              Credentials are encrypted with the server secret RAZORPAY_CREDENTIALS_MASTER_SECRET, which
              must be set in the deployment environment.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
