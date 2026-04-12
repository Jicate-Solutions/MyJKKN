import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check super_admin permission
    const { data: userProfileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userProfile = userProfileData as { role: string } | null;

    if (userProfile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Super admin only.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { status, review_note } = body as {
      status: 'approved' | 'denied';
      review_note?: string;
    };

    // Validate status
    if (!status || !['approved', 'denied'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "approved" or "denied"' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Update the extension request
    const { data: updated, error: updateError } = await (
      serviceClient as any
    )
      .from('action_extension_requests')
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: review_note || null
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Extension request not found' },
          { status: 404 }
        );
      }
      console.error(
        '[admin/notifications/review-extension] Update error:',
        updateError
      );
      return NextResponse.json(
        { error: 'Failed to update extension request' },
        { status: 500 }
      );
    }

    return NextResponse.json(updated, {
      headers: {
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error(
      '[admin/notifications/review-extension] Unexpected error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
