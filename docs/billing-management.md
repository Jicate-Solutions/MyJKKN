# Product Requirements Document (PRD): Billing Management

## Overview

The Billing Management system is a comprehensive module designed to handle all aspects of fee collection, payment processing, and financial documentation for educational institutions. It provides end-to-end billing workflows from fee categorization to invoice generation with integrated receipt management, discount processing, and refund handling.

---

## **Module 01 - Billing Parent Category**

### Purpose

Define high-level billing categories that serve as the foundation for the entire billing structure.

### Key Fields

- **College Name** (Drop-down from Institution Module) - _Required_
- **Billing Parent Category Name** (Text field, max 100 characters) - _Required_
  - Examples: Tuition Fee, Hostel Fee, Library Fee, Laboratory Fee
- **Status** (Active/Inactive) - _Default: Active_
- **Created Date** (Auto-populated)
- **Created By** (From User Session)

### Business Rules

- Parent category names must be unique within each college
- Cannot delete parent categories that have associated sub-categories

### Validations

- College selection is mandatory
- Parent category name cannot be empty or duplicate
- Special characters not allowed except hyphens and spaces

---

## **Module 02 - Billing Sub Category**

### Purpose

Create specific sub-divisions under parent categories for detailed fee classification.

### Key Fields

- **College Name** (Drop-down from Institution Module) - _Required_
- **Parent Category** (Drop-down from Billing Parent Category) - _Required_
- **Billing Sub Category Name** (Text field, max 100 characters) - _Required_
  - Examples: Lab Fee, Internet Fee, Maintenance Fee
- **Status** (Active/Inactive) - _Default: Active_
- **Created Date** (Auto-populated)
- **Created By** (From User Session)

### Business Rules

- Sub-category names must be unique within each parent category
- Cannot delete sub-categories that have associated billing items

### Validations

- All required fields must be filled
- Sub-category name cannot duplicate within the same parent category

---

## **Module 03 - Billing Item Category**

### Purpose

Define specific billable items with amounts and frequencies for actual fee collection.

### Key Fields

- **College Name** (Drop-down from Institution Module) - _Required_
- **Parent Category Name** (Drop-down) - _Required_
- **Sub Category Name** (Drop-down) - _Required_
- **Billing Item Category Name** (Text field, max 150 characters) - _Required_
- **Amount** (Decimal, up to 10,2) - _Optional_
- **Frequency** (Drop-down: Monthly/Quarterly/Yearly/One-time) - _Required_
- **Status** (Active/Inactive) - _Default: Active_

### Business Rules

- Cascading dropdowns: Parent Category → Sub Category based on college selection
- Amount can be predefined or left empty for manual entry during billing

### Validations

- Effective From Date cannot be past date
- Effective To Date must be greater than Effective From Date
- Amount must be positive number if provided

---

## **Module 04 - Billing Schedule (Enhanced)**

### **4.1 - Billing Search & Student List Page**

#### Key Fields

- **Institution Name** (Drop-down from Institution Module) - _Required_
- **Academic Year** (Drop-down) - _Optional_
- **Semester** (Drop-down) - _Optional_
- **Department** (Drop-down) - _Optional_
- **Student Name** (Search field with auto-complete)
- **Roll Number** (Search field)
- **Mobile Number** (Search field)
- **Search Button**
- **Clear Filters Button**

#### Student List Table Display

- **Roll Number**
- **Student Name**
- **Father Name**
- **Institution**
- **Department**
- **Degree**
- **Current Semester**
- **Outstanding Amount** (Calculated field)
- **Action Column**: "View Bill Details" button

#### Functionality

- **Advanced Search**: Multiple parameter combination search
- **Real-time Filtering**: Instant results as user types
- **Pagination**: Handle large student datasets
- **Export Options**: Excel/PDF export of student list
- **Bulk Selection**: Multi-student selection for bulk operations

### **4.2 - Individual Student Billing Schedule Page**

#### Student Profile Section

- **Student Photo** (If available)
- **Student Name**
- **Roll Number**
- **Mobile Number**
- **Email Address**
- **College/Institution**
- **Department**
- **Degree**
- **Programme**
- **Current Semester**
- **Academic Year**
- **Guardian Contact** (Emergency contact)

#### Billing Schedule Table

- **Bill Item Category** (Linked to Module 03)
- **Bill Description**
- **Due Date**
- **Quantity**
- **Unit Amount**
- **Total Amount**
- **Tax Amount** (If applicable)
- **Final Amount** (Including tax)
- **Status** (Paid/Unpaid/Partially Paid/Cancelled/Overdue)
- **Payment Date** (If paid)
- **Balance Amount** (For partial payments)
- **Action Options** (Pay/Edit/Cancel/View Details)

#### Page Controls

- **"Schedule Bill" Button**
- **"Bulk Schedule" Button**
- **Filter Options**:
  - All Bills | Paid | Unpaid | Partially Paid | Cancelled | Overdue
  - Date Range Filter
  - Amount Range Filter
- **Action Buttons**: Receipts | Discount | Refund | Invoice | View Transaction | Print Statement
- **Summary Cards**: Total Bills, Paid Amount, Outstanding Amount, Overdue Amount

### **4.3 - Bill Scheduling Form**

#### Key Fields

- **Student Information** (Display only - Name, Roll No, Department)
- **Bill Items** (Multi-select dropdown from Billing Item Category Module)
- **Due Date** (Date picker with minimum date validation)
- **Quantity** (Numeric input, default: 1)
- **Unit Amount** (Auto-fetch from Billing Item Category OR Manual entry)
- **Total Amount** (Auto-calculated)
- **Remarks** (Text area, max 500 characters)
- **Recurring Bill** (Checkbox)
- **Recurrence Pattern** (Monthly/Quarterly/Yearly - if recurring)
- **Number of Recurrences** (Numeric - if recurring)

#### Functionality

- **Add Multiple Bill Items**: Dynamic row addition
- **Auto-calculation**: Real-time amount calculations
- **Template Selection**: Pre-defined bill templates
- **Duplicate Detection**: Warning for similar existing bills
- **Bulk Student Assignment**: Same bill to multiple students
- **Save as Draft**: Partial completion capability

### **4.4 - Receipt Generation Integration**

#### Receipt Creation Process

**Step 1: Choose Scheduled Bills**

- Individual bill selection
- Multi-select with checkbox selection
- Filter by due date, amount, or category
- Display total amount for selected bills

**Step 2: Receipt Details Form**

- **Receipt Number** (Auto-generated with format: RCP-YYYY-NNNNNN)
- **Receipt Date** (Auto-filled, editable)
- **Payment Mode Selection**:
  - Cash
  - Online (UPI/Card/Net Banking)
  - Bank Transfer
  - DD (Demand Draft)
  - Cheque
- **Payment Reference Number** (For online/bank payments)
- **Payment Amount** (Total/Partial payment options)
- **Payment Columns** (Configurable number for installments)
- **Payment Paid Date** (Auto-filled, editable)
- **Payer Name** (Manual entry with suggestions)
- **Payer Contact** (Mobile/Email)
- **Accountant Selection** (Drop-down from Staff Module)
- **Payment Remarks** (Text area)

**Step 3: Receipt Generation**

- **Preview Receipt** (Before final generation)
- **Generate Receipt** (PDF with institutional branding)
- **Email Receipt** (Automatic email to student/payer)
- **SMS Notification** (Payment confirmation)
- **Print Receipt** (Direct printing option)

### **4.5 - Discount Management Integration**

#### Key Fields

- **Selected Bill Items** (Individual or Multi-select from scheduled bills)
- **Discount Category** (Pre-defined list):
  - Merit Scholarship
  - Financial Aid
  - Staff Quota
  - Sports Quota
  - Special Circumstances
- **Discount Type** (Amount/Percentage)
- **Discount Value** (Numeric input with validation)
- **Maximum Discount Limit** (System defined limits)
- **Discount Reason** (Text area, mandatory)
- **Supporting Documents** (File upload)
- **Authorizer** (Drop-down from Staff Module - Manager level and above)
- **Approval Date** (Auto-filled on approval)
- **Approval Status** (Pending/Approved/Rejected)
- **Effective Date** (Date picker)
- **Expiry Date** (Date picker, optional)

#### Business Rules

- Discount cannot exceed bill amount
- Percentage discounts have maximum limits based on category
- Multiple discounts on same bill require higher level approval
- Expired discounts are automatically deactivated

### **4.6 - Refund Management Integration**

#### Key Fields

- **Selected Paid Bills** (Individual or Multi-select)
- **Original Receipt Number** (Auto-populated)
- **Refund Category** (Pre-defined list):
  - Course Change
  - Withdrawal
  - Duplicate Payment
  - Service Not Provided
  - System Error
- **Refund Amount** (Cannot exceed paid amount)
- **Refund Date** (Date picker)
- **Refund Method**:
  - Cash
  - Bank Transfer
  - Adjust Against Future Bills
  - Cheque
- **Bank Details** (For bank transfers)
- **Refund Reason** (Text area, mandatory)
- **Supporting Documents** (File upload)
- **Authorizer** (Drop-down from Staff Module)
- **Processing Fee** (If applicable)
- **Net Refund Amount** (After deducting processing fee)
- **Approval Status** (Pending/Approved/Rejected/Processed)

#### Business Rules

- Refund amount cannot exceed original payment
- Processing fees are configurable by institution
- Refunds require documentary evidence for amounts above threshold
- Multiple approvals required for large refunds

### **4.7 - Invoice Generation Integration**

#### Key Fields

- **Invoice Type** (Individual/Consolidated)
- **Selected Paid Receipts** (Multi-select for consolidated)
- **Invoice Date** (Date picker, default: current date)
- **Invoice Number** (Auto-generated with format: INV-YYYY-NNNNNN)
- **Billing Period** (From Date - To Date)
- **Invoice Description** (Auto-generated or manual)
- **Tax Summary** (If applicable)
- **Payment Terms** (Text field)
- **Due Date** (Date picker)
- **Additional Charges** (If any)
- **Discount Applied** (Summary from individual receipts)
- **Grand Total** (Calculated field)

#### Functionality

- **Template Selection**: Multiple invoice templates
- **Consolidated Invoicing**: Multiple receipts in single invoice
- **Multi-currency Support**: For international students
- **Recurring Invoices**: Auto-generation for regular payments

### **4.8 - Transaction View & Reports**

#### Display Information

- **Transaction Timeline** (Chronological view)
- **Payment History** (All payments with details)
- **Outstanding Summary** (Current dues)
- **Paid Amount Summary** (Category-wise breakdown)
- **Refund History** (All refunds processed)
- **Discount History** (All discounts applied)
- **Transaction Status** (Real-time status tracking)
- **Payment Methods Used** (Statistical view)
- **Aging Analysis** (Overdue categorization)

#### Reports Available

- **Student Account Statement**
- **Payment Receipt Register**
- **Outstanding Fees Report**
- **Collection Summary Report**
- **Refund Register**
- **Discount Register**
- **Tax Collection Report**
- **Defaulters List**

---

## **Module 05 - Receipt Generation (Standalone)**

### Purpose

Dedicated module for receipt management and template configuration.

### Key Fields

- **Receipt Templates** (Multiple template designs)
- **Auto-numbering Configuration** (Format settings)
- **Institution Branding** (Logo, colors, fonts)
- **Receipt Fields Configuration** (Mandatory/optional fields)
- **Email Template Settings** (Automated email content)
- **SMS Template Settings** (Payment confirmation messages)
- **Digital Signature** (For authorized personnel)
- **Duplicate Receipt Control** (Security measures)

### Features

- **Template Designer** (Drag-and-drop receipt design)
- **Multi-language Support** (Regional language receipts)
- **QR Code Integration** (For receipt verification)
- **Batch Receipt Generation** (Bulk processing)
- **Receipt Audit Trail** (All receipt activities logged)

---

## **Module 06 - Discount Management (Standalone)**

### Purpose

Comprehensive discount policy management and approval workflows.

### Key Fields

- **Discount Policies** (Institution-wide policies)
- **Approval Workflows** (Multi-level approval setup)
- **Discount Limits** (Category-wise limits)
- **Eligibility Criteria** (Rule-based eligibility)
- **Discount Calendar** (Time-based discounts)
- **Bulk Discount Application** (Mass discount processing)
- **Discount Reversal** (Cancellation capability)

### Features

- **Policy Engine** (Rule-based discount application)
- **Approval Dashboard** (For managers/administrators)
- **Discount Analytics** (Usage statistics and trends)
- **Integration with Academic Records** (Merit-based discounts)

---

## **Module 07 - Refund Management (Standalone)**

### Purpose

Systematic refund processing with proper authorization and tracking.

### Key Fields

- **Refund Policies** (Institution refund rules)
- **Processing Workflows** (Step-by-step refund process)
- **Document Management** (Supporting document storage)
- **Payment Gateway Integration** (For online refunds)
- **Refund Tracking** (Status monitoring)
- **Compliance Reports** (Regulatory reporting)

### Features

- **Automated Refund Calculation** (Policy-based computation)
- **Integration with Accounting** (General ledger updates)
- **Refund Dashboard** (Management overview)
- **Audit Trail** (Complete refund history)

---

## **Module 08 - Invoice Management (Standalone)**

### Purpose

Professional invoicing system with taxation and compliance features.

### Key Fields

- **Invoice Templates** (Multiple professional formats)
- **Tax Configuration** (GST/VAT setup)
- **Recurring Invoice Setup** (Automated invoicing)
- **Invoice Approval Workflow** (For high-value invoices)
- **Integration with Accounting** (Automatic posting)
- **Multi-currency Invoicing** (For international students)

### Features

- **Invoice Designer** (Custom invoice layouts)
- **Automated Tax Calculation** (Based on applicable rates)
- **Invoice Portal** (Student self-service access)
- **Payment Link Integration** (Direct payment from invoice)

---

## **Summary**

The Enhanced Billing Management Module provides a comprehensive, scalable, and secure solution for educational institution fee management. Key improvements include:

### **Major Enhancements**

- **Complete Workflow Integration**: Seamless flow from fee categorization to payment processing
- **Advanced Search and Filtering**: Multi-parameter search with real-time results
- **Comprehensive Student View**: 360-degree view of student financial status
- **Flexible Payment Options**: Support for all payment methods and partial payments
- **Automated Processes**: Reduced manual effort through automation
- **Robust Security**: Enterprise-grade security and compliance features
- **Scalable Architecture**: Designed for growth and high transaction volumes
- **Mobile Responsive**: Optimized for mobile and tablet access

### **Business Benefits**

- **Operational Efficiency**: Streamlined processes reduce processing time by 60%
- **Improved Cash Flow**: Faster payment processing and collection
- **Enhanced Student Experience**: Self-service options and transparent billing
- **Regulatory Compliance**: Built-in compliance with educational and financial regulations
- **Data-Driven Insights**: Comprehensive reporting and analytics capabilities
- **Cost Reduction**: Automated processes reduce operational costs
- **Risk Mitigation**: Strong controls and audit capabilities

The system ensures modularity, flexibility, and maintainability while providing a superior user experience for all stakeholders - students, parents, staff, and administrators.
