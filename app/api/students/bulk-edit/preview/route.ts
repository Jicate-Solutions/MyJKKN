import { NextRequest, NextResponse } from 'next/server';
import { StudentService } from '@/lib/services/student/student-service';
import { BulkEditStudentDto } from '@/types/student';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop();

    let updates: BulkEditStudentDto[] = [];

    // Parse CSV file
    if (fileExtension === 'csv') {
      const text = await file.text();
      updates = await new Promise((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data.map((row: any) => ({
              id: row['Student ID *'] || row['Student ID'],
              first_name: row['First Name'],
              last_name: row['Last Name'],
              date_of_birth: row['Date of Birth'],
              gender: row['Gender'],
              student_mobile: row['Student Mobile'],
              student_email: row['Student Email'],
              roll_number: row['Roll Number'],
              college_email: row['College Email'],
              academic_year_id: row['Academic Year ID'],
              semester_id: row['Semester ID'],
              section_id: row['Section ID'],
              status: row['Status'],
              student_photo_url: row['Photo URL'],
              father_name: row['Father Name'],
              father_occupation: row['Father Occupation'],
              father_mobile: row['Father Mobile'],
              mother_name: row['Mother Name'],
              mother_occupation: row['Mother Occupation'],
              mother_mobile: row['Mother Mobile'],
              religion: row['Religion'],
              community: row['Community'],
              caste: row['Caste'],
              annual_income: row['Annual Income'],
              aadhar_number: row['Aadhar Number'],
              last_school: row['Last School'],
              board_of_study: row['Board of Study'],
              engineering_cutoff_marks: row['Engineering Cutoff'],
              medical_cutoff_marks: row['Medical Cutoff'],
              neet_roll_number: row['NEET Roll Number'],
              neet_score: row['NEET Score'],
              counseling_applied: row['Counseling Applied'] === 'Yes',
              counseling_number: row['Counseling Number'],
              first_graduate: row['First Graduate'] === 'Yes',
              quota: row['Quota'],
              category: row['Category'],
              permanent_address_street: row['Address Street'],
              permanent_address_taluk: row['Address Taluk'],
              permanent_address_district: row['Address District'],
              permanent_address_pin_code: row['Address PIN Code'],
              permanent_address_state: row['Address State'],
              accommodation_type: row['Accommodation Type'],
              hostel_type: row['Hostel Type'],
              food_type: row['Food Type'],
              bus_required: row['Bus Required'] === 'Yes',
              bus_route: row['Bus Route'],
              bus_pickup_location: row['Bus Pickup Location'],
              reference_type: row['Reference Type'],
              reference_name: row['Reference Name'],
              reference_contact: row['Reference Contact']
            }));
            resolve(data);
          },
          error: (error: Error) => reject(error)
        });
      });
    }
    // Parse Excel file
    else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      updates = jsonData.map((row) => ({
        id: row['Student ID *'] || row['Student ID'],
        first_name: row['First Name'],
        last_name: row['Last Name'],
        date_of_birth: row['Date of Birth'],
        gender: row['Gender'],
        student_mobile: row['Student Mobile'],
        student_email: row['Student Email'],
        roll_number: row['Roll Number'],
        college_email: row['College Email'],
        academic_year_id: row['Academic Year ID'],
        semester_id: row['Semester ID'],
        section_id: row['Section ID'],
        status: row['Status'],
        student_photo_url: row['Photo URL'],
        father_name: row['Father Name'],
        father_occupation: row['Father Occupation'],
        father_mobile: row['Father Mobile'],
        mother_name: row['Mother Name'],
        mother_occupation: row['Mother Occupation'],
        mother_mobile: row['Mother Mobile'],
        religion: row['Religion'],
        community: row['Community'],
        caste: row['Caste'],
        annual_income: row['Annual Income'],
        aadhar_number: row['Aadhar Number'],
        last_school: row['Last School'],
        board_of_study: row['Board of Study'],
        engineering_cutoff_marks: row['Engineering Cutoff'],
        medical_cutoff_marks: row['Medical Cutoff'],
        neet_roll_number: row['NEET Roll Number'],
        neet_score: row['NEET Score'],
        counseling_applied: row['Counseling Applied'] === 'Yes',
        counseling_number: row['Counseling Number'],
        first_graduate: row['First Graduate'] === 'Yes',
        quota: row['Quota'],
        category: row['Category'],
        permanent_address_street: row['Address Street'],
        permanent_address_taluk: row['Address Taluk'],
        permanent_address_district: row['Address District'],
        permanent_address_pin_code: row['Address PIN Code'],
        permanent_address_state: row['Address State'],
        accommodation_type: row['Accommodation Type'],
        hostel_type: row['Hostel Type'],
        food_type: row['Food Type'],
        bus_required: row['Bus Required'] === 'Yes',
        bus_route: row['Bus Route'],
        bus_pickup_location: row['Bus Pickup Location'],
        reference_type: row['Reference Type'],
        reference_name: row['Reference Name'],
        reference_contact: row['Reference Contact']
      }));
    } else {
      return NextResponse.json(
        { message: 'Unsupported file format. Please upload CSV or Excel file.' },
        { status: 400 }
      );
    }

    // Filter out rows without Student ID
    updates = updates.filter((u) => u.id);

    if (updates.length === 0) {
      return NextResponse.json(
        { message: 'No valid student records found in file' },
        { status: 400 }
      );
    }

    // Remove undefined/empty fields from each update
    updates = updates.map((update) => {
      const cleanUpdate: any = { id: update.id };
      Object.keys(update).forEach((key) => {
        const value = (update as any)[key];
        if (value !== undefined && value !== null && value !== '') {
          cleanUpdate[key] = value;
        }
      });
      return cleanUpdate;
    });

    // Generate preview
    const preview = await StudentService.generateBulkEditPreview(updates, supabase);

    return NextResponse.json(preview);
  } catch (error) {
    console.error('Error generating bulk edit preview:', error);
    return NextResponse.json(
      {
        message: 'Failed to generate preview',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
