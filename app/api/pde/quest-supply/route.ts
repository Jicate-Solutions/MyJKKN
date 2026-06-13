/**
 * /api/pde/quest-supply — PDE Tier 3.1 quest supply pipeline
 * ============================================================================
 *
 * GET     → list proposed quests (admin-only via RLS at table level)
 * POST    → submit a new quest proposal (authenticated user)
 * PATCH   → approve a proposal (?id=<uuid>&action=approve, admin-only)
 *
 * Backed by `PDEQuestSupplyService`. Policy consumed:
 *   `pde.quests.supply_sources` via `getQuestsSupplySources()`.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  PDEQuestSupplyService,
  InvalidSupplySourceError,
  type QuestProposalInput,
} from '@/lib/services/pde-quest-supply-service';
import type { QuestSupplySource } from '@/lib/services/pde-policy-reader-types';

export async function GET(_request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await PDEQuestSupplyService.listProposedQuests();
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<QuestProposalInput>;
    const {
      title,
      description,
      problem_statement,
      quest_type,
      deliverable_description,
      source_type,
    } = body;

    if (
      !title ||
      !description ||
      !problem_statement ||
      !quest_type ||
      !deliverable_description ||
      !source_type
    ) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, problem_statement, quest_type, deliverable_description, source_type' },
        { status: 400 }
      );
    }

    const result = await PDEQuestSupplyService.submitQuestProposal({
      title,
      description,
      problem_statement,
      quest_type,
      deliverable_description,
      source_type: source_type as QuestSupplySource,
      source_contact: body.source_contact ?? null,
      source_department: body.source_department ?? null,
      difficulty: body.difficulty ?? null,
      estimated_hours: body.estimated_hours ?? null,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e: any) {
    if (e instanceof InvalidSupplySourceError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const id = sp.get('id');
    const action = sp.get('action');
    if (!id || action !== 'approve') {
      return NextResponse.json(
        { error: "Expected ?id=<uuid>&action=approve" },
        { status: 400 }
      );
    }

    const row = await PDEQuestSupplyService.approveQuestProposal(id, user.id);
    return NextResponse.json({ data: row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
