import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Database } from '@/types/supabase'; // Ensure Database type is correctly defined
import type { CreateStudentDto } from '@/types/student'; // Ensure CreateStudentDto is correctly defined
import type { CreateUserRequest } from '@/types/users'; // For potential user creation

// Zod schema for validating the incoming array - reuse parts if possible, define explicitly here
// Ensure this matches the expected structure after frontend parsing (e.g., JSON fields as objects)
const bulkCreateStudentSchema = z.array(
  z
    .object({
      // Personal Info
      student_name: z.string().min(1),
      father_name: z.string().min(1),
      father_occupation: z.string().optional().nullable(),
      father_mobile: z.string().optional().nullable(),
      mother_name: z.string().min(1),
      mother_occupation: z.string().optional().nullable(),
      mother_mobile: z.string().min(1),
      date_of_birth: z.string(), // Assume YYYY-MM-DD string
      gender: z.string().min(1),
      religion: z.string().min(1),
      community: z.string().min(1),
      caste: z.string().optional().nullable(),
      annual_income: z.string().optional().nullable(),

      // Academic Info
      last_school: z.string().min(1),
      board_of_study: z.string().min(1),
      tenth_marks_json: z.any(), // Expect pre-parsed JSON object from frontend
      twelfth_marks_json: z.any(), // Expect pre-parsed JSON object from frontend
      medical_cutoff_marks: z.string().optional().nullable(),
      engineering_cutoff_marks: z.string().optional().nullable(),
      neet_roll_number: z.string().optional().nullable(),
      counseling_applied: z.boolean().optional().nullable(),
      counseling_number: z.string().optional().nullable(),
      first_graduate: z.boolean().optional().nullable(),

      // Course Info
      quota: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
      institution_id: z.string().uuid(),
      degree_id: z.string().uuid(),
      department_id: z.string().uuid(),
      program_id: z.string().uuid(),
      entry_type: z.string().min(1),

      // Contact Info
      permanent_address_street: z.string().min(1),
      permanent_address_taluk: z.string().optional().nullable(),
      permanent_address_district: z.string().min(1),
      permanent_address_pin_code: z.string().length(6),
      permanent_address_state: z.string().min(1),
      student_mobile: z.string().min(1),
      student_email: z.string().email(),

      // Accommodation Info
      accommodation_type: z.string().min(1),
      hostel_type: z.string().optional().nullable(),
      bus_required: z.boolean().optional().nullable(),
      bus_route: z.string().optional().nullable(),
      bus_pickup_location: z.string().optional().nullable(),

      // Reference Info
      reference_type: z.string().optional().nullable(),
      reference_name: z.string().optional().nullable(),
      reference_contact: z.string().optional().nullable(),

      // Optional fields
      roll_number: z.string().optional().nullable(),
      college_email: z.string().email().optional().nullable()
    })
    .passthrough() // Allow other fields but don't validate them strictly here
);

// Helper function to generate a random password (reuse or define here)
function generateTemporaryPassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  let password = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  if (!/\d/.test(password)) password += Math.floor(Math.random() * 10);
  if (!/[A-Z]/.test(password))
    password += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return password.slice(0, length);
}

export async function POST(request: Request) {
  try {
    // Validate incoming data
    const studentsToCreate = await request.json();
    const validationResult =
      bulkCreateStudentSchema.safeParse(studentsToCreate);

    if (!validationResult.success) {
      console.error(
        'Bulk create validation error:',
        validationResult.error.flatten()
      );
      return NextResponse.json(
        {
          error: 'Invalid data format received.',
          details: validationResult.error.flatten()
        },
        { status: 400 }
      );
    }

    const validStudentData = validationResult.data;

    if (!validStudentData || validStudentData.length === 0) {
      return NextResponse.json(
        { error: 'No valid student data provided.' },
        { status: 400 }
      );
    }

    // Create Supabase Admin Client (use environment variables)
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let createdCount = 0;
    let failedCount = 0;
    const errors: { email?: string; student_name: string; error: string }[] =
      [];

    // --- Get Current User ID for created_by/updated_by (Requires server session handling) ---
    // This is complex in Route Handlers. For simplicity, we might omit it
    // or use a dedicated service account ID if applicable.
    // const { data: { session } } = await supabaseAdmin.auth.getSession(); // This doesn't work easily here
    // const creatorUserId = session?.user?.id; // Needs proper session retrieval
    // For now, let's omit created_by/updated_by or set to null
    const creatorUserId = null;
    // ---------------------------------------------------------------------------------------

    // Process each student record
    for (const student of validStudentData) {
      try {
        // Prepare data for insertion into the 'students' table
        const studentInsertData: Omit<
          CreateStudentDto,
          'tenth_marks' | 'twelfth_marks'
        > & { tenth_marks: any; twelfth_marks: any } = {
          ...student,
          tenth_marks: student.tenth_marks_json, // Assuming frontend parsed JSON
          twelfth_marks: student.twelfth_marks_json,
          // Explicitly set defaults or calculate fields
          status: 'active', // Default new students to active
          is_profile_complete: !!student.roll_number && !!student.college_email, // Auto-calculate based on optional fields
          created_by: creatorUserId,
          updated_by: creatorUserId
        };

        // Remove the _json suffixed fields before insertion if they exist
        delete (studentInsertData as any).tenth_marks_json;
        delete (studentInsertData as any).twelfth_marks_json;

        // 1. Insert into students table
        const { data: newStudent, error: studentInsertError } =
          await supabaseAdmin
            .from('students')
            .insert(studentInsertData)
            .select('id') // Select only id to confirm creation
            .single();

        if (studentInsertError) {
          throw new Error(
            `Student DB Insert Failed: ${studentInsertError.message} (Code: ${studentInsertError.code})`
          );
        }

        // 2. Conditionally Create Auth User and Profile
        if (student.college_email && student.roll_number && newStudent?.id) {
          const tempPassword = generateTemporaryPassword();
          try {
            // Check if user already exists (optional but good practice)
            const { data: existingUser } =
              await supabaseAdmin.auth.admin.listUsers({
                email: student.college_email
              });
            if (existingUser && existingUser.users.length > 0) {
              console.warn(
                `Auth user with email ${student.college_email} already exists. Skipping auth creation.`
              );
              // Link profile if needed, or handle as appropriate
            } else {
              // Create Auth user
              const { data: authData, error: authError } =
                await supabaseAdmin.auth.admin.createUser({
                  email: student.college_email,
                  password: tempPassword,
                  email_confirm: true, // Auto-confirm email
                  user_metadata: {
                    full_name: student.student_name,
                    role: 'student' // Default role
                  }
                });
              if (authError)
                throw new Error(`Auth Create Failed: ${authError.message}`);

              // Create Profile (Upsert is safer in case trigger exists/runs)
              const profileData = {
                id: authData.user.id, // Use the new auth user ID
                email: student.college_email,
                full_name: student.student_name,
                role: 'student',
                phone_number: student.student_mobile || null,
                profile_completed: 'true', // Mark as completed since required info exists
                is_active: true,
                updated_at: new Date().toISOString()
              };
              const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .upsert(profileData, { onConflict: 'id' }); // Upsert on ID

              if (profileError) {
                // Attempt to clean up the auth user if profile creation fails
                await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
                throw new Error(
                  `Profile Create/Upsert Failed: ${profileError.message}`
                );
              }
              console.log(
                `Auth user and profile created for ${student.college_email}`
              );
              // Log password securely or handle delivery
              console.warn(
                `Temp pwd for ${student.college_email}: ${tempPassword}`
              );
            }
          } catch (userCreateError: any) {
            // Log the error but potentially count the student record as created
            // Or decide if the whole student creation should fail if auth fails.
            console.error(
              `Failed to create auth user/profile for ${
                student.student_email || student.student_name
              }: ${userCreateError.message}`
            );
            // Add to errors list, but don't increment failedCount for the *student* insert itself
            errors.push({
              student_name: student.student_name,
              email: student.college_email,
              error: `Auth/Profile creation failed: ${userCreateError.message}`
            });
          }
        }

        createdCount++;
      } catch (error: any) {
        console.error(
          `Failed to process student: ${student.student_name} (${student.student_email})`,
          error.message
        );
        failedCount++;
        errors.push({
          student_name: student.student_name,
          email: student.student_email,
          error: error.message
        });
      }
    }

    // Prepare response
    const message = `Bulk create finished. Created: ${createdCount}, Failed: ${failedCount}.`;
    if (failedCount > 0) {
      console.error('Bulk create errors:', errors);
      // Return 207 Multi-Status if some failed, or 500 if all failed?
      // Let's return 200 but include error details
      return NextResponse.json(
        {
          success: createdCount > 0,
          message,
          created: createdCount,
          failed: failedCount,
          errors
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { success: true, message, created: createdCount, failed: failedCount },
        { status: 201 }
      ); // 201 Created for full success
    }
  } catch (error: any) {
    console.error('Error in POST /api/students/bulk-create:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
