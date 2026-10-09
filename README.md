# Sales Management System — Waqar Rice Mills

Multi-user web app replacing the `Sales_Management_System.xlsx` + VBA workflow.
Full specification: [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md). Rules for contributors/agents: [`CLAUDE.md`](CLAUDE.md).

## Layout

| Path                     | What                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `apps/api`               | NestJS 11 REST API (`/api/v1`, port 4000)                         |
| `apps/web`               | Next.js 16 App Router + Tailwind 4 + TanStack Query (port 3000)   |
| `packages/shared`        | zod schemas, calc, permissions, formatters — used by both apps    |
| `packages/tsconfig`      | Shared `tsconfig` presets (`base`, `library`, `nestjs`, `nextjs`) |
| `packages/eslint-config` | Shared ESLint flat-config presets (`base`, `nest`, `next`)        |

## Getting started

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
cp .env.example apps/api/.env        # then fill in values
cp .env.example apps/web/.env.local  # only API_URL is needed

# Database — either a Neon URL in apps/api/.env, or a local PGlite Postgres (no install needed):
pnpm --filter api db:local           # keep running in its own terminal (data in apps/api/.pglite)
pnpm --filter api prisma migrate deploy
pnpm db:seed                         # settings, categories, first SUPER_ADMIN from SEED_SUPERADMIN_*

pnpm dev                             # web http://localhost:3000, api http://localhost:4000/api/v1
```

If `db:local` ever fails to start with `RuntimeError: Aborted()`, the local data was left inconsistent
(usually a hard kill mid-write). It's disposable: delete `apps/api/.pglite`, then re-run the migrate and
seed commands above.

The browser only talks to the web origin: `next.config.ts` rewrites `/api/*` to `${API_URL}/api/*`,
so auth cookies stay same-origin.

## Scripts

| Command                                     | Does                             |
| ------------------------------------------- | -------------------------------- |
| `pnpm dev`                                  | Run all apps in watch mode       |
| `pnpm build`                                | Build everything                 |
| `pnpm lint && pnpm typecheck && pnpm test`  | Must pass before every commit    |
| `pnpm --filter api test:e2e`                | API e2e tests (in-memory PGlite) |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Database                         |
| `pnpm --filter api db:local`                | Local Postgres via PGlite        |

## Toolchain notes

- **TypeScript is pinned to 6.0.x.** TS 7 (native) is out, but typescript-eslint, ts-jest and the
  Nest CLI still need the TS 6 JS API.
- **NestJS is pinned to 11.x.** Nest 12 is ESM-only; Jest and `nestjs-zod` don't support it yet.
- **`@sms/shared` is built with plain `tsc`** (CommonJS + `.d.ts`), not tsup. On machines with
  Windows Smart App Control, rollup's unsigned native binary is blocked.
- **Prisma 7 with driver adapters** (`@prisma/adapter-pg`): no native query engine, so it runs on
  Vercel functions and under Smart App Control. The generated client lives in
  `apps/api/src/generated` (git-ignored, created on `pnpm install`).
- **`@nestjs/jwt` is pinned to 11.x** — 12.x is ESM-only and Jest can't load it.

## Importing the old Excel workbook

Super Admin → **Import** (or the CLI). Always check first; nothing is written until you import.

```bash
pnpm import:excel "data/Sales Management System.xlsx" --dry-run --write-mapping data/mapping.json
# edit data/mapping.json: confirm each Sheet1 party/bank decision
pnpm import:excel "data/Sales Management System.xlsx" --mapping data/mapping.json
```

- Reads Products, Lists, Database (`tblLines`), Payments (`tblPayments`) and Sheet1 (bank log).
- Names are trimmed and merged case-insensitively; amounts are recalculated with the app's rules
  and compared with Excel line by line and with the Excel Dashboard totals.
- Sheet1 party names that don't match a party need a decision (same as a party / new party / leave
  out); bank texts map to the bank list (the original text stays in the payment's remarks).
- Sheet1 rows that repeat a Payments-sheet entry (same date, party, amount) are imported once.
- Re-running is safe: existing products/parties/invoice numbers/payments are skipped.
- Keep workbooks in `data/` — it is git-ignored.

## Auth

JWT access token (15 min) and an opaque, rotated refresh token (7 days, SHA-256 hashed in the DB),
both in httpOnly `SameSite=Lax` cookies set by the API. The refresh cookie is scoped to
`/api/v1/auth`. Re-using a rotated refresh token revokes all of that user's sessions. The API
reloads the user on every request, so deactivation and role changes apply immediately.

## Deploying to Vercel

Two projects from this repo — Root Directory `apps/web` and `apps/api` (each has a `vercel.json`).
Add a Neon database to the **api** project (Storage → Neon) and set `JWT_ACCESS_SECRET`, `WEB_URL`,
`SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`. Production builds of the api run
`prisma migrate deploy` and the idempotent seed (`apps/api/scripts/vercel-migrate.mjs`).
Set `API_URL` on the **web** project to the api's URL.
