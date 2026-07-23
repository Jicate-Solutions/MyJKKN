# CSV Import Guide for Billing Categories

**File**: `billing_categories_master_data.csv`  
**Updated**: 2026-04-28  
**Purpose**: Bulk import all billing categories for all programs

---

## 📥 **File Overview**

### **CSV Columns**

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `parent_category_name` | String | "ENGINEERING" | Level 1: Program group |
| `sub_category_name` | String | "UG REGULAR - 1ST YEAR (ONE TIME)" | Level 2: Year/timing |
| `item_category_name` | String | "Tuition Fees" | Level 3: Individual fee |
| `amount` | Decimal(15,2) | 150000.00 | Fee amount (can be NULL if varies per student) |
| `frequency` | Enum | "yearly" | one-time, monthly, quarterly, yearly |
| `is_active` | Boolean | true | false to soft-delete without losing history |
| `notes` | Text | "Annual transport fee" | Internal notes |

---

## 📊 **Data Statistics**

| Metric | Count |
|--------|-------|
| Total Rows (items) | 79 |
| Parent Categories | 6 |
| Sub Categories | 28 |
| Item Categories | 79 |
| Average items per parent | 13 |
| One-time fees | 24 |
| Yearly fees | 40 |
| Monthly/Per-semester | 15 |

### **Breakdown by Program**

```
ENGINEERING               → 8 items
NURSING                   → 10 items
PHARMACY                  → 32 items
ALLIED HEALTH SCIENCE     → 9 items
DENTAL                    → 14 items
EDUCATION                 → 5 items
─────────────────────────────
TOTAL                      → 79 items
```

---

## 🔄 **How to Import**

### **Option 1: Direct SQL Insert (Recommended for Bulk)**

#### **Step 1: Prepare the Data**

```sql
-- Create a temporary table from CSV
CREATE TEMP TABLE billing_import_temp (
  parent_category_name VARCHAR(100),
  sub_category_name VARCHAR(150),
  item_category_name VARCHAR(150),
  amount NUMERIC(15,2),
  frequency VARCHAR(20),
  is_active BOOLEAN,
  notes TEXT
);

-- Import CSV data (using your database tool)
-- In Supabase: Data Editor → CSV Import
-- In psql: \COPY billing_import_temp FROM '/path/to/file.csv' CSV HEADER;
```

#### **Step 2: Insert Parent Categories**

```sql
-- Insert unique parent categories
INSERT INTO billing_parent_categories 
(id, institution_id, parent_category_name, is_active, created_by)
SELECT DISTINCT
  uuid_generate_v4(),
  '<INSTITUTION_ID>',  -- Replace with actual institution_id
  parent_category_name,
  true,
  '<USER_ID>'  -- Replace with actual user_id
FROM billing_import_temp
WHERE parent_category_name IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM billing_parent_categories pc
  WHERE pc.parent_category_name = billing_import_temp.parent_category_name
  AND pc.institution_id = '<INSTITUTION_ID>'
)
ON CONFLICT DO NOTHING
RETURNING id, parent_category_name;

-- Save the returned IDs for next step
```

#### **Step 3: Insert Sub Categories**

```sql
-- Insert unique sub categories
INSERT INTO billing_sub_categories 
(id, institution_id, parent_category_id, sub_category_name, is_active, created_by)
SELECT DISTINCT
  uuid_generate_v4(),
  '<INSTITUTION_ID>',
  pc.id,  -- FK from parent_categories
  bit.sub_category_name,
  true,
  '<USER_ID>'
FROM billing_import_temp bit
JOIN billing_parent_categories pc 
  ON pc.parent_category_name = bit.parent_category_name
  AND pc.institution_id = '<INSTITUTION_ID>'
WHERE bit.sub_category_name IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM billing_sub_categories sc
  WHERE sc.sub_category_name = bit.sub_category_name
  AND sc.parent_category_id = pc.id
)
ON CONFLICT DO NOTHING
RETURNING id, sub_category_name;

-- Save the returned IDs for next step
```

#### **Step 4: Insert Item Categories**

```sql
-- Insert all item categories
INSERT INTO billing_item_categories 
(id, institution_id, parent_category_id, sub_category_id, 
 item_category_name, amount, frequency, is_active, created_by)
SELECT 
  uuid_generate_v4(),
  '<INSTITUTION_ID>',
  pc.id,
  sc.id,
  bit.item_category_name,
  bit.amount,
  bit.frequency,
  bit.is_active,
  '<USER_ID>'
FROM billing_import_temp bit
JOIN billing_parent_categories pc 
  ON pc.parent_category_name = bit.parent_category_name
  AND pc.institution_id = '<INSTITUTION_ID>'
JOIN billing_sub_categories sc 
  ON sc.parent_category_id = pc.id
  AND sc.sub_category_name = bit.sub_category_name
WHERE bit.item_category_name IS NOT NULL
RETURNING id, item_category_name, amount, frequency;

-- Verify the count matches
SELECT COUNT(*) FROM billing_item_categories 
WHERE institution_id = '<INSTITUTION_ID>';
-- Should show: 79
```

#### **Step 5: Cleanup**

```sql
-- Drop temporary table
DROP TABLE IF EXISTS billing_import_temp;

-- Verify all data is present
SELECT 
  'Parent Categories' as type, COUNT(*) as count
FROM billing_parent_categories
WHERE institution_id = '<INSTITUTION_ID>'
UNION ALL
SELECT 'Sub Categories', COUNT(*) 
FROM billing_sub_categories
WHERE institution_id = '<INSTITUTION_ID>'
UNION ALL
SELECT 'Item Categories', COUNT(*) 
FROM billing_item_categories
WHERE institution_id = '<INSTITUTION_ID>';
```

---

### **Option 2: Excel/Google Sheets (Interactive)**

#### **Step 1: Open in Excel**
- Download `billing_categories_master_data.csv`
- Open with Excel/Google Sheets
- Review all columns and values
- Make any institution-specific adjustments

#### **Step 2: Adjust Amounts** (Optional)
- Each institution has different fee amounts
- Update the `amount` column for your institution
- Examples:
  - JKKN Engineering: Tuition = ₹1,50,000
  - JKKN Medical: Tuition = ₹5,00,000
  - JKKN Law: Tuition = ₹80,000

#### **Step 3: Export & Import**
- Save as CSV
- Go to Supabase → Data Editor
- Select `billing_parent_categories` table
- Click "Import" → Choose your CSV
- Select appropriate column mappings

---

## ⚙️ **Customization Examples**

### **Example 1: JKKN Engineering College**

```csv
ENGINEERING,UG REGULAR - 1ST TO 4TH YEAR,Tuition Fees,150000.00,yearly,true,Engineering UG Tuition

-- Keep as-is (already optimized for engineering)
```

### **Example 2: JKKN Medical College**

```csv
-- Update amounts for medical college
NURSING,UG REGULAR - 1ST TO 3RD YEAR,Tuition Fees + Uniform + Hospital Training,250000.00,yearly,true,Medical college higher rate
PHARMACY,UG REGULAR - 1ST TO 4TH YEAR,Tuition Fees,300000.00,yearly,true,Medical college higher rate
DENTAL,BDS - 1ST TO 4TH YEAR (HOSTEL CANDIDATE),Tuition Fees + Instruments + Hostel Fees,500000.00,yearly,true,Medical college higher rate
```

### **Example 3: JKKN Law College** (No hostel fees)

```csv
-- Remove hostel rows, keep only day-scholar fees
LAW UNDERGRADUATE,UG REGULAR - 1ST TO 3RD YEAR,Tuition Fees,80000.00,yearly,true,Law college day-scholar only
LAW UNDERGRADUATE,UG REGULAR - 1ST TO 3RD YEAR,Exam Fees,1000.00,per-semester,true,Law college semester exam fee

-- Omit hostel rows entirely
```

---

## ✅ **Pre-Import Checklist**

- [ ] Institution ID is valid in `institutions` table
- [ ] User ID (created_by) is valid in `profiles` table
- [ ] All fee amounts are correct for your institution
- [ ] Frequency values are one of: `'one-time'`, `'monthly'`, `'quarterly'`, `'yearly'`
- [ ] No duplicate parent/sub/item names within same parent category
- [ ] All amounts are in format: `12345.00` (decimal with 2 places)
- [ ] CSV is saved with UTF-8 encoding (for special characters)

---

## 🧪 **Post-Import Verification**

### **Test 1: Count Verification**

```sql
SELECT 
  COUNT(DISTINCT parent_category_id) as parent_count,
  COUNT(DISTINCT sub_category_id) as sub_count,
  COUNT(*) as total_items
FROM billing_item_categories
WHERE institution_id = '<INSTITUTION_ID>';

-- Expected result for single institution: ~6 parents, ~28 subs, ~79 items
-- (Adjust based on which programs you imported)
```

### **Test 2: No Orphaned Data**

```sql
-- Check for items with missing sub-categories
SELECT COUNT(*) as orphaned_items
FROM billing_item_categories
WHERE sub_category_id NOT IN (
  SELECT id FROM billing_sub_categories
);
-- Should be: 0

-- Check for subs with missing parents
SELECT COUNT(*) as orphaned_subs
FROM billing_sub_categories
WHERE parent_category_id NOT IN (
  SELECT id FROM billing_parent_categories
);
-- Should be: 0
```

### **Test 3: Frequency Check**

```sql
SELECT frequency, COUNT(*) as count
FROM billing_item_categories
WHERE institution_id = '<INSTITUTION_ID>'
GROUP BY frequency;

-- Expected:
-- one-time: 12 (app fee + university fee per program)
-- yearly: 30+
-- monthly: 5+
-- per-semester: 8+
```

### **Test 4: Amount Validation**

```sql
-- Check for NULL amounts (should be intentional)
SELECT item_category_name, COUNT(*) 
FROM billing_item_categories
WHERE institution_id = '<INSTITUTION_ID>'
AND amount IS NULL
GROUP BY item_category_name;

-- Legitimate NULLs: Tuition (varies per category), Hostel (varies), etc.
```

---

## 🔧 **Troubleshooting**

### **Problem: "Foreign Key Constraint Failed"**

**Cause**: Parent category doesn't exist when inserting sub-category  
**Solution**: Ensure you insert in order: Parents → Subs → Items

### **Problem: "Duplicate Key Value Violates Unique Constraint"**

**Cause**: Same parent/sub/item name already exists  
**Solution**: Check for existing entries first:
```sql
SELECT * FROM billing_parent_categories 
WHERE parent_category_name = 'ENGINEERING'
AND institution_id = '<INSTITUTION_ID>';
```

### **Problem: "Invalid Frequency Value"**

**Cause**: Frequency is not one of the allowed values  
**Solution**: Update CSV to use only: `one-time`, `monthly`, `quarterly`, `yearly`

### **Problem: "Institution Not Found"**

**Cause**: `<INSTITUTION_ID>` doesn't exist in institutions table  
**Solution**: Verify institution:
```sql
SELECT id, institution_name FROM institutions 
WHERE is_active = true;
```

---

## 📋 **Multi-Institution Import Strategy**

### **For Multiple Institutions:**

```bash
# Create separate CSVs per institution
billing_categories_engineering.csv    (8 items)
billing_categories_medical.csv        (45 items)
billing_categories_law.csv            (10 items)

# Or use a single CSV with an institution column:
parent_category_name,sub_category_name,...,institution_code
ENGINEERING,UG REGULAR,...,ENG
NURSING,UG REGULAR,...,MED
LAW UNDERGRADUATE,...,LAW
```

### **Then Import with Filter:**

```sql
-- Replace institution_code with actual ID
WITH inst_lookup AS (
  SELECT id, institution_code FROM institutions
)
INSERT INTO billing_parent_categories 
(institution_id, parent_category_name, ...)
SELECT 
  il.id,
  bit.parent_category_name,
  ...
FROM billing_import_temp bit
JOIN inst_lookup il ON il.institution_code = bit.institution_code;
```

---

## 📞 **Support**

- **CSV too large to view?** → Open in Google Sheets or LibreOffice
- **Special characters not showing?** → Re-save as UTF-8 encoding
- **Import is slow?** → Disable triggers temporarily, then re-enable:
  ```sql
  ALTER TABLE billing_parent_categories DISABLE TRIGGER ALL;
  -- ... do import ...
  ALTER TABLE billing_parent_categories ENABLE TRIGGER ALL;
  ```

---

**CSV File Location**: `docs/billing/billing_categories_master_data.csv`  
**Status**: Ready for Import ✅  
**Last Updated**: 2026-04-28
