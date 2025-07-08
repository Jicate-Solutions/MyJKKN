// app/api/applications/[id]/route.ts

import { Database } from '@/types/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import toast from 'react-hot-toast';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CategoryService } from '@/lib/services/application/category-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cookieStore = await cookies();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Application not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    // Log the application data before fetching category
    console.log('Application data before category fetch:', {
      id: data.id,
      name: data.name,
      category_id: data.category_id,
      subcategory_id: data.subcategory_id
    });

    // Fetch category and subcategory data
    if (data.category_id) {
      try {
        console.log(
          'Attempting direct database query for category with ID:',
          data.category_id
        );

        // Direct database query
        const { data: categoryData, error: categoryError } = await supabase
          .from('categories')
          .select('*')
          .eq('id', data.category_id)
          .single();

        if (categoryError) {
          console.error('Database error fetching category:', categoryError);
          data.category = {
            id: data.category_id,
            name: 'Unknown Category',
            description: null
          };
        } else if (categoryData) {
          console.log(
            'Found category directly from database:',
            categoryData.name
          );
          data.category = {
            id: categoryData.id,
            name: categoryData.name,
            description: categoryData.description
          };

          // If subcategory_id exists, fetch it directly too
          if (data.subcategory_id) {
            try {
              const { data: subcategoryData, error: subcategoryError } =
                await supabase
                  .from('subcategories')
                  .select('*')
                  .eq('id', data.subcategory_id)
                  .single();

              if (subcategoryError) {
                console.error('Error fetching subcategory:', subcategoryError);
                data.subcategory = null;
              } else if (subcategoryData) {
                console.log(
                  'Found subcategory from database:',
                  subcategoryData.name
                );
                data.subcategory = {
                  id: subcategoryData.id,
                  name: subcategoryData.name
                };
              } else {
                data.subcategory = null;
              }
            } catch (error) {
              console.error('Unexpected error fetching subcategory:', error);
              data.subcategory = null;
            }
          } else {
            data.subcategory = null;
          }
        } else {
          console.log(
            'No category found in database with ID:',
            data.category_id
          );
          data.category = {
            id: data.category_id,
            name: 'Unknown Category',
            description: null
          };
        }
      } catch (error) {
        console.error('Error processing category data:', error);
        data.category = {
          id: data.category_id,
          name: 'Unknown Category',
          description: null
        };
      }
    } else {
      // Ensure a default category for uncategorized applications
      if (!data.category) {
        data.category = {
          id: data.category_id || '',
          name: 'Uncategorized',
          description: null
        };
      }
    }

    // Log the final application data with category info
    console.log('Final application data with category:', {
      id: data.id,
      name: data.name,
      category: data.category,
      subcategory: data.subcategory
    });

    // Before returning data
    console.log(
      'Final application data to be returned:',
      JSON.stringify(
        {
          id: data.id,
          name: data.name,
          category_id: data.category_id,
          category: data.category
            ? {
                id: data.category.id,
                name: data.category.name,
                description: data.category.description
              }
            : 'undefined'
        },
        null,
        2
      )
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching application:', error);
    return NextResponse.json(
      { error: 'Failed to fetch application' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['super_admin', 'administrator'].includes(profile.role)
    ) {
      toast.error('You are not authorized to update this application');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate URL if provided
    if (body.url && !body.url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'URL must start with https://' },
        { status: 400 }
      );
    }

    // Validate support contact if provided
    if (body.support_contact) {
      const { name, email, phone } = body.support_contact;
      if (!name || !email) {
        return NextResponse.json(
          { error: 'Support contact name and email are required' },
          { status: 400 }
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format for support contact' },
          { status: 400 }
        );
      }
    }

    // Validate API endpoints if provided
    if (body.api_endpoints?.length > 0) {
      for (const endpoint of body.api_endpoints) {
        if (!endpoint.name || endpoint.name.length < 2) {
          return NextResponse.json(
            { error: 'API endpoint name must be at least 2 characters' },
            { status: 400 }
          );
        }
        if (!endpoint.url.startsWith('https://')) {
          return NextResponse.json(
            { error: 'API endpoint URLs must start with https://' },
            { status: 400 }
          );
        }
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(endpoint.method)) {
          return NextResponse.json(
            { error: 'Invalid HTTP method for API endpoint' },
            { status: 400 }
          );
        }
      }
    }

    // Update application
    const { data, error } = await supabase
      .from('applications')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Application not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['super_admin', 'administrator'].includes(profile.role)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase.from('applications').delete().eq('id', id);

    if (error) {
      throw error;
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
