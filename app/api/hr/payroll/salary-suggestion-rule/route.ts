export const dynamic = 'force-dynamic';

/**
 * /api/hr/payroll/salary-suggestion-rule — the Director's salary suggestion rule.
 *
 *   GET  → the HR colleges and every stored row of the rule (group-wide and per
 *          college, published value and pending draft), for the editor.
 *   POST → save a draft or publish, for one college or group-wide, with a
 *          mandatory reason that goes to hr_policy_audit_log.
 *
 * SUPER ADMINS ONLY, like the Pay Scales editor: the rule holds rupee amounts
 * that decide what the system suggests for everybody. Checked with
 * is_super_admin() (the profile flag), never a role name. Everything is read and
 * written with the caller's own session client, so the table's write policy and
 * the audit log's insert policy (is_super_admin()) still apply underneath.
 *
 * Saving the rule changes NOBODY's pay. It only changes what the Suggest panel
 * on Employee Salaries works out.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import {
  RuleInputError,
  SalarySuggestionRuleService,
} from '@/lib/services/hr/pay-bands/salary-suggestion-rule-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function refuseUnlessSuperAdmin(auth: AuthContext): Promise<NextResponse | null> {
  const { data } = await auth.supabase.rpc('is_super_admin');
  if (data === true) return null;
  return NextResponse.json(
    { error: 'Only a super administrator can see or change the salary suggestion rule.' },
    { status: 403 },
  );
}

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    const refused = await refuseUnlessSuperAdmin(auth);
    if (refused) return refused;
    try {
      return NextResponse.json(await SalarySuggestionRuleService.list(auth.supabase));
    } catch (err: unknown) {
      console.error('[HR Salary Suggestion Rule] read error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to load the rule' },
        { status: 500 },
      );
    }
  },
  { requiredPermission: 'read', allowApiKey: false },
);

export const POST = withAuth(
  async (request, auth) => {
    await connection();
    const refused = await refuseUnlessSuperAdmin(auth);
    if (refused) return refused;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const scope = body?.scope;
    const action = body?.action;
    if (scope !== 'group' && !(typeof scope === 'string' && UUID.test(scope))) {
      return NextResponse.json({ error: 'Say which college, or group-wide.' }, { status: 400 });
    }
    if (action !== 'save_draft' && action !== 'publish') {
      return NextResponse.json({ error: 'Say whether to save a draft or publish.' }, { status: 400 });
    }
    if (typeof body?.rule !== 'object' || body.rule === null || Array.isArray(body.rule)) {
      return NextResponse.json({ error: 'The rule is missing.' }, { status: 400 });
    }

    try {
      const result = await SalarySuggestionRuleService.save(auth.supabase, {
        scopeId: scope === 'group' ? null : (scope as string),
        publish: action === 'publish',
        rule: body.rule,
        reason: typeof body.reason === 'string' ? body.reason : '',
        userId: auth.user.id,
      });
      return NextResponse.json(result);
    } catch (err: unknown) {
      if (err instanceof RuleInputError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error('[HR Salary Suggestion Rule] save error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to save the rule' },
        { status: 500 },
      );
    }
  },
  { requiredPermission: 'write', allowApiKey: false },
);
