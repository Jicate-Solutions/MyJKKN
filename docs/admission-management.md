Below is an updated **Development Documentation** for your **Admission Management** module. It incorporates the **dynamic logic** and **auto-calculation** requirements you specified, while retaining the overall structure and clarity needed for both developers and stakeholders.

---

# Admission Management Development Documentation

## 1. Overview

The **Admission Management** module collects detailed information about applicants, verifies their eligibility, and streamlines the admissions process. This includes **Basic Details**, **Academic Information**, **Course Selections**, **Contact Details**, and **Additional (Accommodation) Preferences**.

### Key Features & Logic Highlights

1. **Age Restriction**  
   Applicants must be **15 years or older** to select a valid Date of Birth.
2. **Auto-Calculated Fields**
   - **10th Standard Marks**: Automatic calculation of percentage based on obtained marks.
   - **12th Standard Marks**: Automatic calculation of percentage and display of relevant subject fields based on the chosen **Group/Stream**.
   - **Medical / Engineering Cutoff**: Automatic calculation based on selected **Group/Stream** and subject-wise marks.
3. **Dynamic Field Visibility**
   - **Course Selection**: Display available programs based on the **College Name** and corresponding admission **Year & Entry Type**.
   - **Accommodation Preferences**: Show **Hostel Type** if the applicant is opting for a hostel; or show **Bus Facility** and subsequent route/pickup fields if the applicant is a day scholar.

---

## 2. Form Structure

The **Admission Form** is organized into **5 main sections**:

1. **Basic Details**
2. **Academic Information**
3. **Course Selection**
4. **Contact Details**
5. **Accommodation Preferences**

This structure ensures logical data collection and easier navigation for both applicants and admission officers.

---

## 3. Key Fields & Data Structure

### 3.1. Basic Details

| Field Name           | Description                                                   | Data Type   | Notes/Validations                                                                           |
| -------------------- | ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| **enquiryDate**      | Date of application submission                                | Date        | Must be a valid date (system defaults to current date)                                      |
| **studentName**      | Full name of the applicant                                    | String (50) | Mandatory                                                                                   |
| **fatherName**       | Full name of the father                                       | String (50) | Mandatory                                                                                   |
| **fatherOccupation** | Father’s occupation                                           | String (50) | Optional/Required (per policy)                                                              |
| **fatherMobile**     | Father’s 10-digit mobile number                               | String (10) | Must be exactly 10 digits                                                                   |
| **motherName**       | Full name of the mother                                       | String (50) | Mandatory                                                                                   |
| **motherOccupation** | Mother’s occupation                                           | String (50) | Optional/Required (per policy)                                                              |
| **motherMobile**     | Mother’s 10-digit mobile number                               | String (10) | Must be exactly 10 digits                                                                   |
| **dateOfBirth**      | Applicant’s date of birth                                     | Date        | **Must be at least 15 years before the current date** (disable dates younger than 15 years) |
| **gender**           | "Male" or "Female"                                            | Enum        | Mandatory                                                                                   |
| **religion**         | Religion ("Hindu", "Christian", "Muslim", "Others")           | Enum        | Mandatory                                                                                   |
| **community**        | Caste category (OC, BC, BCM, MBC, DNC, BC-CC, SC, ST, SC (A)) | Enum        | Mandatory                                                                                   |
| **caste**            | Specific caste within community                               | String (50) | Optional, or required if community is set                                                   |
| **annualIncome**     | Family’s annual income                                        | Number      | Optional/Mandatory based on policy                                                          |

#### Validation / UX Note

- **dateOfBirth**: Date picker should not allow selection of a date that makes the applicant younger than 15 years.

---

### 3.2. Academic Information

This section records **previous academic performance** and is also responsible for **auto-calculations** of percentages and cutoffs.

| Field Name                    | Description                                                      | Data Type        | Notes/Validations                                                                            |
| ----------------------------- | ---------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **lastSchool**                | Name of the previous school/college                              | String (100)     | Mandatory                                                                                    |
| **boardOfStudy**              | Board of study ("State Board", "CBSE", "ICSE", "Others")         | Enum             | Mandatory; restricted to listed values                                                       |
| **tenthMarks**                | Object containing Class 10 academic records                      | Object           | System auto-calculates the percentage. Sub-fields: `maxMarks`, `obtainedMarks`, `percentage` |
| &nbsp;&nbsp;→ `maxMarks`      | Maximum possible marks in Class 10                               | Number (Integer) | Non-negative                                                                                 |
| &nbsp;&nbsp;→ `obtainedMarks` | Marks obtained in Class 10                                       | Number (Integer) | Must be <= `maxMarks`                                                                        |
| &nbsp;&nbsp;→ `percentage`    | Percentage scored in Class 10                                    | Number (Float)   | **Auto-calc** = `(obtainedMarks / maxMarks) x 100`                                           |
| **twelfthMarks**              | Object containing Class 12 academic records                      | Object           | Sub-fields include `group`, `maxMarks`, `obtainedMarks`, `percentage`, `subjects`            |
| &nbsp;&nbsp;→ `group`         | Stream/group in Class 12 (see **Group Streams** table below)     | Enum             | Mandatory; selecting a group decides which subject fields to display                         |
| &nbsp;&nbsp;→ `maxMarks`      | Maximum possible marks in Class 12                               | Number (Integer) | Non-negative                                                                                 |
| &nbsp;&nbsp;→ `obtainedMarks` | Marks obtained in Class 12                                       | Number (Integer) | Must be <= `maxMarks`                                                                        |
| &nbsp;&nbsp;→ `percentage`    | Percentage scored in Class 12                                    | Number (Float)   | **Auto-calc** = `(obtainedMarks / maxMarks) x 100`                                           |
| &nbsp;&nbsp;→ `subjects`      | Individual subject marks                                         | Object           | Subject fields dynamically appear based on `group` selection                                 |
| **cutoffMarks**               | Overall cutoff marks (optional)                                  | Number (Float)   | System **dynamically** shows Medical/Engineering cutoff based on group                       |
| **medicalCutoffMarks**        | Medical cutoff marks (if applicable)                             | Number (Float)   | **Auto-calc** (see formula below)                                                            |
| **engineeringCutoffMarks**    | Engineering cutoff marks (if applicable)                         | Number (Float)   | **Auto-calc** (see formula below)                                                            |
| **neetRollNumber**            | NEET exam roll number (optional)                                 | String (20)      | Shown if applicable or mandatory if a medical group is chosen                                |
| **counselingApplied**         | Whether applicant has applied for counseling (Yes/No)            | Boolean/Enum     | True/False                                                                                   |
| **counselingNumber**          | Counseling application number                                    | String (20)      | Shown if `counselingApplied` = True                                                          |
| **ugDiplomaDetails**          | Details of previous UG/Diploma if applying for PG/Lateral entry  | Object           | Optional field                                                                               |
| **firstGraduate**             | Whether the applicant is a first graduate in the family (Yes/No) | Boolean/Enum     | True/False                                                                                   |

#### 3.2.1. Group Streams & Subject Fields

Below are the **Group/Stream** options for Class 12 and the associated subjects that should appear for **Subject-wise marks** input:

1. **Physics, Chemistry, Biology, Mathematics**
   - Subjects: PHY, CHEM, BIO, MATHS
   - **Medical Cutoff** or **Engineering Cutoff** can be shown (the system may allow both if relevant).
2. **Physics, Chemistry, Computer Science, Mathematics**
   - Subjects: PHY, CHEM, CS, MATHS
   - Typically **Engineering Cutoff** applies.
3. **Physics, Chemistry, Botany, Zoology**
   - Subjects: PHY, CHEM, BOT, ZOO
   - **Medical Cutoff** applies.
4. **Physics, Chemistry, Biology, Computer Science**
   - Subjects: PHY, CHEM, BIO, CS
   - Primarily **Medical Cutoff** (depending on institution’s rules).
5. **Physics, Chemistry, Biology, Nursing**
   - Subjects: PHY, CHEM, BIO, NURSING
   - **Medical Cutoff** relevant.
6. **Physics, Chemistry, Mathematics, Home Science**
   - Subjects: PHY, CHEM, MATHS, HOME SCI
   - **Engineering Cutoff** relevant.
7. **Computer Science, Economics, Commerce, Accountancy**
   - Subjects: CS, ECO, COM, ACC
   - No direct medical/engineering cutoff but general cutoff may apply.
8. **History, Economics, Commerce, Accountancy**
   - Subjects: HIST, ECO, COM, ACC
   - General cutoff scenario.
9. **Statistics, Economics, Commerce, Accountancy**
   - Subjects: STAT, ECO, COM, ACC
   - General cutoff scenario.
10. **Accountancy & Auditing**

- Subjects: ACC, AUD (others if any)
- General cutoff scenario.

11. **Others Groups**

- Subjects: Dynamically let users input major subjects (no specific medical/engineering cutoff).

#### 3.2.2. Cutoff Formulas

1. **Medical Cutoff**  
   Depending on the subjects:

   - **`((PHY + CHEM) / 2) + BIO = Medical Cutoff`**
   - **`((PHY + CHEM) / 2) + BOT + (ZOO / 2) = Medical Cutoff`**

2. **Engineering Cutoff**
   - **`((PHY + CHEM) / 2) + MATHS = Engineering Cutoff`**

> **Logic**: If the selected group includes **Biology** (or Botany/Zoology), the system prompts for a **Medical Cutoff**. If it includes **Mathematics** with Physics and Chemistry, the system also shows an **Engineering Cutoff**.

---

### 3.3. Course Selection

**Purpose**: Determine how the applicant’s chosen college, category, and academic year map to specific courses.

| Field Name        | Description                                  | Data Type   | Notes/Validations                                                              |
| ----------------- | -------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| **quota**         | Admission quota                              | String (50) | E.g. Government quota, Management quota, etc.                                  |
| **category**      | Admission category                           | String (50) | E.g. General, OBC, SC/ST, etc.                                                 |
| **fieldOfStudy**  | College selected (various JKKN institutions) | Enum        | Must choose from the list below                                                |
| **courseType**    | "UG" or "PG"                                 | Enum        | Mandatory                                                                      |
| **entryType**     | "FIRST YEAR", "LATERAL ENTRY", "FOURTH YEAR" | Enum        | Mandatory; filtered by `fieldOfStudy` and `courseType`                         |
| **yearAndBranch** | Specific course and branch selection         | String (50) | Populated dynamically based on the chosen college, course type, and entry type |

#### 3.3.1. College-Wise Course Details

Below is a **simplified** breakdown. When the user selects a **College Name (fieldOfStudy)**, the system should then show only the relevant **Course Type** (UG/PG), **Entry Type**, and the subsequent **Course Names**.

1. **JKKN ENGINEERING & TECHNOLOGY**

   - **UG** (FIRST YEAR & LATERAL ENTRY)
     - B.E. – Computer Science Engineering
     - B.E. – Electronics & Communication Engineering
     - B.E. – Electrical & Electronics Engineering
     - B.E. – Mechanical Engineering
     - B.Tech. – Information Technology
   - **UG** (FIRST YEAR & LATERAL ENTRY)
     - MBA (Note: Usually PG, but if the institution lists it under UG, follow that convention. Otherwise treat as PG.)
   - **PG** (FIRST YEAR)
     - M.E. – Computer Science Engineering

2. **JKKN DENTAL COLLEGE & HOSPITAL**

   - **UG** (FIRST YEAR)
     - BDS
   - **PG** (FIRST YEAR)
     - MDS (Orthodontics, Endodontic, Prosthodontics, Periodontics, Oral Medicine & Radiology)

3. **JKKN ALLIED HEALTH SCIENCES**

   - **UG** (FIRST YEAR)
     - B.Sc. – Cardiac Technology
     - B.Sc. – Operation Theatre & Anesthesia Technology
     - B.Sc. – Radiology Imaging Technology
     - B.Sc. – Physician Assistant
     - B.Sc. – Dialysis Technology
     - B.Sc. – Accident & Emergency Care Technology
     - B.Sc. – Respiratory Therapy
     - B.Sc. – Critical Care Technology
     - B.Sc. – Medical Record Science

4. **JKKN COLLEGE OF PHARMACY**

   - **UG** (FIRST YEAR)
     - B.Pharm
     - Pharm.D
   - **UG** (LATERAL ENTRY & FOURTH YEAR)
     - B.Pharm LE (SECOND YEAR)
     - Pharm.D PB (FOURTH YEAR)
   - **PG** (FIRST YEAR)
     - M.Pharm - Pharmaceutics
     - M.Pharm - Pharmaceutical Chemistry
     - M.Pharm - Pharmacology
     - M.Pharm - Pharmaceutical Analysis
     - M.Pharm - Pharmacy Practice

5. **JKKN COLLEGE OF NURSING**

   - **UG** (FIRST YEAR)
     - B.Sc. - Nursing
     - PBBSC - Nursing
   - **PG** (FIRST YEAR)
     - M.Sc. - Medical Surgical Nursing
     - M.Sc. - Psychiatric Nursing
     - M.Sc. - Community Health Nursing
     - M.Sc. - OBG & Gyn. Nursing
     - M.Sc. - Pediatric Nursing

6. **JKKN COLLEGE OF ARTS & SCIENCE**

   - **UG** (FIRST YEAR)
     - B.A. English
     - B.C.A. (Bachelor of Computer Applications)
     - B.Sc. Computer Science
     - B.Sc. CS (Cyber Security)
     - B.Sc. CS (AI & DS) (Artificial Intelligence and Data Science)
     - B.Sc. Microbiology
     - B.Sc. Clinical Laboratory Technology
     - B.Sc. Mathematics
     - B.Sc. Physics
     - B.Sc. TFD (Textile and Fashion Design)
     - B.Sc. Visual Communication
     - B.B.A. (Bachelor of Business Administration)
     - B.Com (A&F) (Accounting and Finance)
     - B.Com (B&I) (Banking and Insurance)
     - B.Com (CA) (Computer Applications)
     - B.Com (FMA) (Financial Market Analysis)
   - **PG** (FIRST YEAR)
     - M.A. English
     - M.Sc. Computer Science
     - M.Sc. Mathematics
     - M.Com.

7. **JKKN COLLEGE OF EDUCATION**
   - **UG** (FIRST YEAR)
     - B.Ed

> **Logic**: The interface must **dynamically filter** courses based on the **College** → **Course Type (UG/PG)** → **Entry Type** selected.

---

### 3.4. Contact Details

| Field Name                   | Description                      | Data Type    | Notes/Validations                               |
| ---------------------------- | -------------------------------- | ------------ | ----------------------------------------------- |
| **permanentAddressStreet**   | Street address                   | String (100) | Mandatory                                       |
| **permanentAddressTaluk**    | Taluk/Tehsil                     | String (50)  | Mandatory                                       |
| **permanentAddressDistrict** | District                         | String (50)  | Mandatory                                       |
| **permanentAddressPinCode**  | PIN code                         | String (6)   | Must be exactly 6 digits                        |
| **permanentAddressState**    | State                            | String (50)  | Mandatory                                       |
| **studentMobile**            | Student’s 10-digit mobile number | String (10)  | Must be exactly 10 digits                       |
| **studentEmail**             | Student’s email address          | String (50)  | Must follow standard email format (user@domain) |

---

### 3.5. Accommodation Preferences

| Field Name            | Description                                                               | Data Type    | Notes/Validations                                                     |
| --------------------- | ------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| **accommodationType** | "Day Scholar" or "Hostel"                                                 | Enum         | Mandatory                                                             |
| **hostelType**        | Type of hostel (optional)                                                 | String (50)  | Show only if `accommodationType` = "Hostel"                           |
| **busRequired**       | Whether bus transport is required (Yes/No)                                | Boolean/Enum | **Show only if** `accommodationType` = "Day Scholar"                  |
| **busRoute**          | Bus route (optional)                                                      | String (50)  | **Show only if** `busRequired` = True                                 |
| **busPickupLocation** | Bus pickup location (optional)                                            | String (50)  | **Show only if** `busRequired` = True and depends on selected route   |
| **referenceType**     | "direct", "jkkn_staff", "student", "consultant", "social_media", "others" | Enum         | Mandatory                                                             |
| **referenceName**     | Name of the reference person                                              | String (50)  | Required if `referenceType` is not "direct" (project policy may vary) |
| **referenceContact**  | Contact of the reference person                                           | String (10)  | 10-digit phone number, if reference is required                       |

> **Logic**:
>
> - If **Hostel** → show **hostelType**.
> - If **Day Scholar** → show **busRequired**. If **busRequired** = Yes → show **busRoute** and then the relevant **Pickup Location** list.

---

## 4. Data Connections & Relationships

1. **Basic Details** → **Academic Information**

   - **One-to-One**: Each application references exactly one academic record (unless your system supports multiple academic records for different levels).

2. **Basic Details** → **Course Selection**

   - **One-to-One**: Typically, an applicant chooses one primary course. This can be **One-to-Many** if multiple preferences are allowed.

3. **Basic Details** → **Contact Details**

   - **One-to-One**: A single set of permanent contact information per application.

4. **Basic Details** → **Accommodation Preferences**
   - **One-to-One**: Contains fields for hostel/bus requirements and references.

---

## 5. Summary & Workflow

1. **Basic Eligibility Check**

   - **DOB** cannot be less than **15 years** from the current date.
   - Basic details like religion, community, mobile fields must be validated before proceeding.

2. **Academic Details**

   - **10th Percentage** auto-calculates as soon as the user enters `maxMarks` and `obtainedMarks`.
   - **12th Marks**: The user selects a **Group/Stream**, which displays the relevant subjects for data entry.
   - Once the subject marks are entered, the system computes:
     - The **12th Percentage**.
     - The **Medical** or **Engineering** (or both) **Cutoff** if subjects match the relevant formula(s).

3. **Course Selection**

   - User chooses the **College** → **Course Type** (UG/PG) → **Entry Type** (FIRST YEAR, LATERAL, FOURTH YEAR).
   - The system then populates a list of valid **Courses** to select from (e.g., B.E. CSE, B.Sc. Nursing, etc.).

4. **Contact Details**

   - Mandatory permanent address.
   - Validate the format for phone number and email.

5. **Accommodation Preferences**

   - If **Hostel** → Show **Hostel Type**.
   - If **Day Scholar** → **Bus Facility Required**? If yes, show **Bus Route** and subsequent **Pickup Location**.

6. **Submission & Storage**
   - Upon final submission, the system verifies all mandatory fields and auto-calculations.
   - A unique **Application ID** is generated and stored in the central database.
   - The record may integrate with fee payment or counseling systems, depending on the internal process flow.

---

## 6. Conclusion

This documentation describes the **form structure**, **dynamic field visibility**, **auto-calculations**, and **course mapping** for the **Admission Management** module. Adhering to these guidelines ensures:

- **Accurate** data capture
- **Consistent** validation
- **Seamless** user experience

> **Reminder**: Keep the documentation updated alongside evolving requirements or institutional policies. By version-controlling this document and your code, you ensure clarity and maintainability for all team members involved.

---

**End of Documentation**
