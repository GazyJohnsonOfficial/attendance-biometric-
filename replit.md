# Class Attendance Pilot

A lecturer workspace for managing class rosters, attendance sessions, review decisions, and reports.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/attendance run dev` — run the lecturer web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/attendance` — lecturer-facing React/Vite application
- `artifacts/api-server/src/routes/attendance` — authenticated attendance API routes
- `artifacts/api-server/src/lib/attendance.ts` — attendance query and response helpers
- `lib/db/src/schema/attendance.ts` — PostgreSQL tables and indexes
- `lib/api-spec/openapi.yaml` — API contract; generated React hooks and Zod schemas come from this file

## Architecture decisions

- Class and session access is scoped to the authenticated Clerk user.
- The current Replit scaffold uses Express, React, and Drizzle. The supplied product specification names Django REST and Flutter; settle that stack difference before expanding the backend or starting the student mobile app.
- The rotating code is display-only. There is no student check-in endpoint or QR display yet, so never describe it as verified attendance.
- Do not capture or store face images, biometric templates, GPS traces, or device-integrity results until the consent, security, and Ghana privacy-law requirements are reviewed and implemented.

## Product

The first slice supports lecturer sign-in, class creation, CSV/XLSX roster preview and import, session creation, manual attendance marks, review decisions, session finalization, and attendance summaries. Student check-in, biometric verification, student accounts, administrator tools, and production exports are not implemented.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after editing the OpenAPI contract.
- Use `pnpm --filter @workspace/db run push` only for development database schema changes; do not run it against production.
- Roster preview intentionally accepts incomplete rows so lecturers can fix them before committing. The commit route remains stricter.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
