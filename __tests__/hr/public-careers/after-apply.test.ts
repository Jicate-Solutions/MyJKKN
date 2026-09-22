import { describe, expect, it, vi } from 'vitest';
import { buildApplicationConfirmationEmail } from '@/lib/hr/recruitment/application-confirmation-email';
import { notifyHrOfApplication, sendApplicantConfirmation } from '@/lib/services/hr/public-careers/after-apply';

const APP = {
  applicationId: 'app-1', reference: 'JOB-007-AAAAAAAA', jobTitle: 'Lab <Assistant>',
  institutionId: 'inst-1', institutionName: 'JKKN College of Pharmacy',
};

function fakeDb(recipients: string[]) {
  const writes: { table: string; payload: unknown }[] = [];
  const db = {
    rpc: vi.fn(async () => ({ data: recipients, error: null })),
    from(table: string) {
      return {
        insert(payload: unknown) {
          writes.push({ table, payload });
          const r = { data: { id: 'n-1' }, error: null };
          return {
            select: () => ({ single: async () => r }),
            then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f),
          };
        },
        update(payload: unknown) {
          writes.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { db: db as never, writes, rpc: db.rpc };
}

describe('buildApplicationConfirmationEmail', () => {
  it('escapes HTML and includes the reference', () => {
    const m = buildApplicationConfirmationEmail({ firstName: 'Priya', jobTitle: 'Lab <Assistant>', institutionName: 'X', reference: 'R-1' });
    expect(m.html).toContain('Lab &lt;Assistant&gt;');
    expect(m.html).not.toContain('<Assistant>');
    expect(m.text).toContain('R-1');
    expect(m.subject).toContain('Lab <Assistant>');
  });
});

describe('notifyHrOfApplication', () => {
  it('writes one notification targeted at the RPC recipients plus a user_notifications row each', async () => {
    const { db, writes, rpc } = fakeDb(['u1', 'u2']);
    expect(await notifyHrOfApplication(db, APP, 'Priya R')).toBe(2);
    expect(rpc).toHaveBeenCalledWith('hr_recruitment_application_recipient_ids', { p_institution_id: 'inst-1' });
    const n = writes.find((w) => w.table === 'notifications')!.payload as Record<string, unknown>;
    expect(n.targeting).toEqual({ type: 'user', user_ids: ['u1', 'u2'] });
    expect(n.url).toBe('/hr/recruitment/applications/app-1');
    expect(writes.find((w) => w.table === 'user_notifications')!.payload).toEqual([
      { user_id: 'u1', notification_id: 'n-1' }, { user_id: 'u2', notification_id: 'n-1' },
    ]);
  });
  it('writes nothing when there are no recipients', async () => {
    const { db, writes } = fakeDb([]);
    expect(await notifyHrOfApplication(db, APP, 'Priya R')).toBe(0);
    expect(writes).toHaveLength(0);
  });
});

describe('sendApplicantConfirmation', () => {
  it('records sent_at on success', async () => {
    const { db, writes } = fakeDb([]);
    const send = vi.fn(async () => ({ error: null }));
    await sendApplicantConfirmation(db, APP, 'priya@example.com', 'Priya', send);
    expect(send).toHaveBeenCalledOnce();
    expect(writes[0].payload).toHaveProperty('confirmation_email_sent_at');
  });
  it('records the error and does not throw on failure', async () => {
    const { db, writes } = fakeDb([]);
    const send = vi.fn(async () => ({ error: { message: 'bad domain' } }));
    await expect(sendApplicantConfirmation(db, APP, 'priya@example.com', 'Priya', send)).resolves.toBeUndefined();
    expect((writes[0].payload as Record<string, unknown>).confirmation_email_error).toContain('bad domain');
  });
});
