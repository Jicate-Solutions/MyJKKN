// =====================================================================
// /pde/admin/feedback-moderation — PDE Tier 3 (T3.5)
// =====================================================================
// Surfaces the pending-feedback queue produced by
// PDEFeedbackModerationService.listPendingFeedback(). Each pending note
// from pde_demonstrations.validator_notes gets approve / redact / reject
// buttons (client-island). Identity policy is enforced server-side; this
// page just renders what the service hands back.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { PDEFeedbackModerationService } from '@/lib/services/pde-feedback-moderation-service';
import { ModerationActions } from './_components/ModerationActions';

export const dynamic = 'force-dynamic';

export const navMeta = {
  label: 'PDE Feedback Moderation',
  icon: 'ShieldAlert',
} as const;

export default async function PdeFeedbackModerationPage() {
  const { items, policy } =
    await PDEFeedbackModerationService.listPendingFeedback();

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Feedback Moderation">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This queue is restricted to super administrators. Identity policy
            is governed by
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              pde.governance.feedback_identity_policy
            </code>
            .
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Feedback Moderation">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Feedback Moderation' },
          ]}
        />

        <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Identity mode:{' '}
          <code className="mx-1 rounded bg-muted px-1 py-0.5">
            {policy.mode}
          </code>
          · Moderator role:{' '}
          <code className="mx-1 rounded bg-muted px-1 py-0.5">
            {policy.moderator_role}
          </code>
        </div>

        {items.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/10 p-6 text-sm text-muted-foreground">
            No feedback awaiting moderation.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={`${item.demonstration_id}:${item.note.id}`}
                className="rounded-md border border-border bg-card p-4"
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Demo:{' '}
                    <code className="rounded bg-muted px-1 py-0.5">
                      {item.demonstration_id.slice(0, 8)}
                    </code>
                  </span>
                  <span>
                    Category:{' '}
                    <code className="rounded bg-muted px-1 py-0.5">
                      {item.category_key}
                    </code>
                  </span>
                  {item.note.author_id && (
                    <span>
                      Author:{' '}
                      <code className="rounded bg-muted px-1 py-0.5">
                        {item.note.author_id.slice(0, 8)}
                      </code>
                    </span>
                  )}
                  {policy.mode === 'fully_anonymous' && (
                    <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                      anonymous
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{item.note.body}</p>
                <ModerationActions
                  demonstrationId={item.demonstration_id}
                  noteId={item.note.id}
                />
              </li>
            ))}
          </ul>
        )}
      </ContentLayout>
    </SuperAdminOnly>
  );
}
