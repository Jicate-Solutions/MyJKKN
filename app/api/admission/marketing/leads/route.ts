// app/api/admission/marketing/leads/route.ts
// Server-side fetch endpoint for marketing leads database.
// Uses service role client to bypass RLS overhead that causes statement timeouts.
// Supports: GET ?action=leads|districts|stats|batches

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action') || 'leads';
  const institutionId = searchParams.get('institution_id');

  if (!institutionId) {
    return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    switch (action) {
      case 'leads': {
        const search = searchParams.get('search') || undefined;
        const district = searchParams.get('district') || undefined;
        const gender = searchParams.get('gender') || undefined;
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const sortBy = searchParams.get('sort_by') || 'created_at';
        const sortOrder = searchParams.get('sort_order') || 'desc';

        let query = supabase
          .from('marketing_leads_database')
          .select('*', { count: 'exact' })
          .eq('institution_id', institutionId);

        if (search) {
          query = query.or(
            `student_name.ilike.%${search}%,father_name.ilike.%${search}%,mobile_number.ilike.%${search}%,school_name.ilike.%${search}%,district.ilike.%${search}%`
          );
        }
        if (district) query = query.eq('district', district);
        if (gender) query = query.eq('gender', gender);

        query = query.order(sortBy, { ascending: sortOrder === 'asc' });
        const from = (page - 1) * limit;
        query = query.range(from, from + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return NextResponse.json({
          data: data || [],
          metadata: {
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
          },
        });
      }

      case 'districts': {
        const { data, error } = await supabase
          .from('marketing_leads_database')
          .select('district')
          .eq('institution_id', institutionId)
          .not('district', 'is', null)
          .order('district');

        if (error) throw error;

        // Deduplicate
        const unique = [...new Set((data || []).map((r: any) => r.district).filter(Boolean))];
        return NextResponse.json(unique);
      }

      case 'stats': {
        // Single query for all stats
        const { data: allRows, error } = await supabase
          .from('marketing_leads_database')
          .select('gender, district, school_name, upload_batch_id')
          .eq('institution_id', institutionId);

        if (error) throw error;

        const rows = allRows || [];
        const districts = new Set<string>();
        const schools = new Set<string>();
        const batches = new Set<string>();
        let male = 0, female = 0, other = 0;

        for (const row of rows) {
          if (row.district) districts.add(row.district);
          if (row.school_name) schools.add(row.school_name);
          if (row.upload_batch_id) batches.add(row.upload_batch_id);
          if (row.gender === 'Male') male++;
          else if (row.gender === 'Female') female++;
          else if (row.gender) other++;
        }

        return NextResponse.json({
          totalLeads: rows.length,
          totalDistricts: districts.size,
          totalSchools: schools.size,
          genderBreakdown: { male, female, other },
          totalUploads: batches.size,
        });
      }

      case 'batches': {
        const { data, error } = await supabase
          .from('marketing_leads_database')
          .select('upload_batch_id, upload_file_name, uploaded_by, created_at')
          .eq('institution_id', institutionId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by batch
        const batchMap = new Map<string, any>();
        for (const row of data || []) {
          if (!batchMap.has(row.upload_batch_id)) {
            batchMap.set(row.upload_batch_id, {
              upload_batch_id: row.upload_batch_id,
              upload_file_name: row.upload_file_name,
              uploaded_by: row.uploaded_by,
              created_at: row.created_at,
              total_records: 0,
            });
          }
          batchMap.get(row.upload_batch_id)!.total_records += 1;
        }

        return NextResponse.json(Array.from(batchMap.values()));
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[admission/marketing-leads-db] API route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
