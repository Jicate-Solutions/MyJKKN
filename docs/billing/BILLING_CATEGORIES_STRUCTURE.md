# Billing Categories Structure — Program Fee Hierarchy

**Last Updated**: 2026-04-28  
**Institution**: JKKN Multi-Professional Colleges  
**Status**: Master Reference for All Programs

---

## 📋 Overview

This document maps all JKKN program fees into the **3-tier billing category model**:

```
Parent Category (Program Group)
    → Sub Category (Year/Timing)
        → Item Category (Individual Fee)
```

---

## 🏗️ **Parent Categories** (Level 1)

Parent categories group all fees by **program type**. Each institution has these main parent categories:

| Parent Category | Description |
|---|---|
| ENGINEERING | UG (Regular + Lateral), all engineering programs |
| NURSING | UG + PG programs |
| PHARMACY | UG (Regular + Lateral), PharmD, PharmD PB, PG |
| ALLIED HEALTH SCIENCE | UG + Internship years |
| DENTAL | BDS + MDS |
| EDUCATION | UG Regular |

---

## 📊 **Complete 3-Tier Mapping**

### **1. ENGINEERING**

#### Sub Category: UG REGULAR — First Year (One Time)
```
parent_category: "ENGINEERING"
sub_category: "UG REGULAR - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time, amount TBD]
  - "University Fee"            [one-time, amount TBD]
```

#### Sub Category: UG REGULAR — 1st to 4th Year (Recurring)
```
parent_category: "ENGINEERING"
sub_category: "UG REGULAR - 1ST TO 4TH YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Transport Fees"           [yearly]
  - "Placement Fees"           [yearly]
  - "Uniform Fees"             [one-time per year]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester or yearly]
```

#### Sub Category: LATERAL ENTRY — 2nd Year (One Time)
```
parent_category: "ENGINEERING"
sub_category: "LATERAL ENTRY - 2ND YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: LATERAL ENTRY — 2nd to 4th Year (Recurring)
```
parent_category: "ENGINEERING"
sub_category: "LATERAL ENTRY - 2ND TO 4TH YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Transport Fees"           [yearly]
  - "Placement Fees"           [yearly]
  - "Uniform Fees"             [one-time per year]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester or yearly]
```

---

### **2. NURSING**

#### Sub Category: UG REGULAR — 1st Year (One Time)
```
parent_category: "NURSING"
sub_category: "UG REGULAR - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: UG REGULAR — 1st to 3rd Year
```
parent_category: "NURSING"
sub_category: "UG REGULAR - 1ST TO 3RD YEAR"
items:
  - "Tuition Fees + Uniform + Hospital Training"  [yearly]
  - "Transport Fees"                              [yearly]
  - "Hostel Fees"                                 [monthly or yearly]
  - "Exam Fees"                                   [per semester]
```

#### Sub Category: PBBSC & PG REGULAR — 1st Year (One Time)
```
parent_category: "NURSING"
sub_category: "PBBSC & PG REGULAR - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: PBBSC & PG REGULAR — 1st to 2nd Year
```
parent_category: "NURSING"
sub_category: "PBBSC & PG REGULAR - 1ST TO 2ND YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester]
```

---

### **3. PHARMACY**

#### Sub Category: UG REGULAR — 1st Year (One Time)
```
parent_category: "PHARMACY"
sub_category: "UG REGULAR - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: UG REGULAR — 1st to 4th Year
```
parent_category: "PHARMACY"
sub_category: "UG REGULAR - 1ST TO 4TH YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester]
```

#### Sub Category: LATERAL ENTRY — 2nd Year (One Time)
```
parent_category: "PHARMACY"
sub_category: "LATERAL ENTRY - 2ND YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: LATERAL ENTRY — 2nd to 4th Year
```
parent_category: "PHARMACY"
sub_category: "LATERAL ENTRY - 2ND TO 4TH YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester]
```

#### Sub Category: PharmD — 1st Year (One Time)
```
parent_category: "PHARMACY"
sub_category: "PHARMD - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: PharmD — 1st to 6th Year
```
parent_category: "PHARMACY"
sub_category: "PHARMD - 1ST TO 6TH YEAR"
items:
  - "Tuition Fees + Hostel Fees (Hostel Candidate)" [yearly]
  - "Tuition Fees (Day Scholar Candidate)"         [yearly]
  - "Transport Fees"                                [yearly]
  - "Exam Fees"                                     [per semester]
```

#### Sub Category: PharmD PB — 4th Year (One Time)
```
parent_category: "PHARMACY"
sub_category: "PHARMD PB - 4TH YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: PharmD PB — 4th to 6th Year
```
parent_category: "PHARMACY"
sub_category: "PHARMD PB - 4TH TO 6TH YEAR"
items:
  - "Tuition Fees + Hostel Fees (Hostel Candidate)" [yearly]
  - "Tuition Fees (Day Scholar Candidate)"         [yearly]
  - "Transport Fees"                                [yearly]
  - "Exam Fees"                                     [per semester]
```

#### Sub Category: PG REGULAR — 1st Year (One Time)
```
parent_category: "PHARMACY"
sub_category: "PG REGULAR - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: PG REGULAR — 1st to 2nd Year
```
parent_category: "PHARMACY"
sub_category: "PG REGULAR - 1ST TO 2ND YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester]
```

---

### **4. ALLIED HEALTH SCIENCE**

#### Sub Category: UG REGULAR — 1st Year (One Time)
```
parent_category: "ALLIED HEALTH SCIENCE"
sub_category: "UG REGULAR - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: UG REGULAR — 1st to 3rd Year
```
parent_category: "ALLIED HEALTH SCIENCE"
sub_category: "UG REGULAR - 1ST TO 3RD YEAR"
items:
  - "Tuition Fees + Uniform + Hospital Training"  [yearly]
  - "Transport Fees"                              [yearly]
  - "Hostel Fees"                                 [monthly or yearly]
  - "Exam Fees"                                   [per semester]
```

#### Sub Category: UG REGULAR — 4th Year (Internship)
```
parent_category: "ALLIED HEALTH SCIENCE"
sub_category: "UG REGULAR - 4TH YEAR (INTERNSHIP)"
items:
  - "Internship Fees"          [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
```

---

### **5. DENTAL**

#### Sub Category: BDS — 1st Year (One Time)
```
parent_category: "DENTAL"
sub_category: "BDS - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: BDS — 1st to 4th Year
```
parent_category: "DENTAL"
sub_category: "BDS - 1ST TO 4TH YEAR"
items:
  - "Tuition Fees + Instruments + Hostel Fees (Hostel)" [yearly]
  - "Tuition Fees + Instruments (Day Scholar)"         [yearly]
  - "Transport Fees"                                    [yearly]
  - "Exam Fees"                                         [per semester]
```

#### Sub Category: BDS — 5th Year (Internship)
```
parent_category: "DENTAL"
sub_category: "BDS - 5TH YEAR (INTERNSHIP)"
items:
  - "Internship Fees"          [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
```

#### Sub Category: MDS — 1st Year (One Time)
```
parent_category: "DENTAL"
sub_category: "MDS - 1ST YEAR (ONE TIME)"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
```

#### Sub Category: MDS — 1st to 3rd Year
```
parent_category: "DENTAL"
sub_category: "MDS - 1ST TO 3RD YEAR"
items:
  - "Tuition Fees"             [yearly]
  - "Instrument Fees"          [yearly]
  - "Transport Fees"           [yearly]
  - "Hostel Fees"              [monthly or yearly]
  - "Exam Fees"                [per semester]
```

---

### **6. EDUCATION**

#### Sub Category: UG REGULAR — 1st to 2nd Year
```
parent_category: "EDUCATION"
sub_category: "UG REGULAR - 1ST TO 2ND YEAR"
items:
  - "Application Fee"           [one-time]
  - "University Fee"            [one-time]
  - "Tuition Fees"              [yearly]
  - "Uniform Fees"              [one-time per year]
  - "Exam Fees"                 [per semester]
```

---

## 💾 **Sample SQL Data**

### Insert Parent Categories

```sql
INSERT INTO billing_parent_categories 
  (id, institution_id, parent_category_name, is_active, created_by)
VALUES
  (uuid_generate_v4(), '<INSTITUTION_ID>', 'ENGINEERING', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', 'NURSING', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', 'PHARMACY', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', 'ALLIED HEALTH SCIENCE', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', 'DENTAL', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', 'EDUCATION', true, '<USER_ID>')
RETURNING id, parent_category_name;
```

### Insert Sub Categories (Example: ENGINEERING)

```sql
-- Get parent_category_id for ENGINEERING
SELECT id FROM billing_parent_categories 
WHERE parent_category_name = 'ENGINEERING' 
AND institution_id = '<INSTITUTION_ID>';

-- Then insert sub-categories
INSERT INTO billing_sub_categories 
  (id, institution_id, parent_category_id, sub_category_name, is_active, created_by)
VALUES
  (uuid_generate_v4(), '<INSTITUTION_ID>', '<ENG_PARENT_ID>', 'UG REGULAR - 1ST YEAR (ONE TIME)', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', '<ENG_PARENT_ID>', 'UG REGULAR - 1ST TO 4TH YEAR', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', '<ENG_PARENT_ID>', 'LATERAL ENTRY - 2ND YEAR (ONE TIME)', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', '<ENG_PARENT_ID>', 'LATERAL ENTRY - 2ND TO 4TH YEAR', true, '<USER_ID>')
RETURNING id, sub_category_name;
```

### Insert Item Categories (Example: UG REGULAR — 1st Year)

```sql
-- Get sub_category_id for "UG REGULAR - 1ST YEAR (ONE TIME)"
SELECT id FROM billing_sub_categories 
WHERE sub_category_name = 'UG REGULAR - 1ST YEAR (ONE TIME)' 
AND parent_category_id = '<ENG_PARENT_ID>';

-- Insert items
INSERT INTO billing_item_categories 
  (id, institution_id, parent_category_id, sub_category_id, item_category_name, amount, frequency, is_active, created_by)
VALUES
  (uuid_generate_v4(), '<INSTITUTION_ID>', '<ENG_PARENT_ID>', '<SUB_ID>', 'Application Fee', 5000.00, 'one-time', true, '<USER_ID>'),
  (uuid_generate_v4(), '<INSTITUTION_ID>', '<ENG_PARENT_ID>', '<SUB_ID>', 'University Fee', 8000.00, 'one-time', true, '<USER_ID>')
RETURNING id, item_category_name, amount, frequency;
```

---

## 🔄 **Data Hierarchy & Relationships**

```
1 Parent Category (ENGINEERING)
    ↓
    ├→ N Sub Categories
    │   ├ "UG REGULAR - 1ST YEAR (ONE TIME)"
    │   ├ "UG REGULAR - 1ST TO 4TH YEAR"
    │   ├ "LATERAL ENTRY - 2ND YEAR (ONE TIME)"
    │   └ "LATERAL ENTRY - 2ND TO 4TH YEAR"
    │
    └→ Each Sub has N Items
        └ "UG REGULAR - 1ST YEAR" has:
            ├ Application Fee (one-time, ₹5,000)
            └ University Fee (one-time, ₹8,000)

        └ "UG REGULAR - 1ST TO 4TH YEAR" has:
            ├ Tuition Fees (yearly, varies)
            ├ Transport Fees (yearly, ₹5,000)
            ├ Placement Fees (yearly, ₹2,000)
            ├ Uniform Fees (yearly, ₹3,000)
            ├ Hostel Fees (monthly/yearly, varies)
            └ Exam Fees (per semester, ₹1,500)
```

---

## 📊 **Key Fields Per Item Category**

| Field | Example | Notes |
|-------|---------|-------|
| `item_category_name` | "Tuition Fees" | Human-readable fee name |
| `amount` | 50000.00 | Can be NULL if amount varies per student |
| `frequency` | `'yearly'` | 'monthly', 'quarterly', 'yearly', 'one-time' |
| `is_active` | true | Soft toggle without deleting data |
| `parent_category_id` | UUID | Links back to parent (ENGINEERING, NURSING, etc.) |
| `sub_category_id` | UUID | Links to specific year/timing (1ST YEAR, 1ST-4TH YEAR, etc.) |
| `institution_id` | UUID | Multi-tenant isolation |

---

## 🎯 **Frequency Guide**

| Frequency | When to Charge | Example |
|-----------|---|---|
| `'one-time'` | Only once during enrollment | Application Fee, University Fee |
| `'monthly'` | Every month | Hostel Fees |
| `'quarterly'` | Every 3 months | Some additional charges |
| `'yearly'` | Once per academic year | Tuition, Transport, Exam Fees |

---

## ✅ **Implementation Checklist**

- [ ] Identify all **institution_id** values for each college
- [ ] Create all 6 **parent categories** per institution
- [ ] Create **sub-categories** for each program (see mapping above)
- [ ] Create **item categories** with amounts and frequency
- [ ] Test with `/auth/test-login` → navigate to Billing → Categories module
- [ ] Verify RLS policies allow role-based access
- [ ] Validate no duplicate names within a parent category

---

## 📞 **Notes**

- **Amount is flexible**: Some fees (e.g., Tuition) may vary by specialization or category. Set `amount = NULL` and override per bill.
- **Hostel candidates vs Day Scholars**: Create separate item categories (e.g., "Tuition + Hostel" vs "Tuition Only")
- **Lateral Entry**: Separate full-year structure; students skip 1st-year one-time fees
- **Internship years**: Use separate sub-categories with internship-specific fees
- **Soft deletion**: `is_active = false` rather than hard delete (preserves billing history)

---

**Generated**: 2026-04-28  
**Status**: Ready for Implementation
