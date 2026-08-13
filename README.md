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

## Deploy to Vercel + Turso

Local `file:./dev.db` does **not** work on Vercel. Use Turso (SQLite-compatible cloud).

### 1. Create a Turso database

In [Turso](https://turso.tech) dashboard or CLI:

```bash
# one-time
npm i -g @turso/cli
turso auth login
turso db create hospital-sched
turso db show hospital-sched --url
turso db tokens create hospital-sched
```

Copy the **URL** (`libsql://…`) and **token**.

### 2. Put secrets in `.env` (and Vercel)

```env
# REQUIRED for Prisma CLI — must stay file:
DATABASE_URL="file:./dev.db"

TURSO_DATABASE_URL="libsql://YOUR-DB.turso.io"
TURSO_AUTH_TOKEN="your-token"
AUTH_SECRET="long-random-string"
AUTH_URL="https://your-app.vercel.app"
```

Do **not** put `libsql://` in `DATABASE_URL` — Prisma will error with “URL must start with file:”.

### 3. Push schema + seed to Turso

```bash
npm run db:setup:turso
```

Or step by step:

```bash
npm run db:push:turso
npm run db:seed:turso
```

### 4. Vercel project env vars

Add: `DATABASE_URL=file:./dev.db` (placeholder for build), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_URL`.

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
