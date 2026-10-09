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
pnpm dev                             # web http://localhost:3000, api http://localhost:4000/api/v1
```

The browser only talks to the web origin: `next.config.ts` rewrites `/api/*` to `${API_URL}/api/*`,
so auth cookies stay same-origin.

## Scripts

| Command                                     | Does                             |
| ------------------------------------------- | -------------------------------- |
| `pnpm dev`                                  | Run all apps in watch mode       |
| `pnpm build`                                | Build everything                 |
| `pnpm lint && pnpm typecheck && pnpm test`  | Must pass before every commit    |
| `pnpm --filter api test:e2e`                | API end-to-end tests (Supertest) |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Database (from Phase 2)          |

## Toolchain notes

- **TypeScript is pinned to 6.0.x.** TS 7 (native) is out, but typescript-eslint, ts-jest and the
  Nest CLI still need the TS 6 JS API.
- **NestJS is pinned to 11.x.** Nest 12 is ESM-only; Jest and `nestjs-zod` don't support it yet.
- **`@sms/shared` is built with plain `tsc`** (CommonJS + `.d.ts`), not tsup. On machines with
  Windows Smart App Control, rollup's unsigned native binary is blocked.
