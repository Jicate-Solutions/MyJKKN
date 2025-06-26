import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Validation schemas
const createConfigurationSchema = z.object({
  configuration_name: z.string().min(1).max(100),
  is_default: z.boolean().optional().default(false),
  layout_config: z.array(z.any()).optional().default([])
});

const updateConfigurationSchema = z.object({
  configuration_name: z.string().min(1).max(100).optional(),
  is_default: z.boolean().optional(),
  layout_config: z.array(z.any()).optional()
});

// GET /api/dashboard/configurations - Get user's dashboard configurations
export async function GET(request: NextRequest) {
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

    // Fetch user's dashboard configurations with widgets
    const { data: configurations, error } = await supabase
      .from('dashboard_configurations')
      .select(
        `
        *,
        dashboard_widgets (
          *,
          widget_type:dashboard_widget_types (*)
        )
      `
      )
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching configurations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data to match expected structure
    const transformedConfigurations =
      configurations?.map((config: any) => ({
        ...config,
        layout_config: config.dashboard_widgets || []
      })) || [];

    return NextResponse.json(transformedConfigurations);
  } catch (error) {
    console.error('Error in GET /api/dashboard/configurations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/dashboard/configurations - Create new dashboard configuration
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
    const validatedData = createConfigurationSchema.parse(body);

    // If this is being set as default, unset other defaults first
    if (validatedData.is_default) {
      await supabase
        .from('dashboard_configurations')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true);
    }

    // Create configuration
    const { data: configuration, error } = await supabase
      .from('dashboard_configurations')
      .insert([
        {
          user_id: user.id,
          configuration_name: validatedData.configuration_name,
          is_default: validatedData.is_default,
          layout_config: validatedData.layout_config
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating configuration:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(configuration, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/dashboard/configurations:', error);

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

// PUT /api/dashboard/configurations - Update configuration (requires config ID in query params)
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

    // Get configuration ID from query params
    const url = new URL(request.url);
    const configId = url.searchParams.get('id');
    if (!configId) {
      return NextResponse.json(
        { error: 'Configuration ID required' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateConfigurationSchema.parse(body);

    // Verify user owns the configuration
    const { data: existingConfig, error: checkError } = await supabase
      .from('dashboard_configurations')
      .select('id')
      .eq('id', configId)
      .eq('user_id', user.id)
      .single();

    if (checkError || !existingConfig) {
      return NextResponse.json(
        { error: 'Configuration not found or access denied' },
        { status: 404 }
      );
    }

    // If this is being set as default, unset other defaults first
    if (validatedData.is_default) {
      await supabase
        .from('dashboard_configurations')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true);
    }

    // Update configuration
    const { data: configuration, error } = await supabase
      .from('dashboard_configurations')
      .update(validatedData)
      .eq('id', configId)
      .select()
      .single();

    if (error) {
      console.error('Error updating configuration:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(configuration);
  } catch (error) {
    console.error('Error in PUT /api/dashboard/configurations:', error);

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

// DELETE /api/dashboard/configurations - Delete configuration (requires config ID in query params)
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

    // Get configuration ID from query params
    const url = new URL(request.url);
    const configId = url.searchParams.get('id');
    if (!configId) {
      return NextResponse.json(
        { error: 'Configuration ID required' },
        { status: 400 }
      );
    }

    // Verify user owns the configuration
    const { data: existingConfig, error: checkError } = await supabase
      .from('dashboard_configurations')
      .select('id')
      .eq('id', configId)
      .eq('user_id', user.id)
      .single();

    if (checkError || !existingConfig) {
      return NextResponse.json(
        { error: 'Configuration not found or access denied' },
        { status: 404 }
      );
    }

    // Delete configuration (widgets will be cascade deleted)
    const { error } = await supabase
      .from('dashboard_configurations')
      .delete()
      .eq('id', configId);

    if (error) {
      console.error('Error deleting configuration:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/dashboard/configurations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
