'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Student } from '@/types/student';
import {
  User,
  BookOpen,
  Phone,
  Home,
  Users,
  GraduationCap,
  Bus,
  Info
} from 'lucide-react';

interface LearnerProfileDetailsProps {
  student: Student;
}

const DetailRow = ({
  label,
  value
}: {
  label: string;
  value: string | undefined | null | boolean | number;
}) => {
  if (value === null || value === undefined || value === '') return null;
  const displayValue =
    typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className='grid grid-cols-2 items-center gap-4 py-3 px-4'>
      <p className='text-sm font-medium text-gray-500'>{label}</p>
      <p className='text-sm text-gray-900 justify-self-start'>{displayValue}</p>
    </div>
  );
};

const MarksDetail = ({
  title,
  marks
}: {
  title: string;
  marks:
    | { max_marks: string; obtained_marks: string; percentage: string }
    | undefined
    | null;
}) => {
  if (!marks) return null;
  return (
    <div className='pt-2 px-4'>
      <h4 className='font-semibold text-gray-700'>{title}</h4>
      <div className='pl-4 border-l-2 border-primary/20 space-y-1 divide-y'>
        <DetailRow label='Max Marks' value={marks.max_marks} />
        <DetailRow label='Obtained Marks' value={marks.obtained_marks} />
        <DetailRow label='Percentage' value={`${marks.percentage}%`} />
      </div>
    </div>
  );
};

export function LearnerProfileDetails({ student }: LearnerProfileDetailsProps) {
  // Ensure marks are parsed if they are strings
  const tenthMarks =
    typeof student.tenth_marks === 'string'
      ? JSON.parse(student.tenth_marks)
      : student.tenth_marks;
  const twelfthMarks =
    typeof student.twelfth_marks === 'string'
      ? JSON.parse(student.twelfth_marks)
      : student.twelfth_marks;

  return (
    <div className='space-y-4'>
      <Accordion
        type='multiple'
        defaultValue={['personal-info', 'academic-info']}
        className='w-full'
      >
        {/* Personal Information */}
        <AccordionItem
          value='personal-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <User className='h-5 w-5 text-primary' />
              Personal Information
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='divide-y'>
              <DetailRow label='Date of Birth' value={student.date_of_birth} />
              <DetailRow label='Gender' value={student.gender} />
              <DetailRow label='Religion' value={student.religion} />
              <DetailRow label='Community' value={student.community} />
              <DetailRow label='Caste' value={student.caste} />
              <DetailRow label='Annual Income' value={student.annual_income} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Academic Information */}
        <AccordionItem
          value='academic-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <BookOpen className='h-5 w-5 text-primary' />
              Academic Information
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='divide-y'>
              <DetailRow
                label='Institution'
                value={student.institution?.name}
              />
              <DetailRow label='Degree' value={student.degree?.degree_name} />
              <DetailRow
                label='Program'
                value={student.program?.program_name}
              />
              <DetailRow
                label='Department'
                value={student.department?.department_name}
              />
              <DetailRow
                label='Semester'
                value={student.semester?.semester_name}
              />
              <DetailRow
                label='Section'
                value={student.section?.section_name}
              />
              <DetailRow
                label='Academic Year'
                value={student.academic_year?.academic_year_name}
              />
              <DetailRow label='Entry Type' value={student.entry_type} />
              <DetailRow label='Admission Quota' value={student.quota} />
              <DetailRow label='Admission Category' value={student.category} />
              <DetailRow label='Status' value={student.status} />
              <DetailRow
                label='Profile Complete'
                value={student.is_profile_complete}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Previous Qualifications */}
        <AccordionItem
          value='prev-qualifications'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <GraduationCap className='h-5 w-5 text-primary' />
              Previous Qualifications
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='space-y-4 divide-y'>
              <div className='pt-4'>
                <DetailRow label='Last School' value={student.last_school} />
                <DetailRow
                  label='Board of Study'
                  value={student.board_of_study}
                />
              </div>
              <MarksDetail title='10th Marks' marks={tenthMarks} />
              <div className='space-y-4 pt-4'>
                <MarksDetail title='12th Marks' marks={twelfthMarks} />
                {twelfthMarks?.group && (
                  <DetailRow label='12th Group' value={twelfthMarks.group} />
                )}
              </div>
              <div className='space-y-2 pt-4'>
                <DetailRow
                  label='Medical Cutoff'
                  value={student.medical_cutoff_marks}
                />
                <DetailRow
                  label='Engineering Cutoff'
                  value={student.engineering_cutoff_marks}
                />
                <DetailRow
                  label='NEET Roll No.'
                  value={student.neet_roll_number}
                />
                <DetailRow
                  label='Applied for Counseling'
                  value={student.counseling_applied}
                />
                <DetailRow
                  label='Counseling Number'
                  value={student.counseling_number}
                />
                <DetailRow
                  label='First Graduate'
                  value={student.first_graduate}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Contact Information */}
        <AccordionItem
          value='contact-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <Phone className='h-5 w-5 text-primary' />
              Contact Information
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='divide-y'>
              <DetailRow label='Mobile' value={student.student_mobile} />
              <DetailRow label='Email' value={student.student_email} />
              <DetailRow label='College Email' value={student.college_email} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Address */}
        <AccordionItem
          value='address-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <Home className='h-5 w-5 text-primary' />
              Address
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='divide-y'>
              <DetailRow
                label='Street'
                value={student.permanent_address_street}
              />
              <DetailRow
                label='Taluk'
                value={student.permanent_address_taluk}
              />
              <DetailRow
                label='District'
                value={student.permanent_address_district}
              />
              <DetailRow
                label='State'
                value={student.permanent_address_state}
              />
              <DetailRow
                label='PIN Code'
                value={student.permanent_address_pin_code}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Accommodation */}
        <AccordionItem
          value='accommodation-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <Bus className='h-5 w-5 text-primary' />
              Accommodation & Transport
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='divide-y'>
              <DetailRow
                label='Accommodation'
                value={student.accommodation_type}
              />
              <DetailRow label='Hostel Type' value={student.hostel_type} />
              <DetailRow label='Bus Required' value={student.bus_required} />
              <DetailRow label='Bus Route' value={student.bus_route} />
              <DetailRow
                label='Bus Pickup Point'
                value={student.bus_pickup_location}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Parent Information */}
        <AccordionItem
          value='parent-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <Users className='h-5 w-5 text-primary' />
              Parent Information
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='space-y-4 pt-2 px-4'>
              <h4 className='font-semibold text-gray-700'>
                Father&apos;s Details
              </h4>
              <div className='pl-4 border-l-2 border-primary/20 space-y-1 divide-y'>
                <DetailRow label='Name' value={student.father_name} />
                <DetailRow
                  label='Occupation'
                  value={student.father_occupation}
                />
                <DetailRow label='Mobile' value={student.father_mobile} />
              </div>
              <h4 className='font-semibold text-gray-700 pt-4'>
                Mother&apos;s Details
              </h4>
              <div className='pl-4 border-l-2 border-primary/20 space-y-1 divide-y'>
                <DetailRow label='Name' value={student.mother_name} />
                <DetailRow
                  label='Occupation'
                  value={student.mother_occupation}
                />
                <DetailRow label='Mobile' value={student.mother_mobile} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Other Information */}
        <AccordionItem
          value='other-info'
          className='bg-white rounded-lg shadow-sm'
        >
          <AccordionTrigger className='text-base font-semibold px-4 hover:no-underline'>
            <div className='flex items-center gap-3'>
              <Info className='h-5 w-5 text-primary' />
              Other Information
            </div>
          </AccordionTrigger>
          <AccordionContent className='pt-0'>
            <div className='divide-y'>
              <DetailRow
                label='Reference Type'
                value={student.reference_type}
              />
              <DetailRow
                label='Reference Name'
                value={student.reference_name}
              />
              <DetailRow
                label='Reference Contact'
                value={student.reference_contact}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
