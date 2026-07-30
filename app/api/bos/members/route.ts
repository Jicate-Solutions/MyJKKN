import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CreateBosMemberDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
  guardAcademicCouncilWrite,
  guardGoverningBodyWrite,
  hasBosPermission,
  isBosReadAllObserver,
} from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/members?compositionId= ──────────────────────────────────────
// Visible to: super-admin, principal (for comps in their institution), and
// any active member of the composition.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const compositionId = searchParams.get('compositionId');

    if (!compositionId) {
      return NextResponse.json({ error: 'compositionId is required' }, { status: 400 });
    }

    // Visibility check before exposing the roster.
    // Allow when: super-admin OR principal-in-institution OR active member of
    // the comp OR creator of the comp (bootstrap — the user who just made the
    // comp and is about to add the first chairman). Without the creator
    // carve-out, a freshly-created comp's roster appears empty to its own
    // creator after they add the first member.
    const scope = await resolveBosBoardScope(user.id);
    // Read-only observer: a role holding academic.bos-members.view but sitting on
    // no board (not a principal, member of nothing) may read any composition's
    // roster. VIEW ONLY — never widens board members/principals.
    const hasView = await hasBosPermission(user.id, 'academic.bos-members.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;
    // Council bodies (Academic Council / Governing Body): the roster read must go
    // through the service-role client because principals lack the bos.members.view
    // RLS grant, so a user-context SELECT returns empty for them. Route-level
    // visibility below is the source of truth.
    let isAcComp = false;
    if (!scope.isSuperAdmin) {
      let visible = seeAll || scope.memberOf.has(compositionId);
      const { data: comp } = await supabase
        .from('bos_compositions')
        .select('institutions_id, created_by, is_academic_council, is_governing_body')
        .eq('id', compositionId)
        .maybeSingle();
      const compRow = comp as {
        institutions_id?: string | null;
        created_by?: string | null;
        is_academic_council?: boolean;
        is_governing_body?: boolean;
      } | null;
      isAcComp = compRow?.is_academic_council === true || compRow?.is_governing_body === true;
      if (!visible) {
        const compInstitution = compRow?.institutions_id ?? null;
        const isCreator = compRow?.created_by != null && compRow.created_by === user.id;
        if (isCreator) {
          visible = true;
        } else if (scope.isPrincipal) {
          visible = compInstitution
            ? scope.allInstitutionIds.includes(compInstitution) || scope.institutionsId === compInstitution
            : false;
        }
      }
      if (!visible) {
        return NextResponse.json([], { status: 200 });
      }
    }

    // Observer (read-all, no membership) lacks the bos_members RLS grant for a
    // comp it doesn't belong to, so its user-context SELECT would return an empty
    // roster despite passing the visibility gate above. Read via service-role —
    // route-level visibility is the source of truth. (Same precedent as AC bodies.)
    const readDb = (isAcComp || canReadAllBos) ? createServiceRoleClient() : supabase;
    const { data, error } = await readDb
      .from('bos_members')
      .select(`
        *,
        expert:bos_external_experts (
          id, name, title, designation, institution_name, email, contact_no, category, distance_km
        ),
        member_type_rec:bos_member_types (
          id, name, base_type
        )
      `)
      .eq('composition_id', compositionId)
      .order('sort_order', { ascending: true })
      .order('member_type', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/members] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

// ── POST /api/bos/members ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Hoisted so the catch-block's diagnostic can re-query the parent composition.
  let compositionIdForDiag: string | null = null;
  let userIdForDiag: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userIdForDiag = user.id;

    const body: CreateBosMemberDto = await request.json();
    compositionIdForDiag = body.composition_id ?? null;

    if (!body.composition_id || !body.member_type || !body.display_name) {
      return NextResponse.json(
        { error: 'composition_id, member_type, and display_name are required' },
        { status: 400 }
      );
    }

    // Chairman OR creator of the parent composition: chairman is the primary
    // gate, but the creator can also manage members until the chairman seat
    // is filled (bootstrap case — HOD just made the comp and needs to add
    // the first chairman row).
    //
    // Defensive: if bos_compositions.created_by doesn't exist yet (migration
    // not applied), the SELECT fails with 42703. Rather than letting that
    // mask the real check, we degrade to chairman-only and surface a clear
    // schema-out-of-date message.
    const scope = await resolveBosBoardScope(user.id);
    // Council bodies (Academic Council / Governing Body) flip the roster-authz:
    // the principal manages the roster (not a board chairman). When the parent is
    // a council body we authorize via the council write-gate and write with the
    // service-role client, since the board-keyed bos_members RLS wouldn't pass a
    // principal.
    let isAcComp = false;
    if (!scope.isSuperAdmin) {
      const { data: parentComp, error: parentErr } = await supabase
        .from('bos_compositions')
        .select('created_by, is_academic_council, is_governing_body, institutions_id')
        .eq('id', body.composition_id)
        .maybeSingle();
      if (parentErr) {
        const code = (parentErr as { code?: string }).code;
        if (code === '42703') {
          return NextResponse.json(
            {
              error:
                'Database schema is out of date — run the 20260514 migration to add bos_compositions.created_by.',
            },
            { status: 500 }
          );
        }
        throw parentErr;
      }
      const comp = parentComp as {
        created_by?: string | null;
        is_academic_council?: boolean;
        is_governing_body?: boolean;
        institutions_id?: string | null;
      } | null;
      const isGbComp = comp?.is_governing_body === true;
      isAcComp = comp?.is_academic_council === true || isGbComp;
      if (isAcComp) {
        const deny = isGbComp
          ? guardGoverningBodyWrite(scope, comp?.institutions_id)
          : guardAcademicCouncilWrite(scope, comp?.institutions_id);
        if (deny) return NextResponse.json({ error: deny }, { status: 403 });
      } else {
        const isCreator = comp?.created_by === user.id;
        if (!isCreator) {
          const deny = guardCompositionChairman(scope, body.composition_id);
          if (deny) return NextResponse.json({ error: deny }, { status: 403 });
        }
      }
    }

    // AC roster writes bypass the board-keyed RLS (route-level authz above is
    // the source of truth). BoS writes stay on the user-context client.
    const writeDb = isAcComp ? createServiceRoleClient() : supabase;

    // Enforce the source check: exactly one of staff_id or expert_id must be set
    if (body.staff_id && body.expert_id) {
      return NextResponse.json(
        { error: 'A member cannot have both staff_id and expert_id. Set only one.' },
        { status: 400 }
      );
    }

    // Council bodies (Academic Council / Governing Body) carry a single default
    // committee (seeded by the prepare route). Members added without an explicit
    // committee are attached to it, so the committee-scoped meeting roster /
    // attendance / TA-DA generation sees them. BoS members keep whatever the Add
    // Member dialog sent.
    let committeeId: string | null = body.committee_id ?? null;
    if (!committeeId) {
      const lookupDb = createServiceRoleClient();
      const { data: compRow } = await lookupDb
        .from('bos_compositions')
        .select('is_academic_council, is_governing_body')
        .eq('id', body.composition_id)
        .maybeSingle();
      const councilRow = compRow as {
        is_academic_council?: boolean;
        is_governing_body?: boolean;
      } | null;
      if (councilRow?.is_academic_council === true || councilRow?.is_governing_body === true) {
        const { data: defaultCommittee } = await lookupDb
          .from('bos_committees')
          .select('id')
          .eq('composition_id', body.composition_id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle();
        committeeId = (defaultCommittee as { id: string } | null)?.id ?? null;
      }
    }

    // Reject duplicates: the same staff or expert cannot be on the same
    // committee of a composition twice (the same person MAY sit on two
    // different committees). The DB enforces this via partial unique indexes
    // (re-scoped per committee in 20260610_bos_committees.sql), but checking
    // here lets us return a friendly 409 Conflict instead of a raw 23505.
    if (body.staff_id || body.expert_id) {
      let dupQuery = writeDb
        .from('bos_members')
        .select('id, display_name')
        .eq('composition_id', body.composition_id)
        .limit(1);
      dupQuery = committeeId
        ? dupQuery.eq('committee_id', committeeId)
        : dupQuery.is('committee_id', null);
      if (body.staff_id) {
        dupQuery.eq('staff_id', body.staff_id);
      } else if (body.expert_id) {
        dupQuery.eq('expert_id', body.expert_id);
      }
      const { data: existingDup } = await dupQuery.maybeSingle();
      if (existingDup) {
        const who = (existingDup as { display_name?: string | null }).display_name ?? 'This person';
        return NextResponse.json(
          { error: `${who} is already a member of this committee.` },
          { status: 409 }
        );
      }
    }

    // Auto-assign sort_order: append after the existing roster.
    //
    // `?? ` alone was not enough — the Add Member dialog used to send a literal
    // 0, which is not nullish, so every member landed on sort_order 0 and the
    // roster had no order at all. Anything <= 0 now means "auto", except that
    // the council routes still insert -1 deliberately to float the chairman /
    // member secretary to the top (they insert directly, not through here).
    const { count } = await writeDb
      .from('bos_members')
      .select('id', { count: 'exact', head: true })
      .eq('composition_id', body.composition_id);

    const explicitOrder =
      typeof body.sort_order === 'number' && body.sort_order > 0
        ? body.sort_order
        : null;

    const insertData = {
      ...body,
      committee_id: committeeId,
      sort_order: explicitOrder ?? (count ?? 0) + 1,
      is_active: body.is_active ?? true,
    };

    const { data, error } = await writeDb
      .from('bos_members')
      .insert(insertData)
      .select(`
        *,
        expert:bos_external_experts (
          id, name, title, designation, institution_name, email, contact_no, category, distance_km
        ),
        member_type_rec:bos_member_types (
          id, name, base_type
        )
      `)
      .single();

    if (error) throw error;

    // Pull the new member into its own group's numbering. The insert above
    // appended it at `count + 1`, which sorts last INSIDE its group (right) but
    // last in the WHOLE composition (wrong — it would print at the end of the
    // meeting notice instead of after the other faculty members). The function
    // recompacts sort_order to 1..n and rebuilds group_position, so the stored
    // ranks match the roster exactly. Never fatal: a failure here leaves the
    // member correctly created, just numbered at the tail until the next write.
    const inserted = data as { id: string } | null;
    if (inserted?.id) {
      const rankDb = createServiceRoleClient();
      const { error: renumberErr } = await rankDb.rpc('bos_renumber_member_order', {
        p_composition_id: body.composition_id,
      });
      if (renumberErr) {
        console.warn('[bos/members] renumber after insert failed:', renumberErr);
      } else {
        // Re-read the ranks the function just assigned so the response (which
        // the client writes straight into its cache) isn't stale.
        const { data: ranked } = await rankDb
          .from('bos_members')
          .select('sort_order, group_position')
          .eq('id', inserted.id)
          .maybeSingle();
        if (ranked) Object.assign(data as object, ranked);
      }
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const pgErr = error as { code?: string; message?: string; hint?: string; details?: string };
    console.error('[bos/members] POST error:', {
      code: pgErr.code,
      message: pgErr.message,
      hint: pgErr.hint,
      details: pgErr.details,
    });
    // 23505 = unique_violation — the partial unique indexes from
    // 20260516_bos_members_no_duplicates.sql triggered. The API pre-check above
    // catches the common case; this branch handles concurrent inserts that
    // raced past it.
    if (pgErr.code === '23505') {
      return NextResponse.json(
        { error: 'This person is already a member of this committee.' },
        { status: 409 }
      );
    }
    // 42703 = undefined column — most likely the 20260514 RLS migration that
    // adds bos_compositions.created_by hasn't been applied yet, so the parent
    // composition lookup above fails and we end up in the chairman branch
    // when we shouldn't.
    if (pgErr.code === '42703') {
      return NextResponse.json(
        {
          error:
            'Database schema is out of date — run the 20260514 migration (missing column: created_by).',
        },
        { status: 500 }
      );
    }
    // 42501 / "new row violates row-level security policy" — run a follow-up
    // diagnostic so we can tell the user WHICH part of the policy failed:
    //   (a) missing role permission `academic.bos-compositions.edit`
    //   (b) parent comp has created_by=NULL (row predates the column)
    //   (c) creator-bootstrap clause shouldn't have failed — RLS migration
    //       ordering or 20260514a not applied
    if (pgErr.code === '42501' || pgErr.message?.includes('row-level security')) {
      // Re-read state to diagnose. These calls use the same auth context so
      // they reflect what RLS would see for the same user.
      let diagReason = 'Unknown — the bos_members INSERT policy rejected the row.';
      try {
        const supabase2 = await createClient();

        // Run all WITH CHECK predicates individually via RPC, plus read the
        // parent composition. Each piece's result tells us which AND/OR
        // sub-clause is failing.
        const [editPerm, viewPerm, instAccess, compResult] = await Promise.all([
          supabase2.rpc('user_has_permission', {
            permission_name: 'academic.bos-compositions.edit',
          }),
          supabase2.rpc('user_has_permission', {
            permission_name: 'academic.bos-compositions.view',
          }),
          compositionIdForDiag
            ? supabase2
                .from('bos_compositions')
                .select('institutions_id')
                .eq('id', compositionIdForDiag)
                .maybeSingle()
                .then(async (r) => {
                  const inst = (r.data as { institutions_id?: string | null } | null)?.institutions_id;
                  if (!inst) return { data: false } as { data: boolean };
                  return supabase2.rpc('role_has_institution_access', {
                    check_institution_id: inst,
                  });
                })
            : Promise.resolve({ data: false } as { data: boolean }),
          compositionIdForDiag
            ? supabase2
                .from('bos_compositions')
                .select('id, created_by, institutions_id')
                .eq('id', compositionIdForDiag)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const hasEditPerm = editPerm.data === true;
        const hasViewPerm = viewPerm.data === true;
        const hasInstAccess = (instAccess as { data: boolean | null }).data === true;
        const comp = (compResult as {
          data: { id: string; created_by: string | null; institutions_id: string | null } | null;
        }).data;

        if (!hasEditPerm) {
          diagReason =
            'Your role lacks `academic.bos-compositions.edit` permission. Grant it in Admin → Roles for the role(s) assigned to your account.';
        } else if (!comp) {
          diagReason = `Parent composition (${compositionIdForDiag}) is not readable via your auth — either it doesn't exist or bos_compositions SELECT policy hides it.`;
        } else if (!comp.created_by) {
          diagReason = `The composition has created_by=NULL (created before the column was added). Backfill: UPDATE bos_compositions SET created_by = '${userIdForDiag}' WHERE id = '${comp.id}';`;
        } else if (comp.created_by !== userIdForDiag) {
          diagReason = `The composition was created by another user (${comp.created_by}). You must be the chairman to add members.`;
        } else if (!hasInstAccess) {
          diagReason = `role_has_institution_access('${comp.institutions_id}') returned false for your user. Your role/user_institution_access doesn't grant access to this composition's institution UUID. Check Admin → Users → Institution Access.`;
        } else if (!hasViewPerm) {
          diagReason =
            'You have `academic.bos-compositions.edit` but not `academic.bos-compositions.view`. The bos_members INSERT policy nests an EXISTS subquery against bos_compositions whose SELECT policy needs `.view`. Grant `academic.bos-compositions.view` to your role.';
        } else {
          diagReason =
            'All four conditions appear satisfied (perm.edit, perm.view, inst-access, creator) but RLS still rejected. Check that the policy expression was actually replaced — `SELECT with_check FROM pg_policies WHERE policyname = \'bos_members_insert\';` should match what 20260514a set.';
        }
      } catch (diagErr) {
        console.error('[bos/members] diagnostic query failed:', diagErr);
      }

      return NextResponse.json(
        { error: `Permission denied by row-level security. Reason: ${diagReason}` },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: pgErr.message ?? 'Failed to add member' },
      { status: 500 }
    );
  }
}
