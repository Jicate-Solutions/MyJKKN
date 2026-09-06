/**
 * Learners Council — a sender's own all-college messages.
 *
 * A message to the sender's own college goes out the moment it is written and
 * never appears here. This page is only about the ones addressed to every
 * college, which are held for one approval and, failing that, send themselves
 * when the window closes.
 *
 * This page needs no permission of its own: row-level security already limits
 * the table to your own requests, so it lists exactly what is yours. The one
 * thing it must never do is present an empty list as proof that you have sent
 * nothing — a refused read looks identical to an empty one, so the two states
 * are kept apart all the way to the screen.
 */

import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { getApproverSetting, listBroadcastRequests } from '@/lib/learners-council/broadcast-server';
import { MyBroadcastsClient } from './my-broadcasts-client';

export default async function MyBroadcastsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <LogIn className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">Please sign in to see your messages.</p>
        </CardContent>
      </Card>
    );
  }

  const [{ rows, readFailed }, approverSetting] = await Promise.all([
    listBroadcastRequests({ requesterId: user.id }),
    getApproverSetting(),
  ]);

  return (
    <div className="mt-4">
      <MyBroadcastsClient
        initialRequests={rows}
        readFailed={readFailed}
        approverName={approverSetting.approverName}
        approverIsNamed={approverSetting.approverId !== null}
        configUnreadable={approverSetting.configUnreadable}
        autoSendHours={approverSetting.autoSendHours}
      />
    </div>
  );
}
