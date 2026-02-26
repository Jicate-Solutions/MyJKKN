# Inventory CSV Template Guide

## Overview

This guide explains how to use the inventory CSV templates for importing both **consumable** and **non-consumable** resources into the MyJKKN Resource Management system.

## Template Files

1. **`inventory_consumable_template.csv`** - For items that get depleted (stationery, chemicals, supplies)
2. **`inventory_non_consumable_template.csv`** - For assets that can be booked/reserved (equipment, rooms, vehicles)

---

## Field Descriptions

### Core Fields (Required for All Resources)

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `resource_code` | Yes | Unique identifier for the resource | PROJ001, STAT001 |
| `resource_name` | Yes | Display name of the resource | LCD Projector, A4 Paper |
| `description` | No | Detailed description | "3300 lumens XGA projector for classrooms" |
| `parent_category_name` | Yes | Main category (will be created if doesn't exist) | Audio Visual, Stationery |
| `sub_category_name` | Yes | Sub-category under parent category | Projectors, Paper Products |

### Stock Management Fields

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `initial_stock_quantity` | Yes | Starting quantity when added | 100 |
| `current_stock_quantity` | Yes | Current available quantity | 85 |

**Note:**
- For **consumable** items: Track stock carefully (paper, chemicals, etc.)
- For **non-consumable** items: Usually set to 1 (single asset)

### Location Fields

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `building_number` | No | Building name or number | Main Building, Science Block |
| `block_number` | No | Block within building | A Block, B Wing |
| `floor_number` | No | Floor number | 1, 2, Ground |
| `room_number` | No | Room number or name | 101, Lab 301, Seminar Hall 1 |
| `location_notes` | No | Additional location details | "Near cafeteria", "Storage Room A" |

### Vendor/Supplier Fields

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `vendor_name` | No | Name of vendor/supplier | Tech Solutions Ltd |
| `vendor_email` | No | Vendor contact email | tech@example.com |
| `vendor_mobile` | No | Vendor phone number | 9876543210 |
| `vendor_address` | No | Vendor full address | 123 Tech Park, Chennai |

### Purchase & Warranty Fields

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `purchase_date` | No | Date of purchase (YYYY-MM-DD) | 2024-06-15 |
| `warranty_expiry_date` | No | When warranty expires (YYYY-MM-DD) | 2027-06-15 |
| `maintenance_schedule` | No | How often to maintain | Quarterly, Annual, Monthly |

### Assignment Fields

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `caretaker_name` | No | Person responsible for resource | John Doe, Dr. Smith |
| `caretaker_email` | No | Caretaker contact email | john@example.com |
| `department_name` | No | Department owning the resource | IT Department, Chemistry |

### Resource Status & Availability

| Field Name | Required | Description | Allowed Values |
|------------|----------|-------------|----------------|
| `status` | Yes | Current status of resource | available, occupied, maintenance, out_of_order, retired |

### Booking Configuration (Non-Consumable Only)

| Field Name | Required | Description | Allowed Values |
|------------|----------|-------------|----------------|
| `booking_type` | No* | How resource can be used | reservation, walk_in, no_booking |
| `booking_required` | No | Is booking mandatory | true, false |
| `access_roles` | No | Who can access (comma-separated) | "faculty, admin, student" |

**Note:** Required for non-consumable items that need booking/reservation.

### Metadata Fields

| Field Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `tags` | No | Searchable keywords (comma-separated) | "projector, av, classroom" |
| `custom_attributes` | No | JSON object for custom fields | {"lumens":"3300","type":"LED"} |

---

## Custom Attributes Format

Custom attributes allow you to store additional metadata specific to the resource type. Use JSON format:

```json
{
  "key1": "value1",
  "key2": "value2"
}
```

### Examples by Resource Type

**Electronics:**
```json
{
  "processor": "Intel i5",
  "ram": "8GB",
  "storage": "512GB SSD",
  "os": "Windows 11"
}
```

**Laboratory Equipment:**
```json
{
  "magnification": "40x-1000x",
  "type": "binocular",
  "light": "LED"
}
```

**Vehicles:**
```json
{
  "seating_capacity": "52",
  "fuel_type": "diesel",
  "registration": "TN01AB1234"
}
```

**Chemicals:**
```json
{
  "concentration": "98%",
  "grade": "AR",
  "hazard": "corrosive"
}
```

---

## Status Values Explained

| Status | When to Use |
|--------|-------------|
| `available` | Resource is ready to use/issue |
| `occupied` | Currently in use or issued |
| `maintenance` | Under maintenance or servicing |
| `out_of_order` | Not working, needs repair |
| `retired` | No longer in service, disposed |

---

## Booking Type Explained (Non-Consumable)

| Booking Type | When to Use | Example Resources |
|--------------|-------------|-------------------|
| `reservation` | Must be booked in advance | Conference rooms, projectors, vehicles |
| `walk_in` | Available for immediate use | Computer labs, library desks |
| `no_booking` | No booking needed | Furniture, fixtures |

---

## Import Steps

### Step 1: Download Template
1. Download the appropriate template:
   - `inventory_consumable_template.csv` for stock-tracked items
   - `inventory_non_consumable_template.csv` for bookable assets

### Step 2: Fill Template
1. Open the CSV in Excel or Google Sheets
2. **Keep the header row** (first row with column names)
3. Fill in your data starting from row 2
4. Follow the field descriptions above
5. Use the example rows as reference

### Step 3: Validate Data
Before importing, check:
- ✅ All required fields are filled
- ✅ Dates are in YYYY-MM-DD format
- ✅ Status values match allowed values
- ✅ Email addresses are valid
- ✅ Custom attributes are valid JSON
- ✅ No special characters in resource codes (use A-Z, 0-9, hyphen, underscore only)

### Step 4: Import
1. Go to **Resource Management** → **Resources**
2. Click **Import** button
3. Select your filled CSV file
4. Review the preview
5. Click **Confirm Import**

---

## Common Mistakes to Avoid

### ❌ Don't Do This

1. **Missing Required Fields**
   ```csv
   ,Projector,,,,  ❌ Missing resource_code, parent_category
   ```

2. **Invalid Date Format**
   ```csv
   purchase_date
   15/01/2024      ❌ Wrong format
   ```
   **✅ Use:** `2024-01-15`

3. **Invalid Status Value**
   ```csv
   status
   in_use          ❌ Not a valid status
   ```
   **✅ Use:** `available`, `occupied`, `maintenance`, `out_of_order`, or `retired`

4. **Invalid JSON in Custom Attributes**
   ```csv
   custom_attributes
   brand:Samsung   ❌ Not valid JSON
   ```
   **✅ Use:** `{"brand":"Samsung"}`

5. **Comma in Text Fields (breaks CSV)**
   ```csv
   description
   Projector, 3300 lumens, XGA  ❌ Unescaped commas
   ```
   **✅ Use:** `"Projector, 3300 lumens, XGA"` (wrap in quotes)

---

## Examples by Category

### Consumable Items

**Stationery:**
- resource_code: STAT001, STAT002
- Categories: Paper Products, Writing Instruments, Office Supplies
- High initial_stock_quantity (50-500)
- Track current_stock_quantity carefully

**Chemicals:**
- resource_code: CHEM001, CHEM002
- Categories: Acids, Bases, Reagents
- Include safety info in custom_attributes
- Mandatory vendor and expiry tracking

**Cleaning Supplies:**
- resource_code: CLEAN001, CLEAN002
- Categories: Liquid Cleaners, Tools, Safety Equipment
- Department: Usually Maintenance

### Non-Consumable Items

**Audio-Visual Equipment:**
- resource_code: PROJ001, MIC001
- Booking type: reservation
- Include specifications in custom_attributes
- Maintenance schedule: Quarterly

**Laboratory Equipment:**
- resource_code: LAB001, LAB002
- Booking type: walk_in or reservation
- Include calibration info in custom_attributes
- Regular maintenance required

**Facilities:**
- resource_code: ROOM001, HALL001
- Booking type: reservation
- Include capacity in custom_attributes
- Access roles: faculty, admin

**Vehicles:**
- resource_code: VEH001, VEH002
- Booking type: reservation (always)
- Include registration in custom_attributes
- Maintenance schedule: Monthly

---

## Bulk Import Tips

### For Large Datasets (100+ items):

1. **Split by Category**: Import one category at a time
2. **Use Consistent Codes**: Follow a naming scheme (PROJ001, PROJ002...)
3. **Test Small Batch First**: Import 5-10 items to verify format
4. **Backup**: Keep original CSV before making changes

### Resource Code Naming Conventions:

```
[CATEGORY][NUMBER]
PROJ001 - Projector 1
STAT001 - Stationery item 1
LAB001  - Lab equipment 1
VEH001  - Vehicle 1
```

Or with more detail:
```
[DEPT][CATEGORY][NUMBER]
IT-PROJ-001    - IT Department Projector 1
CHEM-LAB-001   - Chemistry Lab Equipment 1
ADMIN-FURN-001 - Admin Furniture 1
```

---

## Updating Existing Resources

To update existing resources via CSV:

1. **Export current data** first (to get correct IDs)
2. **Modify** the exported CSV
3. **Re-import** with the same resource_codes
4. System will **update** instead of creating duplicates

**Important:** resource_code acts as the unique key for updates.

---

## Access Roles Reference

Common role values for `access_roles` field (comma-separated):

- `super_admin` - Full system access
- `admin` - Institution administrators
- `hod` - Head of Department
- `faculty` - Teaching staff
- `lab_assistant` - Lab support staff
- `student` - Students
- `transport_manager` - Transport coordinators
- `sports_coordinator` - Sports department staff

**Example:**
```csv
access_roles
"faculty, admin, hod"
```

---

## Need Help?

### Common Issues:

**Q: Import failed with "Invalid JSON"**
- Check `custom_attributes` column
- Ensure all JSON is properly formatted with double quotes
- Use online JSON validator

**Q: Category not found**
- Categories are auto-created from `parent_category_name` and `sub_category_name`
- Make sure spelling is consistent across all rows

**Q: Duplicate resource_code error**
- Each resource_code must be unique
- Check for duplicates in your CSV

**Q: Date format errors**
- Always use YYYY-MM-DD format
- Leave blank if date not applicable

---

## Download Links

- **Consumable Template**: `/templates/inventory_consumable_template.csv`
- **Non-Consumable Template**: `/templates/inventory_non_consumable_template.csv`
- **This Guide**: `/templates/INVENTORY_TEMPLATE_GUIDE.md`

---

**Last Updated:** 2026-02-14
**Version:** 1.0
