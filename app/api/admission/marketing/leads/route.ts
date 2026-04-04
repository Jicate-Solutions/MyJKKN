export const dynamic = 'force-dynamic';

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

        const unique = [...new Set((data || []).map((r: any) => r.district).filter(Boolean))];
        return NextResponse.json(unique);
      }

      case 'stats': {
        // Use aggregate queries instead of fetching all rows
        // (fetching all rows hits Supabase's default row limit and truncates results)

        // 1. Total count via exact count
        const { count: totalLeads, error: countError } = await supabase
          .from('marketing_leads_database')
          .select('id', { count: 'exact', head: true })
          .eq('institution_id', institutionId);

        if (countError) throw countError;

        // 2. Distinct districts
        const { data: districtRows, error: districtError } = await supabase
          .from('marketing_leads_database')
          .select('district')
          .eq('institution_id', institutionId)
          .not('district', 'is', null);

        if (districtError) throw districtError;
        const totalDistricts = new Set((districtRows || []).map((r: any) => r.district)).size;

        // 3. Distinct schools
        const { data: schoolRows, error: schoolError } = await supabase
          .from('marketing_leads_database')
          .select('school_name')
          .eq('institution_id', institutionId)
          .not('school_name', 'is', null);

        if (schoolError) throw schoolError;
        const totalSchools = new Set((schoolRows || []).map((r: any) => r.school_name)).size;

        // 4. Gender breakdown via individual counts
        const [maleResult, femaleResult, otherResult] = await Promise.all([
          supabase
            .from('marketing_leads_database')
            .select('id', { count: 'exact', head: true })
            .eq('institution_id', institutionId)
            .eq('gender', 'Male'),
          supabase
            .from('marketing_leads_database')
            .select('id', { count: 'exact', head: true })
            .eq('institution_id', institutionId)
            .eq('gender', 'Female'),
          supabase
            .from('marketing_leads_database')
            .select('id', { count: 'exact', head: true })
            .eq('institution_id', institutionId)
            .not('gender', 'in', '("Male","Female")')
            .not('gender', 'is', null),
        ]);

        // 5. Distinct upload batches
        const { data: batchRows, error: batchError } = await supabase
          .from('marketing_leads_database')
          .select('upload_batch_id')
          .eq('institution_id', institutionId)
          .not('upload_batch_id', 'is', null);

        if (batchError) throw batchError;
        const totalUploads = new Set((batchRows || []).map((r: any) => r.upload_batch_id)).size;

        return NextResponse.json({
          totalLeads: totalLeads || 0,
          totalDistricts,
          totalSchools,
          genderBreakdown: {
            male: maleResult.count || 0,
            female: femaleResult.count || 0,
            other: otherResult.count || 0,
          },
          totalUploads,
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
