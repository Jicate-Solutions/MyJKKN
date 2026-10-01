export const dynamic = 'force-dynamic';

/**
 * /api/hr/payroll/salary-suggestion-rule — the Director's per-department amounts.
 *
 *   GET  → every active department at an HR college, the one group-wide row of
 *          the rule (published value and pending draft), and `canEdit`.
 *   POST → save a draft or publish, with a mandatory reason that goes to
 *          hr_policy_audit_log.
 *
 * WHO. Looking: super admins (checked with is_super_admin(), the profile flag,
 * never a role name) — the amounts decide what the system suggests for
 * everybody. Changing: ONLY the Director list (fn_is_the_director(), #4121;
 * the Director's ruling of 30 Sep 2026). Another super admin gets the page
 * read-only (`canEdit: false`) and a 403 on POST. Both checks are strict: only
 * a boolean true passes, and a failed check is a refusal, never a pass.
 * Everything is read and written with the caller's own session client, so the
 * table's policies and this PR's database guard (20270512090000, section 4)
 * still apply underneath.
 *
 * Saving the rule changes NOBODY's pay. It only changes what the Suggest panel
 * on Employee Salaries works out.
 *
 * NOT BEFORE #4111. Until PR #4111's restrictive read policies are live, every
 * signed-in account can read platform_policies rows — this rule's amounts
 * included, and a draft's too (draft_value sits in the same row). So POST asks
 * fn_hr_salary_rule_lock_present() first and answers 409, saving nothing,
 * while it is false. A failed check is a refusal too (500), never a pass.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import {
  RuleInputError,
  SalarySuggestionRuleService,
} from '@/lib/services/hr/pay-bands/salary-suggestion-rule-service';

async function isSuperAdmin(auth: AuthContext): Promise<boolean> {
  const { data } = await auth.supabase.rpc('is_super_admin');
  return data === true;
}

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    if (!(await isSuperAdmin(auth))) {
      return NextResponse.json(
        { error: 'Only a super administrator can see the salary suggestion amounts.' },
        { status: 403 },
      );
    }
    // Before #4121 is applied the check fails: the page is then read-only.
    let canEdit = false;
    try {
      canEdit = await SalarySuggestionRuleService.isTheDirector(auth.supabase);
    } catch (err: unknown) {
      console.warn('[HR Salary Suggestion Rule] Director check failed; page read-only:', err);
    }
    try {
      return NextResponse.json({ ...(await SalarySuggestionRuleService.list(auth.supabase)), canEdit });
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
    let director: boolean;
    try {
      director = await SalarySuggestionRuleService.isTheDirector(auth.supabase);
    } catch (err: unknown) {
      console.error('[HR Salary Suggestion Rule] Director check error:', err);
      return NextResponse.json(
        { error: 'Could not confirm that you are on the Director list, so nothing was saved.' },
        { status: 500 },
      );
    }
    if (!director) {
      return NextResponse.json(
        { error: 'Only the Director can change the salary suggestion amounts. Nothing was saved.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = body?.action;
    if (action !== 'save_draft' && action !== 'publish') {
      return NextResponse.json({ error: 'Say whether to save a draft or publish.' }, { status: 400 });
    }
    if (typeof body?.rule !== 'object' || body.rule === null || Array.isArray(body.rule)) {
      return NextResponse.json({ error: 'The rule is missing.' }, { status: 400 });
    }

    let locked: boolean;
    try {
      locked = await SalarySuggestionRuleService.lockPresent(auth.supabase);
    } catch (err: unknown) {
      console.error('[HR Salary Suggestion Rule] lock check error:', err);
      return NextResponse.json(
        { error: 'Could not confirm that pay-policy protection is live, so nothing was saved.' },
        { status: 500 },
      );
    }
    if (!locked) {
      return NextResponse.json(
        {
          error:
            action === 'publish'
              ? 'The salary rule cannot be published until pay-policy protection is live. Nothing was saved.'
              : 'The salary rule cannot be saved, even as a draft, until pay-policy protection is live. Nothing was saved.',
        },
        { status: 409 },
      );
    }

    try {
      const result = await SalarySuggestionRuleService.save(auth.supabase, {
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
