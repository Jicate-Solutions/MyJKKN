// app/api/admission/remarketing/route.ts
// CRUD API for remarketing audience rules

import { NextRequest, NextResponse } from 'next/server';
import { RemarketingService } from '@/lib/services/marketing/remarketing-service';
import type { AdPlatform, AudienceSyncStatus } from '@/lib/services/marketing/remarketing-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const view = searchParams.get('view'); // 'ad_accounts' | 'sync_history'
    const ruleId = searchParams.get('rule_id');

    if (view === 'ad_accounts') {
      const statuses = await RemarketingService.getAdAccountStatus();
      return NextResponse.json({ accounts: statuses });
    }

    if (view === 'sync_history' && ruleId) {
      const history = await RemarketingService.getSyncHistory(
        ruleId,
        parseInt(searchParams.get('limit') || '20')
      );
      return NextResponse.json({ history });
    }

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const rules = await RemarketingService.getAudienceRules({
      institutionId,
      platform: searchParams.get('platform') as AdPlatform || undefined,
      isEnabled: searchParams.get('is_enabled') !== null ? searchParams.get('is_enabled') === 'true' : undefined,
      syncStatus: searchParams.get('sync_status') as AudienceSyncStatus || undefined,
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('[api/remarketing] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch remarketing rules' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'sync') {
      const result = await RemarketingService.syncAudience(body.rule_id);
      return NextResponse.json(result);
    }

    // Create new rule
    const rule = await RemarketingService.createAudienceRule(body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('[api/remarketing] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process remarketing request' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const rule = await RemarketingService.updateAudienceRule(id, updateData);
    return NextResponse.json({ rule });
  } catch (error) {
    console.error('[api/remarketing] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update remarketing rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await RemarketingService.deleteAudienceRule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/remarketing] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete remarketing rule' },
      { status: 500 }
    );
  }
}
