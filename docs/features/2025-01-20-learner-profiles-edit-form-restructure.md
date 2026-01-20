# Learner Profiles Edit Form Restructuring

**Created:** 2025-01-20
**Purpose:** Restructure learner profiles edit form to match enquiry form structure

---

## Overview

The learner profiles edit form needs to be restructured to match the enquiry form's comprehensive structure with all fields and better organization.

## Current Structure (Learners Profiles Edit Form)

**Tabs:**
1. Personal - Basic info, family details
2. Academic - Institution, degree, academic details
3. Contact - Address fields
4. Qualifications - School, board, entry type
5. Other - Accommodation, application details

**Total Fields:** ~45 fields

## Target Structure (Enquiry Form)

**Tabs:**
1. Basic Details - Personal info, family details
2. Academic Information - School details, marks breakdown, counseling
3. Course Selection - Institution, degree, program details
4. Contact Details - Address with cascading dropdowns
5. Accommodation Preferences - Hostel, transport, reference details

**Total Fields:** ~80+ fields

---

## Changes Required

### 1. Tab Restructuring

| Old Tab | New Tab | Changes |
|---------|---------|---------|
| Personal | Basic Details | Add: enquiry_date, admission_year, student_photo_url |
| Academic + Qualifications | Academic Information | Add: 10th marks details, 12th marks details, NEET scores, cutoff marks, counseling details, scholarship type |
| Academic | Course Selection | Reorganize: quota, category, all program selection fields |
| Contact | Contact Details | Change: Replace text inputs with cascading combobox for state/district/taluk |
| Other | Accommodation Preferences | Add: hostel_type, food_type, bus_required, bus_route, bus_pickup_location, reference_type, reference_name, reference_contact |

### 2. New Fields to Add

#### Basic Details
- `enquiry_date` - Date (read-only)
- `admission_year` - Number
- `student_photo_url` - String (file upload)

#### Academic Information
- `tenth_marks` - Object with:
  - `max_marks` - String
  - `obtained_marks` - String
  - `percentage` - String
- `twelfth_marks` - Object with:
  - `group` - Enum (SCIENCE_BIOLOGY, SCIENCE_COMPUTER, SCIENCE_MATHS, COMMERCE, ARTS)
  - `max_marks` - String
  - `obtained_marks` - String
  - `percentage` - String
  - `subjects` - Object with subject-specific marks
- `neet_roll_number` - String
- `neet_score` - String
- `medical_cutoff_marks` - String
- `engineering_cutoff_marks` - String
- `counseling_applied` - Boolean
- `counseling_number` - String (conditional on counseling_applied)
- `scholarship_type` - Enum

#### Course Selection
- `quota` - Enum
- `category` - Enum

#### Contact Details
- `permanent_address_street` - String
- `permanent_address_state` - String (ID from states list)
- `permanent_address_district` - String (ID from districts list)
- `permanent_address_taluk` - String (ID from taluks list)
- `permanent_address_pin_code` - String (6 digits)
- `student_mobile` - String
- `student_email` - String

#### Accommodation Preferences
- `accommodation_type` - Enum (HOSTEL/DAY SCHOLAR/HOME)
- `hostel_type` - Enum (AC HOSTEL/NON-AC HOSTEL) - conditional
- `food_type` - Enum (VEG/NON-VEG) - conditional
- `bus_required` - Boolean - conditional
- `bus_route` - Enum - conditional
- `bus_pickup_location` - Enum - conditional
- `reference_type` - Enum
- `reference_name` - String
- `reference_contact` - String

### 3. Field Updates

#### Existing Fields to Update
- `gender` - Change to Radio Group
- `accommodation_type` - Change to Radio Group
- `permanent_address` - Split into street/state/district/taluk/pincode with cascading dropdowns
- `entry_type` - Already updated to dropdown

---

## Implementation Plan

### Phase 1: Schema Updates
1. Add all new fields to `editLearnerSchema` in page.tsx
2. Update existing fields with proper validation

### Phase 2: Component Structure
1. Create `form-sections` directory under `learners/profiles/_components/`
2. Create separate section components:
   - `basic-details.tsx`
   - `academic-information.tsx`
   - `course-selection.tsx`
   - `contact-details.tsx`
   - `accommodation-preferences.tsx`

### Phase 3: Tab Implementation
1. Update tab structure in page.tsx
2. Import and use section components
3. Implement conditional field rendering

### Phase 4: Data Loading
1. Update fetchLearner to load all data
2. Update form.reset() with all fields
3. Update DTO mapping for submission

### Phase 5: Cascading Dropdowns
1. Import location data helpers
2. Implement state → district → taluk cascading logic
3. Add combobox components for searchable dropdowns

### Phase 6: Testing
1. Test all field validations
2. Test cascading dropdown logic
3. Test form submission
4. Test with existing learner data

---

## Benefits

1. **Consistency** - Matches enquiry form structure exactly
2. **Completeness** - All fields from database are editable
3. **User Experience** - Better organization with logical grouping
4. **Data Quality** - Cascading dropdowns reduce input errors
5. **Maintainability** - Separated section components are easier to maintain

---

## Migration Notes

- Existing learner records may not have values for new fields
- All new fields should be optional in schema
- Form should handle missing data gracefully
- Database schema already supports all these fields (from learners_profiles table)

---

**Status:** Planning Complete
**Next Step:** Begin Phase 1 - Schema Updates
