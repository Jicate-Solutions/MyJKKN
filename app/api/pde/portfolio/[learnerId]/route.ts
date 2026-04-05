export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// PUBLIC endpoint — no auth required (like certificate verification)
// Returns full portfolio data for a learner

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ learnerId: string }> }
): Promise<NextResponse> {
  const { learnerId } = await params;

  if (!learnerId) {
    return NextResponse.json(
      { error: 'Learner ID is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();

    // 1. Learner profile (name, institution, programme)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, institution_id, department_id')
      .eq('id', learnerId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Learner not found' },
        { status: 404 }
      );
    }

    // Fetch institution name
    let institutionName = '';
    let programmeName = '';
    if (profile.institution_id) {
      const { data: inst } = await supabase
        .from('institutions')
        .select('name')
        .eq('id', profile.institution_id)
        .single();
      institutionName = inst?.name || '';
    }
    if (profile.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', profile.department_id)
        .single();
      programmeName = dept?.name || '';
    }

    // 2. Quest completions
    const { data: questEnrollments } = await supabase
      .from('pde_quest_enrollments')
      .select('*, quest:pde_quests(id, title, problem_statement, deliverable_description, difficulty, quest_type)')
      .eq('learner_id', learnerId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    // Get best submission scores for completed quests
    const questCompletions = [];
    for (const enrollment of (questEnrollments || [])) {
      const { data: bestSubmission } = await supabase
        .from('pde_quest_submissions')
        .select('final_score, title')
        .eq('quest_id', enrollment.quest_id)
        .eq('learner_id', learnerId)
        .eq('passed', true)
        .order('final_score', { ascending: false })
        .limit(1)
        .maybeSingle();

      questCompletions.push({
        quest_id: enrollment.quest_id,
        title: enrollment.quest?.title || '',
        problem_statement: enrollment.quest?.problem_statement || '',
        deliverable_description: enrollment.quest?.deliverable_description || '',
        difficulty: enrollment.quest?.difficulty || null,
        quest_type: enrollment.quest?.quest_type || null,
        completed_at: enrollment.completed_at,
        score: bestSubmission?.final_score || null,
      });
    }

    // 3. Demonstrated capabilities
    const { data: learnerCapabilities } = await supabase
      .from('pde_learner_capabilities')
      .select('*, capability:pde_capabilities(id, name, slug, description, category, level)')
      .eq('learner_id', learnerId)
      .in('status', ['demonstrated', 'mastered'])
      .order('demonstrated_at', { ascending: false });

    // 4. Certificates
    const { data: certificates } = await supabase
      .from('pde_certificates')
      .select('id, certificate_number, certificate_type, issued_at, final_score, completion_hours, finks_profile, verification_url, course_id')
      .eq('learner_id', learnerId)
      .order('issued_at', { ascending: false });

    // Enrich certificates with course names
    const enrichedCerts = [];
    for (const cert of (certificates || [])) {
      let courseName = '';
      if (cert.course_id) {
        const { data: course } = await supabase
          .from('vac_courses')
          .select('title')
          .eq('id', cert.course_id)
          .single();
        courseName = course?.title || '';
      }
      enrichedCerts.push({
        ...cert,
        course_name: courseName,
        verification_url: cert.verification_url || `/verify/${cert.certificate_number}`,
      });
    }

    // 5. Agency Index (latest per course, plus overall)
    const { data: agencyRecords } = await supabase
      .from('pde_agency_index')
      .select('*')
      .eq('learner_id', learnerId)
      .order('assessment_date', { ascending: false });

    // Calculate aggregate agency
    const agencyData = agencyRecords || [];
    let agencyIndex = null;
    if (agencyData.length > 0) {
      // Get the latest entry per course, then average
      const latestByCourse = new Map<string, typeof agencyData[0]>();
      for (const a of agencyData) {
        if (!latestByCourse.has(a.course_id)) {
          latestByCourse.set(a.course_id, a);
        }
      }
      const latestEntries = Array.from(latestByCourse.values());
      const avgOverall = latestEntries.reduce((s, a) => s + (a.overall || 0), 0) / latestEntries.length;

      // Determine level
      let level: string = 'dependent';
      if (avgOverall >= 80) level = 'principal';
      else if (avgOverall >= 60) level = 'self_directed';
      else if (avgOverall >= 40) level = 'independent';
      else if (avgOverall >= 20) level = 'directed';

      agencyIndex = {
        overall: Math.round(avgOverall),
        level,
        dimensions: {
          initiative: Math.round(latestEntries.reduce((s, a) => s + (a.initiative || 0), 0) / latestEntries.length),
          self_direction: Math.round(latestEntries.reduce((s, a) => s + (a.self_direction || 0), 0) / latestEntries.length),
          tool_mastery: Math.round(latestEntries.reduce((s, a) => s + (a.tool_mastery || 0), 0) / latestEntries.length),
          critical_evaluation: Math.round(latestEntries.reduce((s, a) => s + (a.critical_evaluation || 0), 0) / latestEntries.length),
          ethical_judgment: Math.round(latestEntries.reduce((s, a) => s + (a.ethical_judgment || 0), 0) / latestEntries.length),
        },
        assessments_count: latestEntries.length,
      };
    }

    // 6. Reputation + badges
    const { data: reputation } = await supabase
      .from('pde_reputation')
      .select('*')
      .eq('learner_id', learnerId)
      .single();

    const { data: learnerBadges } = await supabase
      .from('pde_learner_badges')
      .select('*, badge:pde_badges(id, name, slug, description, icon_url, category)')
      .eq('learner_id', learnerId)
      .order('earned_at', { ascending: false });

    // 7. Fink's aggregate profile (from certificates or submissions)
    let finksProfile = null;
    const certsWithFinks = (certificates || []).filter(c => c.finks_profile);
    if (certsWithFinks.length > 0) {
      const dimensions = [
        'foundational_knowledge', 'application', 'integration',
        'human_dimension', 'caring', 'learning_how_to_learn',
      ];
      const aggregated: Record<string, number> = {};
      for (const dim of dimensions) {
        const values = certsWithFinks
          .map(c => (c.finks_profile as Record<string, number>)?.[dim])
          .filter((v): v is number => v != null);
        aggregated[dim] = values.length > 0
          ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
          : 0;
      }
      finksProfile = aggregated;
    }

    return NextResponse.json({
      success: true,
      data: {
        profile: {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          institution: institutionName,
          programme: programmeName,
        },
        reputation: reputation ? {
          total_points: reputation.total_points || 0,
          level: reputation.level || 'apprentice',
          quests_completed: reputation.quests_completed || 0,
          capabilities_demonstrated: reputation.capabilities_demonstrated || 0,
          peer_reviews_given: reputation.peer_reviews_given || 0,
          current_streak: reputation.current_streak || 0,
        } : null,
        badges: (learnerBadges || []).map(lb => ({
          id: lb.badge?.id,
          name: lb.badge?.name,
          description: lb.badge?.description,
          icon_url: lb.badge?.icon_url,
          category: lb.badge?.category,
          earned_at: lb.earned_at,
        })),
        quest_completions: questCompletions,
        capabilities: (learnerCapabilities || []).map(lc => ({
          id: lc.capability?.id,
          name: lc.capability?.name,
          slug: lc.capability?.slug,
          description: lc.capability?.description,
          category: lc.capability?.category,
          level: lc.capability?.level,
          status: lc.status,
          demonstrated_at: lc.demonstrated_at,
          score: lc.demonstration_score,
        })),
        certificates: enrichedCerts,
        agency_index: agencyIndex,
        finks_profile: finksProfile,
      },
    });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio data' },
      { status: 500 }
    );
  }
}
