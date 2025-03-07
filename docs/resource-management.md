# Resource Management Workflow

## Module 1: Resource

### Key Fields
- Resource ID
- Resource Name
- Resource Type (Equipment, Facility, Vehicle, etc.)
- Category (fetch from Resource Category in Module 2)
- Description
- Location
  - Institution ID (fetch from Institution in Organization Management Module 1)
  - Department ID (fetch from Department in Organization Management Module 3)
  - Building
  - Room
- Specifications (flexible structure to hold extra details, e.g., RAM for a computer resource)
- Acquisition Date
- Value (monetary worth of the resource)
- Condition (Excellent, Good, Fair, Poor)
- Availability Schedule
  - Weekday Hours (e.g., Monday: 9:00-17:00)
- Is Shareable? (Yes/No)
- Sharing Restrictions (rules, e.g. "Only for lab sessions")
- Maintenance Schedule
  - Last Maintenance Date
  - Next Maintenance Date
- Owner Type (Institution, Department, Program)
- Owner ID
- Is Active (Boolean)
- Created At
- Updated At

### Connections
- Fetches Institution and Department information from the Organization Management modules (Institution, Department).
- References the Resource Category (Module 2) to classify resources and determine required attributes.
- Used by Reservations (Module 3) to track bookings and availability.
- Used by Sharing Policies (Module 4) for determining reservation rules (e.g., approvals, priorities).

### Summary
This module stores the core details of each resource and ties it to the institution and/or department. It ensures that all necessary information (location, availability, maintenance) is captured, providing a foundation for reservations, sharing policies, and further reporting.

## Module 2: Resource Category

### Key Fields
- Category ID
- Category Name
- Parent Category ID (can be null for top-level categories)
- Description
- Attributes (list of expected specifications, e.g., "Processor," "RAM" for computers)
- Is Active (Boolean)
- Created At
- Updated At

### Connections
- Referenced by Resource (Module 1) to classify each resource.
- Defines Attributes that a Resource might include in its Specifications.

### Summary
The Category module organizes resources by type or classification (e.g., Laboratory Equipment, Vehicles, etc.). It also supports hierarchical structure (e.g., a "Vehicles" parent category with child categories such as "Cars," "Buses"). Each category can define certain attributes that resources within that category should have.

## Module 3: Reservations

### Key Fields
- Reservation ID
- Resource ID (fetch from Resource in Module 1)
- User ID (fetch from Users in the authentication/organization context)
- Title
- Description
- Start DateTime
- End DateTime
- Status (Pending, Approved, Rejected, Canceled, Completed)
- Purpose
- Requester Institution ID (fetch from Organization Management Institution)
- Requester Department ID (fetch from Organization Management Department)
- Approver ID (if manual approval is required)
- Approval DateTime
- Notes
- Recurring Pattern (e.g., weekly, monthly)
- Created At
- Updated At

### Connections
- Depends on the Resource module to identify and check availability.
- Uses User data (from your centralized user management / Org Management) for requesters and approvers.
- Enforces rules from Sharing Policies (Module 4) to determine if approval is required or if any restrictions apply.

### Summary
The Reservations module manages booking requests for resources. It checks schedules, applies policy rules, and tracks the lifecycle of a reservation (from "Pending" to "Approved" or "Rejected").

## Module 4: Sharing Policies

### Key Fields
- Policy ID
- Resource Type ID (link to a specific resource category from Module 2, or a broad resource type)
- Institution ID (if the policy is specific to an institution; null if global)
- Priority Levels
  - Owner Priority
  - Same Institution Priority
  - Other Institution Priority
- Approval Required (Boolean)
- Max Reservation Duration (hours)
- Advance Notice Required (hours)
- Cancellation Policy (e.g., "Cancel at least 24 hours before start")
- Pricing Model
  - Internal Rate
  - External Rate
  - Rate Unit (per hour, per day, etc.)
- Is Active (Boolean)
- Created At
- Updated At

### Connections
- Enforced by Reservations (Module 3): determines if a reservation needs manual approval, how long bookings can last, and priority if conflicts occur.
- Ties into Resource data (Module 1) via resource type/category to know which policy applies.
- References Institution from Organization Management to apply institution-specific or global sharing rules.

### Summary
Sharing Policies define how resources can be reserved, who gets priority, maximum duration of reservations, and any costs. They ensure resources are utilized fairly among departments and institutions, with optional approval workflows in place.

## Module 5: Usage Reports

### Key Fields
- Resource ID (from Resource module)
- Time Period
  - Start Date
  - End Date
- Metrics
  - Total Hours Used
  - Utilization Percentage
  - Reservation Count
  - Unique Users
  - Cross-Institution Usage
- Usage by Institution (Record of institution → usage hours)
- Usage by Department (Record of department → usage hours)
- Peak Usage Times (Record of time slots → usage count)
- Created At

### Connections
- Gathers reservation data from Reservations (Module 3) to compute usage metrics.
- References Resource (Module 1) and possibly Institution/Department info from Organization Management for usage breakdown.

### Summary
Usage Reports provide analytical insight into how resources are being utilized across the institution(s). They help administrators understand resource demand, peak times, and cross-institution usage, enabling data-driven decisions about resource allocation and policy updates.

## Module 6: Resource Requests

### Key Fields
- Request ID
- Requester ID (User ID, referencing user data)
- Resource Type (Equipment, Facility, etc.)
- Specifications (details about the requested resource)
- Justification
- Estimated Cost
- Priority (Low, Medium, High)
- Status (Pending, Approved, Rejected, Acquired)
- Approver ID
- Approval Date
- Notes
- Created At
- Updated At

### Connections
- May reference Resource Category (Module 2) to indicate what type of new resource is requested.
- Ties into user data (from Organization Management or authentication) for requesters and approvers.
- Once approved, can be used to create a new Resource entry (Module 1).

### Summary
Resource Requests allow faculty or staff to formally request new or additional resources. An admin then reviews, approves/rejects, and if approved, the request can lead to acquisition and the creation of a new Resource record.

## Final Output (Sample Example)

Below is a hypothetical example showing how these modules interconnect, similar to the Organization Management final output sample:

### Resource
- Resource ID: RSC001
- Resource Name: Projector X123
- Resource Type: Equipment
- Category: "Audio-Visual Equipment" (from Resource Category)
- Location:
  - Institution ID: XYZ University (fetched from Organization Management)
  - Department ID: CSE Department (fetched from Organization Management)
  - Building: Main Block
  - Room: 205
- Specifications: { "Resolution": "1080p", "Brightness": "4000 lumens" }
- Acquisition Date: 2023-01-15
- Value: 1200
- Condition: Excellent
- Availability Schedule:
  - Weekday Hours: { Monday: "9:00-18:00", Tuesday: "9:00-18:00" … }
- Is Shareable: True
- Sharing Restrictions: [ "Not for off-campus use" ]
- Maintenance Schedule:
  - Last Maintenance: 2023-06-01
  - Next Maintenance: 2024-06-01
- Owner Type: Department
- Owner ID: CSE Department
- Is Active: True
- Created At: 2023-01-15
- Updated At: 2023-06-10

### Resource Category
- Category ID: CAT001
- Category Name: Audio-Visual Equipment
- Parent Category ID: null
- Description: All AV-related devices (projectors, screens, speakers, etc.)
- Attributes: [ "Resolution", "Brightness", "Max Display Size" ]
- Is Active: True
- Created At: 2022-12-01
- Updated At: 2023-01-10

### Reservations
- Reservation ID: RES001
- Resource ID: RSC001 (Projector X123)
- User ID: U001 (Professor Alice)
- Title: "Projector for Guest Lecture"
- Description: Need the projector for Monday's AI seminar
- Start DateTime: 2023-09-18 09:00
- End DateTime: 2023-09-18 11:00
- Status: Approved
- Purpose: Guest Lecture / Seminar
- Requester Institution ID: XYZ University
- Requester Department ID: CSE Department
- Approver ID: ADM101
- Approval DateTime: 2023-09-10 10:00
- Notes: "Make sure to test it beforehand"
- Recurring Pattern: null
- Created At: 2023-09-08
- Updated At: 2023-09-10

### Sharing Policies
- Policy ID: SPOL001
- Resource Type ID: CAT001 (Audio-Visual Equipment)
- Institution ID: XYZ University
- Priority Levels: { owner_priority: 1, same_institution_priority: 2, other_institution_priority: 3 }
- Approval Required: True
- Max Reservation Duration: 4 (hours)
- Advance Notice Required: 24 (hours)
- Cancellation Policy: "Cancel at least 2 hours before start"
- Pricing Model: { internal_rate: 0, external_rate: 100, rate_unit: "per day" }
- Is Active: True
- Created At: 2023-01-05
- Updated At: 2023-01-10

### Usage Reports
- Resource ID: RSC001 (Projector X123)
- Time Period: { "start_date": "2023-09-01", "end_date": "2023-09-30" }
- Metrics:
  - total_hours_used: 30
  - utilization_percentage: 20
  - reservation_count: 15
  - unique_users: 10
  - cross_institution_usage: 2
- Usage by Institution: { "XYZ University": 28, "ABC College": 2 }
- Usage by Department: { "CSE Department": 25, "ECE Department": 3 }
- Peak Usage Times: { "10:00-12:00": 8, "14:00-16:00": 7 }
- Created At: 2023-10-01

### Resource Requests
- Request ID: RREQ001
- Requester ID: U002 (Professor Bob)
- Resource Type: "Vehicle"
- Specifications: { "Seats": 12, "Fuel Type": "Diesel" }
- Justification: "Need a van for field trips."
- Estimated Cost: 30000
- Priority: "High"
- Status: "Pending"
- Approver ID: null
- Approval Date: null
- Notes: "Outdoor lab sessions require safe transport"
- Created At: 2023-09-25
- Updated At: 2023-09-25

## Summary of Flow Connections

- Resource (Module 1) is the central store for each item's details, linked to an Institution and/or Department from the Organization Management modules.
- Resource Category (Module 2) provides classification and attributes for each resource, much like how Degrees or Programs categorize fields of study.
- Reservations (Module 3) uses data from Resource and the existing user base to manage scheduling and track usage.
- Sharing Policies (Module 4) apply to resources by type/category, determining whether reservations need approval, maximum durations, and any cost considerations.
- Usage Reports (Module 5) aggregates reservation data (from Reservations) to provide insights into resource utilization.
- Resource Requests (Module 6) is a workflow for requesting additional or new resources, which may ultimately create new entries in Resource once approved.

By following this structure, the Resource Management module seamlessly integrates with the Organization Management data. It ensures that institutions, departments, degrees, and other organizational entities already defined can be referenced for accurate resource location, ownership, and usage reporting.

Note: This document mirrors the style and structure of your "Organization Management Workflow" with Modules, Key Fields, Connections, and Summaries for each sub-module. Any time you need to fetch data about the institution, department, program, etc., these should come from your already completed Organization Management module.
