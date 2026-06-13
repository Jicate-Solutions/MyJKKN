# Billing Categories — Quick Reference Guide

**For**: Billing Admins, Finance Teams, Developers  
**Updated**: 2026-04-28

---

## 🎯 **One-Page Overview**

### **What Are Billing Categories?**

A **3-tier hierarchical system** for organizing institution fees:

```
┌─────────────────────────────────────────────────────────────────┐
│ Level 1: PARENT CATEGORY (Program Group)                        │
│ Example: "ENGINEERING"                                          │
├─────────────────────────────────────────────────────────────────┤
│ Level 2: SUB CATEGORY (Year/Timing)                             │
│ Example: "UG REGULAR - 1ST TO 4TH YEAR"                         │
├─────────────────────────────────────────────────────────────────┤
│ Level 3: ITEM CATEGORY (Individual Fee)                         │
│ Example: "Tuition Fees" (₹1,50,000 / yearly)                   │
├─────────────────────────────────────────────────────────────────┤
│ Linked To: BILLING_STUDENT_BILLS (charges students)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔢 **Key Numbers**

| Metric | Count |
|--------|-------|
| Parent Categories (all institutions) | ~11 |
| Sub Categories (all institutions) | ~44 |
| Item Categories (all institutions) | ~158 |
| Average items per institution | ~30 |
| Average frequency: `yearly` or `one-time` | 90% |

---

## 📊 **Real Example: Engineering Student**

### **Year 1 (First Year) - One Time Fees**

Student gets billed:
```
Parent Category: ENGINEERING
  Sub: UG REGULAR - 1ST YEAR (ONE TIME)
    ├─ Application Fee ..................... ₹5,000    [one-time]
    └─ University Fee ...................... ₹8,000    [one-time]
                                           ───────
                                    Total: ₹13,000
```

### **Year 1 (First Year) - Recurring Fees**

Student gets billed:
```
Parent Category: ENGINEERING
  Sub: UG REGULAR - 1ST TO 4TH YEAR
    ├─ Tuition Fees ....................... ₹1,50,000  [yearly]
    ├─ Transport Fees ..................... ₹5,000     [yearly]
    ├─ Placement Fees ..................... ₹2,000     [yearly]
    ├─ Uniform Fees ....................... ₹3,000     [yearly]
    ├─ Hostel Fees ........................ ₹8,000     [monthly]
    └─ Exam Fees .......................... ₹1,500     [per semester]
                                           ───────
                                    Total: ₹1,69,500 + Hostel + Exam
```

### **Year 4 (Final Year) - Same as Years 1-3**

Same recurring fees structure continues until graduation.

---

## 🗂️ **Complete Program List**

### **Engineering**
- UG Regular (1st-4th year)
- Lateral Entry (2nd-4th year)

### **Nursing**
- UG Regular (1st-3rd year)
- PBBSC & PG Regular (1st-2nd year)

### **Pharmacy**
- UG Regular (1st-4th year)
- Lateral Entry (2nd-4th year)
- PharmD (1st-6th year)
- PharmD PB (4th-6th year)
- PG Regular (1st-2nd year)

### **Allied Health Science**
- UG Regular (1st-3rd year + 4th year internship)

### **Dental**
- BDS (1st-4th year + 5th year internship)
- MDS (1st-3rd year)

### **Education**
- UG Regular (1st-2nd year)

---

## 🗄️ **Database Quick Reference**

### **Tables**

| Table | Columns | Key Field | Purpose |
|-------|---------|-----------|---------|
| `billing_parent_categories` | id, institution_id, parent_category_name, is_active | institution_id | Groups programs |
| `billing_sub_categories` | id, institution_id, parent_category_id, sub_category_name, is_active | parent_category_id | Groups years |
| `billing_item_categories` | id, institution_id, parent_category_id, sub_category_id, item_category_name, amount, frequency, is_active | sub_category_id | Individual fees |
| `billing_student_bills` | id, student_id, item_category_id, amount, ... | item_category_id | Student charges |

### **Foreign Key Chain**

```
billing_student_bills → item_category_id
                           ↓
                   billing_item_categories
                           ↓
                   (parent_category_id, sub_category_id)
                           ↓
                billing_sub_categories
                billing_parent_categories
```

### **Multi-Tenancy Field**

**Every table has `institution_id`**:
- `billing_parent_categories.institution_id`
- `billing_sub_categories.institution_id`
- `billing_item_categories.institution_id`

This ensures **complete isolation** between institutions.

---

## 📋 **Frequency Cheat Sheet**

```
'one-time'   → Charged once (Application Fee, University Fee)
'monthly'    → Charged every month (Hostel Fees)
'quarterly'  → Charged every 3 months (Rare)
'yearly'     → Charged once per academic year (Tuition, Transport, etc.)
```

---

## 👤 **User Access Rules**

| User Type | Can See | Cannot See |
|-----------|---------|-----------|
| **Super Admin** | All categories (all institutions) | — |
| **Admin** | All categories (all institutions) | — |
| **Accountant** (inst-eng-001) | Categories for ENGINEERING only | Categories for other institutions |
| **Accountant** (inst-med-001) | Categories for MEDICAL only | Categories for other institutions |
| **Finance Manager** | Own institution categories | Other institution categories |

**Enforced by**: RLS policies on all 3 tables.

---

## 🔍 **Finding Things**

### **Find all items for a program**

```sql
-- All fees for "ENGINEERING" program
SELECT ic.item_category_name, ic.amount, ic.frequency
FROM billing_item_categories ic
JOIN billing_sub_categories sc ON ic.sub_category_id = sc.id
JOIN billing_parent_categories pc ON ic.parent_category_id = pc.id
WHERE pc.parent_category_name = 'ENGINEERING'
AND ic.is_active = true;
```

### **Find all one-time fees**

```sql
SELECT ic.item_category_name, ic.amount
FROM billing_item_categories ic
WHERE ic.frequency = 'one-time'
AND ic.is_active = true;
```

### **Find all fees for a student (from bills)**

```sql
SELECT 
  pc.parent_category_name,
  sc.sub_category_name,
  ic.item_category_name,
  sb.amount,
  sb.due_date
FROM billing_student_bills sb
JOIN billing_item_categories ic ON sb.item_category_id = ic.id
JOIN billing_sub_categories sc ON ic.sub_category_id = sc.id
JOIN billing_parent_categories pc ON ic.parent_category_id = pc.id
WHERE sb.student_id = '<STUDENT_ID>'
ORDER BY sb.due_date;
```

---

## ✏️ **Common Edits**

### **Change a fee amount**

```sql
-- Update Tuition Fee for Engineering
UPDATE billing_item_categories
SET amount = 1,75,000
WHERE item_category_name = 'Tuition Fees'
AND sub_category_id IN (
  SELECT id FROM billing_sub_categories 
  WHERE parent_category_id IN (
    SELECT id FROM billing_parent_categories 
    WHERE parent_category_name = 'ENGINEERING'
  )
);
```

### **Disable a fee (without deleting)**

```sql
-- Soft delete: set is_active = false
UPDATE billing_item_categories
SET is_active = false
WHERE item_category_name = 'Placement Fees'
AND institution_id = '<INSTITUTION_ID>';

-- Students already billed won't be affected
-- New students won't see this fee
```

### **Add a new fee**

```sql
INSERT INTO billing_item_categories 
(id, institution_id, parent_category_id, sub_category_id, 
 item_category_name, amount, frequency, is_active, created_by)
VALUES 
(uuid_generate_v4(), 
 '<INSTITUTION_ID>',
 '<PARENT_CATEGORY_ID>',
 '<SUB_CATEGORY_ID>',
 'Library Fee',
 2000,
 'yearly',
 true,
 '<USER_ID>');
```

---

## 🧪 **Quick Test Queries**

### **Test 1: Count everything**

```sql
SELECT 
  'Parent Categories' as type, COUNT(*) as count
FROM billing_parent_categories
UNION ALL
SELECT 'Sub Categories', COUNT(*) FROM billing_sub_categories
UNION ALL
SELECT 'Item Categories', COUNT(*) FROM billing_item_categories
UNION ALL
SELECT 'Student Bills', COUNT(*) FROM billing_student_bills;
```

### **Test 2: Find orphaned items** (items with no sub-category)

```sql
SELECT * FROM billing_item_categories
WHERE sub_category_id NOT IN (
  SELECT id FROM billing_sub_categories
);
```

### **Test 3: Check institution isolation**

```sql
-- User from institution A shouldn't see institution B's categories
SELECT institution_id, COUNT(*) 
FROM billing_item_categories 
GROUP BY institution_id;
-- Should see clear separation
```

---

## 🎓 **Examples by Program**

### **Example 1: Engineering Student (₹ Total)**

```
Year 1 Entry Fees:          ₹13,000
Year 1 Recurring:         ₹1,69,500 + Hostel (Monthly) + Exam (Semester)
Years 2-4 (Each):         ₹1,69,500 + Hostel (Monthly) + Exam (Semester)
─────────────────────────────────────────────────────────────────
Total Tuition (4 years):  ₹6,00,000+ (excluding hostel, exam, monthly charges)
```

### **Example 2: Nursing Student (₹ Total)**

```
Year 1 Entry Fees:         ₹13,000
Year 1 Recurring:        ₹80,000 + Hostel (Monthly)
Years 2-3 (Each):        ₹80,000 + Hostel (Monthly)
─────────────────────────────────────────────────────────────────
Total (3 years):         ₹2,40,000+ (excluding hostel, monthly charges)
```

### **Example 3: Dental Student (BDS) (₹ Total)**

```
Year 1 Entry Fees:         ₹13,000
Year 1 Recurring:      ₹2,50,000 (including instruments) + Hostel (Monthly)
Years 2-4 (Each):     ₹2,50,000 + Hostel (Monthly)
Year 5 Internship:    ₹50,000 (internship fee)
─────────────────────────────────────────────────────────────────
Total (5 years):       ₹13,00,000+ (excluding hostel, monthly charges)
```

---

## 🚀 **Getting Started (Admin)**

### **Step 1: View Categories**
- Go to **Billing** → **Categories**
- Select program from dropdown
- See full hierarchy

### **Step 2: Add New Category**
- Click **New Parent Category** (or Sub Category)
- Fill name, description
- Click Save

### **Step 3: Edit Fee Amount**
- Find the fee in Item Categories
- Click Edit
- Update amount and frequency
- Save

### **Step 4: Disable Fee**
- Find the fee
- Toggle `is_active = false`
- Save (doesn't delete, preserves history)

---

## ❓ **FAQ**

**Q: Can I have the same item name in different parent categories?**  
A: Yes! "Transport Fees" can exist in ENGINEERING, NURSING, PHARMACY, etc. Each has its own amount.

**Q: What if a student's fee amount is different from the item category default?**  
A: When creating a bill, you can override `amount`. The bill records the actual amount charged.

**Q: Can I delete an item category?**  
A: Best practice: set `is_active = false` instead. This preserves billing history.

**Q: Why do we need 3 tiers instead of just one list?**  
A: Organization! With 158+ fees, a 3-tier structure lets you:
- Group by program (Parent)
- Group by year/timing (Sub)
- Manage individual fees (Item)

**Q: What's the difference between one-time and yearly?**  
A: `one-time` = charged once per enrollment. `yearly` = charged every academic year.

---

## 📞 **Support**

- **Issues with calculations?** → Check frequency and amount in item_category
- **Fee not appearing?** → Check `is_active = true` on parent, sub, and item
- **Wrong institution?** → Verify `institution_id` matches user's institution
- **Students not billed?** → Check `billing_student_bills` for entries linking to item_category_id

---

**Last Updated**: 2026-04-28  
**Version**: 1.0  
**Status**: Quick Reference ✅
