// app/api/check-database-tables/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
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
