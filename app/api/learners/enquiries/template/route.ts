// app/api/learners/enquiries/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  EXCEL_GENDER,
  EXCEL_RELIGION,
  EXCEL_COMMUNITY,
  EXCEL_BLOOD_GROUP,
  EXCEL_ENTRY_TYPE,
  EXCEL_ACCOMMODATION,
  EXCEL_HOSTEL_TYPE,
  EXCEL_FOOD_TYPE,
  EXCEL_QUOTA,
  EXCEL_SCHOLARSHIP_TYPE,
  EXCEL_BOARD_OF_STUDY,
  EXCEL_TWELFTH_GROUP,
  EXCEL_REFERENCE_TYPE,
  EXCEL_BOOLEAN
} from '@/lib/utils/mappings/enquiry-excel-mappings';
import {

  indianStates,
  getDistrictsByState,
  getTaluksByDistrict,
  type State,
  type District,
  type Taluk
} from '@/lib/data/locations';

/**
 * GET /api/learners/enquiries/template
 *
 * Generates an Excel template for bulk enquiry import with:
 * - 5-level cascading dropdowns (Institution → Department → Program → Semester → Section)
 * - 12+ enum field dropdowns
 * - Sample data row
 * - Hidden Lists sheet with reference data
 * - Instructions sheet
 */
export async function GET(request: NextRequest) {
  try {
    // ============================================================
    // 1. AUTHENTICATION
    // ============================================================
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ============================================================
    // 2. FETCH REFERENCE DATA FOR HIERARCHICAL DROPDOWNS
    // ============================================================

    // Level 1: Institutions
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, name, institution_type')
      .eq('is_active', true)
      .order('name');

    if (instError) {
      console.error('[template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionNames = institutions?.map(i => i.name) || [];

    // Level 2: Degrees (with institution context)
    const { data: degrees, error: degError } = await supabase
      .from('degrees')
      .select(`
        id,
        degree_name,
        institution_id,
        institutions!inner(name)
      `)
      .eq('is_active', true)
      .order('degree_name');

    if (degError) {
      console.error('[template] Error fetching degrees:', degError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degError.message },
        { status: 500 }
      );
    }

    // Level 3: Departments (with degree AND institution context)
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select(`
        id,
        department_name,
        degree_id,
        degrees!inner(degree_name, institution_id, institutions!inner(name))
      `)
      .eq('is_active', true)
      .order('department_name');

    if (deptError) {
      console.error('[template] Error fetching departments:', deptError);
      return NextResponse.json(
        { error: 'Failed to fetch departments', message: deptError.message },
        { status: 500 }
      );
    }

    // Level 4: Programs (with full hierarchy: department → degree → institution)
    const { data: programs, error: progError } = await supabase
      .from('programs')
      .select(`
        id,
        program_name,
        department_id,
        departments!inner(department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name)))
      `)
      .eq('is_active', true)
      .order('program_name');

    if (progError) {
      console.error('[template] Error fetching programs:', progError);
      return NextResponse.json(
        { error: 'Failed to fetch programs', message: progError.message },
        { status: 500 }
      );
    }

    // Level 5: Semesters (with full hierarchy: program → department → degree → institution)
    const { data: semesters, error: semError } = await supabase
      .from('semesters')
      .select(`
        id,
        semester_name,
        program_id,
        programs!inner(program_name, department_id, departments!inner(department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name))))
      `)
      .eq('is_active', true)
      .order('semester_name');

    if (semError) {
      console.error('[template] Error fetching semesters:', semError);
      return NextResponse.json(
        { error: 'Failed to fetch semesters', message: semError.message },
        { status: 500 }
      );
    }

    // Level 6: Sections (with full hierarchy: semester → program → department → degree → institution)
    const { data: sections, error: sectError } = await supabase
      .from('sections')
      .select(`
        id,
        section_name,
        semester_id,
        semesters!inner(semester_name, program_id, programs!inner(program_name, department_id, departments!inner(department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name)))))
      `)
      .eq('is_active', true)
      .order('section_name');

    if (sectError) {
      console.error('[template] Error fetching sections:', sectError);
      return NextResponse.json(
        { error: 'Failed to fetch sections', message: sectError.message },
        { status: 500 }
      );
    }

    // Academic Years (with institution context)
    const { data: academicYears, error: ayError } = await supabase
      .from('academic_years')
      .select(`
        academic_year_name,
        institution_id,
        institutions!inner(name)
      `)
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });

    if (ayError) {
      console.error('[template] Error fetching academic years:', ayError);
    }

    // ============================================================
    // 3. BUILD HIERARCHICAL GROUPINGS
    // ============================================================

    // Map: Institution name → Degree names
    const degsByInst = new Map<string, string[]>();
    degrees?.forEach((deg: any) => {
      const instName = deg.institutions?.name;
      if (instName) {
        if (!degsByInst.has(instName)) {
          degsByInst.set(instName, []);
        }
        degsByInst.get(instName)!.push(deg.degree_name);
      }
    });

    // Map: Institution name → Academic Year names
    const acadYearsByInst = new Map<string, string[]>();
    academicYears?.forEach((ay: any) => {
      const instName = ay.institutions?.name;
      const yearName = ay.academic_year_name;
      if (instName && yearName) {
        if (!acadYearsByInst.has(instName)) {
          acadYearsByInst.set(instName, []);
        }
        const existing = acadYearsByInst.get(instName)!;
        if (!existing.includes(yearName)) {
          existing.push(yearName);
        }
      }
    });

    // Map: Institution|Degree → Department names (composite key)
    const deptsByDeg = new Map<string, string[]>();
    departments?.forEach((d: any) => {
      const degName = d.degrees?.degree_name;
      const instName = d.degrees?.institutions?.name;
      const deptName = d.department_name;
      if (degName && instName && deptName) {
        const compositeKey = `${instName}|${degName}`;
        if (!deptsByDeg.has(compositeKey)) {
          deptsByDeg.set(compositeKey, []);
        }
        const existing = deptsByDeg.get(compositeKey)!;
        if (!existing.includes(deptName)) {
          existing.push(deptName);
        }
      }
    });

    // Map: Institution|Degree|Department → Program names (composite key)
    const progsByDept = new Map<string, string[]>();
    programs?.forEach((p: any) => {
      const deptName = p.departments?.department_name;
      const degName = p.departments?.degrees?.degree_name;
      const instName = p.departments?.degrees?.institutions?.name;
      const progName = p.program_name;
      if (deptName && degName && instName && progName) {
        const compositeKey = `${instName}|${degName}|${deptName}`;
        if (!progsByDept.has(compositeKey)) {
          progsByDept.set(compositeKey, []);
        }
        const existing = progsByDept.get(compositeKey)!;
        if (!existing.includes(progName)) {
          existing.push(progName);
        }
      }
    });

    // Map: Institution|Degree|Department|Program → Semester names (composite key)
    const semsByProg = new Map<string, string[]>();
    semesters?.forEach((s: any) => {
      const progName = s.programs?.program_name;
      const deptName = s.programs?.departments?.department_name;
      const degName = s.programs?.departments?.degrees?.degree_name;
      const instName = s.programs?.departments?.degrees?.institutions?.name;
      const semName = s.semester_name;
      if (progName && deptName && degName && instName && semName) {
        const compositeKey = `${instName}|${degName}|${deptName}|${progName}`;
        if (!semsByProg.has(compositeKey)) {
          semsByProg.set(compositeKey, []);
        }
        const existing = semsByProg.get(compositeKey)!;
        if (!existing.includes(semName)) {
          existing.push(semName);
        }
      }
    });

    // Map: Institution|Degree|Department|Program|Semester → Section names (composite key)
    const sectsBySem = new Map<string, string[]>();
    sections?.forEach((s: any) => {
      const semName = s.semesters?.semester_name;
      const progName = s.semesters?.programs?.program_name;
      const deptName = s.semesters?.programs?.departments?.department_name;
      const degName = s.semesters?.programs?.departments?.degrees?.degree_name;
      const instName = s.semesters?.programs?.departments?.degrees?.institutions?.name;
      const sectName = s.section_name;
      if (semName && progName && deptName && degName && instName && sectName) {
        const compositeKey = `${instName}|${degName}|${deptName}|${progName}|${semName}`;
        if (!sectsBySem.has(compositeKey)) {
          sectsBySem.set(compositeKey, []);
        }
        const existing = sectsBySem.get(compositeKey)!;
        if (!existing.includes(sectName)) {
          existing.push(sectName);
        }
      }
    });

    // ============================================================
    // 3. CREATE ADDRESS CASCADING MAPPINGS (State → District → Taluk)
    // ============================================================

    // All state names
    const stateNames = indianStates.map(s => s.name);

    // Map: State name → Districts
    const distsByState = new Map<string, string[]>();
    indianStates.forEach(state => {
      const districtNames = state.districts.map(d => d.name);
      distsByState.set(state.name, districtNames);
    });

    // Map: State|District → Taluks (composite key)
    const taluksByDist = new Map<string, string[]>();
    indianStates.forEach(state => {
      state.districts.forEach(district => {
        const compositeKey = `${state.name}|${district.name}`;
        const talukNames = district.taluks.map(t => t.name);
        taluksByDist.set(compositeKey, talukNames);
      });
    });

    // ============================================================
    // 4. CREATE EXCEL WORKBOOK
    // ============================================================
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Main Data Sheet (Enquiries)
    // ============================================================
    const worksheet = workbook.addWorksheet('Enquiries');

    // Define columns with proper headers
    worksheet.columns = [
      // SECTION 1: Basic Details
      { header: '* First Name', key: 'first_name', width: 15 },
      { header: '* Last Name', key: 'last_name', width: 15 },
      { header: '* Date of Birth', key: 'date_of_birth', width: 15 },
      { header: '* Gender', key: 'gender', width: 12 },
      { header: '* Religion', key: 'religion', width: 12 },
      { header: '* Community', key: 'community', width: 12 },
      { header: '* Caste', key: 'caste', width: 15 },
      { header: 'Aadhar Number', key: 'aadhar_number', width: 15 },
      { header: 'Blood Group', key: 'blood_group', width: 12 },

      // SECTION 2: Parent/Guardian Information
      { header: '* Father Name', key: 'father_name', width: 20 },
      { header: 'Father Occupation', key: 'father_occupation', width: 18 },
      { header: '* Father Mobile', key: 'father_mobile', width: 15 },
      { header: '* Mother Name', key: 'mother_name', width: 20 },
      { header: 'Mother Occupation', key: 'mother_occupation', width: 18 },
      { header: '* Mother Mobile', key: 'mother_mobile', width: 15 },
      { header: 'Annual Income', key: 'annual_income', width: 15 },

      // SECTION 3: Academic Assignment (CASCADING DROPDOWNS - 6 LEVELS)
      { header: '* Institution', key: 'institution', width: 35 },
      { header: '* Degree', key: 'degree', width: 30 },
      { header: '* Department', key: 'department', width: 30 },
      { header: '* Program', key: 'program', width: 25 },
      { header: '* Semester', key: 'semester', width: 15 },
      { header: '* Section', key: 'section', width: 10 },
      { header: '* Academic Year', key: 'academic_year', width: 15 },
      { header: 'Admission Year', key: 'admission_year', width: 15 },
      { header: 'Regulation', key: 'regulation', width: 15 },
      { header: 'Batch', key: 'batch', width: 15 },

      // SECTION 4: Contact Details
      { header: '* Student Mobile', key: 'student_mobile', width: 15 },
      { header: 'College Email', key: 'college_email', width: 30 },
      { header: '* Student Email', key: 'student_email', width: 30 },

      // SECTION 5: Address Information (CASCADING: State → District → Taluk)
      { header: '* Permanent Address Street', key: 'permanent_address_street', width: 30 },
      { header: '* Permanent Address State', key: 'permanent_address_state', width: 20 },
      { header: '* Permanent Address District', key: 'permanent_address_district', width: 20 },
      { header: '* Permanent Address Taluk', key: 'permanent_address_taluk', width: 20 },
      { header: '* Permanent Address Pin Code', key: 'permanent_address_pin_code', width: 15 },

      // SECTION 6: Entry & Scholarship
      { header: '* Entry Type', key: 'entry_type', width: 18 },
      { header: '* Scholarship Type', key: 'scholarship_type', width: 20 },

      // SECTION 7: Accommodation
      { header: '* Accommodation Type', key: 'accommodation_type', width: 18 },
      { header: 'Hostel Type', key: 'hostel_type', width: 15 },
      { header: 'Food Type', key: 'food_type', width: 12 },

      // SECTION 8: Previous Education
      { header: '* Last School', key: 'last_school', width: 30 },
      { header: '* Board of Study', key: 'board_of_study', width: 18 },
      { header: '* 10th Max Marks', key: 'tenth_max_marks', width: 15 },
      { header: '* 10th Obtained Marks', key: 'tenth_obtained_marks', width: 18 },
      { header: '* 10th Percentage', key: 'tenth_percentage', width: 15 },
      { header: '* 12th Group', key: 'twelfth_group', width: 15 },
      { header: '* 12th Max Marks', key: 'twelfth_max_marks', width: 15 },
      { header: '* 12th Obtained Marks', key: 'twelfth_obtained_marks', width: 18 },
      { header: '* 12th Percentage', key: 'twelfth_percentage', width: 15 },

      // SECTION 9: Entrance Exams (Optional)
      { header: 'Medical Cutoff Marks', key: 'medical_cutoff_marks', width: 18 },
      { header: 'Engineering Cutoff Marks', key: 'engineering_cutoff_marks', width: 20 },
      { header: 'NEET Roll Number', key: 'neet_roll_number', width: 18 },
      { header: 'NEET Score', key: 'neet_score', width: 12 },

      // SECTION 10: Counseling
      { header: 'Counseling Applied', key: 'counseling_applied', width: 18 },
      { header: 'Quota', key: 'quota', width: 18 },
      { header: 'Category', key: 'category', width: 15 },

      // SECTION 11: Transport
      { header: 'Bus Required', key: 'bus_required', width: 15 },
      { header: 'Bus Route', key: 'bus_route', width: 20 },
      { header: 'Bus Pickup Location', key: 'bus_pickup_location', width: 25 },

      // SECTION 12: Reference
      { header: 'Reference Type', key: 'reference_type', width: 15 },
      { header: 'Reference Name', key: 'reference_name', width: 20 },
      { header: 'Reference Contact', key: 'reference_contact', width: 15 }
    ];

    // Style header row
    worksheet.getRow(1).font = {
      bold: true,
      size: 11,
      name: 'Arial',
      color: { argb: 'FFFFFFFF' }
    };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }  // Blue background
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(1).height = 30;

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ============================================================
    // 5. ADD SAMPLE ROW (6-LEVEL CASCADE WITH COMPOSITE KEYS)
    // ============================================================
    const sampleInst = institutionNames[0] || 'JKKN College of Engineering and Technology';
    const sampleDegs = degsByInst.get(sampleInst) || [];
    const sampleDeg = sampleDegs[0] || 'Bachelor of Engineering';
    const sampleDepts = deptsByDeg.get(`${sampleInst}|${sampleDeg}`) || [];
    const sampleDept = sampleDepts[0] || 'Computer Science and Engineering';
    const sampleProgs = progsByDept.get(`${sampleInst}|${sampleDeg}|${sampleDept}`) || [];
    const sampleProg = sampleProgs[0] || '(BE) CSE';
    const sampleSems = semsByProg.get(`${sampleInst}|${sampleDeg}|${sampleDept}|${sampleProg}`) || [];
    const sampleSem = sampleSems[0] || 'Semester 1';
    const sampleSects = sectsBySem.get(`${sampleInst}|${sampleDeg}|${sampleDept}|${sampleProg}|${sampleSem}`) || [];
    const sampleSect = sampleSects[0] || 'A';
    const sampleAcadYears = acadYearsByInst.get(sampleInst) || [];
    const sampleAcadYear = sampleAcadYears[0] || '2024-2025';

    // Sample address data (Tamil Nadu → Namakkal → Namakkal)
    const sampleState = stateNames[0] || 'Tamil Nadu';
    const sampleDists = distsByState.get(sampleState) || [];
    const sampleDistrict = sampleDists.find(d => d === 'Namakkal') || sampleDists[0] || 'Namakkal';
    const sampleTaluks = taluksByDist.get(`${sampleState}|${sampleDistrict}`) || [];
    const sampleTaluk = sampleTaluks.find(t => t === 'Namakkal') || sampleTaluks[0] || 'Namakkal';

    worksheet.addRow({
      first_name: 'JOHN',
      last_name: 'DOE',
      date_of_birth: '2005-01-15',
      gender: EXCEL_GENDER[0],
      religion: EXCEL_RELIGION[0],
      community: EXCEL_COMMUNITY[0],
      caste: 'OBC',
      aadhar_number: '999999999999',
      blood_group: EXCEL_BLOOD_GROUP[0],
      father_name: 'ROBERT DOE',
      father_occupation: 'Business',
      father_mobile: '9999999991',
      mother_name: 'MARY DOE',
      mother_occupation: 'Teacher',
      mother_mobile: '9999999992',
      annual_income: '500000',
      institution: sampleInst,
      degree: sampleDeg,
      department: sampleDept,
      program: sampleProg,
      semester: sampleSem,
      section: sampleSect,
      academic_year: sampleAcadYear,
      admission_year: '2024',
      regulation: 'R2021',
      batch: '2024-2028',
      student_mobile: '9999999990',
      college_email: 'sample.template@jkkn.ac.in',
      student_email: 'sample.template@example.com',
      permanent_address_street: '123 Main Street, Sample Colony',
      permanent_address_state: sampleState,
      permanent_address_district: sampleDistrict,
      permanent_address_taluk: sampleTaluk,
      permanent_address_pin_code: '637001',
      entry_type: EXCEL_ENTRY_TYPE[0],
      scholarship_type: EXCEL_SCHOLARSHIP_TYPE[0],
      accommodation_type: EXCEL_ACCOMMODATION[0],
      hostel_type: EXCEL_HOSTEL_TYPE[0],
      food_type: EXCEL_FOOD_TYPE[0],
      last_school: 'St. Mary\'s High School',
      board_of_study: EXCEL_BOARD_OF_STUDY[0],
      tenth_max_marks: '500',
      tenth_obtained_marks: '450',
      tenth_percentage: '90',
      twelfth_group: EXCEL_TWELFTH_GROUP[0],
      twelfth_max_marks: '600',
      twelfth_obtained_marks: '540',
      twelfth_percentage: '90',
      medical_cutoff_marks: '',
      engineering_cutoff_marks: '',
      neet_roll_number: '',
      neet_score: '',
      counseling_applied: EXCEL_BOOLEAN[0],
      quota: EXCEL_QUOTA[0],
      category: 'General',
      bus_required: EXCEL_BOOLEAN[0],
      bus_route: 'Route 5',
      bus_pickup_location: 'Central Bus Stand',
      reference_type: EXCEL_REFERENCE_TYPE[0], // Use first reference type from list
      reference_name: 'Dr. Kumar',
      reference_contact: '9999999999'
    });

    // Style sample row (yellow background)
    worksheet.getRow(2).font = {
      name: 'Arial',
      size: 10,
      color: { argb: 'FF1F2937' }
    };
    worksheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' }  // Yellow background
    };
    worksheet.getRow(2).alignment = { vertical: 'middle' };

    // Add note to sample row
    const noteCell = worksheet.getCell('A2');
    noteCell.note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row (FAKE DATA)\n\n' },
        { font: { size: 9 }, text: 'This row contains fake mobile numbers (9999999990, etc.) to avoid conflicts with real data.\n\n' },
        { font: { bold: true, size: 9 }, text: 'DELETE THIS ROW before uploading!\n\n' },
        { font: { size: 9 }, text: 'Replace with your actual student data.' }
      ]
    };

    // Style future data rows
    for (let row = 3; row <= 100; row++) {
      worksheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' }
      };
    }

    // ============================================================
    // SHEET 2: Lists (Reference Data for Dropdowns)
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Get items that have children (6-level cascade) - using composite keys
    const instsWithDegs = Array.from(degsByInst.keys()).filter(
      inst => (degsByInst.get(inst)?.length || 0) > 0
    );
    // Section 2 headers: Institution|Degree composite keys
    const degsWithDepts = Array.from(deptsByDeg.keys()).filter(
      compositeKey => (deptsByDeg.get(compositeKey)?.length || 0) > 0
    );
    // Section 3 headers: Institution|Degree|Department composite keys
    const deptsWithProgs = Array.from(progsByDept.keys()).filter(
      compositeKey => (progsByDept.get(compositeKey)?.length || 0) > 0
    );
    // Section 4 headers: Institution|Degree|Department|Program composite keys
    const progsWithSems = Array.from(semsByProg.keys()).filter(
      compositeKey => (semsByProg.get(compositeKey)?.length || 0) > 0
    );
    // Section 5 headers: Institution|Degree|Department|Program|Semester composite keys
    const semsWithSects = Array.from(sectsBySem.keys()).filter(
      compositeKey => (sectsBySem.get(compositeKey)?.length || 0) > 0
    );
    // Section 6: Institution → Academic Years
    const instsWithAcadYears = Array.from(acadYearsByInst.keys()).filter(
      inst => (acadYearsByInst.get(inst)?.length || 0) > 0
    );

    // Section 7: State → Districts (for address cascading)
    const statesWithDists = Array.from(distsByState.keys()).filter(
      state => (distsByState.get(state)?.length || 0) > 0
    );
    // Section 8: State|District → Taluks (composite key for address cascading)
    const distsWithTaluks = Array.from(taluksByDist.keys()).filter(
      compositeKey => (taluksByDist.get(compositeKey)?.length || 0) > 0
    );

    // Calculate section boundaries (6 cascade sections + academic years + address cascading + reference columns)
    // Note: Each section is followed by a separator column
    const sec1End = instsWithDegs.length;
    const sec2Start = sec1End + 2;  // +1 for separator, +1 to start next section
    const sec2End = sec2Start + degsWithDepts.length - 1;
    const sec3Start = sec2End + 2;  // +1 for separator, +1 to start next section
    const sec3End = sec3Start + deptsWithProgs.length - 1;
    const sec4Start = sec3End + 2;  // +1 for separator, +1 to start next section
    const sec4End = sec4Start + progsWithSems.length - 1;
    const sec5Start = sec4End + 2;  // +1 for separator, +1 to start next section
    const sec5End = sec5Start + semsWithSects.length - 1;
    const sec6Start = sec5End + 2;  // +1 for separator, +1 to start next section
    const sec6End = sec6Start + instsWithAcadYears.length - 1;
    const sec7Start = sec6End + 2;  // +1 for separator, +1 to start next section (Address: State→District)
    const sec7End = sec7Start + statesWithDists.length - 1;
    const sec8Start = sec7End + 2;  // +1 for separator, +1 to start next section (Address: State|District→Taluk)
    const sec8End = sec8Start + distsWithTaluks.length - 1;
    const refStart = sec8End + 2;  // +1 for separator, +1 to start reference columns

    // Build header row (6-level cascade + academic years + address cascading structure)
    const headerRow: string[] = [
      ...instsWithDegs,   // Section 1: Institution headers
      '',                 // Separator
      ...degsWithDepts,   // Section 2: Degree headers (Institution|Degree composite keys)
      '',                 // Separator
      ...deptsWithProgs,  // Section 3: Department headers (Institution|Degree|Department composite keys)
      '',                 // Separator
      ...progsWithSems,   // Section 4: Program headers (Institution|Degree|Department|Program composite keys)
      '',                 // Separator
      ...semsWithSects,   // Section 5: Semester headers (Institution|Degree|Department|Program|Semester composite keys)
      '',                 // Separator
      ...instsWithAcadYears, // Section 6: Institution headers (for Academic Year cascading)
      '',                 // Separator
      ...statesWithDists, // Section 7: State headers (for Address State→District cascading)
      '',                 // Separator
      ...distsWithTaluks, // Section 8: State|District composite headers (for Address District→Taluk cascading)
      '',                 // Separator
      // Reference columns
      'AllInstitutions',
      'Gender',
      'Religion',
      'Community',
      'BloodGroup',
      'EntryType',
      'ScholarshipType',
      'AccommodationType',
      'HostelType',
      'FoodType',
      'Quota',
      'BoardOfStudy',
      'TwelfthGroup',
      'ReferenceType',
      'Boolean'
    ];

    listsSheet.addRow(headerRow);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Calculate max data rows needed (for 6-level cascade + academic years + address cascading)
    const maxDegPerInst = Math.max(...Array.from(degsByInst.values()).map(arr => arr.length), 1);
    const maxDeptPerDeg = Math.max(...Array.from(deptsByDeg.values()).map(arr => arr.length), 1);
    const maxProgPerDept = Math.max(...Array.from(progsByDept.values()).map(arr => arr.length), 1);
    const maxSemPerProg = Math.max(...Array.from(semsByProg.values()).map(arr => arr.length), 1);
    const maxSectPerSem = Math.max(...Array.from(sectsBySem.values()).map(arr => arr.length), 1);
    const maxAcadYearPerInst = Math.max(...Array.from(acadYearsByInst.values()).map(arr => arr.length), 1);
    const maxDistPerState = Math.max(...Array.from(distsByState.values()).map(arr => arr.length), 1);
    const maxTalukPerDist = Math.max(...Array.from(taluksByDist.values()).map(arr => arr.length), 1);
    const maxRefValues = Math.max(
      institutionNames.length,
      EXCEL_GENDER.length,
      EXCEL_RELIGION.length,
      EXCEL_COMMUNITY.length,
      EXCEL_BLOOD_GROUP.length,
      EXCEL_ENTRY_TYPE.length,
      EXCEL_SCHOLARSHIP_TYPE.length,
      EXCEL_ACCOMMODATION.length,
      EXCEL_HOSTEL_TYPE.length,
      EXCEL_FOOD_TYPE.length,
      EXCEL_QUOTA.length,
      EXCEL_BOARD_OF_STUDY.length,
      EXCEL_TWELFTH_GROUP.length,
      EXCEL_REFERENCE_TYPE.length,
      EXCEL_BOOLEAN.length
    );
    const maxDataRows = Math.max(
      maxDegPerInst,
      maxDeptPerDeg,
      maxProgPerDept,
      maxSemPerProg,
      maxSectPerSem,
      maxAcadYearPerInst,
      maxDistPerState,
      maxTalukPerDist,
      maxRefValues
    );

    // Add data rows - use null for empty cells (not empty string) so COUNTA works correctly
    for (let i = 0; i < maxDataRows; i++) {
      const rowData: (string | null)[] = [];

      // Section 1: Degrees for each Institution
      instsWithDegs.forEach(inst => {
        const children = degsByInst.get(inst) || [];
        rowData.push(children[i] || null);
      });

      // Debug first 3 rows of Section 1 data
      if (i < 3) {
      }

      // Separator
      rowData.push(null);

      // Section 2: Departments for each Institution|Degree (composite key)
      degsWithDepts.forEach(compositeKey => {
        const children = deptsByDeg.get(compositeKey) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 3: Programs for each Institution|Degree|Department (composite key)
      deptsWithProgs.forEach(compositeKey => {
        const children = progsByDept.get(compositeKey) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 4: Semesters for each Institution|Degree|Department|Program (composite key)
      progsWithSems.forEach(compositeKey => {
        const children = semsByProg.get(compositeKey) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 5: Sections for each Institution|Degree|Department|Program|Semester (composite key)
      semsWithSects.forEach(compositeKey => {
        const children = sectsBySem.get(compositeKey) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 6: Academic Years for each Institution
      instsWithAcadYears.forEach(inst => {
        const children = acadYearsByInst.get(inst) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 7: Districts for each State (for address cascading)
      statesWithDists.forEach(state => {
        const children = distsByState.get(state) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 8: Taluks for each State|District (composite key for address cascading)
      distsWithTaluks.forEach(compositeKey => {
        const children = taluksByDist.get(compositeKey) || [];
        rowData.push(children[i] || null);
      });

      // Separator
      rowData.push(null);

      // Reference columns
      rowData.push(institutionNames[i] || null);
      rowData.push(EXCEL_GENDER[i] || null);
      rowData.push(EXCEL_RELIGION[i] || null);
      rowData.push(EXCEL_COMMUNITY[i] || null);
      rowData.push(EXCEL_BLOOD_GROUP[i] || null);
      rowData.push(EXCEL_ENTRY_TYPE[i] || null);
      rowData.push(EXCEL_SCHOLARSHIP_TYPE[i] || null);
      rowData.push(EXCEL_ACCOMMODATION[i] || null);
      rowData.push(EXCEL_HOSTEL_TYPE[i] || null);
      rowData.push(EXCEL_FOOD_TYPE[i] || null);
      rowData.push(EXCEL_QUOTA[i] || null);
      rowData.push(EXCEL_BOARD_OF_STUDY[i] || null);
      rowData.push(EXCEL_TWELFTH_GROUP[i] || null);
      rowData.push(EXCEL_REFERENCE_TYPE[i] || null);
      rowData.push(EXCEL_BOOLEAN[i] || null);

      listsSheet.addRow(rowData);
    }

    // Set column widths
    for (let i = 1; i <= headerRow.length; i++) {
      listsSheet.getColumn(i).width = 15;
    }

    // ============================================================
    // 6. DATA VALIDATION (Dropdowns)
    // ============================================================

    const validationEndRow = 100;

    // Helper to get column letter
    const getColLetter = (colNum: number): string => {
      let letter = '';
      while (colNum > 0) {
        const rem = (colNum - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colNum = Math.floor((colNum - 1) / 26);
      }
      return letter;
    };

    // Calculate reference column letters
    const allInstCol = refStart;
    const genderCol = allInstCol + 1;
    const religionCol = genderCol + 1;
    const communityCol = religionCol + 1;
    const bloodGroupCol = communityCol + 1;
    const entryTypeCol = bloodGroupCol + 1;
    const scholarshipTypeCol = entryTypeCol + 1;
    const accommodationCol = scholarshipTypeCol + 1;
    const hostelTypeCol = accommodationCol + 1;
    const foodTypeCol = hostelTypeCol + 1;
    const quotaCol = foodTypeCol + 1;
    const boardOfStudyCol = quotaCol + 1;
    const twelfthGroupCol = boardOfStudyCol + 1;
    const referenceTypeCol = twelfthGroupCol + 1;
    const booleanCol = referenceTypeCol + 1;

    // Section boundary letters for cascading formulas (6-level cascade + academic years)
    const sec1EndLetter = getColLetter(sec1End);
    const sec2StartLetter = getColLetter(sec2Start);
    const sec2EndLetter = getColLetter(sec2End);
    const sec3StartLetter = getColLetter(sec3Start);
    const sec3EndLetter = getColLetter(sec3End);
    const sec4StartLetter = getColLetter(sec4Start);
    const sec4EndLetter = getColLetter(sec4End);
    const sec5StartLetter = getColLetter(sec5Start);
    const sec5EndLetter = getColLetter(sec5End);
    const sec6StartLetter = getColLetter(sec6Start);
    const sec6EndLetter = getColLetter(sec6End);
    const sec7StartLetter = getColLetter(sec7Start);
    const sec7EndLetter = getColLetter(sec7End);
    const sec8StartLetter = getColLetter(sec8Start);
    const sec8EndLetter = getColLetter(sec8End);

    // Apply validation cell-by-cell
    for (let row = 2; row <= validationEndRow; row++) {
      // Column 4 (D): Gender dropdown
      worksheet.getCell(row, 4).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(genderCol)}$2:$${getColLetter(genderCol)}$${EXCEL_GENDER.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_GENDER.join(', ')}`
      };

      // Column 5 (E): Religion dropdown
      worksheet.getCell(row, 5).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(religionCol)}$2:$${getColLetter(religionCol)}$${EXCEL_RELIGION.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select from dropdown`
      };

      // Column 6 (F): Community dropdown
      worksheet.getCell(row, 6).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(communityCol)}$2:$${getColLetter(communityCol)}$${EXCEL_COMMUNITY.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select from dropdown`
      };

      // Column 9 (I): Blood Group dropdown
      worksheet.getCell(row, 9).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(bloodGroupCol)}$2:$${getColLetter(bloodGroupCol)}$${EXCEL_BLOOD_GROUP.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select from dropdown`
      };

      // Column 17 (Q): Institution dropdown (Level 1)
      if (institutionNames.length > 0) {
        worksheet.getCell(row, 17).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${getColLetter(allInstCol)}$2:$${getColLetter(allInstCol)}$${institutionNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select from dropdown'
        };
      }

      // Column 18 (R): Degree dropdown (Level 2 - CASCADE from Institution)
      if (instsWithDegs.length > 0) {
        const degFormula = `OFFSET(Lists!$A$1,1,MATCH(Q${row},Lists!$A$1:$${sec1EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(Q${row},Lists!$A$1:$${sec1EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 18).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [degFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution first, then choose Degree from dropdown'
        };
      }

      // Column 19 (S): Department dropdown (Level 3 - CASCADE from Institution|Degree composite key)
      if (degsWithDepts.length > 0) {
        const deptFormula = `OFFSET(Lists!$${sec2StartLetter}$1,1,MATCH(Q${row}&"|"&R${row},Lists!$${sec2StartLetter}$1:$${sec2EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec2StartLetter}$1,1,MATCH(Q${row}&"|"&R${row},Lists!$${sec2StartLetter}$1:$${sec2EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 19).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [deptFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution and Degree first, then choose Department from dropdown'
        };
      }

      // Column 20 (T): Program dropdown (Level 4 - CASCADE from Institution|Degree|Department composite key)
      if (deptsWithProgs.length > 0) {
        const progFormula = `OFFSET(Lists!$${sec3StartLetter}$1,1,MATCH(Q${row}&"|"&R${row}&"|"&S${row},Lists!$${sec3StartLetter}$1:$${sec3EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec3StartLetter}$1,1,MATCH(Q${row}&"|"&R${row}&"|"&S${row},Lists!$${sec3StartLetter}$1:$${sec3EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 20).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [progFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution, Degree and Department first, then choose Program from dropdown'
        };
      }

      // Column 21 (U): Semester dropdown (Level 5 - CASCADE from Institution|Degree|Department|Program composite key)
      if (progsWithSems.length > 0) {
        const semFormula = `OFFSET(Lists!$${sec4StartLetter}$1,1,MATCH(Q${row}&"|"&R${row}&"|"&S${row}&"|"&T${row},Lists!$${sec4StartLetter}$1:$${sec4EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec4StartLetter}$1,1,MATCH(Q${row}&"|"&R${row}&"|"&S${row}&"|"&T${row},Lists!$${sec4StartLetter}$1:$${sec4EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 21).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [semFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution, Degree, Department and Program first, then choose Semester from dropdown'
        };
      }

      // Column 22 (V): Section dropdown (Level 6 - CASCADE from Institution|Degree|Department|Program|Semester composite key)
      if (semsWithSects.length > 0) {
        const sectFormula = `OFFSET(Lists!$${sec5StartLetter}$1,1,MATCH(Q${row}&"|"&R${row}&"|"&S${row}&"|"&T${row}&"|"&U${row},Lists!$${sec5StartLetter}$1:$${sec5EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec5StartLetter}$1,1,MATCH(Q${row}&"|"&R${row}&"|"&S${row}&"|"&T${row}&"|"&U${row},Lists!$${sec5StartLetter}$1:$${sec5EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 22).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [sectFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution, Degree, Department, Program and Semester first, then choose Section from dropdown'
        };
      }

      // Column 23 (W): Academic Year dropdown (CASCADE from Institution)
      if (instsWithAcadYears.length > 0) {
        const acadYearFormula = `OFFSET(Lists!$${sec6StartLetter}$1,1,MATCH(Q${row},Lists!$${sec6StartLetter}$1:$${sec6EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec6StartLetter}$1,1,MATCH(Q${row},Lists!$${sec6StartLetter}$1:$${sec6EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 23).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [acadYearFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution first, then choose Academic Year from dropdown'
        };
      }

      // ======= ADDRESS CASCADING DROPDOWNS =======

      // Column 31 (AE): Permanent Address State dropdown (Level 1 - All States)
      if (statesWithDists.length > 0) {
        const stateFormula = `OFFSET(Lists!$${sec7StartLetter}$1,0,0,1,${statesWithDists.length})`;
        worksheet.getCell(row, 31).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [stateFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select State from dropdown'
        };
      }

      // Column 32 (AF): Permanent Address District dropdown (Level 2 - CASCADE from State)
      if (statesWithDists.length > 0) {
        const districtFormula = `OFFSET(Lists!$${sec7StartLetter}$1,1,MATCH(AE${row},Lists!$${sec7StartLetter}$1:$${sec7EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec7StartLetter}$1,1,MATCH(AE${row},Lists!$${sec7StartLetter}$1:$${sec7EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 32).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [districtFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select State first, then choose District from dropdown'
        };
      }

      // Column 33 (AG): Permanent Address Taluk dropdown (Level 3 - CASCADE from State|District composite key)
      if (distsWithTaluks.length > 0) {
        const talukFormula = `OFFSET(Lists!$${sec8StartLetter}$1,1,MATCH(AE${row}&"|"&AF${row},Lists!$${sec8StartLetter}$1:$${sec8EndLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${sec8StartLetter}$1,1,MATCH(AE${row}&"|"&AF${row},Lists!$${sec8StartLetter}$1:$${sec8EndLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(row, 33).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [talukFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select State and District first, then choose Taluk from dropdown'
        };
      }

      // Column 36 (AJ): Entry Type dropdown
      worksheet.getCell(row, 36).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(entryTypeCol)}$2:$${getColLetter(entryTypeCol)}$${EXCEL_ENTRY_TYPE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_ENTRY_TYPE.join(', ')}`
      };

      // Column 37 (AK): Scholarship Type dropdown
      worksheet.getCell(row, 37).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(scholarshipTypeCol)}$2:$${getColLetter(scholarshipTypeCol)}$${EXCEL_SCHOLARSHIP_TYPE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select from dropdown'
      };

      // Column 38 (AL): Accommodation Type dropdown
      worksheet.getCell(row, 38).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(accommodationCol)}$2:$${getColLetter(accommodationCol)}$${EXCEL_ACCOMMODATION.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_ACCOMMODATION.join(', ')}`
      };

      // Column 39 (AM): Hostel Type dropdown
      worksheet.getCell(row, 39).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(hostelTypeCol)}$2:$${getColLetter(hostelTypeCol)}$${EXCEL_HOSTEL_TYPE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select from dropdown'
      };

      // Column 40 (AN): Food Type dropdown
      worksheet.getCell(row, 40).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(foodTypeCol)}$2:$${getColLetter(foodTypeCol)}$${EXCEL_FOOD_TYPE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select from dropdown'
      };

      // Column 42 (AP): Board of Study dropdown
      worksheet.getCell(row, 42).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(boardOfStudyCol)}$2:$${getColLetter(boardOfStudyCol)}$${EXCEL_BOARD_OF_STUDY.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select from dropdown'
      };

      // Column 46 (AT): 12th Group dropdown
      worksheet.getCell(row, 46).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(twelfthGroupCol)}$2:$${getColLetter(twelfthGroupCol)}$${EXCEL_TWELFTH_GROUP.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_TWELFTH_GROUP.join(', ')}`
      };

      // Column 54 (BB): Counseling Applied (Boolean)
      worksheet.getCell(row, 54).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(booleanCol)}$2:$${getColLetter(booleanCol)}$${EXCEL_BOOLEAN.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_BOOLEAN.join(', ')}`
      };

      // Column 55 (BC): Quota dropdown
      worksheet.getCell(row, 55).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(quotaCol)}$2:$${getColLetter(quotaCol)}$${EXCEL_QUOTA.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select from dropdown'
      };

      // Column 57 (BE): Bus Required (Boolean)
      worksheet.getCell(row, 57).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(booleanCol)}$2:$${getColLetter(booleanCol)}$${EXCEL_BOOLEAN.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_BOOLEAN.join(', ')}`
      };

      // Column 60 (BH): Reference Type dropdown
      worksheet.getCell(row, 60).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${getColLetter(referenceTypeCol)}$2:$${getColLetter(referenceTypeCol)}$${EXCEL_REFERENCE_TYPE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select from dropdown'
      };
    }

    // ============================================================
    // SHEET 3: Instructions
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 90 }];

    const instructions = [
      'ENQUIRY BULK IMPORT - INSTRUCTIONS',
      '',
      '1. REQUIRED FIELDS (marked with * in template):',
      '   • Personal: First Name, Last Name, DOB, Gender, Religion, Community, Caste',
      '   • Parent/Guardian: Father Name, Father Mobile, Mother Name, Mother Mobile',
      '   • Academic: Institution, Degree, Department, Program, Semester, Section, Academic Year',
      '   • Contact: Student Mobile, Student Email',
      '   • Permanent Address: Street, State, District, Taluk, Pin Code (All cascading)',
      '   • Entry: Entry Type, Scholarship Type, Accommodation Type',
      '   • Education: Last School, Board, 10th Marks (Max/Obtained/%), 12th Group, 12th Marks (Max/Obtained/%)',
      '',
      '2. OPTIONAL FIELDS:',
      '   • College Email, Admission Year, Regulation, Batch, Blood Group, Hostel Type, Food Type',
      '   • Entrance Exam details (Medical/Engineering Cutoff, NEET Roll Number/Score)',
      '   • Counseling details, Transport details, Reference details',
      '',
      '3. CASCADING DROPDOWN INSTRUCTIONS (VERY IMPORTANT):',
      '   ⚠️ ALWAYS select in this exact order for Academic Structure:',
      '   Step 1: Select INSTITUTION (Column Q) FIRST',
      '   Step 2: Select DEGREE (Column R) - shows ONLY degrees for that institution',
      '   Step 3: Select DEPARTMENT (Column S) - shows ONLY departments for that institution and degree',
      '   Step 4: Select PROGRAM (Column T) - shows ONLY programs for that department',
      '   Step 5: Select SEMESTER (Column U) - shows ONLY semesters for that program',
      '   Step 6: Select SECTION (Column V) - shows ONLY sections for that semester',
      '   ',
      '   ⚠️ Academic Year (Column W) cascades from Institution:',
      '   • After selecting Institution, the Academic Year dropdown will show only years for that institution',
      '   ',
      '   ⚠️ Permanent Address cascades: State → District → Taluk (Columns AE-AG):',
      '   Step 1: Select STATE (Column AE) FIRST',
      '   Step 2: Select DISTRICT (Column AF) - shows ONLY districts in that state',
      '   Step 3: Select TALUK (Column AG) - shows ONLY taluks in that district',
      '   ',
      '   ⚠️ If you change a parent selection, you MUST re-select all child values!',
      '   Example: If you change Institution, you MUST re-select Degree, Department, Program, Semester, Section, and Academic Year',
      '   Example: If you change State, you MUST re-select District and Taluk',
      '',
      '4. DROPDOWN FIELDS:',
      '   • Gender: MALE, FEMALE, OTHER',
      '   • Religion: HINDU, CHRISTIAN, MUSLIM, SIKH, BUDDHIST, JAIN, OTHERS',
      '   • Community: OC, BC, BCM, MBC, DNC, BC-CC, SC, ST, SBC, SC (A)',
      '   • Entry Type: FIRST YEAR, LATERAL ENTRY, RE-ADMISSION, COLLEGE TRANSFER',
      '   • Scholarship Type: FIRST GRADUATE, PMS SCHOLARSHIP, 7.5% SCHOLARSHIP, NOT APPLICABLE',
      '   • Accommodation Type: HOSTEL, DAY SCHOLAR, HOME',
      '   • All dropdown values are case-insensitive (MALE = male = Male)',
      '',
      '5. DATA FORMATTING:',
      '   • Date of Birth: YYYY-MM-DD format (Example: 2005-01-15)',
      '   • Mobile Numbers: 10 digits, no spaces/dashes - use real numbers, not sample (9999999990)',
      '   • Pin Code: 6 digits (Example: 637001)',
      '   • College Email: Must end with @jkkn.ac.in if provided (Optional for enquiries)',
      '   • Academic Year: YYYY-YYYY format (Example: 2024-2025)',
      '   • Regulation: Usually "R" followed by year (Example: R2021, R2024)',
      '   • Batch: Year range format (Example: 2024-2028 for 4-year program)',
      '',
      '6. IMPORTANT NOTES:',
      '   • NEVER type values manually - ALWAYS use dropdowns where available',
      '   • Delete the yellow sample row (Row 2) before uploading your actual data',
      '   • Sample row uses fake mobile numbers (9999999990, etc.) to avoid conflicts',
      '   • Replace sample data with real student information before upload',
      '   • All uppercase fields will be automatically normalized (MALE, FEMALE, etc.)',
      '   • Enquiries will have status "Enquiry" - user accounts created only after approval',
      '',
      '7. AFTER FILLING DATA:',
      '   • Save the file as .xlsx',
      '   • Go to Enquiries page and click "Import" button',
      '   • Upload the file and review validation results',
      '   • Fix any errors shown and re-upload if needed',
      '',
      'For support, contact your system administrator.',
      `Template generated: ${new Date().toLocaleString()}`
    ];

    instructions.forEach((line, index) => {
      const row = instructionsSheet.addRow([line]);
      if (index === 0) {
        row.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A8A' } };
      } else if (line.match(/^\d+\./)) {
        row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else if (line.includes('⚠️') || line.includes('IMPORTANT')) {
        row.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FFDC2626' } };
      } else {
        row.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // Hide Lists sheet
    listsSheet.state = 'hidden';

    // ============================================================
    // 7. GENERATE AND RETURN FILE
    // ============================================================
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=enquiry-import-template-${new Date().toISOString().split('T')[0]}.xlsx`
      }
    });
  } catch (error) {
    console.error('[learners/enquiries/template] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate template', message: errorMessage },
      { status: 500 }
    );
  }
}
