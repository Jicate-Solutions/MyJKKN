# Institution-Wise Billing Categories Mapping

**Last Updated**: 2026-04-28  
**Purpose**: Multi-tenant isolation & per-institution fee structures  
**Status**: Reference for Setup & Queries

---

## 🏢 **Multi-Tenant Architecture**

Every billing category table includes `institution_id` for **complete isolation**:

```
JKKN Engineering College (inst-001)
  ├─ Parent Categories (6 parents)
  ├─ Sub Categories (25+ subs)
  └─ Item Categories (100+ items)

JKKN Medical College (inst-002)
  ├─ Parent Categories (different set)
  ├─ Sub Categories (different set)
  └─ Item Categories (different set)

JKKN Law College (inst-003)
  ├─ Parent Categories (different set)
  ├─ Sub Categories (different set)
  └─ Item Categories (different set)
```

**Isolation guarantee**: RLS policies enforce `institution_id` matching on every query.

---

## 📋 **Institution IDs (Sample)**

| Institution | ID | Programs Offered |
|---|---|---|
| JKKN Engineering College | `inst-eng-001` | Engineering (UG + Lateral) |
| JKKN Medical College | `inst-med-001` | Medicine, Nursing, Allied Health, Dental |
| JKKN Law College | `inst-law-001` | BA.LLB, LLM |
| JKKN Business School | `inst-biz-001` | BBA, MBA |
| JKKN Agriculture | `inst-agr-001` | Agriculture, Horticulture |

---

## 🏗️ **Per-Institution Structure Example**

### **Institution: JKKN Engineering College** (inst-eng-001)

```
PARENT CATEGORY                          SUB CATEGORIES                        ITEMS
─────────────────────────────────────────────────────────────────────────────────────────────

ENGINEERING                    
                               UG REGULAR - 1ST YEAR (ONE TIME)      ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               UG REGULAR - 1ST TO 4TH YEAR          ├─ Tuition Fees
                               │                                      ├─ Transport Fees
                               │                                      ├─ Placement Fees
                               │                                      ├─ Uniform Fees
                               │                                      ├─ Hostel Fees
                               │                                      └─ Exam Fees
                               │
                               LATERAL ENTRY - 2ND YEAR (ONE TIME)   ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               LATERAL ENTRY - 2ND TO 4TH YEAR       ├─ Tuition Fees
                                                                      ├─ Transport Fees
                                                                      ├─ Placement Fees
                                                                      ├─ Uniform Fees
                                                                      ├─ Hostel Fees
                                                                      └─ Exam Fees
```

### **Institution: JKKN Medical College** (inst-med-001)

```
PARENT CATEGORY                          SUB CATEGORIES                        ITEMS
─────────────────────────────────────────────────────────────────────────────────────────────

NURSING                        
                               UG REGULAR - 1ST YEAR (ONE TIME)      ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               UG REGULAR - 1ST TO 3RD YEAR          ├─ Tuition + Uniform + Training
                               │                                      ├─ Transport Fees
                               │                                      ├─ Hostel Fees
                               │                                      └─ Exam Fees
                               │
                               PBBSC & PG - 1ST YEAR (ONE TIME)      ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               PBBSC & PG - 1ST TO 2ND YEAR          ├─ Tuition Fees
                                                                      ├─ Transport Fees
                                                                      ├─ Hostel Fees
                                                                      └─ Exam Fees

DENTAL                         
                               BDS - 1ST YEAR (ONE TIME)             ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               BDS - 1ST TO 4TH YEAR                 ├─ Tuition + Instruments + Hostel
                               │                                      ├─ Transport Fees
                               │                                      └─ Exam Fees
                               │
                               BDS - 5TH YEAR (INTERNSHIP)           ├─ Internship Fees
                               │                                      ├─ Transport Fees
                               │                                      └─ Hostel Fees
                               │
                               MDS - 1ST YEAR (ONE TIME)             ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               MDS - 1ST TO 3RD YEAR                 ├─ Tuition Fees
                                                                      ├─ Instrument Fees
                                                                      ├─ Transport Fees
                                                                      ├─ Hostel Fees
                                                                      └─ Exam Fees

ALLIED HEALTH SCIENCE          
                               UG REGULAR - 1ST YEAR (ONE TIME)      ├─ Application Fee
                               │                                      └─ University Fee
                               │
                               UG REGULAR - 1ST TO 3RD YEAR          ├─ Tuition + Uniform + Training
                               │                                      ├─ Transport Fees
                               │                                      ├─ Hostel Fees
                               │                                      └─ Exam Fees
                               │
                               UG REGULAR - 4TH YEAR (INTERNSHIP)    ├─ Internship Fees
                                                                      ├─ Transport Fees
                                                                      └─ Hostel Fees
```

---

## 💾 **Institution-Wise SQL Setup**

### **Step 1: Get Institution IDs**

```sql
SELECT id, institution_name, institution_code, counselling_code 
FROM institutions 
WHERE is_active = true
ORDER BY institution_name;

-- Result:
-- id                                 | institution_name                | code
-- ──────────────────────────────────────────────────────────────────────────
-- f47ac10b-58cc-4372-a567-0e02b2c3d479 | JKKN Engineering College         | ENG
-- 550e8400-e29b-41d4-a716-446655440000 | JKKN Medical College             | MED
-- 6ba7b810-9dad-11d1-80b4-00c04fd430c8 | JKKN Law College                 | LAW
```

### **Step 2: Seed Parent Categories Per Institution**

```sql
INSERT INTO billing_parent_categories 
  (id, institution_id, parent_category_name, is_active, created_by)
-- JKKN Engineering College (inst-001)
SELECT 
  uuid_generate_v4(),
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  parent_name,
  true,
  '<ADMIN_USER_ID>'
FROM (VALUES
  ('ENGINEERING')
) AS t(parent_name)

UNION ALL

-- JKKN Medical College (inst-002)
SELECT 
  uuid_generate_v4(),
  '550e8400-e29b-41d4-a716-446655440000',
  parent_name,
  true,
  '<ADMIN_USER_ID>'
FROM (VALUES
  ('NURSING'),
  ('PHARMACY'),
  ('ALLIED HEALTH SCIENCE'),
  ('DENTAL')
) AS t(parent_name)

UNION ALL

-- JKKN Law College (inst-003)
SELECT 
  uuid_generate_v4(),
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  parent_name,
  true,
  '<ADMIN_USER_ID>'
FROM (VALUES
  ('LAW UNDERGRADUATE'),
  ('LAW POSTGRADUATE')
) AS t(parent_name)

RETURNING institution_id, parent_category_name;
```

### **Step 3: Query All Categories for an Institution**

```sql
-- Get all parent categories for JKKN Engineering College
SELECT 
  pc.id,
  pc.parent_category_name,
  COUNT(DISTINCT sc.id) as sub_category_count,
  COUNT(DISTINCT ic.id) as item_category_count
FROM billing_parent_categories pc
LEFT JOIN billing_sub_categories sc ON sc.parent_category_id = pc.id
LEFT JOIN billing_item_categories ic ON ic.parent_category_id = pc.id
WHERE pc.institution_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
GROUP BY pc.id, pc.parent_category_name
ORDER BY pc.parent_category_name;
```

### **Step 4: Get Complete Hierarchy for an Institution**

```sql
-- Get full 3-tier structure for JKKN Medical College
WITH institution AS (
  SELECT id FROM institutions WHERE institution_code = 'MED'
)
SELECT 
  pc.parent_category_name as "Parent Category",
  sc.sub_category_name as "Sub Category",
  ic.item_category_name as "Item Category",
  ic.amount,
  ic.frequency
FROM billing_parent_categories pc
JOIN billing_sub_categories sc ON sc.parent_category_id = pc.id
LEFT JOIN billing_item_categories ic ON ic.sub_category_id = sc.id
WHERE pc.institution_id = (SELECT id FROM institution)
AND pc.is_active = true
AND sc.is_active = true
AND (ic.is_active = true OR ic.id IS NULL)
ORDER BY pc.parent_category_name, sc.sub_category_name, ic.item_category_name;
```

---

## 🔐 **RLS Policies (Institution Isolation)**

Every table has RLS enforcing `institution_id` access:

### Parent Categories Policy
```sql
CREATE POLICY "parent_categories_select" ON billing_parent_categories
FOR SELECT USING (
  is_super_admin() 
  OR is_admin()
  OR (role_has_institution_access(institution_id) 
      AND user_has_permission('billing.categories.view'))
);
```

### Sub Categories Policy
```sql
CREATE POLICY "sub_categories_select" ON billing_sub_categories
FOR SELECT USING (
  is_super_admin()
  OR is_admin()
  OR (role_has_institution_access(institution_id)
      AND user_has_permission('billing.categories.view'))
);
```

### Item Categories Policy
```sql
CREATE POLICY "item_categories_select" ON billing_item_categories
FOR SELECT USING (
  is_super_admin()
  OR is_admin()
  OR (role_has_institution_access(institution_id)
      AND user_has_permission('billing.categories.view'))
);
```

**Result**: A user with access to **Institution A** cannot see categories for **Institution B**.

---

## 📊 **Data Distribution Matrix**

```
Institution          | Parent Categories | Sub Categories | Item Categories | Total Items
─────────────────────────────────────────────────────────────────────────────────────────
JKKN Engineering     | 1 (ENGINEERING)  | 4               | ~15             | ~15
JKKN Medical         | 4 (NURSING, PHARM, | 20+             | ~80             | ~80
                     |  AHS, DENTAL)    |                 |                 |
JKKN Law             | 2 (UG, PG)       | 6               | ~20             | ~20
JKKN Business        | 2 (BBA, MBA)     | 8               | ~25             | ~25
JKKN Agriculture     | 2 (UG, PG)       | 6               | ~18             | ~18
─────────────────────────────────────────────────────────────────────────────────────────
TOTAL                | ~11              | ~44             | ~158            | ~158
```

---

## 🎯 **Key Points for Institution Setup**

### **1. Unique Fees Per Institution**

Each institution can have **completely different fee structures**:

```
JKKN Engineering:      Tuition = ₹1,50,000/year
JKKN Medical:          Tuition = ₹5,00,000/year
JKKN Law:              Tuition = ₹80,000/year
```

**Implementation**: Same `item_category_name` ("Tuition Fees"), but different `amount` per institution.

### **2. Program Availability Per Institution**

Not all institutions offer all programs:

```
JKKN Engineering    → Only ENGINEERING programs
JKKN Medical        → NURSING, PHARMACY, DENTAL, ALLIED HEALTH (NO ENGINEERING)
JKKN Law            → LAW programs only
```

**Implementation**: Create only the parent categories that the institution offers.

### **3. Multi-Tenancy Query Pattern**

Always filter by `institution_id`:

```typescript
// ❌ WRONG - gets ALL categories across all institutions
const { data: categories } = await supabase
  .from('billing_item_categories')
  .select('*');

// ✅ CORRECT - gets categories only for this institution
const { data: categories } = await supabase
  .from('billing_item_categories')
  .select('*')
  .eq('institution_id', userInstitutionId);
```

### **4. User Institution Access**

Users can access categories **only for their institution** (unless super_admin):

```sql
-- User with role = 'accountant' at JKKN Engineering (inst-eng-001)
-- Can ONLY see categories where institution_id = 'inst-eng-001'

-- Super admin can see ALL institution categories
```

---

## 📝 **Template: Adding New Institution**

### **When adding a new institution (e.g., JKKN Arts College):**

1. **Create institution record** (done by Admin UI)
   ```sql
   INSERT INTO institutions 
   (institution_name, institution_code, counselling_code, is_active)
   VALUES ('JKKN Arts College', 'ARTS', 'ARTS', true)
   RETURNING id; -- e.g., inst-arts-001
   ```

2. **Add parent categories** for JKKN Arts
   ```sql
   INSERT INTO billing_parent_categories 
   (institution_id, parent_category_name, is_active, created_by)
   VALUES 
   ('inst-arts-001', 'ARTS UNDERGRADUATE', true, '<ADMIN_ID>'),
   ('inst-arts-001', 'ARTS POSTGRADUATE', true, '<ADMIN_ID>');
   ```

3. **Add sub-categories** for each parent
   ```sql
   -- Assuming parent_category_id for "ARTS UNDERGRADUATE" is xxx
   INSERT INTO billing_sub_categories 
   (institution_id, parent_category_id, sub_category_name, is_active, created_by)
   VALUES 
   ('inst-arts-001', 'xxx', 'BA - 1ST YEAR (ONE TIME)', true, '<ADMIN_ID>'),
   ('inst-arts-001', 'xxx', 'BA - 1ST TO 3RD YEAR', true, '<ADMIN_ID>');
   ```

4. **Add item categories** with amounts
   ```sql
   -- For "BA - 1ST YEAR (ONE TIME)" sub-category
   INSERT INTO billing_item_categories 
   (institution_id, parent_category_id, sub_category_id, item_category_name, amount, frequency, is_active, created_by)
   VALUES 
   ('inst-arts-001', 'xxx', 'yyy', 'Application Fee', 3000.00, 'one-time', true, '<ADMIN_ID>'),
   ('inst-arts-001', 'xxx', 'yyy', 'University Fee', 5000.00, 'one-time', true, '<ADMIN_ID>');
   ```

5. **Verify**: Query all categories for the new institution
   ```sql
   SELECT pc.parent_category_name, sc.sub_category_name, ic.item_category_name
   FROM billing_parent_categories pc
   LEFT JOIN billing_sub_categories sc ON sc.parent_category_id = pc.id
   LEFT JOIN billing_item_categories ic ON ic.sub_category_id = sc.id
   WHERE pc.institution_id = 'inst-arts-001';
   ```

---

## 🔄 **Bulk Import Pattern (For Multiple Institutions)**

```sql
-- Load all institutions first
WITH institutions_data AS (
  SELECT id FROM institutions WHERE is_active = true
),
-- Create a mapping of institution_code → parent categories to create
parent_categories_to_create AS (
  SELECT 
    i.id as institution_id,
    CASE 
      WHEN i.id = 'inst-eng-001' THEN 'ENGINEERING'
      WHEN i.id = 'inst-med-001' THEN 'NURSING'
      WHEN i.id = 'inst-med-001' THEN 'PHARMACY'
      WHEN i.id = 'inst-law-001' THEN 'LAW UNDERGRADUATE'
    END as parent_category_name
  FROM institutions i
  WHERE i.is_active = true
)
-- Insert all parent categories at once
INSERT INTO billing_parent_categories 
(id, institution_id, parent_category_name, is_active, created_by)
SELECT 
  uuid_generate_v4(),
  institution_id,
  parent_category_name,
  true,
  '<ADMIN_ID>'
FROM parent_categories_to_create
WHERE parent_category_name IS NOT NULL
RETURNING institution_id, parent_category_name;
```

---

## ✅ **Checklist: New Institution Billing Setup**

- [ ] Institution created in `institutions` table
- [ ] All 6 parent categories created (if multi-program institution)
- [ ] Sub-categories created for each program
- [ ] Item categories created with `amount` and `frequency`
- [ ] RLS policies verified (user can only see own institution)
- [ ] Test user assigned to institution can see their categories
- [ ] Test user from different institution cannot see these categories
- [ ] Verify no duplicate item names within a sub-category
- [ ] Finance team verifies all fee amounts are correct

---

**Generated**: 2026-04-28  
**Version**: 1.0  
**Status**: Ready for Multi-Institution Setup
