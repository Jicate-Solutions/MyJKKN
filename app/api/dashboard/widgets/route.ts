import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Validation schemas
const createWidgetSchema = z.object({
  configuration_id: z.string().uuid(),
  widget_type_id: z.string().uuid(),
  position_x: z.number().int().min(0),
  position_y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  widget_config: z.record(z.any()).optional().default({}),
  is_visible: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0)
});

const updateWidgetSchema = z.object({
  position_x: z.number().int().min(0).optional(),
  position_y: z.number().int().min(0).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  widget_config: z.record(z.any()).optional(),
  is_visible: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

// POST /api/dashboard/widgets - Add widget to configuration
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createWidgetSchema.parse(body);

    // Verify user owns the configuration
    const { data: configuration, error: configError } = await supabase
      .from('dashboard_configurations')
      .select('id')
      .eq('id', validatedData.configuration_id)
      .eq('user_id', user.id)
      .single();

    if (configError || !configuration) {
      return NextResponse.json(
        { error: 'Configuration not found or access denied' },
        { status: 404 }
      );
    }

    // Create widget
    const { data: widget, error } = await supabase
      .from('dashboard_widgets')
      .insert([validatedData])
      .select(
        `
        *,
        widget_type:dashboard_widget_types (*)
      `
      )
      .single();

    if (error) {
      console.error('Error creating widget:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(widget, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/dashboard/widgets:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/dashboard/widgets - Update widget (requires widget ID in query params)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get widget ID from query params
    const url = new URL(request.url);
    const widgetId = url.searchParams.get('id');
    if (!widgetId) {
      return NextResponse.json(
        { error: 'Widget ID required' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateWidgetSchema.parse(body);

    // First get the widget with its configuration_id
    const { data: widget, error: widgetError } = await supabase
      .from('dashboard_widgets')
      .select('id, configuration_id')
      .eq('id', widgetId)
      .single();

    if (widgetError || !widget) {
      return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
    }

    // Then verify user owns the configuration
    const { data: configuration, error: configError } = await supabase
      .from('dashboard_configurations')
      .select('id')
      .eq('id', widget.configuration_id)
      .eq('user_id', user.id)
      .single();

    if (configError || !configuration) {
      return NextResponse.json(
        { error: 'Configuration not found or access denied' },
        { status: 404 }
      );
    }

    // Update widget
    const { data: updatedWidget, error } = await supabase
      .from('dashboard_widgets')
      .update(validatedData)
      .eq('id', widgetId)
      .select(
        `
        *,
        widget_type:dashboard_widget_types (*)
      `
      )
      .single();

    if (error) {
      console.error('Error updating widget:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(updatedWidget);
  } catch (error) {
    console.error('Error in PUT /api/dashboard/widgets:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/dashboard/widgets - Delete widget (requires widget ID in query params)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get widget ID from query params
    const url = new URL(request.url);
    const widgetId = url.searchParams.get('id');
    if (!widgetId) {
      return NextResponse.json(
        { error: 'Widget ID required' },
        { status: 400 }
      );
    }

    // First get the widget with its configuration_id
    const { data: widget, error: widgetError } = await supabase
      .from('dashboard_widgets')
      .select('id, configuration_id')
      .eq('id', widgetId)
      .single();

    if (widgetError || !widget) {
      return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
    }

    // Then verify user owns the configuration
    const { data: configuration, error: configError } = await supabase
      .from('dashboard_configurations')
      .select('id')
      .eq('id', widget.configuration_id)
      .eq('user_id', user.id)
      .single();

    if (configError || !configuration) {
      return NextResponse.json(
        { error: 'Configuration not found or access denied' },
        { status: 404 }
      );
    }

    // Delete widget
    const { error } = await supabase
      .from('dashboard_widgets')
      .delete()
      .eq('id', widgetId);

    if (error) {
      console.error('Error deleting widget:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/dashboard/widgets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
