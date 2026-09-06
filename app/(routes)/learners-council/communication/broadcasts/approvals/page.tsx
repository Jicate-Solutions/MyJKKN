/**
 * Learners Council — all-college broadcast approval queue.
 *
 * An all-college council message is held here until the ONE named approver
 * decides, or until the waiting window runs out and it sends itself. That last
 * part is a deliberate Director decision, taken on a question that named the
 * consequence: silence counts as yes. Every card therefore states the deadline
 * as a sentence, not as a timestamp somebody has to do arithmetic on.
 *
 * ACCESS IS REFUSED OUT LOUD, NEVER BY REDIRECT. Somebody who is not the
 * approver gets a page that says so and names who to talk to. Bouncing them to
 * the dashboard would produce a loop they cannot diagnose: click, land back,
 * click again, land back.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, LogIn } from 'lucide-react';
import { getApproverSetting, listBroadcastRequests } from '@/lib/learners-council/broadcast-server';
import { BroadcastApprovalsClient } from './approvals-client';

/** Roles the database treats as administrators; fn_lc_broadcast_decide accepts them too. */
const ADMIN_ROLE_KEYS = ['admin', 'super_admin', 'administrator'];

export default async function BroadcastApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <LogIn className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">Please sign in to open this page.</p>
        </CardContent>
      </Card>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_super_admin, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <LogIn className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">Please sign in to open this page.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your profile could not be read, so this page cannot tell whether you are the approver.
          </p>
        </CardContent>
      </Card>
    );
  }

  const approverSetting = await getApproverSetting();

  const isAdministrator =
    profile.is_super_admin === true || ADMIN_ROLE_KEYS.includes(String(profile.role));
  const isNamedApprover =
    approverSetting.approverId !== null && approverSetting.approverId === profile.id;
  const canDecide = isAdministrator || isNamedApprover;

  if (!canDecide) {
    return <NoAccessNotice approverSetting={approverSetting} />;
  }

  const { rows, readFailed } = await listBroadcastRequests({ pendingOnly: true });

  return (
    <div className="mt-4">
      <BroadcastApprovalsClient
        initialRequests={rows}
        readFailed={readFailed}
        approverName={approverSetting.approverName}
        approverIsNamed={approverSetting.approverId !== null}
        configUnreadable={approverSetting.configUnreadable}
        autoSendHours={approverSetting.autoSendHours}
        viewerIsAdministrator={isAdministrator}
      />
    </div>
  );
}

/**
 * The refusal, said plainly and with a next step.
 *
 * Two different truths are possible here and they must not be blurred: either
 * somebody else holds the seat (say who), or nobody holds it at all (say that,
 * and say what happens as a result — the messages still go out).
 */
function NoAccessNotice({
  approverSetting,
}: {
  approverSetting: Awaited<ReturnType<typeof getApproverSetting>>;
}) {
  const { approverId, approverName, approverEmail, autoSendHours, configUnreadable } = approverSetting;
  const hoursLabel = `${autoSendHours} hour${autoSendHours === 1 ? '' : 's'}`;

  return (
    <Card className="mt-4 border-l-4 border-l-amber-400">
      <CardContent className="space-y-3 py-8">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-500" />
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">You don&apos;t have access to this queue</h1>

            {configUnreadable ? (
              <p className="text-sm text-muted-foreground">
                Only the named approver can decide on all-college council messages. This page could
                not read who that is, so it cannot tell you who to contact — please ask the Learners
                Council office.
              </p>
            ) : approverId ? (
              <p className="text-sm text-muted-foreground">
                Only one person approves all-college council messages, and it is not you. To get a
                message approved, or to ask for this seat, contact{' '}
                <span className="font-medium text-foreground">
                  {approverName || 'the named approver'}
                </span>
                {approverEmail ? (
                  <>
                    {' '}
                    (<a className="underline" href={`mailto:${approverEmail}`}>{approverEmail}</a>)
                  </>
                ) : null}
                , or the Learners Council office.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No approver has been named yet, so nobody can approve here — all-college messages
                simply send themselves after {hoursLabel}. To have somebody named, contact the
                Learners Council office.
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              You can still see and withdraw your own messages on the{' '}
              <Link className="underline" href="/learners-council/communication/broadcasts">
                My Broadcasts
              </Link>{' '}
              page.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
