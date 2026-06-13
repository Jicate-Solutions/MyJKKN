// ============================================================================
// /hr/memos/my — staff's own memos with acknowledge / dispute actions
// ============================================================================
// T6.1 — staff lands here after the WhatsApp notification ("HR memo issued").
// Sees all memos issued against them, can acknowledge (no comment) or dispute
// (with text). Resolved memos remain read-only.
// ============================================================================

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRMemoService } from '@/lib/services/hr/memo-service';
import { MyMemoCard } from './_components/my-memo-card';

export default async function MyMemosPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/hr/memos/my');

  // Resolve staff_id from auth_user_id
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, first_name, last_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!staffRow) {
    return (
      <ContentLayout title="My HR Memos">
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          We could not find a staff record linked to your account. If you
          believe this is wrong, contact HR.
        </div>
      </ContentLayout>
    );
  }

  const service = new HRMemoService(supabase);
  const memos = await service.listForStaff(staffRow.id as string);

  const active = memos.filter(
    (m) => m.status === 'issued' || m.status === 'acknowledged',
  );
  const past = memos.filter(
    (m) => m.status === 'resolved' || m.status === 'disputed',
  );

  return (
    <ContentLayout
      title={`HR Memos — ${staffRow.first_name ?? ''} ${
        staffRow.last_name ?? ''
      }`.trim()}
    >
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Active ({active.length})
          </h2>
          {active.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No active memos. You are in good standing.
            </div>
          ) : (
            <div className="space-y-3">
              {active.map((m) => (
                <MyMemoCard key={m.id} memo={m} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Past ({past.length})
            </h2>
            <div className="space-y-3">
              {past.map((m) => (
                <MyMemoCard key={m.id} memo={m} readOnly />
              ))}
            </div>
          </section>
        )}
      </div>
    </ContentLayout>
  );
}
