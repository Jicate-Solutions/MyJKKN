import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const institutionsId = searchParams.get('institutions_id');

  if (!institutionsId) {
    return NextResponse.json(
      { error: 'institutions_id is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all syllabi for institution with version info
    const { data: syllabi, error: syllError } = await supabase
      .from('bos_course_syllabi')
      .select(`
        id,
        course_code,
        course_name,
        stream,
        version_number,
        is_latest,
        is_archived,
        regulation_id,
        last_modified_at,
        course_objectives,
        course_learning_outcomes,
        course_content,
        po_mappings
      `)
      .eq('institutions_id', institutionsId)
      .eq('is_archived', false)
      .order('course_code');

    if (syllError) throw syllError;

    const totalSyllabi = syllabi?.length ?? 0;

    // Calculate metrics
    const byStream: Record<string, number> = {};
    const byRegulation: Record<string, number> = {};
    const versionCounts: Record<number, number> = {};
    let incompleteCount = 0;
    const recentlyModified: typeof syllabi = [];

    syllabi?.forEach((syll: any) => {
      // Stream count
      byStream[syll.stream] = (byStream[syll.stream] ?? 0) + 1;

      // Regulation count (track by regulation_id)
      byRegulation[syll.regulation_id] = (byRegulation[syll.regulation_id] ?? 0) + 1;

      // Version distribution
      versionCounts[syll.version_number] = (versionCounts[syll.version_number] ?? 0) + 1;

      // Incomplete check: missing objectives, CLOs, content, or mappings
      if (
        !syll.course_objectives?.objectives?.length ||
        !syll.course_learning_outcomes?.clos?.length ||
        !syll.course_content?.units?.length ||
        !syll.po_mappings?.mappings?.length
      ) {
        incompleteCount++;
      }

      // Track recently modified
      recentlyModified.push(syll);
    });

    // Sort recently modified and take top 10
    const recentlyModifiedList = recentlyModified
      .sort((a: any, b: any) =>
        new Date(b.last_modified_at).getTime() -
        new Date(a.last_modified_at).getTime()
      )
      .slice(0, 10)
      .map((s: any) => ({
        id: s.id,
        courseCode: s.course_code,
        courseName: s.course_name,
        stream: s.stream,
        lastModified: s.last_modified_at,
      }));

    // Calculate average revisions per course
    const uniqueCourses = new Set(
      syllabi?.map((s: any) => s.course_code) ?? []
    ).size;
    const totalVersions = syllabi?.reduce(
      (sum: number, s: any) => sum + s.version_number,
      0
    ) ?? 0;
    const averageRevisionsPerCourse = uniqueCourses > 0
      ? (totalVersions / uniqueCourses)
      : 0;

    // Build revision distribution
    const revisionDistribution = Object.entries(versionCounts)
      .map(([version, count]) => ({
        version: parseInt(version),
        count,
      }))
      .sort((a, b) => a.version - b.version);

    return NextResponse.json({
      totalSyllabi,
      byStream,
      byRegulation,
      averageRevisionsPerCourse: Math.round(averageRevisionsPerCourse * 100) / 100,
      incompleteCount,
      recentlyModified: recentlyModifiedList,
      revisionDistribution,
    });
  } catch (error) {
    console.error('Metrics fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
