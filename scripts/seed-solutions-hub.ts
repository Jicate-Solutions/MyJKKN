/**
 * Solutions Hub Seed Script
 * -------------------------
 * Creates comprehensive test data for the Solutions Hub module in MyJKKN.
 *
 * Usage: npx tsx scripts/seed-solutions-hub.ts
 *
 * This script creates:
 * - 5 Clients (with various source types and partner statuses)
 * - 6 Solutions (2 Software, 2 Training, 2 Content)
 * - Phases for software solutions
 * - 3 Builders with skills and assignments
 * - 3 Cohort Members for training
 * - 3 Production Learners for content
 * - Training programs, sessions, and assignments
 * - Content orders, deliverables, and assignments
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// ===== CONSTANTS AND IDS =====

// Pre-generated UUIDs for consistent references
const IDS = {
  // Clients
  clients: {
    techcorp: randomUUID(),
    abcUniversity: randomUUID(),
    yiChennai: randomUUID(),
    globalTraining: randomUUID(),
    jkknInternal: randomUUID(),
  },
  // Solutions
  solutions: {
    software1: randomUUID(),
    software2: randomUUID(),
    training1: randomUUID(),
    training2: randomUUID(),
    content1: randomUUID(),
    content2: randomUUID(),
  },
  // Phases
  phases: {
    software1_phase1: randomUUID(),
    software1_phase2: randomUUID(),
    software1_phase3: randomUUID(),
    software2_phase1: randomUUID(),
    software2_phase2: randomUUID(),
  },
  // Builders
  builders: {
    builder1: randomUUID(),
    builder2: randomUUID(),
    builder3: randomUUID(),
  },
  // Cohort Members
  cohortMembers: {
    cohort1: randomUUID(),
    cohort2: randomUUID(),
    cohort3: randomUUID(),
  },
  // Production Learners
  productionLearners: {
    learner1: randomUUID(),
    learner2: randomUUID(),
    learner3: randomUUID(),
  },
  // Training Programs
  trainingPrograms: {
    program1: randomUUID(),
    program2: randomUUID(),
  },
  // Training Sessions
  trainingSessions: {
    session1: randomUUID(),
    session2: randomUUID(),
    session3: randomUUID(),
    session4: randomUUID(),
  },
  // Content Orders
  contentOrders: {
    order1: randomUUID(),
    order2: randomUUID(),
  },
  // Content Deliverables
  deliverables: {
    deliverable1: randomUUID(),
    deliverable2: randomUUID(),
    deliverable3: randomUUID(),
  },
};

// Helper to generate date strings
const today = new Date();
const formatDate = (date: Date) => date.toISOString().split('T')[0];
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// ===== HELPER FUNCTIONS =====

async function checkExistingData(table: string, field: string, value: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq(field, value)
    .maybeSingle();

  return !error && data !== null;
}

async function getExistingDepartment(): Promise<string | null> {
  const { data, error } = await supabase
    .from('departments')
    .select('id')
    .limit(1)
    .single();

  if (error || !data) {
    console.log('Warning: No departments found, using NULL for department references');
    return null;
  }
  return data.id;
}

async function getExistingInstitution(): Promise<string | null> {
  const { data, error } = await supabase
    .from('institutions')
    .select('id')
    .limit(1)
    .single();

  if (error || !data) {
    console.log('Warning: No institutions found, using NULL for institution references');
    return null;
  }
  return data.id;
}

// ===== SEED FUNCTIONS =====

async function seedClients(departmentId: string | null) {
  console.log('\n--- Seeding Clients ---');

  const clients = [
    {
      id: IDS.clients.techcorp,
      name: 'TechCorp Industries',
      company_code: 'JKKN-CLI-2026-001',
      contact_person: 'Rajesh Kumar',
      contact_email: 'rajesh@techcorp.com',
      contact_phone: '+91-9876543210',
      address: '123 Tech Park, Sector 5',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      source_type: 'direct',
      partner_status: 'standard',
      industry_sector: 'Information Technology',
      company_size: 'enterprise',
      website: 'https://techcorp.example.com',
      tags: ['enterprise', 'it', 'software'],
      notes: 'Large enterprise client with multiple ongoing projects',
    },
    {
      id: IDS.clients.abcUniversity,
      name: 'ABC University',
      company_code: 'JKKN-CLI-2026-002',
      contact_person: 'Dr. Priya Sharma',
      contact_email: 'priya.sharma@abcuniv.edu',
      contact_phone: '+91-9876543211',
      address: '456 Education Lane',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641001',
      source_type: 'alumni',
      partner_status: 'alumni',
      industry_sector: 'Education',
      company_size: 'enterprise',
      website: 'https://abcuniversity.edu',
      tags: ['education', 'university', 'alumni'],
      notes: 'Alumni partner - 50% discount applicable',
    },
    {
      id: IDS.clients.yiChennai,
      name: 'Young Indians Chennai',
      company_code: 'JKKN-CLI-2026-003',
      contact_person: 'Arun Venkatesh',
      contact_email: 'arun@yichennai.org',
      contact_phone: '+91-9876543212',
      address: '789 CII Building',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
      source_type: 'yi',
      partner_status: 'yi',
      industry_sector: 'Non-Profit',
      company_size: 'sme',
      website: 'https://yichennai.org',
      linkedin_url: 'https://linkedin.com/company/yi-chennai',
      tags: ['yi', 'nonprofit', 'community'],
      notes: 'YI partner - 50% discount applicable. Multiple training engagements.',
    },
    {
      id: IDS.clients.globalTraining,
      name: 'Global Training Co',
      company_code: 'JKKN-CLI-2026-004',
      contact_person: 'Sarah Williams',
      contact_email: 'sarah@globaltraining.com',
      contact_phone: '+91-9876543213',
      address: '321 Business Center',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      source_type: 'referral',
      partner_status: 'referral',
      industry_sector: 'Corporate Training',
      company_size: 'sme',
      website: 'https://globaltraining.com',
      tags: ['training', 'corporate', 'referral'],
      notes: 'Referred by ABC University. Interested in corporate training programs.',
    },
    {
      id: IDS.clients.jkknInternal,
      name: 'JKKN Internal Projects',
      company_code: 'JKKN-CLI-2026-005',
      contact_person: 'Dr. K. Kumar',
      contact_email: 'director@jkkn.ac.in',
      contact_phone: '+91-9876543214',
      address: 'JKKN Campus',
      city: 'Namakkal',
      state: 'Tamil Nadu',
      pincode: '637001',
      source_type: 'direct',
      partner_status: 'mou',
      industry_sector: 'Education',
      company_size: 'enterprise',
      website: 'https://jkkn.ac.in',
      tags: ['internal', 'jkkn', 'mou'],
      notes: 'Internal JKKN projects - MOU partner status',
    },
  ];

  for (const client of clients) {
    // Check if client already exists
    const exists = await checkExistingData('sh_clients', 'company_code', client.company_code);
    if (exists) {
      console.log(`  Skipping existing client: ${client.name}`);
      continue;
    }

    const { error } = await supabase
      .from('sh_clients')
      .insert({
        ...client,
        source_department_id: departmentId,
      });

    if (error) {
      console.error(`  Error creating client ${client.name}:`, error.message);
    } else {
      console.log(`  Created client: ${client.name}`);
    }
  }
}

async function seedSolutions(departmentId: string | null, institutionId: string | null) {
  console.log('\n--- Seeding Solutions ---');

  const solutions = [
    // Software Solutions
    {
      id: IDS.solutions.software1,
      solution_code: 'JKKN-SOL-2026-001',
      solution_type: 'software',
      title: 'Hospital Management System',
      description: 'Comprehensive hospital management system with patient records, appointments, and billing modules',
      client_id: IDS.clients.techcorp,
      lead_department_id: departmentId,
      institution_id: institutionId,
      status: 'active',
      base_price: 500000,
      final_price: 500000,
      start_date: formatDate(addDays(today, -30)),
      target_date: formatDate(addDays(today, 90)),
      priority: 8,
      tags: ['healthcare', 'enterprise', 'webapp'],
      notes: 'Phase 1 focusing on patient management',
    },
    {
      id: IDS.solutions.software2,
      solution_code: 'JKKN-SOL-2026-002',
      solution_type: 'software',
      title: 'Learning Management Portal',
      description: 'Custom LMS for university with course management, assessments, and analytics',
      client_id: IDS.clients.abcUniversity,
      lead_department_id: departmentId,
      institution_id: institutionId,
      status: 'active',
      base_price: 400000,
      final_price: 200000, // 50% alumni discount
      discount_percentage: 50,
      discount_reason: 'Alumni partner discount',
      start_date: formatDate(addDays(today, -15)),
      target_date: formatDate(addDays(today, 60)),
      priority: 7,
      tags: ['education', 'lms', 'webapp'],
      notes: 'Alumni discount applied',
    },
    // Training Solutions
    {
      id: IDS.solutions.training1,
      solution_code: 'JKKN-SOL-2026-003',
      solution_type: 'training',
      title: 'Full Stack Development Bootcamp',
      description: '12-week intensive bootcamp covering React, Node.js, and cloud deployment',
      client_id: IDS.clients.yiChennai,
      lead_department_id: departmentId,
      institution_id: institutionId,
      status: 'active',
      base_price: 300000,
      final_price: 150000, // 50% YI discount
      discount_percentage: 50,
      discount_reason: 'YI partner discount',
      start_date: formatDate(addDays(today, -10)),
      target_date: formatDate(addDays(today, 74)),
      priority: 9,
      tags: ['training', 'fullstack', 'yi'],
      notes: 'Track A - Internal trainers. YI discount applied.',
      metadata: { track: 'A' },
    },
    {
      id: IDS.solutions.training2,
      solution_code: 'JKKN-SOL-2026-004',
      solution_type: 'training',
      title: 'Data Analytics Workshop',
      description: '3-day workshop on Python, Pandas, and Power BI',
      client_id: IDS.clients.globalTraining,
      lead_department_id: departmentId,
      institution_id: institutionId,
      status: 'active',
      base_price: 150000,
      final_price: 150000,
      start_date: formatDate(addDays(today, 7)),
      target_date: formatDate(addDays(today, 10)),
      priority: 6,
      tags: ['training', 'analytics', 'workshop'],
      notes: 'Track B - External corporate training.',
      metadata: { track: 'B' },
    },
    // Content Solutions
    {
      id: IDS.solutions.content1,
      solution_code: 'JKKN-SOL-2026-005',
      solution_type: 'content',
      title: 'Corporate Video Package',
      description: 'Company overview video, product demos, and social media content',
      client_id: IDS.clients.techcorp,
      lead_department_id: departmentId,
      institution_id: institutionId,
      status: 'active',
      base_price: 75000,
      final_price: 75000,
      start_date: formatDate(addDays(today, -5)),
      target_date: formatDate(addDays(today, 30)),
      priority: 5,
      tags: ['video', 'corporate', 'social'],
      notes: 'Includes 1 main video and 5 social media clips',
    },
    {
      id: IDS.solutions.content2,
      solution_code: 'JKKN-SOL-2026-006',
      solution_type: 'content',
      title: 'University Prospectus Design',
      description: 'Complete prospectus with brochures, digital versions, and social media graphics',
      client_id: IDS.clients.jkknInternal,
      lead_department_id: departmentId,
      institution_id: institutionId,
      status: 'active',
      base_price: 50000,
      final_price: 50000,
      start_date: formatDate(today),
      target_date: formatDate(addDays(today, 45)),
      priority: 7,
      tags: ['design', 'print', 'education'],
      notes: 'Internal project for new academic year',
    },
  ];

  for (const solution of solutions) {
    const exists = await checkExistingData('sh_solutions', 'solution_code', solution.solution_code);
    if (exists) {
      console.log(`  Skipping existing solution: ${solution.title}`);
      continue;
    }

    const { error } = await supabase.from('sh_solutions').insert(solution);

    if (error) {
      console.error(`  Error creating solution ${solution.title}:`, error.message);
    } else {
      console.log(`  Created solution: ${solution.title}`);
    }
  }
}

async function seedPhases(departmentId: string | null) {
  console.log('\n--- Seeding Solution Phases ---');

  const phases = [
    // Hospital Management System phases
    {
      id: IDS.phases.software1_phase1,
      solution_id: IDS.solutions.software1,
      phase_number: 1,
      phase_code: 'HMS-P1',
      title: 'Patient Management Module',
      description: 'Core patient registration, medical records, and appointment scheduling',
      status: 'prototype_building',
      owner_department_id: departmentId,
      estimated_value: 200000,
      estimated_hours: 240,
      actual_hours: 80,
      start_date: formatDate(addDays(today, -30)),
      due_date: formatDate(addDays(today, 15)),
      notes: 'Currently in active development',
    },
    {
      id: IDS.phases.software1_phase2,
      solution_id: IDS.solutions.software1,
      phase_number: 2,
      phase_code: 'HMS-P2',
      title: 'Billing & Inventory Module',
      description: 'Hospital billing, insurance integration, and pharmacy inventory',
      status: 'prospecting',
      owner_department_id: departmentId,
      estimated_value: 180000,
      estimated_hours: 200,
      start_date: formatDate(addDays(today, 16)),
      due_date: formatDate(addDays(today, 60)),
      notes: 'Requirements gathering in progress',
    },
    {
      id: IDS.phases.software1_phase3,
      solution_id: IDS.solutions.software1,
      phase_number: 3,
      phase_code: 'HMS-P3',
      title: 'Reporting & Analytics',
      description: 'Management dashboards, reports, and analytics module',
      status: 'prospecting',
      owner_department_id: departmentId,
      estimated_value: 120000,
      estimated_hours: 150,
      start_date: formatDate(addDays(today, 61)),
      due_date: formatDate(addDays(today, 90)),
      notes: 'Final phase',
    },
    // LMS phases
    {
      id: IDS.phases.software2_phase1,
      solution_id: IDS.solutions.software2,
      phase_number: 1,
      phase_code: 'LMS-P1',
      title: 'Course Management System',
      description: 'Course creation, content management, and student enrollment',
      status: 'client_demo',
      owner_department_id: departmentId,
      estimated_value: 120000,
      estimated_hours: 160,
      actual_hours: 150,
      start_date: formatDate(addDays(today, -15)),
      due_date: formatDate(addDays(today, 10)),
      notes: 'Demo scheduled with client',
    },
    {
      id: IDS.phases.software2_phase2,
      solution_id: IDS.solutions.software2,
      phase_number: 2,
      phase_code: 'LMS-P2',
      title: 'Assessment Engine',
      description: 'Online exams, quiz builder, and automated grading',
      status: 'prd_writing',
      owner_department_id: departmentId,
      estimated_value: 80000,
      estimated_hours: 100,
      start_date: formatDate(addDays(today, 11)),
      due_date: formatDate(addDays(today, 60)),
      notes: 'Requirements document in progress',
    },
  ];

  for (const phase of phases) {
    const exists = await checkExistingData('sh_solution_phases', 'phase_code', phase.phase_code!);
    if (exists) {
      console.log(`  Skipping existing phase: ${phase.title}`);
      continue;
    }

    const { error } = await supabase.from('sh_solution_phases').insert(phase);

    if (error) {
      console.error(`  Error creating phase ${phase.title}:`, error.message);
    } else {
      console.log(`  Created phase: ${phase.title}`);
    }
  }
}

async function seedBuilders(departmentId: string | null, institutionId: string | null) {
  console.log('\n--- Seeding Builders ---');

  const builders = [
    {
      id: IDS.builders.builder1,
      builder_code: 'JKKN-BLD-2026-001',
      name: 'Karthik Rajagopal',
      email: 'karthik.builder@jkkn.ac.in',
      phone: '+91-9876543301',
      department_id: departmentId,
      institution_id: institutionId,
      trained_date: formatDate(addDays(today, -180)),
      specialization: 'Full Stack Development',
      bio: 'Experienced full-stack developer specializing in React and Node.js',
      hourly_rate: 500,
      total_earnings: 45000,
      projects_completed: 3,
      average_rating: 4.5,
      is_internal: true,
      is_active: true,
      availability_status: 'busy',
      tags: ['react', 'nodejs', 'typescript'],
    },
    {
      id: IDS.builders.builder2,
      builder_code: 'JKKN-BLD-2026-002',
      name: 'Priya Sundaram',
      email: 'priya.builder@jkkn.ac.in',
      phone: '+91-9876543302',
      department_id: departmentId,
      institution_id: institutionId,
      trained_date: formatDate(addDays(today, -120)),
      specialization: 'Backend Development',
      bio: 'Backend specialist with expertise in databases and API development',
      hourly_rate: 450,
      total_earnings: 28000,
      projects_completed: 2,
      average_rating: 4.7,
      is_internal: true,
      is_active: true,
      availability_status: 'available',
      tags: ['python', 'postgresql', 'api'],
    },
    {
      id: IDS.builders.builder3,
      builder_code: 'JKKN-BLD-2026-003',
      name: 'Arjun Krishnamurthy',
      email: 'arjun.builder@jkkn.ac.in',
      phone: '+91-9876543303',
      department_id: departmentId,
      institution_id: institutionId,
      trained_date: formatDate(addDays(today, -90)),
      specialization: 'UI/UX Development',
      bio: 'Frontend developer with strong design sensibilities',
      hourly_rate: 400,
      total_earnings: 15000,
      projects_completed: 1,
      average_rating: 4.3,
      is_internal: true,
      is_active: true,
      availability_status: 'available',
      tags: ['react', 'tailwind', 'figma'],
    },
  ];

  for (const builder of builders) {
    const exists = await checkExistingData('sh_builders', 'builder_code', builder.builder_code);
    if (exists) {
      console.log(`  Skipping existing builder: ${builder.name}`);
      continue;
    }

    const { error } = await supabase.from('sh_builders').insert(builder);

    if (error) {
      console.error(`  Error creating builder ${builder.name}:`, error.message);
    } else {
      console.log(`  Created builder: ${builder.name}`);
    }
  }
}

async function seedBuilderSkills() {
  console.log('\n--- Seeding Builder Skills ---');

  const skills = [
    // Karthik's skills
    { builder_id: IDS.builders.builder1, skill_name: 'React', skill_category: 'frontend', proficiency_level: 5, years_experience: 3 },
    { builder_id: IDS.builders.builder1, skill_name: 'Node.js', skill_category: 'backend', proficiency_level: 4, years_experience: 2.5 },
    { builder_id: IDS.builders.builder1, skill_name: 'TypeScript', skill_category: 'language', proficiency_level: 4, years_experience: 2 },
    // Priya's skills
    { builder_id: IDS.builders.builder2, skill_name: 'Python', skill_category: 'backend', proficiency_level: 5, years_experience: 3 },
    { builder_id: IDS.builders.builder2, skill_name: 'PostgreSQL', skill_category: 'database', proficiency_level: 4, years_experience: 2 },
    { builder_id: IDS.builders.builder2, skill_name: 'FastAPI', skill_category: 'backend', proficiency_level: 4, years_experience: 1.5 },
    // Arjun's skills
    { builder_id: IDS.builders.builder3, skill_name: 'React', skill_category: 'frontend', proficiency_level: 4, years_experience: 1.5 },
    { builder_id: IDS.builders.builder3, skill_name: 'Tailwind CSS', skill_category: 'frontend', proficiency_level: 5, years_experience: 2 },
    { builder_id: IDS.builders.builder3, skill_name: 'Figma', skill_category: 'design', proficiency_level: 4, years_experience: 2 },
  ];

  for (const skill of skills) {
    // Check for existing skill
    const { data: existing } = await supabase
      .from('sh_builder_skills')
      .select('id')
      .eq('builder_id', skill.builder_id)
      .eq('skill_name', skill.skill_name)
      .maybeSingle();

    if (existing) {
      console.log(`  Skipping existing skill: ${skill.skill_name}`);
      continue;
    }

    const { error } = await supabase.from('sh_builder_skills').insert(skill);

    if (error) {
      console.error(`  Error creating skill ${skill.skill_name}:`, error.message);
    } else {
      console.log(`  Created skill: ${skill.skill_name}`);
    }
  }
}

async function seedBuilderAssignments() {
  console.log('\n--- Seeding Builder Assignments ---');

  const assignments = [
    {
      phase_id: IDS.phases.software1_phase1,
      builder_id: IDS.builders.builder1,
      role: 'lead',
      status: 'active',
      estimated_hours: 120,
      actual_hours: 60,
      hourly_rate: 500,
      total_earnings: 30000,
      started_at: new Date(addDays(today, -20)).toISOString(),
      notes: 'Lead developer for patient management module',
    },
    {
      phase_id: IDS.phases.software1_phase1,
      builder_id: IDS.builders.builder3,
      role: 'contributor',
      status: 'active',
      estimated_hours: 80,
      actual_hours: 30,
      hourly_rate: 400,
      total_earnings: 12000,
      started_at: new Date(addDays(today, -15)).toISOString(),
      notes: 'UI/UX implementation',
    },
    {
      phase_id: IDS.phases.software2_phase1,
      builder_id: IDS.builders.builder2,
      role: 'lead',
      status: 'active',
      estimated_hours: 100,
      actual_hours: 90,
      hourly_rate: 450,
      total_earnings: 40500,
      started_at: new Date(addDays(today, -15)).toISOString(),
      notes: 'Backend development for LMS',
    },
  ];

  for (const assignment of assignments) {
    // Check for existing assignment
    const { data: existing } = await supabase
      .from('sh_builder_assignments')
      .select('id')
      .eq('phase_id', assignment.phase_id)
      .eq('builder_id', assignment.builder_id)
      .maybeSingle();

    if (existing) {
      console.log(`  Skipping existing assignment`);
      continue;
    }

    const { error } = await supabase.from('sh_builder_assignments').insert(assignment);

    if (error) {
      console.error(`  Error creating builder assignment:`, error.message);
    } else {
      console.log(`  Created builder assignment`);
    }
  }
}

async function seedCohortMembers(departmentId: string | null, institutionId: string | null) {
  console.log('\n--- Seeding Cohort Members ---');

  const cohortMembers = [
    {
      id: IDS.cohortMembers.cohort1,
      cohort_code: 'JKKN-COH-2026-001',
      name: 'Dr. Meena Shankar',
      email: 'meena.cohort@jkkn.ac.in',
      phone: '+91-9876543401',
      department_id: departmentId,
      institution_id: institutionId,
      level: 'master',
      track: 'Technology',
      specializations: ['Full Stack Development', 'Cloud Computing', 'DevOps'],
      bio: 'Senior trainer with 10+ years of industry experience',
      sessions_observed: 5,
      sessions_co_led: 10,
      sessions_led: 50,
      sessions_master: 20,
      total_hours_trained: 500,
      total_participants_trained: 1200,
      total_earnings: 250000,
      average_rating: 4.8,
      is_active: true,
      availability_status: 'available',
      tags: ['senior', 'fullstack', 'cloud'],
    },
    {
      id: IDS.cohortMembers.cohort2,
      cohort_code: 'JKKN-COH-2026-002',
      name: 'Vikram Natarajan',
      email: 'vikram.cohort@jkkn.ac.in',
      phone: '+91-9876543402',
      department_id: departmentId,
      institution_id: institutionId,
      level: 'lead',
      track: 'Data Science',
      specializations: ['Python', 'Machine Learning', 'Data Analytics'],
      bio: 'Data science expert with corporate training experience',
      sessions_observed: 3,
      sessions_co_led: 8,
      sessions_led: 15,
      sessions_master: 0,
      total_hours_trained: 150,
      total_participants_trained: 300,
      total_earnings: 75000,
      average_rating: 4.6,
      is_active: true,
      availability_status: 'available',
      tags: ['data', 'python', 'ml'],
    },
    {
      id: IDS.cohortMembers.cohort3,
      cohort_code: 'JKKN-COH-2026-003',
      name: 'Lakshmi Venkatesh',
      email: 'lakshmi.cohort@jkkn.ac.in',
      phone: '+91-9876543403',
      department_id: departmentId,
      institution_id: institutionId,
      level: 'co_lead',
      track: 'Technology',
      specializations: ['React', 'JavaScript', 'Frontend Development'],
      bio: 'Rising trainer specializing in modern frontend technologies',
      sessions_observed: 8,
      sessions_co_led: 5,
      sessions_led: 2,
      sessions_master: 0,
      total_hours_trained: 40,
      total_participants_trained: 80,
      total_earnings: 20000,
      average_rating: 4.4,
      is_active: true,
      availability_status: 'busy',
      tags: ['frontend', 'react', 'javascript'],
    },
  ];

  for (const member of cohortMembers) {
    const exists = await checkExistingData('sh_cohort_members', 'cohort_code', member.cohort_code);
    if (exists) {
      console.log(`  Skipping existing cohort member: ${member.name}`);
      continue;
    }

    const { error } = await supabase.from('sh_cohort_members').insert(member);

    if (error) {
      console.error(`  Error creating cohort member ${member.name}:`, error.message);
    } else {
      console.log(`  Created cohort member: ${member.name}`);
    }
  }
}

async function seedTrainingPrograms() {
  console.log('\n--- Seeding Training Programs ---');

  const programs = [
    {
      id: IDS.trainingPrograms.program1,
      solution_id: IDS.solutions.training1,
      program_code: 'JKKN-TRN-2026-001',
      title: 'Full Stack Development Bootcamp',
      program_type: 'bootcamp',
      track: 'Track A',
      description: 'Comprehensive 12-week bootcamp covering modern web development',
      objectives: [
        'Master React and Next.js',
        'Build backend APIs with Node.js',
        'Deploy applications to cloud',
        'Work on real-world projects',
      ],
      prerequisites: ['Basic programming knowledge', 'Laptop with internet'],
      participant_count: 25,
      max_participants: 30,
      location_preference: 'hybrid',
      venue: 'JKKN Computer Lab',
      start_date: formatDate(addDays(today, -10)),
      end_date: formatDate(addDays(today, 74)),
      total_hours: 240,
      total_sessions: 48,
      price_per_participant: 6000,
      total_price: 150000,
      materials_included: true,
      certification_included: true,
      status: 'in_progress',
      tags: ['bootcamp', 'fullstack', 'intensive'],
      notes: 'YI Chennai batch - Track A program',
    },
    {
      id: IDS.trainingPrograms.program2,
      solution_id: IDS.solutions.training2,
      program_code: 'JKKN-TRN-2026-002',
      title: 'Data Analytics Workshop',
      program_type: 'workshop',
      track: 'Track B',
      description: '3-day intensive workshop on data analytics fundamentals',
      objectives: [
        'Learn Python for data analysis',
        'Master Pandas and NumPy',
        'Create visualizations with Power BI',
        'Analyze real datasets',
      ],
      prerequisites: ['Basic Excel knowledge'],
      participant_count: 15,
      max_participants: 20,
      location_preference: 'on_site',
      venue: 'Global Training Co - Bangalore Office',
      start_date: formatDate(addDays(today, 7)),
      end_date: formatDate(addDays(today, 10)),
      total_hours: 24,
      total_sessions: 6,
      price_per_participant: 10000,
      total_price: 150000,
      materials_included: true,
      certification_included: true,
      status: 'confirmed',
      tags: ['workshop', 'analytics', 'corporate'],
      notes: 'Corporate workshop - Track B program',
    },
  ];

  for (const program of programs) {
    const exists = await checkExistingData('sh_training_programs', 'program_code', program.program_code);
    if (exists) {
      console.log(`  Skipping existing program: ${program.title}`);
      continue;
    }

    const { error } = await supabase.from('sh_training_programs').insert(program);

    if (error) {
      console.error(`  Error creating program ${program.title}:`, error.message);
    } else {
      console.log(`  Created program: ${program.title}`);
    }
  }
}

async function seedTrainingSessions() {
  console.log('\n--- Seeding Training Sessions ---');

  const sessions = [
    // Bootcamp sessions
    {
      id: IDS.trainingSessions.session1,
      program_id: IDS.trainingPrograms.program1,
      session_number: 1,
      title: 'Introduction to Web Development',
      description: 'Overview of modern web development stack and tools',
      topics: ['HTML5', 'CSS3', 'JavaScript basics', 'VS Code setup'],
      session_date: formatDate(addDays(today, -10)),
      start_time: '10:00',
      end_time: '15:00',
      duration_minutes: 300,
      location: 'JKKN Computer Lab',
      room: 'Lab 1',
      is_virtual: false,
      status: 'completed',
      attendance_count: 24,
      max_attendance: 30,
      notes: 'First session completed successfully',
    },
    {
      id: IDS.trainingSessions.session2,
      program_id: IDS.trainingPrograms.program1,
      session_number: 2,
      title: 'React Fundamentals',
      description: 'Introduction to React components, JSX, and state management',
      topics: ['React components', 'JSX syntax', 'Props and state', 'Hooks intro'],
      session_date: formatDate(addDays(today, -3)),
      start_time: '10:00',
      end_time: '15:00',
      duration_minutes: 300,
      location: 'JKKN Computer Lab',
      room: 'Lab 1',
      is_virtual: false,
      status: 'completed',
      attendance_count: 25,
      max_attendance: 30,
      notes: 'Good engagement from participants',
    },
    // Workshop sessions
    {
      id: IDS.trainingSessions.session3,
      program_id: IDS.trainingPrograms.program2,
      session_number: 1,
      title: 'Python for Data Analysis',
      description: 'Python basics and introduction to data analysis libraries',
      topics: ['Python basics', 'Jupyter notebooks', 'Pandas intro', 'NumPy arrays'],
      session_date: formatDate(addDays(today, 7)),
      start_time: '09:00',
      end_time: '17:00',
      duration_minutes: 480,
      location: 'Global Training Co - Bangalore',
      room: 'Training Room A',
      is_virtual: false,
      status: 'scheduled',
      max_attendance: 20,
      notes: 'Day 1 - Foundation',
    },
    {
      id: IDS.trainingSessions.session4,
      program_id: IDS.trainingPrograms.program2,
      session_number: 2,
      title: 'Data Visualization with Power BI',
      description: 'Creating dashboards and reports with Power BI',
      topics: ['Power BI basics', 'Data modeling', 'Creating visuals', 'Dashboard design'],
      session_date: formatDate(addDays(today, 8)),
      start_time: '09:00',
      end_time: '17:00',
      duration_minutes: 480,
      location: 'Global Training Co - Bangalore',
      room: 'Training Room A',
      is_virtual: false,
      status: 'scheduled',
      max_attendance: 20,
      notes: 'Day 2 - Visualization',
    },
  ];

  for (const session of sessions) {
    // Check for existing session
    const { data: existing } = await supabase
      .from('sh_training_sessions')
      .select('id')
      .eq('program_id', session.program_id)
      .eq('session_number', session.session_number)
      .maybeSingle();

    if (existing) {
      console.log(`  Skipping existing session: ${session.title}`);
      continue;
    }

    const { error } = await supabase.from('sh_training_sessions').insert(session);

    if (error) {
      console.error(`  Error creating session ${session.title}:`, error.message);
    } else {
      console.log(`  Created session: ${session.title}`);
    }
  }
}

async function seedCohortAssignments() {
  console.log('\n--- Seeding Cohort Assignments ---');

  const assignments = [
    // Bootcamp assignments
    {
      session_id: IDS.trainingSessions.session1,
      cohort_member_id: IDS.cohortMembers.cohort1,
      role: 'lead',
      status: 'completed',
      earnings: 5000,
      hours_worked: 6,
      rating: 5,
      feedback_from_participants: 'Excellent introduction to web development!',
      completed_at: new Date(addDays(today, -10)).toISOString(),
    },
    {
      session_id: IDS.trainingSessions.session2,
      cohort_member_id: IDS.cohortMembers.cohort1,
      role: 'lead',
      status: 'completed',
      earnings: 5000,
      hours_worked: 6,
      rating: 5,
      feedback_from_participants: 'Great hands-on exercises',
      completed_at: new Date(addDays(today, -3)).toISOString(),
    },
    {
      session_id: IDS.trainingSessions.session2,
      cohort_member_id: IDS.cohortMembers.cohort3,
      role: 'co_lead',
      status: 'completed',
      earnings: 2500,
      hours_worked: 6,
      rating: 4,
      mentor_feedback: 'Good support during practical sessions',
      completed_at: new Date(addDays(today, -3)).toISOString(),
    },
    // Workshop assignments
    {
      session_id: IDS.trainingSessions.session3,
      cohort_member_id: IDS.cohortMembers.cohort2,
      role: 'lead',
      status: 'approved',
      hours_worked: 8,
      earnings: 8000,
      notes: 'Lead trainer for Python session',
    },
    {
      session_id: IDS.trainingSessions.session4,
      cohort_member_id: IDS.cohortMembers.cohort2,
      role: 'lead',
      status: 'approved',
      hours_worked: 8,
      earnings: 8000,
      notes: 'Lead trainer for Power BI session',
    },
  ];

  for (const assignment of assignments) {
    // Check for existing assignment
    const { data: existing } = await supabase
      .from('sh_cohort_assignments')
      .select('id')
      .eq('session_id', assignment.session_id)
      .eq('cohort_member_id', assignment.cohort_member_id)
      .maybeSingle();

    if (existing) {
      console.log(`  Skipping existing cohort assignment`);
      continue;
    }

    const { error } = await supabase.from('sh_cohort_assignments').insert(assignment);

    if (error) {
      console.error(`  Error creating cohort assignment:`, error.message);
    } else {
      console.log(`  Created cohort assignment`);
    }
  }
}

async function seedProductionLearners(departmentId: string | null, institutionId: string | null) {
  console.log('\n--- Seeding Production Learners ---');

  const learners = [
    {
      id: IDS.productionLearners.learner1,
      learner_code: 'JKKN-PRD-2026-001',
      name: 'Sneha Ramesh',
      email: 'sneha.production@jkkn.ac.in',
      phone: '+91-9876543501',
      department_id: departmentId,
      institution_id: institutionId,
      division: 'video',
      skill_level: 'advanced',
      specializations: ['Video Editing', 'Motion Graphics', 'Color Grading'],
      software_tools: ['Adobe Premiere Pro', 'After Effects', 'DaVinci Resolve'],
      bio: 'Professional video editor with experience in corporate and educational content',
      portfolio_url: 'https://sneha.portfolio.example.com',
      orders_completed: 12,
      total_deliverables: 35,
      total_earnings: 85000,
      average_rating: 4.7,
      is_active: true,
      availability_status: 'busy',
      tags: ['video', 'motion', 'corporate'],
    },
    {
      id: IDS.productionLearners.learner2,
      learner_code: 'JKKN-PRD-2026-002',
      name: 'Rahul Menon',
      email: 'rahul.production@jkkn.ac.in',
      phone: '+91-9876543502',
      department_id: departmentId,
      institution_id: institutionId,
      division: 'design',
      skill_level: 'expert',
      specializations: ['Graphic Design', 'Brand Identity', 'Print Design'],
      software_tools: ['Adobe Photoshop', 'Illustrator', 'InDesign', 'Canva'],
      bio: 'Senior graphic designer specializing in educational and corporate branding',
      behance_url: 'https://behance.net/rahulmenon',
      dribbble_url: 'https://dribbble.com/rahulmenon',
      orders_completed: 25,
      total_deliverables: 80,
      total_earnings: 120000,
      average_rating: 4.9,
      is_active: true,
      availability_status: 'available',
      tags: ['design', 'branding', 'print'],
    },
    {
      id: IDS.productionLearners.learner3,
      learner_code: 'JKKN-PRD-2026-003',
      name: 'Divya Krishnan',
      email: 'divya.production@jkkn.ac.in',
      phone: '+91-9876543503',
      department_id: departmentId,
      institution_id: institutionId,
      division: 'social',
      skill_level: 'intermediate',
      specializations: ['Social Media Graphics', 'Reels', 'Stories'],
      software_tools: ['Canva', 'CapCut', 'Adobe Express'],
      bio: 'Social media content specialist with a flair for viral content',
      orders_completed: 8,
      total_deliverables: 40,
      total_earnings: 32000,
      average_rating: 4.5,
      is_active: true,
      availability_status: 'available',
      tags: ['social', 'reels', 'stories'],
    },
  ];

  for (const learner of learners) {
    const exists = await checkExistingData('sh_production_learners', 'learner_code', learner.learner_code);
    if (exists) {
      console.log(`  Skipping existing production learner: ${learner.name}`);
      continue;
    }

    const { error } = await supabase.from('sh_production_learners').insert(learner);

    if (error) {
      console.error(`  Error creating production learner ${learner.name}:`, error.message);
    } else {
      console.log(`  Created production learner: ${learner.name}`);
    }
  }
}

async function seedContentOrders() {
  console.log('\n--- Seeding Content Orders ---');

  const orders = [
    {
      id: IDS.contentOrders.order1,
      solution_id: IDS.solutions.content1,
      order_code: 'JKKN-CNT-2026-001',
      title: 'Corporate Overview Video',
      order_type: 'video',
      division: 'video',
      description: 'Professional 3-minute company overview video with motion graphics',
      requirements: 'Modern, professional look. Use company brand colors. Include executive interviews.',
      quantity: 1,
      duration_minutes: 3,
      format: 'mp4',
      revision_rounds: 3,
      revisions_used: 1,
      due_date: formatDate(addDays(today, 20)),
      priority: 7,
      estimated_hours: 40,
      actual_hours: 15,
      price: 45000,
      status: 'in_progress',
      tags: ['corporate', 'overview', 'professional'],
      notes: 'First draft delivered, waiting for client feedback',
    },
    {
      id: IDS.contentOrders.order2,
      solution_id: IDS.solutions.content2,
      order_code: 'JKKN-CNT-2026-002',
      title: 'University Prospectus 2026',
      order_type: 'document',
      division: 'design',
      description: 'Complete prospectus design with digital and print versions',
      requirements: 'Follow JKKN brand guidelines. Include all programs, facilities, and achievements.',
      brand_guidelines_url: 'https://drive.google.com/jkkn-brand-guidelines',
      quantity: 1,
      dimensions: 'A4',
      format: 'pdf',
      revision_rounds: 2,
      revisions_used: 0,
      due_date: formatDate(addDays(today, 30)),
      priority: 8,
      estimated_hours: 60,
      price: 35000,
      status: 'assigned',
      tags: ['prospectus', 'print', 'education'],
      notes: 'High priority - needed for admission season',
    },
  ];

  for (const order of orders) {
    const exists = await checkExistingData('sh_content_orders', 'order_code', order.order_code);
    if (exists) {
      console.log(`  Skipping existing order: ${order.title}`);
      continue;
    }

    const { error } = await supabase.from('sh_content_orders').insert(order);

    if (error) {
      console.error(`  Error creating order ${order.title}:`, error.message);
    } else {
      console.log(`  Created order: ${order.title}`);
    }
  }
}

async function seedContentDeliverables() {
  console.log('\n--- Seeding Content Deliverables ---');

  const deliverables = [
    {
      id: IDS.deliverables.deliverable1,
      order_id: IDS.contentOrders.order1,
      deliverable_number: 1,
      title: 'Corporate Overview Video - Main',
      description: '3-minute corporate overview video',
      status: 'in_progress',
      revision_count: 1,
      current_revision_notes: 'Client requested more focus on innovation section',
      notes: 'First revision in progress',
    },
    {
      id: IDS.deliverables.deliverable2,
      order_id: IDS.contentOrders.order2,
      deliverable_number: 1,
      title: 'Prospectus - Print Version',
      description: 'High-resolution print-ready prospectus',
      status: 'pending',
      notes: 'Waiting for content finalization',
    },
    {
      id: IDS.deliverables.deliverable3,
      order_id: IDS.contentOrders.order2,
      deliverable_number: 2,
      title: 'Prospectus - Digital Version',
      description: 'Interactive digital prospectus with hyperlinks',
      status: 'pending',
      notes: 'To be created after print version',
    },
  ];

  for (const deliverable of deliverables) {
    // Check for existing deliverable
    const { data: existing } = await supabase
      .from('sh_content_deliverables')
      .select('id')
      .eq('order_id', deliverable.order_id)
      .eq('deliverable_number', deliverable.deliverable_number)
      .maybeSingle();

    if (existing) {
      console.log(`  Skipping existing deliverable: ${deliverable.title}`);
      continue;
    }

    const { error } = await supabase.from('sh_content_deliverables').insert(deliverable);

    if (error) {
      console.error(`  Error creating deliverable ${deliverable.title}:`, error.message);
    } else {
      console.log(`  Created deliverable: ${deliverable.title}`);
    }
  }
}

async function seedProductionAssignments() {
  console.log('\n--- Seeding Production Assignments ---');

  const assignments = [
    {
      deliverable_id: IDS.deliverables.deliverable1,
      learner_id: IDS.productionLearners.learner1,
      role: 'creator',
      status: 'active',
      estimated_hours: 40,
      actual_hours: 15,
      earnings: 20000,
      started_at: new Date(addDays(today, -5)).toISOString(),
      notes: 'Working on first revision',
    },
    {
      deliverable_id: IDS.deliverables.deliverable2,
      learner_id: IDS.productionLearners.learner2,
      role: 'creator',
      status: 'approved',
      estimated_hours: 40,
      earnings: 22000,
      notes: 'Assignment approved, starting soon',
    },
    {
      deliverable_id: IDS.deliverables.deliverable3,
      learner_id: IDS.productionLearners.learner2,
      role: 'creator',
      status: 'requested',
      estimated_hours: 20,
      earnings: 10000,
      notes: 'Pending after print version completion',
    },
  ];

  for (const assignment of assignments) {
    // Check for existing assignment
    const { data: existing } = await supabase
      .from('sh_production_assignments')
      .select('id')
      .eq('deliverable_id', assignment.deliverable_id)
      .eq('learner_id', assignment.learner_id)
      .maybeSingle();

    if (existing) {
      console.log(`  Skipping existing production assignment`);
      continue;
    }

    const { error } = await supabase.from('sh_production_assignments').insert(assignment);

    if (error) {
      console.error(`  Error creating production assignment:`, error.message);
    } else {
      console.log(`  Created production assignment`);
    }
  }
}

// ===== MAIN FUNCTION =====

async function main() {
  console.log('========================================');
  console.log('  Solutions Hub Seed Script');
  console.log('========================================');
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Date: ${formatDate(today)}`);

  try {
    // Get existing references
    const departmentId = await getExistingDepartment();
    const institutionId = await getExistingInstitution();

    console.log(`\nDepartment ID: ${departmentId || 'NULL'}`);
    console.log(`Institution ID: ${institutionId || 'NULL'}`);

    // Seed in dependency order
    await seedClients(departmentId);
    await seedSolutions(departmentId, institutionId);
    await seedPhases(departmentId);
    await seedBuilders(departmentId, institutionId);
    await seedBuilderSkills();
    await seedBuilderAssignments();
    await seedCohortMembers(departmentId, institutionId);
    await seedTrainingPrograms();
    await seedTrainingSessions();
    await seedCohortAssignments();
    await seedProductionLearners(departmentId, institutionId);
    await seedContentOrders();
    await seedContentDeliverables();
    await seedProductionAssignments();

    console.log('\n========================================');
    console.log('  Seed Complete!');
    console.log('========================================');
    console.log('\nSummary:');
    console.log('  - 5 Clients');
    console.log('  - 6 Solutions (2 Software, 2 Training, 2 Content)');
    console.log('  - 5 Solution Phases');
    console.log('  - 3 Builders with 9 skills and 3 assignments');
    console.log('  - 3 Cohort Members with 5 assignments');
    console.log('  - 2 Training Programs with 4 sessions');
    console.log('  - 3 Production Learners with 3 assignments');
    console.log('  - 2 Content Orders with 3 deliverables');

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main();
