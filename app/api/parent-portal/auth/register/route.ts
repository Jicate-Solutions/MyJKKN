// app/api/parent-portal/auth/register/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parentRegistrationSchema } from '@/lib/validations/parent-portal';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const validated = parentRegistrationSchema.parse(body);

    // Find the learner by enrollment number
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('id, name, institution_id')
      .eq('enrollment_number', validated.learner_enrollment_number)
      .eq('institution_id', validated.institution_id)
      .single();

    if (learnerError || !learner) {
      return NextResponse.json(
        {
          success: false,
          message: 'Learner not found with the provided enrollment number',
        },
        { status: 404 }
      );
    }

    // Check if parent already exists with this phone
    const { data: existingParent } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('phone', validated.phone)
      .eq('institution_id', validated.institution_id)
      .single();

    if (existingParent) {
      // Check if already linked to this learner
      const { data: existingLink } = await supabase
        .from('parent_learner_links')
        .select('id')
        .eq('parent_id', existingParent.id)
        .eq('learner_id', learner.id)
        .single();

      if (existingLink) {
        return NextResponse.json(
          {
            success: false,
            message: 'You are already linked to this learner. Please login.',
          },
          { status: 409 }
        );
      }

      // Link existing parent to new learner
      const { error: linkError } = await supabase
        .from('parent_learner_links')
        .insert({
          parent_id: existingParent.id,
          learner_id: learner.id,
          relationship: validated.relationship,
        });

      if (linkError) throw linkError;

      return NextResponse.json({
        success: true,
        message: 'Learner added to your account. Please verify your phone.',
        parent_id: existingParent.id,
        requires_verification: true,
      });
    }

    // New parent - return that registration needs OTP verification first
    return NextResponse.json({
      success: true,
      message: 'Please verify your phone number to complete registration',
      requires_verification: true,
      learner_id: learner.id,
      learner_name: learner.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/auth/register] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to register' },
      { status: 500 }
    );
  }
}
