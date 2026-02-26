# Inventory CSV Import - Quick Reference Card

## 📋 Templates Available

| Template | Use For | Example Items |
|----------|---------|---------------|
| **inventory_consumable_template.csv** | Stock-tracked items that get depleted | Paper, chemicals, stationery, cleaning supplies |
| **inventory_non_consumable_template.csv** | Assets that can be booked/reserved | Projectors, computers, vehicles, rooms |

---

## ✅ Required Fields (Must Fill)

```
✓ resource_code          (Unique ID: PROJ001, STAT001)
✓ resource_name          (Display name)
✓ parent_category_name   (Main category)
✓ sub_category_name      (Sub-category)
✓ initial_stock_quantity (Starting qty)
✓ current_stock_quantity (Current qty)
✓ status                 (available, occupied, etc.)
```

---

## 📊 Status Values

| Value | When to Use |
|-------|-------------|
| `available` | ✅ Ready to use |
| `occupied` | 🔒 In use |
| `maintenance` | 🔧 Being serviced |
| `out_of_order` | ❌ Not working |
| `retired` | 🗑️ Disposed/No longer used |

---

## 🔖 Booking Types (Non-Consumable Only)

| Value | Meaning | Example |
|-------|---------|---------|
| `reservation` | Must book in advance | Conference rooms, vehicles |
| `walk_in` | Use without booking | Computer labs, library desks |
| `no_booking` | No booking needed | Furniture, fixtures |

---

## 📅 Date Format

**Always use:** `YYYY-MM-DD`

✅ Correct: `2024-06-15`
❌ Wrong: `15/06/2024`, `06-15-2024`, `15-Jun-2024`

---

## 🏷️ Custom Attributes Format

**Valid JSON only:**

✅ Correct:
```json
{"brand":"Samsung","ram":"8GB","processor":"i5"}
```

❌ Wrong:
```
brand:Samsung, ram:8GB
```

---

## 📍 Resource Code Naming

**Pattern:** `[CATEGORY][NUMBER]`

```
PROJ001   → Projector 1
STAT001   → Stationery 1
LAB001    → Lab Equipment 1
VEH001    → Vehicle 1
COMP001   → Computer 1
CHEM001   → Chemical 1
```

**Or with department:**
```
IT-PROJ-001      → IT Dept Projector 1
CHEM-LAB-001     → Chemistry Lab Equip 1
ADMIN-FURN-001   → Admin Furniture 1
```

---

## 🚫 Common Mistakes

| ❌ Don't | ✅ Do |
|---------|------|
| Leave resource_code empty | Use unique codes (PROJ001) |
| Use date format 15/01/2024 | Use 2024-01-15 |
| Write status as "in use" | Use `occupied` |
| Plain text in custom_attributes | Use valid JSON |
| Unescaped commas in description | Wrap in quotes: "Text, with, commas" |

---

## 🎯 Quick Import Checklist

Before importing, verify:

- [ ] Header row is present (row 1)
- [ ] All required fields filled
- [ ] resource_code is unique for each item
- [ ] Dates in YYYY-MM-DD format
- [ ] Status values are valid (available, occupied, etc.)
- [ ] Custom attributes are valid JSON (if used)
- [ ] No special characters in resource codes

---

## 📞 Access Roles (Common Values)

Use comma-separated values:

```
"faculty, admin"
"student, faculty"
"admin, hod, faculty"
"super_admin"
```

**Available roles:**
- super_admin
- admin
- hod (Head of Department)
- faculty
- student
- lab_assistant
- transport_manager
- sports_coordinator

---

## 🔢 Stock Quantities Guide

**Consumable Items:**
- Paper: 50-500 sheets/reams
- Chemicals: 10-100 units
- Stationery: 50-200 items

**Non-Consumable Items:**
- Equipment: Usually 1
- Rooms/Facilities: Always 1
- Vehicles: Always 1

---

## ⚡ Quick Start (3 Steps)

1. **Download Template**
   - Consumable: For depleting items
   - Non-consumable: For bookable assets

2. **Fill Data**
   - Keep header row
   - Follow examples in template
   - Validate format

3. **Import**
   - Resource Management → Resources → Import
   - Select CSV file
   - Confirm import

---

## 📚 Example Categories

### Consumable
- Stationery → Paper Products, Writing Instruments
- Chemicals → Acids, Bases, Reagents
- Cleaning → Liquid Cleaners, Tools

### Non-Consumable
- Audio Visual → Projectors, Microphones, Speakers
- Laboratory → Microscopes, Equipment, Instruments
- Facilities → Meeting Rooms, Halls, Courts
- Transportation → Buses, Vans, Cars
- Computing → Desktops, Laptops, Servers
- Furniture → Desks, Chairs, Cabinets

---

## 🆘 Troubleshooting

**Error:** Invalid JSON
→ Check custom_attributes, use JSON validator

**Error:** Duplicate resource_code
→ Make each code unique

**Error:** Invalid date
→ Use YYYY-MM-DD format

**Error:** Category not found
→ Categories auto-created, check spelling

---

## 📥 Download Templates

Access from: `/templates/`

- `inventory_consumable_template.csv`
- `inventory_non_consumable_template.csv`
- `INVENTORY_TEMPLATE_GUIDE.md` (Full guide)

---

**Print this card for quick reference!**
