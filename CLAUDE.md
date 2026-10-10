# CLAUDE.md — Sales Management System (Waqar Rice Mills)

The full specification is in `docs/PROJECT_SPEC.md`. Read it before starting any task, and follow its build plan (§13) one phase at a time.

## Stack

- Monorepo: Turborepo + pnpm workspaces. Node 22, TypeScript strict.
- `apps/api` is NestJS + Prisma + PostgreSQL.
- `apps/web` is Next.js App Router + Tailwind + shadcn/ui + TanStack Query.
- `packages/shared` holds the zod schemas, calc functions, permissions and formatters. Both apps import from it, so never duplicate this logic.
- Both apps deploy to Vercel. The DB is on Neon Postgres.

## Commands

- `pnpm dev` starts all apps (web on :3000, api on :4000).
- `pnpm lint && pnpm typecheck && pnpm test` must pass before any commit.
- `pnpm db:migrate`, `pnpm db:seed` and `pnpm db:studio` manage the database.

## Non-negotiable rules

1. **Money is Decimal**: use `decimal.js` in code and `Decimal` in Prisma. Never do money math with JS `number`.
2. **The server recomputes** every calculated field (rate/pack, amount, commission, weight, totals) using `packages/shared/src/calc`. Ignore client-sent calculated values.
3. Amount = `ROUND_HALF_UP(rate40Kg / 40 × packWeightKg × qtyPacks, 0)`. Commission = amount × rate, unrounded (stored to 4 dp). The golden test for invoice #15 (spec §6.4: total 1,272,188 / commission 4,452.658 / 200 bags) must always pass.
4. **Snapshot** `packWeightKg` and `commissionRate` onto each invoice line when it is saved.
5. **Permissions** come from `packages/shared/src/permissions.ts`. Enforce them in the API guard, and mirror them in the UI.
6. Soft delete invoices and payments (`deletedAt`), and deactivate masters (`isActive`). Never hard delete business data. The one exception is a master or user that nothing references (soft-deleted invoices and payments count as references). It may be hard deleted. Anything referenced gets a 409 that says to deactivate it instead.
7. Invoice and payment writes run in a single Prisma transaction, plus an `AuditLog` entry.
8. Trim names, and keep master names unique case-insensitively.
9. Use Asia/Karachi for "today" and month boundaries. Dates use the format `YYYY-MM-DD`.
10. The web app calls the API only through the `/api/*` rewrite (same-origin cookies). Do not put tokens in localStorage.

## Conventions

- Nest: use one module per feature (`controller`, `service`, `dto` built from shared zod schemas). Keep business logic in services, not controllers.
- Next: put route groups at `(auth)` and `(app)`. Put shared UI in `apps/web/components`, and the API client in `apps/web/lib/api.ts`.
- Write tests next to the code they cover: `*.spec.ts` (Nest) and `*.test.ts` (shared/web).
- Use conventional commits (`feat:`, `fix:`, `chore:`…).
- When a requirement is unclear, check spec §14 (open questions). Ask before guessing on anything that changes the data model.
