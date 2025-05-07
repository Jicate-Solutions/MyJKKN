# PRD: Timetable Management Module

## 1. Introduction & Overview

The Timetable Management module is designed to provide a comprehensive solution for creating, managing, and viewing academic timetables. It will allow administrators to dynamically build timetables for various academic programs, incorporating periods, courses, and staff assignments. The module will also support timetable templates for efficient reuse and advanced features to handle breaks, and ensure a user-friendly experience. This module will integrate with existing systems like Organization Management, Course Management, and Staff Planning to fetch necessary data.

## 2. Goals & Objectives

- To enable administrators to easily create and manage academic timetables.
- To provide a clear and accessible view of timetables for students and staff.
- To support dynamic scheduling of periods, courses, and staff.
- To allow the creation and reuse of timetable templates to save time and effort.
- To incorporate breaks (e.g., lunch, tea breaks) into the timetable.
- To ensure conflict-free scheduling where possible (advanced feature).
- To provide a responsive and intuitive user interface.

## 3. Target Audience

- **Administrators:** Users responsible for creating, updating, and managing timetables.
- **Staff/Faculty:** Users who need to view their assigned schedules and teaching duties.
- **Students:** Users who need to view their course schedules.

## 4. User Stories / Requirements

### 4.1. Period Management (Prerequisite Module/Feature)

- **U-PM-001:** As an Administrator, I want to define academic periods with a name, start time, and end time, so that these can be used in timetable creation.
  - **Fields:**
    - `period_id` (UUID, Primary Key)
    - `period_name` (TEXT, e.g., "Period 1", "Morning Session 1") - Mandatory
    - `start_time` (TIME) - Mandatory
    - `end_time` (TIME) - Mandatory
    - `is_break` (BOOLEAN, default: FALSE) - _To identify if this period is a break (e.g., Lunch, Tea Break)_
    - `created_at` (TIMESTAMPTZ)
    - `updated_at` (TIMESTAMPTZ)
  - **Acceptance Criteria:**
    - Periods must have unique names.
    - Start time must be before end time.
    - CRUD operations (Create, Read, Update, Delete) for periods.

### 4.2. Timetable Creation & Management

- **U-TC-001:** As an Administrator, I want to select the context (Institution, Degree, Program, Department, Semester, Section, Academic Year) for which I am creating a timetable, so that the timetable is specific and accurate.

  - **Dropdown Fields (Data fetched from respective existing modules):**
    1.  Institution (from Organization Management)
    2.  Degree
    3.  Program
    4.  Department (from Organization Management)
    5.  Semester
    6.  Section
    7.  Academic Year (from `academic_years` table)
  - **Acceptance Criteria:**
    - All dropdowns must be populated with relevant data from the system.
    - Selections should cascade where appropriate (e.g., Programs filter by selected Degree).

- **U-TC-002:** As an Administrator, I want to view a dynamic timetable grid with days (Monday - Sunday) on the Y-axis and periods on the X-axis, so that I can assign courses and staff to specific time slots.

  - **Acceptance Criteria:**
    - The grid should clearly display days of the week.
    - Periods (from Period Management) should be displayed as columns.

- **U-TC-003:** As an Administrator, I want to dynamically add or remove period columns in the timetable grid during creation, so that I can customize the number of periods per day for a specific timetable.

  - **Acceptance Criteria:**
    - An option to "Add Period Column" should be available.
    - An option to "Remove Period Column" should be available for unassigned period columns.

- **U-TC-004:** As an Administrator, I want to designate specific time slots as "Break Time" or "Lunch Time" within the timetable grid, so that non-academic activities are clearly marked.

  - **Acceptance Criteria:**
    - Ability to select a period slot and mark it as a specific type of break (e.g., using pre-defined 'break' periods from Period Management).
    - Break slots should be visually distinct in the timetable.

- **U-TC-005:** As an Administrator, I want to select a course from the "Course Mapping" module and assign it to a specific day/period slot in the timetable.

  - **Acceptance Criteria:**
    - When a cell (day/period slot) is selected, a modal or dropdown should allow course selection.
    - Courses available for selection should be relevant to the selected Program/Department/Semester.

- **U-TC-006:** As an Administrator, I want to select staff from the "Staff Planning" module (filtered by the selected course) and assign them to a course in a specific day/period slot.

  - **Acceptance Criteria:**
    - After a course is assigned to a slot, the system should allow staff selection.
    - The list of staff should be filtered based on those qualified or planned to teach the selected course (from Staff Planning).
    - Multiple staff can be assigned if team-teaching is a feature.

- **U-TC-007:** As an Administrator, I want to save a created timetable with a unique name or identifier.

  - **Fields (Timetable Header):**
    - `timetable_id` (UUID, Primary Key)
    - `institution_id` (UUID, FK)
    - `degree_id` (UUID, FK)
    - `program_id` (UUID, FK)
    - `department_id` (UUID, FK)
    - `semester` (INT or TEXT)
    - `section` (TEXT)
    - `academic_year_id` (UUID, FK to `academic_years`)
    - `timetable_name` (TEXT, e.g., "CSE Sem 3 Section A Timetable 2024-2025")
    - `version` (INT, default: 1)
    - `is_active` (BOOLEAN, default: TRUE)
    - `created_at` (TIMESTAMPTZ)
    - `updated_at` (TIMESTAMPTZ)
    - `created_by` (UUID, FK to `users`)
  - **Fields (Timetable Slots/Entries):**
    - `timetable_slot_id` (UUID, Primary Key)
    - `timetable_id` (UUID, FK to `timetables`)
    - `day_of_week` (ENUM: MON, TUE, WED, THU, FRI, SAT, SUN)
    - `period_id` (UUID, FK to `periods`)
    - `course_id` (UUID, FK to `courses`, optional if it's a break)
    - `staff_id` (UUID, FK to `staff`, optional if it's a break or unassigned)
    - `room_id` (UUID, FK to `rooms`, optional, for future room allocation)
    - `is_break_slot` (BOOLEAN, default: FALSE)
    - `break_description` (TEXT, e.g., "Lunch", optional)

- **U-TC-008:** As an Administrator, I want to edit an existing timetable.
- **U-TC-009:** As an Administrator, I want to delete a timetable (soft delete preferred).
- **U-TC-010:** As an Administrator, I want to view a list of all created timetables with filtering and sorting options.

### 4.3. Timetable Templates

- **U-TT-001:** As an Administrator, I want to save a completed timetable as a "template" with a unique template name, so that I can reuse it later.

  - **Acceptance Criteria:**
    - Option to "Save as Template" when viewing/editing a timetable.
    - Templates should store the structure, period configurations, and break slots, but course/staff assignments might be optional to include or cleared.

- **U-TT-002:** As an Administrator, I want to create a new timetable by selecting an existing template, so that I don't have to build it from scratch.

  - **Acceptance Criteria:**
    - When creating a new timetable, an option to "Use Template" should be available.
    - Selecting a template should pre-fill the timetable grid structure. The user can then make modifications and assign specific courses/staff for the new context (Academic Year, Section, etc.).

- **U-TT-003:** As an Administrator, I want to manage (view, update, delete) timetable templates.

### 4.4. Timetable Viewing

- **U-TV-001:** As a Staff member, I want to view my personal timetable, showing all courses I am assigned to teach, along with dates, times, and locations (if applicable).
- **U-TV-002:** As a Student, I want to view the timetable for my registered courses/program/section, showing subjects, timings, and assigned staff.
- **U-TV-003:** As any User (with appropriate permissions), I want to view the timetable for a specific Program/Department/Semester/Section.
- **U-TV-004:** As a User, I want the timetable display to be clear, easy to read, and responsive across different devices (desktop, tablet, mobile).
- **U-TV-005:** As a User, I want to be able to print or export the timetable (e.g., to PDF, ICS). (Advanced Feature)

### 4.5. Advanced Features

- **U-AF-001:** As an Administrator, the system should provide warnings or prevent assignments that result in staff clashes (staff assigned to two different classes at the same time).
- **U-AF-002:** As an Administrator, the system should provide warnings or prevent assignments that result in student group/section clashes (a section having two different courses scheduled at the same time).
- **U-AF-003:** As an Administrator, the system should check for staff availability (e.g., leave, non-teaching days) before confirming an assignment (requires integration with staff availability module).
- **U-AF-004:** As an Administrator, I want an option for "auto-fill" or "suggest" staff for a course based on expertise or previous assignments (requires more data and logic).
- **U-AF-005:** As an Administrator, I want to define recurring breaks (e.g., a 15-min tea break after every two periods) that can be automatically applied to timetable templates or new timetables.
- **U-AF-006:** As an Administrator, I want to define rules like maximum consecutive teaching hours for a staff member, or minimum break times.

## 5. Data Model (High-Level)

(Referencing Supabase schema conventions from `supabase/academic-management.sql` and general project rules)

- **`periods` Table:** (As defined in 4.1)

  - `id` (UUID, PK)
  - `period_name` (TEXT)
  - `start_time` (TIME)
  - `end_time` (TIME)
  - `is_break` (BOOLEAN)
  - `created_at`, `updated_at`

- **`timetables` Table:** (As defined in 4.2, U-TC-007)

  - `id` (UUID, PK)
  - `institution_id` (UUID, FK)
  - `academic_year_id` (UUID, FK)
  - `degree_id` (UUID, FK)
  - `program_id` (UUID, FK)
  - `department_id` (UUID, FK)
  - `semester` (INT or TEXT)
  - `section` (TEXT)
  - `timetable_name` (TEXT)
  - `version` (INT)
  - `is_active` (BOOLEAN)
  - `is_template` (BOOLEAN, default: FALSE) - _To distinguish templates_
  - `template_name` (TEXT, nullable) - _If `is_template` is TRUE_
  - `created_by` (UUID, FK to `auth.users`)
  - `created_at`, `updated_at`

- **`timetable_slots` Table:** (As defined in 4.2, U-TC-007)

  - `id` (UUID, PK)
  - `timetable_id` (UUID, FK to `timetables`)
  - `day_of_week` (ENUM: 'MONDAY', 'TUESDAY', ..., 'SUNDAY')
  - `period_id` (UUID, FK to `periods`)
  - `course_id` (UUID, FK to `courses`, nullable)
  - `staff_id` (UUID, FK to `staff` or `users` table representing staff, nullable)
  - `room_id` (UUID, FK to `rooms` table, nullable) - _For future room allocation_
  - `is_break_slot` (BOOLEAN, default: FALSE)
  - `break_description` (TEXT, nullable)
  - `created_at`, `updated_at`
  - `UNIQUE (timetable_id, day_of_week, period_id)` - _Ensures one entry per slot in a timetable_

- **RLS Policies:**
  - Standard RLS policies will be applied as per project guidelines.
  - Administrators (with a specific role) will have CUD permissions on timetables and periods.
  - Authenticated users will have Read access to relevant timetables based on their role and associations (e.g., their program, their teaching assignments).

## 6. User Interface (UI) / User Experience (UX) Considerations

- **Dashboard:** A central dashboard for administrators to manage timetables and templates.
- **Timetable Grid:**
  - A visually intuitive drag-and-drop interface (if feasible, otherwise click-to-assign) for assigning courses/staff to slots.
  - Clear visual distinction for regular classes, breaks, and unassigned slots.
  - Dynamic addition/removal of period columns should be seamless.
  - Hover-over tooltips to show full details of a slot (course name, staff name, time).
- **Forms:** Clean and well-structured forms for creating/editing periods and timetable metadata. Dropdowns should utilize search/filter capabilities for long lists.
- **Responsiveness:** All views should be responsive and accessible on various screen sizes.
- **Loading & Error States:** Implement loading indicators for data fetching and clear error messages as per project standards.
- **Accessibility:** Adhere to accessibility best practices (ARIA attributes, keyboard navigation).
- **Dark Mode:** Support for dark mode.

## 7. Technical Considerations & Dependencies

- **Frontend:** Next.js 15, React, TypeScript, TailwindCSS.
- **State Management:** React Query for server state, Zustand or React Context for UI state if needed.
- **Backend/Database:** Supabase (PostgreSQL).
- **API:** RESTful or GraphQL APIs (via Supabase or Next.js API routes) for CRUD operations.
- **Validation:** Zod for input validation on client and server.
- **Dependencies on other modules:**
  - **Organization Management:** For Institution, Department data.
  - **Academic Management:** For Academic Year, Degree, Program, Semester, Section data.
  - **Course Management / Course Mapping:** For course details.
  - **Staff Management / Staff Planning:** For staff details and their availability/course mappings.
  - **User Management/Authentication:** For user roles and permissions.
- **Performance:** Efficient querying of timetable data, especially for display. Lazy loading of components where applicable.

## 8. Non-Functional Requirements

- **Security:** RLS in Supabase must be strictly enforced. All inputs validated.
- **Performance:** Timetable views should load quickly. Operations like saving a timetable should be performant.
- **Scalability:** The system should handle a growing number of timetables and users.
- **Maintainability:** Code should be well-structured, commented, and follow project guidelines.
- **Reliability:** Timetables should be accurate and consistently available.

## 9. Future Enhancements

- **Room Allocation:** Integration with a room management system to assign classrooms to timetable slots.
- **Automated Timetable Generation:** Algorithmic generation of timetables based on constraints (staff availability, room capacity, student preferences).
- **Conflict Resolution Wizard:** A tool to help administrators identify and resolve scheduling conflicts.
- **Notifications:** Automated notifications to staff/students about timetable changes.
- **Integration with Calendar Apps:** Export to iCalendar (.ics) format or direct integration.
- **Resource Booking for Slots:** Linking specific resources (e.g., lab equipment) to timetable slots.
- **Substitution Management:** Handling temporary staff substitutions.

## 10. Out of Scope (Initial Release)

- Fully automated timetable generation.
- Student self-registration directly impacting timetable slots.
- Budgeting or financial aspects related to timetabling.
- Advanced analytics and reporting beyond basic views.
