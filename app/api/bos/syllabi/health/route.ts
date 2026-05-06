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

    // Fetch all latest syllabi for institution
    const { data: syllabi, error: syllError } = await supabase
      .from('bos_course_syllabi')
      .select(`
        id,
        course_code,
        is_latest,
        is_archived,
        course_objectives,
        course_learning_outcomes,
        course_content,
        po_mappings,
        textbooks,
        web_resources,
        pedagogy
      `)
      .eq('institutions_id', institutionsId)
      .eq('is_latest', true)
      .eq('is_archived', false);

    if (syllError) throw syllError;

    const missingObjectives: string[] = [];
    const missingLearningOutcomes: string[] = [];
    const missingContent: string[] = [];
    const missingMappings: string[] = [];

    syllabi?.forEach((syll: any) => {
      if (!syll.course_objectives?.objectives?.length) {
        missingObjectives.push(syll.course_code);
      }

      if (!syll.course_learning_outcomes?.clos?.length) {
        missingLearningOutcomes.push(syll.course_code);
      }

      if (!syll.course_content?.units?.length) {
        missingContent.push(syll.course_code);
      }

      if (!syll.po_mappings?.mappings?.length) {
        missingMappings.push(syll.course_code);
      }
    });

    const totalIssues =
      missingObjectives.length +
      missingLearningOutcomes.length +
      missingContent.length +
      missingMappings.length;

    return NextResponse.json({
      totalIssues,
      missingObjectives,
      missingLearningOutcomes,
      missingContent,
      missingMappings,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { error: 'Failed to check health' },
      { status: 500 }
    );
  }
}
