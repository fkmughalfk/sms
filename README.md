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

## CI

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit + API e2e on in-memory
PGlite, so no database service) and `pnpm build` on every push to `main` and every pull request.

Migrations are applied by the **api** project's Vercel production build (`scripts/vercel-migrate.mjs`),
not by CI: the Neon connection strings live only in Vercel, and preview builds never migrate.

## API docs

Outside production the API serves Swagger UI at `http://localhost:4000/api/docs`. Request bodies are
validated by the zod schemas in `packages/shared/src/schemas`, which are the reference for payloads.

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

**As part of the seed (local development):** set `SEED_WORKBOOK` and `SEED_MAPPING` in
`apps/api/.env` (paths from the repo root, see `.env.example`) and `pnpm db:seed` loads the workbook after
the base data. A workbook with problems stops the seed with the report; nothing is written.

**Production (Neon):** don't use `db:seed` (it would also create the `.env` seed admin). Load only the
workbook, with the Neon _direct_ connection string from Vercel → api project → Settings → Environment
Variables → `DATABASE_URL_UNPOOLED`:

```powershell
$env:DIRECT_URL = "postgresql://…"   # paste; never commit it
pnpm import:excel "data/Sales Management System.xlsx" --mapping data/mapping.json --dry-run
pnpm import:excel "data/Sales Management System.xlsx" --mapping data/mapping.json
Remove-Item Env:DIRECT_URL
```

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
