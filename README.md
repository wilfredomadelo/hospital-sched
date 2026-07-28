# Hospital Nurse Scheduling

Web app for hospital nurse rostering, leave requests, and staffing compliance checks.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite
- Auth.js (NextAuth v5) credentials + role-based access

## Setup

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env` if needed. Defaults work for local demo.

## Seed logins

Password for all accounts: `password123`

| Role       | Email                         |
|------------|-------------------------------|
| Admin      | admin@hospital.local          |
| Supervisor | supervisor@hospital.local     |
| Nurse      | nurse1–15@hospital.local (ICU), nurse101–115@hospital.local (ER) |

## Features

### Rostering module
- Interactive nurse × date grid (sticky name column, scrollable dates)
- Views: weekly, **15-day**, monthly
- Color-coded cells: Day, Evening, Night, Off, Leave, Holiday
- Click cell to assign / change / clear
- Fill mode (paint shifts across cells)
- Bulk select nurses → apply or clear shifts
- Auto-generate drafts (preferences, leave, hours, night fairness)
- Copy previous period
- CSV export
- Filters: nurse name / employee ID, shift type, unit

### Core ops
- Role-based admin/supervisor and nurse portals
- Units and nurse profile CRUD
- Leave request / approve / deny (blocks assignments)
- Compliance alerts (overlap, hours, rest, license, leave)
- Workforce analytics dashboard
- In-app notifications on leave decisions and publish

## Scripts

| Script             | Description                        |
|--------------------|------------------------------------|
| `npm run dev`      | Start development server           |
| `npm run build`    | Production build                   |
| `npm run db:push`  | Apply Prisma schema to SQLite      |
| `npm run db:seed`  | Seed demo users, units, and shifts |
| `npm run db:setup` | Push schema + seed                 |

## Deferred

Shift swaps, open-shift marketplace, email/SMS, Excel/PDF export, AG Grid Enterprise, multi-hospital.
