# Sales Management System (SMS) — Project Specification

> **Client:** Waqar Rice Mills — Shamshad Khan Shaheed Road, Kamoke
> **Source of truth:** `Sales_Management_System.xlsx` (Data Entry, Dashboard, Database, Payments, Sheet1, Products, Lists, How To (VBA))
> **Goal:** Replace the Excel + VBA workflow with a multi-user web app.
> **Stack:** Monorepo (Turborepo + pnpm) · Backend **NestJS** · Frontend **Next.js** (App Router) · PostgreSQL + Prisma · Deployed on **Vercel**
> **Roles:** `SUPER_ADMIN`, `ADMIN`, `USER`

This document is written so Claude Code (or any developer) can build the project phase by phase. Every formula below was taken from the workbook; the worked example in §6.4 uses real invoice data and **must** be reproduced exactly by the code.

---

## 1. Monorepo layout

```
sms/
├── apps/
│   ├── api/                    # NestJS REST API
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/         # guards, decorators, filters, interceptors, pipes
│   │   │   ├── prisma/         # PrismaService + module
│   │   │   ├── auth/           # login, refresh, logout, JWT strategy
│   │   │   ├── users/          # user management (role-gated)
│   │   │   ├── settings/       # company profile, default commission, annual target
│   │   │   ├── masters/
│   │   │   │   ├── categories/
│   │   │   │   ├── products/
│   │   │   │   ├── parties/
│   │   │   │   ├── sub-parties/
│   │   │   │   ├── cities/
│   │   │   │   ├── salespersons/   # "ASM / Salesperson"
│   │   │   │   └── banks/
│   │   │   ├── invoices/       # sales invoices + lines
│   │   │   ├── payments/       # recovery entries
│   │   │   ├── reports/        # dashboard + aggregate endpoints
│   │   │   ├── audit/          # audit log
│   │   │   └── import/         # one-time Excel import
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── test/
│   └── web/                    # Next.js frontend
│       ├── app/
│       │   ├── (auth)/login/
│       │   └── (app)/
│       │       ├── dashboard/
│       │       ├── invoices/          # list, new, [id], [id]/edit, [id]/print
│       │       ├── payments/          # list, new
│       │       ├── recovery/          # party ledger / outstanding
│       │       ├── reports/
│       │       ├── masters/           # products, parties, sub-parties, cities, salespersons, banks, categories
│       │       ├── users/
│       │       └── settings/
│       ├── components/
│       ├── lib/                # api client, auth helpers, formatters
│       └── middleware.ts       # route protection by role
├── packages/
│   ├── shared/                 # ⭐ used by BOTH api and web
│   │   ├── src/
│   │   │   ├── calc/           # invoice math (§6) — pure functions + unit tests
│   │   │   ├── schemas/        # zod schemas (DTO validation, forms)
│   │   │   ├── enums.ts        # Role, Category, etc.
│   │   │   ├── permissions.ts  # role → permission matrix (§3)
│   │   │   └── format.ts       # PKR / KG / Tons / % formatting
│   │   └── package.json
│   ├── eslint-config/
│   └── tsconfig/
├── docs/
│   └── PROJECT_SPEC.md         # this file
├── CLAUDE.md                   # short rules for Claude Code
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

### 1.1 Tooling choices

| Concern | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Package manager | pnpm (workspaces) |
| Monorepo runner | Turborepo |
| Language | TypeScript, `strict: true` everywhere |
| Backend | NestJS (latest stable), `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/swagger`, `@nestjs/throttler` |
| Validation | `zod` schemas in `packages/shared` (use `nestjs-zod` or a custom `ZodValidationPipe` in the API, `react-hook-form` + `@hookform/resolvers/zod` in web) |
| ORM / DB | Prisma + PostgreSQL (Neon or Supabase; both work with Vercel) |
| Money math | `decimal.js` (never JS floats for money) |
| Frontend | Next.js (latest stable, App Router), Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, Recharts |
| Auth | JWT access token (15 min) + refresh token (7 days, rotated, hashed in DB), both in **httpOnly cookies** |
| Passwords | `argon2` |
| Excel import/export | `exceljs` |
| PDF invoice print | Browser print CSS (phase 1); `@react-pdf/renderer` optional later |
| Tests | Vitest (shared + web), Jest (Nest default) + Supertest for e2e |
| Lint/format | ESLint + Prettier, Husky + lint-staged |

### 1.2 Root scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:migrate": "pnpm --filter api prisma migrate dev",
    "db:seed": "pnpm --filter api prisma db seed",
    "db:studio": "pnpm --filter api prisma studio",
    "import:excel": "pnpm --filter api ts-node src/import/cli.ts"
  }
}
```

---

## 2. Domain overview (what the Excel does today)

| Excel sheet | What it does | Web app equivalent |
|---|---|---|
| **Data Entry** | Invoice form: header (Invoice No., Date, Party, City, Sub Party, ASM) + up to 12 product lines; buttons SAVE/UPDATE, LOAD FOR EDIT, DELETE INVOICE, CLEAR FORM | `/invoices/new`, `/invoices/[id]/edit` (unlimited lines) |
| **Database** (`tblLines`) | One row per invoice line, with calculated Pack Wt, Rate/Pack, Amount, Commission, Weight; totals: Tons, Total Sale, Commission, Packs, Avg per Ton, Avg per Pack | `Invoice` + `InvoiceLine` tables, `/invoices` list with totals footer |
| **Dashboard** | KPIs, annual target, sales by Category / ASM / Product, Payments & Recovery, Recovery by Party | `/dashboard` + `/reports` |
| **Payments** (`tblPayments`) | Payment entry (Date, Party, Sub Party, Slip No., Bank, Amount, Remarks) with live "Party Position"; recovery summary by party | `/payments/new`, `/recovery` |
| **Sheet1** | Raw bank/receipt log with free-text party names | One-time import → `Payment` (needs party mapping, §11) |
| **Products** | Product master: name, unit weight, pcs per pack, pack weight, category, commission rate (default 0.35%) | `/masters/products`, `/masters/categories` |
| **Lists** | Dropdown sources: Parties, Cities, ASMs, Sub Parties, Banks | `/masters/*` CRUD |
| **How To (VBA)** | Macro install guide | Not needed — replaced by the app |

### 2.1 Problems in the Excel to fix in the app

- Party/ASM names are free text with trailing spaces and inconsistent case (`"Tayyab Traders "` vs `"tayyab traders "`, `"Farhan Khalid"` vs `"Farhan Khalid "`). → **Use foreign keys to master tables. Trim + case-insensitive unique names.**
- Sheet1 payments use names like `"Pak Rice Traders dina"` that don't match the party list. → Import with a mapping step.
- Changing a product's weight or commission rate in Excel silently rewrites every historical invoice. → **Snapshot** pack weight and commission rate onto each invoice line at save time.
- Only 12 lines per invoice. → Unlimited lines.
- No users, no audit trail, no concurrency. → Roles, audit log, server-side validation.

---

## 3. Roles & permissions

Permissions live in `packages/shared/src/permissions.ts` and are enforced in **both** the API (guard) and the UI (hide/disable). The API is the authority.

| Permission | SUPER_ADMIN | ADMIN | USER |
|---|:-:|:-:|:-:|
| Manage company settings (name, address, default commission rate, annual target) | ✅ | ❌ | ❌ |
| Create/edit/deactivate **Admins** | ✅ | ❌ | ❌ |
| Create/edit/deactivate **Users** | ✅ | ✅ | ❌ |
| Manage categories & commission rates | ✅ | ✅ | ❌ |
| Manage products, parties, sub-parties, cities, salespersons, banks | ✅ | ✅ | ❌ (read only) |
| Create invoice | ✅ | ✅ | ✅ |
| Edit invoice | ✅ any | ✅ any | ✅ own, same day only* |
| Delete (soft) invoice | ✅ | ✅ | ❌ |
| Record payment | ✅ | ✅ | ✅ |
| Edit / delete payment | ✅ | ✅ | ❌ |
| View dashboard & reports | ✅ all | ✅ all | ✅ own data only** |
| Export to Excel | ✅ | ✅ | ❌ |
| View audit log | ✅ | ✅ | ❌ |
| Run Excel import | ✅ | ❌ | ❌ |

\* Configurable in Settings (`userEditWindowHours`, default 24).
\** A `USER` may optionally be linked to a `Salesperson`; if linked, they see only invoices for that salesperson (or invoices they created).

Rules:
- There must always be at least one active SUPER_ADMIN (block deactivating or demoting the last one).
- An ADMIN cannot change any user's role to ADMIN or SUPER_ADMIN.
- First SUPER_ADMIN is created by `prisma db seed` from `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`.

> ⚠️ **Assumption to confirm with the client:** the table above is a sensible default. Adjust it before Phase 2 if the business wants something different.

---

## 4. Database schema (Prisma)

All money is stored as `Decimal`. All tables have `createdAt`, `updatedAt`. Master tables use `isActive` instead of hard delete. Invoices and payments use `deletedAt` (soft delete).

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role { SUPER_ADMIN ADMIN USER }

model User {
  id             String       @id @default(cuid())
  name           String
  email          String       @unique
  passwordHash   String
  role           Role         @default(USER)
  isActive       Boolean      @default(true)
  salespersonId  String?      // optional link for USER data scoping
  salesperson    Salesperson? @relation(fields: [salespersonId], references: [id])
  lastLoginAt    DateTime?
  refreshTokens  RefreshToken[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model RefreshToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
  @@index([userId])
}

model Setting {           // single row (id = 1)
  id                     Int      @id @default(1)
  companyName            String   @default("WAQAR RICE MILLS")
  companyAddress         String   @default("Shamshad Khan Shaheed Road, Kamoke")
  defaultCommissionRate  Decimal  @default(0.0035) @db.Decimal(8, 6)  // 0.35%
  annualSalesTarget      Decimal  @default(10000000000) @db.Decimal(18, 2)
  fiscalYearStartMonth   Int      @default(1)   // 1 = January
  userEditWindowHours    Int      @default(24)
  updatedAt              DateTime @updatedAt
}

model Category {          // Rice, Pulses, Other
  id              String    @id @default(cuid())
  name            String    @unique
  commissionRate  Decimal?  @db.Decimal(8, 6)   // null → use Setting.defaultCommissionRate
  isActive        Boolean   @default(true)
  products        Product[]
}

model Product {
  id              String    @id @default(cuid())
  sku             Int       @unique               // "#" column
  name            String    @unique               // e.g. "ZAFARANI STEAM PLATINUM 25KG"
  unitWeightKg    Decimal   @db.Decimal(10, 3)    // "Unit Weight (KG)"
  packPcs         Int       @default(1)           // "Pack (pcs)"
  // packWeightKg is derived: unitWeightKg * packPcs (compute, don't store)
  categoryId      String
  category        Category  @relation(fields: [categoryId], references: [id])
  commissionRate  Decimal?  @db.Decimal(8, 6)     // optional per-product override
  isActive        Boolean   @default(true)
  lines           InvoiceLine[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model City {
  id        String   @id @default(cuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  parties   Party[]
  invoices  Invoice[]
}

model Party {
  id          String     @id @default(cuid())
  name        String     @unique      // trimmed, case-insensitive unique (see §4.1)
  cityId      String?                 // default city, pre-fills invoice
  city        City?      @relation(fields: [cityId], references: [id])
  phone       String?
  openingBalance Decimal @default(0) @db.Decimal(18, 2)
  isActive    Boolean    @default(true)
  subParties  SubParty[]
  invoices    Invoice[]
  payments    Payment[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model SubParty {
  id        String    @id @default(cuid())
  name      String
  partyId   String?   // optional parent party
  party     Party?    @relation(fields: [partyId], references: [id])
  isActive  Boolean   @default(true)
  invoices  Invoice[]
  payments  Payment[]
  @@unique([name, partyId])
}

model Salesperson {       // "ASM / Salesperson"
  id        String    @id @default(cuid())
  name      String    @unique
  phone     String?
  isActive  Boolean   @default(true)
  invoices  Invoice[]
  users     User[]
}

model Bank {
  id        String    @id @default(cuid())
  name      String    @unique      // Allied Bank, Askari Bank, ..., Cash
  isActive  Boolean   @default(true)
  payments  Payment[]
}

model Invoice {
  id             String        @id @default(cuid())
  invoiceNo      Int           @unique
  invoiceDate    DateTime      @db.Date
  partyId        String
  party          Party         @relation(fields: [partyId], references: [id])
  cityId         String?       // snapshot of city for this invoice
  city           City?         @relation(fields: [cityId], references: [id])
  subPartyId     String?
  subParty       SubParty?     @relation(fields: [subPartyId], references: [id])
  salespersonId  String?
  salesperson    Salesperson?  @relation(fields: [salespersonId], references: [id])
  remarks        String?
  // Denormalised totals (recomputed on every save from lines)
  totalPacks       Int         @default(0)
  totalWeightKg    Decimal     @default(0) @db.Decimal(14, 3)
  totalAmount      Decimal     @default(0) @db.Decimal(18, 2)
  totalCommission  Decimal     @default(0) @db.Decimal(18, 4)
  lines          InvoiceLine[]
  createdById    String
  updatedById    String?
  deletedAt      DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  @@index([invoiceDate])
  @@index([partyId])
  @@index([salespersonId])
}

model InvoiceLine {
  id              String   @id @default(cuid())
  invoiceId       String
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  lineNo          Int
  productId       String
  product         Product  @relation(fields: [productId], references: [id])
  qtyPacks        Int                                  // "Bags" / "Qty (Packs)"
  rate40Kg        Decimal  @db.Decimal(14, 2)          // user input
  // ── snapshots taken at save time ──
  packWeightKg    Decimal  @db.Decimal(10, 3)
  commissionRate  Decimal  @db.Decimal(8, 6)
  // ── calculated (see §6) ──
  ratePerPack     Decimal  @db.Decimal(14, 4)
  amount          Decimal  @db.Decimal(18, 2)
  commission      Decimal  @db.Decimal(18, 4)
  weightKg        Decimal  @db.Decimal(14, 3)
  @@unique([invoiceId, lineNo])
  @@index([productId])
}

model Payment {
  id           String    @id @default(cuid())
  paymentDate  DateTime  @db.Date
  partyId      String
  party        Party     @relation(fields: [partyId], references: [id])
  subPartyId   String?
  subParty     SubParty? @relation(fields: [subPartyId], references: [id])
  slipNo       String?   // transaction / slip no
  bankId       String?
  bank         Bank?     @relation(fields: [bankId], references: [id])
  amount       Decimal   @db.Decimal(18, 2)
  remarks      String?
  createdById  String
  updatedById  String?
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@index([paymentDate])
  @@index([partyId])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  action     String   // CREATE | UPDATE | DELETE | LOGIN | IMPORT
  entity     String   // Invoice | Payment | Product | ...
  entityId   String?
  before     Json?
  after      Json?
  ip         String?
  createdAt  DateTime @default(now())
  @@index([entity, entityId])
  @@index([createdAt])
}
```

### 4.1 Data rules
- Trim all names before saving. Enforce case-insensitive uniqueness for master names (Postgres `citext` or a unique index on `lower(name)` added in a raw SQL migration).
- `invoiceNo`: auto-suggest `max(invoiceNo) + 1` on the form, editable, must be unique (the Excel used manual numbers — keep that ability).
- Deactivated master records stay on old invoices but don't appear in dropdowns.
- Invoice save is one DB transaction: upsert header, delete+recreate lines, recompute totals, write audit log.

---

## 5. Features (mapped from the Excel)

### 5.1 Authentication
- `/login` with email + password. Rate-limited (5 attempts / min / IP).
- Logout revokes the refresh token.
- Inactive users cannot log in; deactivating a user revokes their tokens.
- "Change my password" for every user; SUPER_ADMIN/ADMIN can reset others' passwords (within their scope).

### 5.2 Sales invoice (replaces **Data Entry** + VBA buttons)

**Header fields**

| Field | Excel source | Rule |
|---|---|---|
| Invoice No. | D4 | Required, integer, unique. Auto-suggest next. |
| Invoice Date | D5 | Required. Default today. |
| Party (Name) | D6 (`lstParty`) | Required. Searchable combobox. "+ Add party" inline for ADMIN+. |
| City | D7 (`lstCity`) | Pre-filled from party's default city, editable. |
| Sub Party | D8 (`lstSubParty`) | Optional. Filter to the selected party's sub-parties + unassigned ones. |
| ASM / Salesperson | D9 (`lstASM`) | Optional (recommend required). |
| Remarks | — | Optional, new. |

**Line items** (unlimited, add/remove rows, keyboard-friendly: Enter moves to next cell)

| Column | Type | Source |
|---|---|---|
| Sr | auto | row number |
| Description (Product) | input — product combobox | `lstProduct` |
| Bags (Qty Packs) | input — integer > 0 | |
| Pack Wt (KG) | calculated (read-only) | product.unitWeightKg × packPcs |
| Rate 40Kg | input — number > 0 | |
| Rate / Pack | calculated | §6 |
| Amount | calculated | §6 |
| Commission | calculated | §6 |
| Weight (KG) | calculated | §6 |

**Invoice summary panel** (live, as in Excel I5:I7): Amount, Commission, Total Bags, plus Total Weight (KG / Tons).

**Actions** (replacing VBA buttons)
- **Save** (`btnSave`) — validates and saves. If the invoice number already exists, the UI asks "Invoice N already exists — open it for edit?" rather than silently overwriting.
- **Edit** (`btnEdit`) — `/invoices/[id]/edit` loads all lines.
- **Delete** (`btnDelete`) — soft delete with confirmation "Delete all N line(s) of invoice X?".
- **Clear** (`btnClear`) — reset form.
- **Print** — new: printable invoice with company header.

**Validation** (copied from the VBA `ValidateForm` messages)
- "Enter the Invoice No." / "Enter the Invoice Date." / "Enter the Party (Name)."
- "Line N: enter Qty (Packs)." (must be > 0)
- "Line N: enter Rate 40Kg." (must be > 0)
- "Enter at least one product line."
- New: the same product may appear more than once on an invoice (allowed — the Excel allows it), but show a soft warning.

### 5.3 Invoice list (replaces **Database** sheet)
- Table with filters: date range, month picker (default current month, as the Excel header shows "SEPTEMBER 2026"), party, city, salesperson, product, category, invoice no.
- Two views: **Invoices** (one row per invoice) and **Lines** (one row per line, same columns as `tblLines`).
- Footer totals (Database Q5:R10): **Weight (Tons)**, **Total Sale**, **Commission**, **Total Packs**, **Avg per Ton** = Total Sale ÷ Tons, **Avg per Pack** = Total Sale ÷ Packs.
- Export to Excel (ADMIN+).

### 5.4 Payments / recovery (replaces **Payments** sheet + **Sheet1**)

**New payment form**: Date*, Party*, Sub Party, Slip No., Bank (from Banks list, includes "Cash"), Amount* (> 0), Remarks.

**Live "Party Position" panel** (Payments F5:G8), shown as soon as a party is chosen:
- **Invoiced** = Σ invoice totalAmount for the party (+ openingBalance)
- **Recovered so far** = Σ payment amounts for the party
- **Outstanding** = Invoiced − Recovered
- **After this payment** = Outstanding − amount being entered

Validation messages (from VBA `SavePayment`): "Enter a date.", "Select a party.", "Enter a valid amount."

**Payments list**: filters (date range, party, bank), totals.

**Recovery summary by party** (Payments J20:N…): Party, Invoiced, Recovered, Outstanding, % Recovered, Last Payment date. Click a party → **Party ledger**: chronological invoices (debit) and payments (credit) with running balance. Printable.

### 5.5 Dashboard (replaces **Dashboard** sheet)

Global filter: date range / month / fiscal year (default: current fiscal year). USER sees only their scope.

**KPI cards (row 6–7)**
| Card | Value | Sub-text |
|---|---|---|
| Total Revenue (PKR) | Σ amount | "▲ x.x% of target" = revenue ÷ annual target |
| Total Commission | Σ commission | "▲ x.xx% of sales" |
| Total Weight (Tons) | Σ weightKg ÷ 1000 | "● n KG" |
| Invoices | count of distinct invoices | "● n packs" |

**Annual sales target (rows 11–16)**
Annual Target (from Settings, editable by SUPER_ADMIN) · Actual to date · Achieved % (progress bar) · Remaining = max(0, target − actual) · Implied monthly target = target ÷ 12. New: a monthly actual-vs-target bar chart.

**Sales by Category — Rice vs Pulses vs Other (rows 20–25)**
Columns: Qty (Packs), Weight (KG), Amount, Commission, % of Sales, Share bar. Plus a donut chart.

**Sales by ASM / Salesperson (rows 29–42)** — same columns, sorted by amount desc.

**Sales by Product (rows 46–87)** — same columns + Category; sorted by amount desc; products with no category show "Unmapped".

**Payments & recovery (rows 90–93)**
Total Recovered · Outstanding = revenue − recovered · Recovery Rate = recovered ÷ revenue · Payments logged (count).

**Recovery by Party (rows 96+)** — Party, Invoiced, Recovered, Outstanding, Last Payment, % Recovered, Share bar.

New, nice-to-have: sales trend (daily/monthly line chart), top 10 parties, sales by city.

### 5.6 Master data (replaces **Products** + **Lists**)
CRUD screens (ADMIN+; USER read-only) with search, active/inactive toggle, and CSV/Excel import:
- **Categories**: name, commission rate (blank = default 0.35%).
- **Products**: # (sku), name, unit weight (KG), pack (pcs), pack weight (calculated, read-only), category, optional commission override, active.
- **Parties**: name, default city, phone, opening balance, active.
- **Sub-parties**: name, optional parent party.
- **Cities**, **Salespersons (ASM)**, **Banks**.

### 5.7 Users (SUPER_ADMIN, ADMIN)
List, create, edit, deactivate, reset password, assign role (within limits in §3), link USER to a salesperson.

### 5.8 Settings (SUPER_ADMIN)
Company name & address (shown in header and on printed invoices), default commission rate, annual sales target, fiscal year start month, user edit window.

### 5.9 Audit log (SUPER_ADMIN, ADMIN)
Every create/update/delete of invoices, payments, masters, users, settings; logins; imports. Filter by user, entity, date. Show before/after diff.

---

## 6. Calculation rules — `packages/shared/src/calc`

These are pure functions using `decimal.js`. **The API is authoritative** (it always recomputes on save and ignores any calculated values sent by the client). The web app uses the same functions for the live preview.

### 6.1 Per product
```
packWeightKg = unitWeightKg × packPcs                         // Products!E = C × D
commissionRate =
     product.commissionRate                                  // per-product override, if set
  ?? category.commissionRate                                 // Products!I via J:K lookup
  ?? settings.defaultCommissionRate                          // frmCommRate = 0.0035
```

### 6.2 Per line
```
ratePerPack = rate40Kg ÷ 40 × packWeightKg                    // G = F/40*E
amount      = ROUND_HALF_UP(ratePerPack × qtyPacks, 0)        // H = ROUND(G*D, 0)  → whole rupees
commission  = amount × commissionRate                         // I = H * rate   (NOT rounded; store 4 dp, display 2 dp)
weightKg    = qtyPacks × packWeightKg                         // J = D*E
```

### 6.3 Totals (invoice, list, dashboard)
```
totalPacks      = Σ qtyPacks
totalAmount     = Σ amount
totalCommission = Σ commission
totalWeightKg   = Σ weightKg      ;  tons = totalWeightKg ÷ 1000
avgPerTon       = totalAmount ÷ tons          (guard ÷0)
avgPerPack      = totalAmount ÷ totalPacks    (guard ÷0)
pctOfSales(x)   = x.amount ÷ grandTotalAmount
targetAchieved  = totalAmount ÷ annualTarget
remaining       = max(0, annualTarget − totalAmount)
monthlyTarget   = annualTarget ÷ 12
outstanding     = invoiced − recovered
recoveryRate    = recovered ÷ invoiced
```

### 6.4 Golden test — Invoice #15 (must pass exactly)

Invoice 15 · 2026-09-02 · Pak Rice Traders · Dina · ASM Farhan Khalid · commission rate 0.35%

| # | Product | Bags | Pack Wt | Rate 40Kg | Rate/Pack | Amount | Commission | Weight |
|--|--|--:|--:|--:|--:|--:|--:|--:|
| 1 | MASAR SABIT 25KG | 30 | 25 | 8,000 | 5,000.00 | 150,000 | 525.0000 | 750 |
| 2 | DAAL MASH CHARI 25KG | 20 | 25 | 16,250 | 10,156.25 | 203,125 | 710.9375 | 500 |
| 3 | DAAL MOONG 25KG | 30 | 25 | 10,250 | 6,406.25 | **192,188** *(192,187.5 rounded up)* | 672.6580 | 750 |
| 4 | DALL MASOOR 25KG | 20 | 25 | 8,400 | 5,250.00 | 105,000 | 367.5000 | 500 |
| 5 | DAAL CHANNA SUPREME 25KG | 100 | 25 | 9,950 | 6,218.75 | 621,875 | 2,176.5625 | 2,500 |
| | **TOTAL** | **200** | | | | **1,272,188** | **4,452.6580** | **5,000** |

Write this as a unit test in `packages/shared/src/calc/__tests__/invoice.test.ts` **before** writing the calc code. Also test: a 10KG × 4-pcs product (pack weight 40), a 0.5KG ghee product, and the ÷0 guards.

---

## 7. API design (NestJS)

- Global prefix `/api/v1`. Swagger at `/api/docs` (disabled in production or behind SUPER_ADMIN).
- Global: `ZodValidationPipe`, `JwtAuthGuard` (opt-out via `@Public()`), `RolesGuard` / `PermissionsGuard` with `@RequirePermission('invoice.delete')`, exception filter returning `{ statusCode, message, errors? }`, `ThrottlerGuard`, `helmet`, CORS restricted to `WEB_URL`.
- Pagination: `?page=1&pageSize=50&sort=invoiceDate:desc`. Response `{ data, meta: { page, pageSize, total } }`.
- Dates are `YYYY-MM-DD` strings; timezone **Asia/Karachi** for "today" and month boundaries.

| Module | Endpoints |
|---|---|
| auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| users | `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/reset-password`, `PATCH /users/:id/status` |
| settings | `GET /settings`, `PATCH /settings` |
| categories, products, parties, sub-parties, cities, salespersons, banks | `GET /x` (search, active filter), `GET /x/:id`, `POST /x`, `PATCH /x/:id`, `PATCH /x/:id/status`, `GET /x/options` (lightweight dropdown list) |
| invoices | `GET /invoices`, `GET /invoices/lines`, `GET /invoices/next-number`, `GET /invoices/:id`, `POST /invoices`, `PUT /invoices/:id`, `DELETE /invoices/:id`, `POST /invoices/preview` (returns calculated lines without saving), `GET /invoices/export` |
| payments | `GET /payments`, `GET /payments/:id`, `POST /payments`, `PATCH /payments/:id`, `DELETE /payments/:id`, `GET /payments/export` |
| recovery | `GET /recovery/parties` (summary), `GET /recovery/parties/:id/position`, `GET /recovery/parties/:id/ledger` |
| reports | `GET /reports/dashboard?from&to` (KPIs + target + recovery totals in one call), `GET /reports/by-category`, `GET /reports/by-salesperson`, `GET /reports/by-product`, `GET /reports/by-party`, `GET /reports/by-city`, `GET /reports/trend?granularity=day|month` |
| audit | `GET /audit` |
| import | `POST /import/excel` (multipart, SUPER_ADMIN; dry-run flag returns a preview + unmatched names) |

Reports are computed with SQL aggregates (`groupBy` / raw SQL), never by loading all lines into memory. All report endpoints apply the USER data scope.

---

## 8. Frontend (Next.js)

- App Router. Server Components for layout/shell; data tables and forms as Client Components using TanStack Query.
- **API access:** `next.config` `rewrites` proxy `/api/:path*` → `${API_URL}/api/:path*`, so the browser talks same-origin and httpOnly auth cookies work without cross-site cookie issues.
- `middleware.ts`: redirect to `/login` if there is no session cookie; block routes by role (e.g. `/settings` → SUPER_ADMIN only).
- Layout: sidebar (Dashboard, Invoices, Payments, Recovery, Reports, Masters ▸, Users, Settings, Audit), top bar with company name, month selector, user menu. Menu items filtered by permission.
- Invoice form: spreadsheet-like grid, keyboard navigation, live totals, sticky summary panel, unsaved-changes warning.
- Formatting: PKR with thousands separators (`1,272,188`), commission to 2 dp, weight in KG and Tons, percentages to 1–2 dp — all in `packages/shared/src/format.ts`.
- Charts: Recharts (category donut, salesperson bar, monthly trend, target progress).
- Responsive: usable on a phone for payment entry and dashboard viewing.
- Print stylesheet for invoices and party ledger.
- Light/dark mode.

---

## 9. Environment variables (`.env.example`)

```bash
# apps/api
DATABASE_URL="postgresql://...?...&pgbouncer=true"   # pooled URL (Neon/Supabase)
DIRECT_URL="postgresql://..."                        # direct URL for migrations
JWT_ACCESS_SECRET="change-me"
JWT_REFRESH_SECRET="change-me-too"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
WEB_URL="http://localhost:3000"
TZ="Asia/Karachi"
SEED_SUPERADMIN_EMAIL="admin@example.com"
SEED_SUPERADMIN_PASSWORD="ChangeMe123!"

# apps/web
API_URL="http://localhost:4000"
```

---

## 10. Deployment (Vercel)

Two Vercel projects pointing at the same Git repo:

| Vercel project | Root directory | Notes |
|---|---|---|
| `sms-web` | `apps/web` | Next.js preset. Env: `API_URL` = URL of `sms-api`. |
| `sms-api` | `apps/api` | NestJS runs on Vercel as a serverless function. Env: all API vars above. Build: `pnpm prisma generate && pnpm build`. |

- Database: **Neon** (or Supabase) Postgres. Use the **pooled** connection string for `DATABASE_URL` (serverless opens many connections) and the direct one for `DIRECT_URL`.
- Run `prisma migrate deploy` in CI (GitHub Actions) on push to `main`, before Vercel deploys — not inside the serverless function.
- Turborepo remote caching works with Vercel automatically.
- Vercel's "Ignored Build Step" with `npx turbo-ignore` so each app only rebuilds when it (or `packages/*`) changed.
- **Fallback:** if serverless cold starts or limits become a problem for the API, deploy `apps/api` to Railway / Render / Fly.io as a long-running Node server instead; no code change needed apart from the entrypoint.

---

## 11. One-time Excel import (`apps/api/src/import`)

A CLI (`pnpm import:excel path/to/file.xlsx [--dry-run]`) and an admin UI that:

1. **Products** sheet (rows 4+) → Categories (Rice, Pulses, Other) + Products (sku, name, unit weight, pack pcs, category). Default commission 0.35%.
2. **Lists** sheet → Cities, Salespersons, Sub-parties, Banks (Allied Bank, Askari Bank, Bank Alfalah, Bank of Punjab, Faysal Bank, HBL, Meezan Bank, MCB, National Bank, UBL, Cash). Parties come from the Lists column A and from distinct names in Database.
3. **Database** sheet (`tblLines`, ~130 lines) → group by `Invoice #` → Invoice + InvoiceLines. Trim + case-insensitive match names to masters. Recompute amounts with §6 and **report any row where the recomputed amount differs from Excel**.
4. **Payments** sheet (`tblPayments`) → Payments.
5. **Sheet1** (raw bank log, ~87 rows) → Payments, but its party names don't match (`"Pak Rice Traders dina"`, `"Allah walay Nakyal"`, `"Tayyab Traders Chakwal"`, …). The dry run outputs a **mapping table** of unmatched names; an ADMIN maps each to a party in the UI, then the import runs. Bank text such as `"grainco ubl"`, `"Waqar Rice Abl"` → map to the bank list (or keep in remarks). Avoid double-importing payments that already exist in the Payments sheet (match on date + party + amount).
6. Write an `IMPORT` audit entry with counts.

---

## 12. Non-functional requirements

- **Security:** argon2 hashes, httpOnly + Secure + SameSite=Lax cookies, refresh token rotation, helmet, rate limiting on auth, permission checks on every endpoint, no secrets in the repo.
- **Integrity:** invoice and payment saves in transactions; server recomputes all calculated fields; soft delete only.
- **Performance:** dashboard < 1 s for 100k lines (indexes on dates, party, salesperson, product; SQL aggregates).
- **Quality:** TypeScript strict, ESLint clean, unit tests for all calc + permission logic, e2e tests for auth, invoice CRUD, payments and dashboard numbers.
- **Backups:** rely on Neon/Supabase point-in-time recovery; Excel export available to ADMIN+.

---

## 13. Build plan (phases for Claude Code)

Do one phase per session. At the end of each phase: `pnpm lint && pnpm typecheck && pnpm test` must pass, then commit.

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Scaffold** | Turborepo + pnpm workspaces; `apps/api` (Nest), `apps/web` (Next), `packages/shared`, `packages/tsconfig`, `packages/eslint-config`; Prettier, Husky; `.env.example`; README | `pnpm dev` starts both apps; web calls `GET /api/v1/health` through the rewrite |
| **1. Shared calc** | `packages/shared` calc + format + zod schemas + permissions matrix, with tests (§6.4 golden test first) | Golden test passes |
| **2. DB + Auth + Users** | Prisma schema (§4), migrations, seed (SUPER_ADMIN + settings + categories), auth module, users module, guards; web login page, protected layout, users screens | Can log in as each role; permission matrix enforced by e2e tests |
| **3. Masters** | CRUD for categories, products, parties, sub-parties, cities, salespersons, banks (API + UI) | ADMIN can manage; USER read-only |
| **4. Invoices** | Invoice API (create/update/delete/preview/list/lines/export) + grid form + list + print | Entering invoice #15 in the UI shows exactly the §6.4 numbers |
| **5. Payments & Recovery** | Payment API + form with live Party Position + list + recovery summary + party ledger | Outstanding numbers match manual calculation |
| **6. Dashboard & Reports** | Reports endpoints + dashboard UI + charts + filters + target | Numbers match the Excel Dashboard for the same data |
| **7. Excel import** | CLI + admin UI with dry run and name mapping (§11) | Full workbook imports; dashboard totals match the Excel |
| **8. Audit, polish, deploy** | Audit log, settings UI, responsive/print polish, CI workflow, Vercel deploy for both apps, Neon DB | Production URL works end to end |

---

## 14. Open questions for the client

1. Is the role/permission matrix in §3 correct? Specifically: should a USER be a salesperson (sees only own sales) or an office data-entry operator (sees everything)?
2. Should commission rates differ by category (the sheet has a Category→Rate table, currently all 0.35%)?
3. Do parties have opening balances from before September 2026 that the recovery figures should include?
4. Is the annual target per company only, or also per salesperson / per category?
5. Should invoice numbers restart each fiscal year?
6. Is there a single company, or will more mills use the system later (multi-tenant)?
7. Is Urdu needed anywhere (printed invoice, UI)?
