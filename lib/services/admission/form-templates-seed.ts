// lib/services/admission/form-templates-seed.ts
// Pre-built admission form templates for quick start
// Added: 2026-04-08
// Seed via: INSERT INTO admission_form_templates (...) using this data, or
// load via FormBuilderService when admin opens "New Form" dialog.

export const ADMISSION_FORM_TEMPLATES = [
  {
    name: 'UG Admission Form',
    description: 'Standard undergraduate admission enquiry form with personal, academic, and parent details.',
    form_type: 'ug_admission',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Information',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', placeholder: 'Enter your full name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', placeholder: '10-digit mobile number', help_text: 'We will contact you on this number', display_order: 1 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: false, lead_field_map: 'email', placeholder: 'your.email@example.com', display_order: 2 },
            { field_key: 'gender', field_label: 'Gender', field_type: 'select', is_required: false, lead_field_map: 'gender', options: [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }], display_order: 3 },
            { field_key: 'date_of_birth', field_label: 'Date of Birth', field_type: 'date', is_required: false, lead_field_map: 'date_of_birth', display_order: 4 },
          ],
        },
        {
          title: 'Parent / Guardian Details',
          fields: [
            { field_key: 'parent_name', field_label: 'Parent/Guardian Name', field_type: 'text', is_required: true, lead_field_map: 'parent_name', placeholder: 'Father/Mother/Guardian name', display_order: 0 },
            { field_key: 'parent_phone', field_label: 'Parent Phone', field_type: 'phone', is_required: true, lead_field_map: 'parent_phone', placeholder: '10-digit mobile number', display_order: 1 },
          ],
        },
        {
          title: 'Academic Interest',
          fields: [
            { field_key: 'institution_program', field_label: 'Preferred Institution & Program', field_type: 'institution_program_selector', is_required: true, display_order: 0 },
            { field_key: 'twelfth_marks', field_label: '12th Standard Marks (%)', field_type: 'number', is_required: false, min_value: 0, max_value: 100, placeholder: 'Enter percentage', display_order: 1 },
            { field_key: 'district', field_label: 'District', field_type: 'text', is_required: false, lead_field_map: 'district', placeholder: 'Your district', display_order: 2 },
            { field_key: 'state', field_label: 'State', field_type: 'select', is_required: false, lead_field_map: 'state', options: [
              { label: 'Tamil Nadu', value: 'Tamil Nadu' }, { label: 'Kerala', value: 'Kerala' },
              { label: 'Karnataka', value: 'Karnataka' }, { label: 'Andhra Pradesh', value: 'Andhra Pradesh' },
              { label: 'Telangana', value: 'Telangana' }, { label: 'Maharashtra', value: 'Maharashtra' },
              { label: 'Other', value: 'Other' },
            ], display_order: 3 },
          ],
        },
      ],
    },
  },
  {
    name: 'PG Admission Form',
    description: 'Postgraduate admission enquiry form with UG degree, CGPA, and work experience fields.',
    form_type: 'pg_admission',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Information',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', display_order: 1 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: true, lead_field_map: 'email', display_order: 2 },
          ],
        },
        {
          title: 'Academic Background',
          fields: [
            { field_key: 'ug_degree', field_label: 'UG Degree', field_type: 'text', is_required: true, placeholder: 'e.g., B.Tech CSE, BBA', display_order: 0 },
            { field_key: 'ug_cgpa', field_label: 'UG CGPA / Percentage', field_type: 'number', is_required: false, min_value: 0, max_value: 100, display_order: 1 },
            { field_key: 'work_experience', field_label: 'Work Experience (years)', field_type: 'number', is_required: false, min_value: 0, max_value: 40, display_order: 2 },
            { field_key: 'institution_program', field_label: 'Preferred PG Program', field_type: 'institution_program_selector', is_required: true, display_order: 3 },
          ],
        },
      ],
    },
  },
  {
    name: 'Hostel Enquiry Form',
    description: 'Hostel accommodation enquiry form for prospective and current students.',
    form_type: 'hostel_enquiry',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Student Details',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', display_order: 1 },
            { field_key: 'institution_program', field_label: 'Institution & Program', field_type: 'institution_program_selector', is_required: true, display_order: 2 },
          ],
        },
        {
          title: 'Hostel Preferences',
          fields: [
            { field_key: 'room_type', field_label: 'Room Type', field_type: 'select', is_required: true, options: [
              { label: 'Single Room', value: 'single' }, { label: 'Double Sharing', value: 'double' },
              { label: 'Triple Sharing', value: 'triple' }, { label: 'Dormitory', value: 'dormitory' },
            ], display_order: 0 },
            { field_key: 'food_preference', field_label: 'Food Preference', field_type: 'select', is_required: true, options: [
              { label: 'Vegetarian', value: 'veg' }, { label: 'Non-Vegetarian', value: 'non_veg' },
            ], display_order: 1 },
            { field_key: 'special_needs', field_label: 'Special Requirements', field_type: 'textarea', is_required: false, placeholder: 'Any medical or dietary requirements', display_order: 2 },
          ],
        },
      ],
    },
  },
  {
    name: 'Scholarship Application',
    description: 'Scholarship application form with academic achievements and financial information.',
    form_type: 'scholarship',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Details',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', display_order: 1 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: true, lead_field_map: 'email', display_order: 2 },
            { field_key: 'institution_program', field_label: 'Applied Program', field_type: 'institution_program_selector', is_required: true, display_order: 3 },
          ],
        },
        {
          title: 'Academic & Financial',
          fields: [
            { field_key: 'twelfth_marks', field_label: '12th Standard Marks (%)', field_type: 'number', is_required: true, min_value: 0, max_value: 100, display_order: 0 },
            { field_key: 'family_income', field_label: 'Annual Family Income (INR)', field_type: 'select', is_required: true, options: [
              { label: 'Below 1 Lakh', value: 'below_1l' }, { label: '1-3 Lakhs', value: '1l_3l' },
              { label: '3-5 Lakhs', value: '3l_5l' }, { label: '5-10 Lakhs', value: '5l_10l' },
              { label: 'Above 10 Lakhs', value: 'above_10l' },
            ], display_order: 1 },
            { field_key: 'achievements', field_label: 'Achievements & Awards', field_type: 'textarea', is_required: false, placeholder: 'List academic achievements, sports awards, extracurricular activities', display_order: 2 },
            { field_key: 'income_proof', field_label: 'Income Certificate (PDF)', field_type: 'file', is_required: false, help_text: 'Upload scanned income certificate if available', display_order: 3 },
          ],
        },
      ],
    },
  },
  {
    name: 'Lead Basic Details',
    description:
      'Mirrors the manual lead creation form with essential fields only — name, phone, email, parent contact, program interest, and location. Perfect starting point for a general admission enquiry form.',
    form_type: 'lead_basic',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Details',
          description: 'Tell us about yourself',
          fields: [
            { field_key: 'first_name', field_label: 'First Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', placeholder: 'e.g., Aarav', display_order: 0 },
            { field_key: 'last_name', field_label: 'Last Name', field_type: 'text', is_required: false, lead_field_map: 'last_name', placeholder: 'e.g., Kumar', display_order: 1 },
            { field_key: 'phone', field_label: 'Mobile Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', placeholder: '10-digit mobile number', help_text: 'We will reach you on this number via WhatsApp and call', display_order: 2 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: false, lead_field_map: 'email', placeholder: 'your.email@example.com', display_order: 3 },
            { field_key: 'gender', field_label: 'Gender', field_type: 'select', is_required: false, lead_field_map: 'gender', options: [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }], display_order: 4, placeholder: 'Select gender' },
            { field_key: 'date_of_birth', field_label: 'Date of Birth', field_type: 'date', is_required: false, lead_field_map: 'date_of_birth', display_order: 5 },
          ],
        },
        {
          title: 'Parent / Guardian Contact',
          description: 'So we can share updates with your parents',
          fields: [
            { field_key: 'parent_name', field_label: 'Parent / Guardian Name', field_type: 'text', is_required: false, lead_field_map: 'parent_name', placeholder: 'Father / Mother / Guardian name', display_order: 0 },
            { field_key: 'parent_phone', field_label: 'Parent Phone', field_type: 'phone', is_required: false, lead_field_map: 'parent_phone', placeholder: '10-digit mobile number', display_order: 1 },
          ],
        },
        {
          title: 'Program Interest',
          description: 'Which program are you interested in?',
          fields: [
            { field_key: 'institution_program', field_label: 'Institution & Program', field_type: 'institution_program_selector', is_required: true, display_order: 0, help_text: 'Select the institution and program you are interested in' },
          ],
        },
        {
          title: 'Location',
          description: 'Where are you from?',
          fields: [
            { field_key: 'district', field_label: 'District', field_type: 'text', is_required: false, lead_field_map: 'district', placeholder: 'e.g., Salem, Coimbatore', display_order: 0 },
            { field_key: 'state', field_label: 'State', field_type: 'select', is_required: false, lead_field_map: 'state', options: [
              { label: 'Tamil Nadu', value: 'Tamil Nadu' }, { label: 'Kerala', value: 'Kerala' },
              { label: 'Karnataka', value: 'Karnataka' }, { label: 'Andhra Pradesh', value: 'Andhra Pradesh' },
              { label: 'Telangana', value: 'Telangana' }, { label: 'Puducherry', value: 'Puducherry' },
              { label: 'Other', value: 'Other' },
            ], display_order: 1, placeholder: 'Select state' },
          ],
        },
      ],
    },
  },
];

/**
 * SQL to seed templates manually in Supabase Dashboard:
 *
 * INSERT INTO admission_form_templates (name, description, form_type, template_data, is_system)
 * VALUES (...) -- one row per template above
 *
 * Or call FormBuilderService programmatically on first admin access.
 */
