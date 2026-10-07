'use client';

/**
 * /hr/playbooks — the three tabs. For team members (the database refuses anyone else); the
 * Proposals tab is shown only to whoever holds hr.harness.playbooks.manage
 * (or a super admin), and its content is wrapped in PermissionGuard as well.
 */

import { useRouter, useSearchParams } from 'next/navigation';

import { PermissionGuard } from '@/components/auth/permission-guard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { PLAYBOOK_DUTIES } from '@/types/hr-playbook';

import { ContributorsTab } from './contributors-tab';
import { PlaybooksByDuty } from './playbooks-by-duty';
import { ProposalsTab } from './proposals-tab';

export const PLAYBOOKS_MANAGE_KEY = 'hr.harness.playbooks.manage';

export function PlaybooksView() {
  const router = useRouter();
  const params = useSearchParams();
  const { can, isSuperAdmin, userProfile } = usePermissions();
  const canManage = isSuperAdmin || can(PLAYBOOKS_MANAGE_KEY);

  const dutyParam = params.get('duty');
  const duty = PLAYBOOK_DUTIES.some((d) => d.code === dutyParam) ? (dutyParam as string) : PLAYBOOK_DUTIES[0].code;
  const tabParam = params.get('tab');
  const tab = tabParam === 'contributors' || (tabParam === 'proposals' && canManage) ? tabParam : 'duties';

  function go(next: { duty?: string; tab?: string }) {
    const q = new URLSearchParams(params.toString());
    if (next.duty) q.set('duty', next.duty);
    if (next.tab) q.set('tab', next.tab);
    router.replace(`/hr/playbooks?${q.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={(t) => go({ tab: t })} className='space-y-4'>
      <TabsList>
        <TabsTrigger value='duties'>Playbooks by duty</TabsTrigger>
        {canManage && <TabsTrigger value='proposals'>Proposals</TabsTrigger>}
        <TabsTrigger value='contributors'>Contributors</TabsTrigger>
      </TabsList>
      <TabsContent value='duties'>
        <PlaybooksByDuty duty={duty} onDutyChange={(d) => go({ duty: d })} canManage={canManage} />
      </TabsContent>
      {canManage && (
        <TabsContent value='proposals'>
          <PermissionGuard module='hr.harness.playbooks' action='manage'>
            <ProposalsTab myId={(userProfile as { id?: string } | null)?.id ?? null} />
          </PermissionGuard>
        </TabsContent>
      )}
      <TabsContent value='contributors'>
        <ContributorsTab />
      </TabsContent>
    </Tabs>
  );
}
