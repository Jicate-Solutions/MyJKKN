import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';


// GET /api/dashboard/widget-types - Get available widget types
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user to check permissions
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role/permissions (if needed for filtering)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Fetch all active widget types
    const { data: widgetTypes, error } = await supabase
      .from('dashboard_widget_types')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('widget_name');

    if (error) {
      console.error('Error fetching widget types:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter widget types based on user permissions (optional)
    // For now, we'll return all widget types, but you could filter based on permissions_required
    const filteredWidgetTypes =
      widgetTypes?.filter((widget: any) => {
        // If no permissions required, show to everyone
        if (
          !widget.permissions_required ||
          widget.permissions_required.length === 0
        ) {
          return true;
        }

        // For super admins, show everything
        if (profile?.role === 'super_admin') {
          return true;
        }

        // For other roles, you could implement permission checking here
        // For now, we'll show all widgets to authenticated users
        return true;
      }) || [];

    return NextResponse.json(filteredWidgetTypes);
  } catch (error) {
    console.error('Error in GET /api/dashboard/widget-types:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
