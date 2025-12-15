# Billing Categories - Complete Context

> 3-Level fee category hierarchy for billing management

---

## Overview

Billing categories follow a 3-level hierarchy:
1. **Parent Categories**: Top-level groupings (Tuition, Hostel, Transport)
2. **Sub Categories**: Mid-level groupings under parent
3. **Item Categories**: Specific fee items with amounts

---

## Parent Categories

### Table: billing_parent_categories

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `parent_category_name` | TEXT | Yes | - | Category name |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `updated_by` | UUID | No | - | Last modifier user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### TypeScript Types

```typescript
export interface BillingParentCategory {
  id: string;
  institution_id: string;
  parent_category_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateBillingParentCategoryDto {
  institution_id: string;
  parent_category_name: string;
  is_active?: boolean;
}

export interface BillingParentCategoryFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

### Sample Data

```json
[
  {
    "id": "parent-1",
    "institution_id": "inst-uuid",
    "parent_category_name": "Tuition Fees",
    "is_active": true
  },
  {
    "id": "parent-2",
    "institution_id": "inst-uuid",
    "parent_category_name": "Hostel Fees",
    "is_active": true
  },
  {
    "id": "parent-3",
    "institution_id": "inst-uuid",
    "parent_category_name": "Transport Fees",
    "is_active": true
  },
  {
    "id": "parent-4",
    "institution_id": "inst-uuid",
    "parent_category_name": "Examination Fees",
    "is_active": true
  }
]
```

---

## Sub Categories

### Table: billing_sub_categories

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `parent_category_id` | UUID | Yes | - | FK to parent category |
| `sub_category_name` | TEXT | Yes | - | Sub category name |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `updated_by` | UUID | No | - | Last modifier user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### TypeScript Types

```typescript
export interface BillingSubCategory {
  id: string;
  institution_id: string;
  parent_category_id: string;
  sub_category_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  parent_category?: {
    id: string;
    parent_category_name: string;
  };
}

export interface CreateBillingSubCategoryDto {
  institution_id: string;
  parent_category_id: string;
  sub_category_name: string;
  is_active?: boolean;
}

export interface BillingSubCategoryFilters {
  search?: string;
  institution_id?: string;
  parent_category_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

### Sample Data

```json
[
  {
    "id": "sub-1",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-1",
    "sub_category_name": "Semester Fees",
    "parent_category": {
      "id": "parent-1",
      "parent_category_name": "Tuition Fees"
    }
  },
  {
    "id": "sub-2",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-1",
    "sub_category_name": "Lab Fees",
    "parent_category": {
      "id": "parent-1",
      "parent_category_name": "Tuition Fees"
    }
  },
  {
    "id": "sub-3",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-2",
    "sub_category_name": "Room Rent",
    "parent_category": {
      "id": "parent-2",
      "parent_category_name": "Hostel Fees"
    }
  },
  {
    "id": "sub-4",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-2",
    "sub_category_name": "Mess Fees",
    "parent_category": {
      "id": "parent-2",
      "parent_category_name": "Hostel Fees"
    }
  }
]
```

---

## Item Categories

### Table: billing_item_categories

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `parent_category_id` | UUID | Yes | - | FK to parent category |
| `sub_category_id` | UUID | Yes | - | FK to sub category |
| `item_category_name` | TEXT | Yes | - | Item name |
| `amount` | DECIMAL | No | - | Default amount (nullable) |
| `frequency` | TEXT | Yes | - | Billing frequency |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `updated_by` | UUID | No | - | Last modifier user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Frequency Options

| Value | Description |
|-------|-------------|
| `monthly` | Billed every month |
| `quarterly` | Billed every 3 months |
| `yearly` | Billed once per year |
| `one-time` | One-time fee |

### TypeScript Types

```typescript
export interface BillingItemCategory {
  id: string;
  institution_id: string;
  parent_category_id: string;
  sub_category_id: string;
  item_category_name: string;
  amount?: number | null;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  parent_category?: {
    id: string;
    parent_category_name: string;
  };
  sub_category?: {
    id: string;
    sub_category_name: string;
  };
}

export interface CreateBillingItemCategoryDto {
  institution_id: string;
  parent_category_id: string;
  sub_category_id: string;
  item_category_name: string;
  amount?: number | null;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  is_active?: boolean;
}

export interface BillingItemCategoryFilters {
  search?: string;
  institution_id?: string;
  parent_category_id?: string;
  sub_category_id?: string;
  frequency?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

### Sample Data

```json
[
  {
    "id": "item-1",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-1",
    "sub_category_id": "sub-1",
    "item_category_name": "CSE 1st Year Sem 1 Tuition",
    "amount": 50000,
    "frequency": "yearly",
    "parent_category": {
      "parent_category_name": "Tuition Fees"
    },
    "sub_category": {
      "sub_category_name": "Semester Fees"
    }
  },
  {
    "id": "item-2",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-1",
    "sub_category_id": "sub-2",
    "item_category_name": "Chemistry Lab Fee",
    "amount": 5000,
    "frequency": "yearly"
  },
  {
    "id": "item-3",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-2",
    "sub_category_id": "sub-3",
    "item_category_name": "Single Room Rent",
    "amount": 8000,
    "frequency": "monthly"
  },
  {
    "id": "item-4",
    "institution_id": "inst-uuid",
    "parent_category_id": "parent-2",
    "sub_category_id": "sub-4",
    "item_category_name": "Mess Charges (Veg)",
    "amount": 3500,
    "frequency": "monthly"
  }
]
```

---

## Hierarchy Visualization

```
Institution: JKKN College of Engineering
│
├── Tuition Fees (Parent)
│   ├── Semester Fees (Sub)
│   │   ├── CSE 1st Year Sem 1 - ₹50,000 (yearly)
│   │   ├── CSE 1st Year Sem 2 - ₹50,000 (yearly)
│   │   ├── ECE 1st Year Sem 1 - ₹45,000 (yearly)
│   │   └── ...
│   ├── Lab Fees (Sub)
│   │   ├── Chemistry Lab - ₹5,000 (yearly)
│   │   ├── Physics Lab - ₹5,000 (yearly)
│   │   └── Computer Lab - ₹8,000 (yearly)
│   └── Library Fee (Sub)
│       └── Annual Library Fee - ₹2,000 (yearly)
│
├── Hostel Fees (Parent)
│   ├── Room Rent (Sub)
│   │   ├── Single Room - ₹8,000 (monthly)
│   │   ├── Double Room - ₹5,000 (monthly)
│   │   └── Triple Room - ₹3,500 (monthly)
│   └── Mess Fees (Sub)
│       ├── Mess Charges (Veg) - ₹3,500 (monthly)
│       └── Mess Charges (Non-Veg) - ₹4,000 (monthly)
│
├── Transport Fees (Parent)
│   └── Bus Service (Sub)
│       ├── Route A - ₹2,500 (monthly)
│       ├── Route B - ₹3,000 (monthly)
│       └── Route C - ₹3,500 (monthly)
│
└── Examination Fees (Parent)
    └── Exam Registration (Sub)
        ├── Internal Exam Fee - ₹500 (one-time)
        ├── Semester Exam Fee - ₹1,500 (one-time)
        └── Supplementary Exam Fee - ₹800 (one-time)
```

---

## API Reference

### Parent Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/parent-categories` | List all |
| GET | `/api/api-management/billing/parent-categories/:id` | Get by ID |
| POST | `/api/billing/parent-categories` | Create new |
| PUT | `/api/billing/parent-categories/:id` | Update |
| DELETE | `/api/billing/parent-categories/:id` | Delete |

### Sub Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/sub-categories` | List all |
| GET | `/api/api-management/billing/sub-categories/:id` | Get by ID |
| POST | `/api/billing/sub-categories` | Create new |
| PUT | `/api/billing/sub-categories/:id` | Update |
| DELETE | `/api/billing/sub-categories/:id` | Delete |

### Item Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/item-categories` | List all |
| GET | `/api/api-management/billing/item-categories/:id` | Get by ID |
| POST | `/api/billing/item-categories` | Create new |
| PUT | `/api/billing/item-categories/:id` | Update |
| DELETE | `/api/billing/item-categories/:id` | Delete |

---

## Business Rules

1. **Unique Names**: Category names must be unique within their parent
2. **Cascade Delete**: Deleting parent deletes all children (with confirmation)
3. **Amount Optional**: Item amount can be null (specified at bill creation)
4. **Institution Scope**: All categories belong to a single institution
5. **Soft Delete**: is_active = false instead of hard delete

---

## Service Locations

| Service | Path |
|---------|------|
| Parent Category | `lib/services/billing/categories/billing-parent-category-service.ts` |
| Sub Category | `lib/services/billing/categories/billing-sub-category-service.ts` |
| Item Category | `lib/services/billing/categories/billing-item-category-service.ts` |

---

*Last Updated: December 2024*
