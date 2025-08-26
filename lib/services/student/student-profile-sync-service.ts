import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export interface EmailReassignmentResult {
  success: boolean;
  message: string;
  details?: {
    studentUpdated?: boolean;
    profileUpdated?: boolean;
    oldProfileDeleted?: boolean;
  };
}

export class StudentProfileSyncService {
  private static supabase = createClientSupabaseClient();

  /**
   * Reassigns an email from one student to another, handling all profile synchronization
   */
  static async reassignStudentEmail(
    studentId: string,
    newEmail: string,
    options?: {
      forceReassign?: boolean; // Force reassignment even if email is in use
      deleteOldProfile?: boolean; // Delete the old profile if it exists
    }
  ): Promise<EmailReassignmentResult> {
    try {
      // 1. Get current student data
      const { data: student, error: studentError } = await this.supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

      if (studentError || !student) {
        return {
          success: false,
          message: 'Student not found'
        };
      }

      const oldEmail = student.college_email;

      // 2. Check if new email is already in use by another student
      const { data: existingStudent } = await this.supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('college_email', newEmail)
        .neq('id', studentId)
        .maybeSingle();

      if (existingStudent && !options?.forceReassign) {
        return {
          success: false,
          message: `Email ${newEmail} is already assigned to ${existingStudent.first_name} ${existingStudent.last_name}`
        };
      }

      // 3. Check profile situation
      const { data: newEmailProfile } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('email', newEmail)
        .maybeSingle();

      const { data: oldEmailProfile } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('email', oldEmail)
        .maybeSingle();

      // 4. Update the student record
      const { error: updateError } = await this.supabase
        .from('students')
        .update({
          college_email: newEmail,
          updated_at: new Date().toISOString()
        })
        .eq('id', studentId);

      if (updateError) {
        return {
          success: false,
          message: `Failed to update student email: ${updateError.message}`
        };
      }

      const details: EmailReassignmentResult['details'] = {
        studentUpdated: true
      };

      // 5. Handle profile synchronization
      if (newEmailProfile && newEmailProfile.role === 'student') {
        // Update existing profile with student's institution
        const { error: profileUpdateError } = await this.supabase
          .from('profiles')
          .update({
            institution_id: student.institution_id,
            full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', newEmailProfile.id);

        if (!profileUpdateError) {
          details.profileUpdated = true;
        }
      } else if (oldEmailProfile && !newEmailProfile) {
        // Move old profile to new email
        const { error: profileMoveError } = await this.supabase
          .from('profiles')
          .update({
            email: newEmail,
            updated_at: new Date().toISOString()
          })
          .eq('id', oldEmailProfile.id);

        if (!profileMoveError) {
          details.profileUpdated = true;
        }
      }

      // 6. Handle old profile deletion if requested
      if (options?.deleteOldProfile && oldEmailProfile && oldEmail !== newEmail) {
        const { error: deleteError } = await this.supabase
          .from('profiles')
          .delete()
          .eq('id', oldEmailProfile.id);

        if (!deleteError) {
          details.oldProfileDeleted = true;
        }
      }

      return {
        success: true,
        message: `Successfully reassigned email from ${oldEmail} to ${newEmail}`,
        details
      };
    } catch (error) {
      console.error('Error in reassignStudentEmail:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
    }
  }

  /**
   * Syncs all student-profile mismatches in the database
   */
  static async syncAllStudentProfiles(): Promise<{
    success: boolean;
    synced: number;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];
      let syncedCount = 0;

      // Get all students with profiles
      const { data: students, error: fetchError } = await this.supabase
        .from('students')
        .select('id, college_email, first_name, last_name, institution_id')
        .not('college_email', 'is', null);

      if (fetchError) {
        throw fetchError;
      }

      for (const student of students || []) {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('email', student.college_email)
          .maybeSingle();

        if (profile) {
          // Check if profile needs updating
          const needsUpdate = 
            profile.institution_id !== student.institution_id ||
            profile.full_name !== `${student.first_name} ${student.last_name || ''}`.trim();

          if (needsUpdate) {
            const { error: updateError } = await this.supabase
              .from('profiles')
              .update({
                institution_id: student.institution_id,
                full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
                updated_at: new Date().toISOString()
              })
              .eq('email', student.college_email);

            if (updateError) {
              errors.push(`Failed to sync ${student.college_email}: ${updateError.message}`);
            } else {
              syncedCount++;
            }
          }
        }
      }

      return {
        success: errors.length === 0,
        synced: syncedCount,
        errors
      };
    } catch (error) {
      console.error('Error in syncAllStudentProfiles:', error);
      return {
        success: false,
        synced: 0,
        errors: [error instanceof Error ? error.message : 'An unexpected error occurred']
      };
    }
  }

  /**
   * Checks for and reports email conflicts in the system
   */
  static async checkEmailConflicts(): Promise<{
    conflicts: Array<{
      email: string;
      studentId?: string;
      profileId?: string;
      issue: string;
    }>;
  }> {
    const conflicts: Array<{
      email: string;
      studentId?: string;
      profileId?: string;
      issue: string;
    }> = [];

    try {
      // Check for students without matching profiles
      const { data: studentsWithoutProfiles } = await this.supabase
        .from('students')
        .select('id, college_email, first_name, last_name')
        .not('college_email', 'is', null);

      for (const student of studentsWithoutProfiles || []) {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('id')
          .eq('email', student.college_email)
          .maybeSingle();

        if (!profile) {
          conflicts.push({
            email: student.college_email,
            studentId: student.id,
            issue: `Student ${student.first_name} ${student.last_name} has no profile`
          });
        }
      }

      // Check for profiles with role='student' but no student record
      const { data: profiles } = await this.supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'student');

      for (const profile of profiles || []) {
        const { data: student } = await this.supabase
          .from('students')
          .select('id')
          .eq('college_email', profile.email)
          .maybeSingle();

        if (!student) {
          conflicts.push({
            email: profile.email,
            profileId: profile.id,
            issue: `Profile ${profile.full_name} has no student record`
          });
        }
      }

      return { conflicts };
    } catch (error) {
      console.error('Error checking email conflicts:', error);
      return { conflicts };
    }
  }
}