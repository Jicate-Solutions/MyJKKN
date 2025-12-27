// app/api/check-database-tables/route.ts

import { Database } from '@/types/applications';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';


export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    // Check if digital_resource_categories table exists
    const { error: categoriesError } = await supabase
      .from('digital_resource_categories')
      .select('id')
      .limit(1);

    // Check if digital_resources table exists
    const { error: resourcesError } = await supabase
      .from('digital_resources')
      .select('id')
      .limit(1);

    // Check if users table exists
    const { error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    const tablesExist = !categoriesError && !resourcesError && !usersError;

    return NextResponse.json({
      tablesExist,
      errors: {
        categories: categoriesError ? categoriesError.message : null,
        resources: resourcesError ? resourcesError.message : null,
        users: usersError ? usersError.message : null
      }
    });
  } catch (error) {
    console.error('Error checking database tables:', error);
    return NextResponse.json(
      { error: 'Failed to check database tables' },
      { status: 500 }
    );
  }
}
