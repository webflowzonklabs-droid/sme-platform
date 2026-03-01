# HR & Workforce Modules — Design & Implementation Plan

## Overview

Three new modules for the SME Platform, built in dependency order:

1. **Branches** — Location/branch setup (no dependencies)
2. **Staff** — Staff onboarding, profiles, documents (depends: branches)
3. **Timekeeping** — Time tracking, payroll calculation (depends: staff, branches)

All modules follow the existing `defineModule()` pattern and are **vertical-agnostic**.

---

## Module 1: Branches (`branches`)

> Prerequisite for staff & timekeeping — staff are assigned to branches.

### Schema

```
branches
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (varchar 200) — "Main Store", "Commissary", "SM Seaside Branch"
├── code (varchar 50) — short code "MAIN", "COM", "SMS"
├── address (text, nullable)
├── city (varchar 100, nullable)
├── province (varchar 100, nullable)
├── contact_number (varchar 50, nullable)
├── is_active (boolean, default true)
├── settings (jsonb) — timezone, operating hours, etc.
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

### Navigation
- Branches → `/branches` (list/CRUD)

### Permissions
- `branches:view`, `branches:manage`, `branches:admin`

### Pages
- Branch list (with search)
- Branch create/edit dialog

---

## Module 2: Staff (`staff`)

> Staff profiles, documents, role/branch assignment, salary config.
> **Note:** "Staff" is separate from platform "Users" — a staff member may not have a login account. Think of Users as system accounts, Staff as HR records.

### Schema

```
staff_members
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── user_id (uuid, FK → users, nullable) — linked platform account (optional)
├── branch_id (uuid, FK → branches, nullable) — primary branch
├── employee_id (varchar 50) — company employee number
├── first_name (varchar 100)
├── last_name (varchar 100)
├── middle_name (varchar 100, nullable)
├── email (varchar 255, nullable)
├── phone (varchar 50, nullable)
├── date_of_birth (date, nullable)
├── hire_date (date)
├── end_date (date, nullable) — null = still employed
├── employment_type (varchar 50) — 'full-time', 'part-time', 'contractual', 'probationary'
├── position (varchar 200) — "Baker", "Cashier", "Store Manager"
├── department (varchar 200, nullable)
├── daily_rate (decimal 12,2) — daily salary
├── pay_frequency (varchar 20) — 'daily', 'weekly', 'bi-monthly', 'monthly'
├── sss_number (varchar 50, nullable)
├── philhealth_number (varchar 50, nullable)
├── pagibig_number (varchar 50, nullable)
├── tin_number (varchar 50, nullable)
├── bank_name (varchar 100, nullable)
├── bank_account_number (varchar 100, nullable)
├── emergency_contact_name (varchar 200, nullable)
├── emergency_contact_phone (varchar 50, nullable)
├── notes (text, nullable)
├── status (varchar 20) — 'active', 'inactive', 'terminated', 'on-leave'
├── is_deleted (boolean, default false) — soft delete
├── created_at (timestamptz)
└── updated_at (timestamptz)

staff_documents
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── staff_id (uuid, FK → staff_members)
├── name (varchar 200) — "NBI Clearance", "SSS E-1", "Resume"
├── file_url (text) — storage URL
├── file_type (varchar 50) — "pdf", "jpg", "png"
├── file_size (integer) — bytes
├── category (varchar 50) — 'government', 'medical', 'contract', 'certificate', 'other'
├── expiry_date (date, nullable) — for IDs/certs that expire
├── uploaded_at (timestamptz)
└── uploaded_by (uuid, FK → users)
```

### Navigation
- Staff → `/staff` (list all staff)
- Staff → `/staff/[id]` (profile detail + documents)

### Permissions
- `staff:view`, `staff:manage`, `staff:admin`
- `staff:salary:view` (separate — not everyone should see salaries)

### Pages
- Staff list (search, filter by branch/status/type)
- Staff create form (multi-step or single page)
- Staff detail page (profile info + documents tab)
- Document upload dialog

---

## Module 3: Timekeeping (`timekeeping`)

> Clock in/out, breaks, payroll calculation, adjustments.

### Schema

```
time_entries
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── staff_id (uuid, FK → staff_members)
├── branch_id (uuid, FK → branches)
├── date (date) — work date
├── clock_in (timestamptz)
├── clock_out (timestamptz, nullable) — null = still clocked in
├── break_minutes (integer, default 0) — total break time
├── overtime_minutes (integer, default 0) — approved OT
├── hours_worked (decimal 5,2) — computed: clock_out - clock_in - breaks
├── status (varchar 20) — 'pending', 'approved', 'rejected'
├── notes (text, nullable)
├── approved_by (uuid, FK → users, nullable)
├── created_at (timestamptz)
└── updated_at (timestamptz)

time_breaks
├── id (uuid, PK)
├── time_entry_id (uuid, FK → time_entries)
├── break_start (timestamptz)
├── break_end (timestamptz, nullable)
├── break_type (varchar 20) — 'lunch', 'rest', 'other'
└── duration_minutes (integer) — computed

payroll_periods
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (varchar 100) — "Feb 1-15, 2026"
├── start_date (date)
├── end_date (date)
├── status (varchar 20) — 'draft', 'calculated', 'approved', 'paid'
├── created_at (timestamptz)
└── updated_at (timestamptz)

payroll_items
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── payroll_period_id (uuid, FK → payroll_periods)
├── staff_id (uuid, FK → staff_members)
├── days_worked (decimal 5,2)
├── daily_rate (decimal 12,2) — snapshot from staff at calc time
├── basic_pay (decimal 12,2) — days_worked × daily_rate
├── overtime_pay (decimal 12,2, default 0)
├── overtime_hours (decimal 5,2, default 0)
├── overtime_rate_multiplier (decimal 3,2, default 1.25) — 125% for regular OT
├── holiday_pay (decimal 12,2, default 0)
├── night_diff_pay (decimal 12,2, default 0)
├── allowances (decimal 12,2, default 0)
├── deductions (decimal 12,2, default 0)
├── sss_contribution (decimal 12,2, default 0)
├── philhealth_contribution (decimal 12,2, default 0)
├── pagibig_contribution (decimal 12,2, default 0)
├── tax_withheld (decimal 12,2, default 0)
├── gross_pay (decimal 12,2) — basic + OT + holiday + night + allowances
├── net_pay (decimal 12,2) — gross - deductions - contributions - tax
├── adjustments_json (jsonb) — [{reason, amount, type: 'add'|'deduct'}]
├── status (varchar 20) — 'draft', 'approved', 'paid'
├── created_at (timestamptz)
└── updated_at (timestamptz)

salary_adjustments
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── staff_id (uuid, FK → staff_members)
├── payroll_item_id (uuid, FK → payroll_items, nullable)
├── type (varchar 20) — 'bonus', 'deduction', 'advance', 'reimbursement', 'penalty'
├── amount (decimal 12,2)
├── reason (text)
├── effective_date (date)
├── created_by (uuid, FK → users)
├── created_at (timestamptz)
└── updated_at (timestamptz)

holidays
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (varchar 200) — "New Year's Day"
├── date (date)
├── type (varchar 20) — 'regular', 'special', 'company'
├── pay_multiplier (decimal 3,2) — 2.0 for regular holidays, 1.3 for special
├── is_recurring (boolean, default false) — repeats yearly
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

### PH Labor Law Defaults
- Regular holiday: 200% of daily rate
- Special non-working holiday: 130% of daily rate
- Regular OT: 125% (8hrs+)
- Rest day: 130%
- Night diff (10PM-6AM): +10%

### Navigation
- Time Entries → `/timekeeping/entries` (daily view, clock in/out)
- Payroll → `/timekeeping/payroll` (periods, calculation)
- Holidays → `/timekeeping/holidays` (holiday calendar)

### Permissions
- `timekeeping:view`, `timekeeping:manage`, `timekeeping:admin`
- `timekeeping:payroll:view`, `timekeeping:payroll:manage` (separate)
- `timekeeping:approve` (approve time entries)

### Pages
- Time entries list (filter by date range, staff, branch)
- Clock in/out interface (for managers to log staff time)
- Payroll periods list
- Payroll calculation page (generate, review, approve)
- Payroll detail (per-staff breakdown)
- Holiday management
- Salary adjustments

### Payroll Calculation Logic
```
For each staff in period:
  1. Count days_worked from approved time_entries in date range
  2. basic_pay = days_worked × daily_rate
  3. overtime_pay = SUM(overtime_minutes) / 60 × (daily_rate/8) × OT_multiplier
  4. holiday_pay = days on holidays × daily_rate × holiday_multiplier
  5. gross = basic + overtime + holiday + night_diff + allowances
  6. Apply adjustments (bonuses, deductions, advances)
  7. Compute SSS/PhilHealth/Pag-IBIG (based on PH contribution tables)
  8. net = gross - deductions - contributions - tax
```

---

## Implementation Order

### Phase 1: Branches (1-2 days)
- Schema + migration
- tRPC router (CRUD)
- Frontend pages (list + create/edit dialog)
- Simple module, no complex logic

### Phase 2: Staff (3-4 days)
- Schema + migration
- tRPC router (CRUD, search, filter)
- Staff list page
- Staff detail page + document upload
- File storage setup (Supabase Storage or S3)

### Phase 3: Timekeeping & Payroll (5-7 days)
- Schema + migration
- Time entry CRUD + break tracking
- Holiday management
- Payroll period management
- **Payroll calculation engine** (most complex part)
  - PH labor law rates
  - SSS/PhilHealth/Pag-IBIG contribution tables
  - Tax computation
- Payroll review & approval flow
- Salary adjustments

### Total estimate: ~10-13 days

---

## Key Design Decisions

1. **Staff ≠ Users** — Staff is an HR record. A cashier might clock in via PIN but never log into the platform. `user_id` link is optional.

2. **Daily rate basis** — PH standard for SMEs. Monthly salaried staff can be computed as `monthly_rate / working_days_per_month`.

3. **Snapshot salary in payroll** — `daily_rate` is copied into `payroll_items` at calculation time so historical payroll is accurate even after raises.

4. **PH compliance built-in** — SSS, PhilHealth, Pag-IBIG contribution tables, holiday multipliers. These are configurable per tenant but default to current PH rates.

5. **Soft delete on staff** — Never hard delete staff records (payroll history depends on them).

6. **Branch-aware** — All time entries are branch-scoped. Useful for multi-location businesses.
