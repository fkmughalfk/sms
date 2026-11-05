# Orders & Pending Orders Module: Design (draft for review)

> Status: **proposal, not built.** Owner's answers recorded 2026-11-05 (§9). Nothing in the main app changes until this is approved.
> Lives inside the Sales Management System and reuses its products, parties, cities, salespersons, users, credit control, invoices and payments.

## 1. How it works

The owner **enters orders** in the system. **Invoices and payments are not typed in.** They keep coming from the current software as **PDFs**, and the system **reads them by itself**. Each invoice PDF is recorded as an invoice and **reduces the pending balance** of the orders it delivers.

```
 Salesman / office           Office                         Office uploads PDFs                System
 ─────────────────           ──────                         ───────────────────                ──────
 Book order        ──►  Approve (credit warning) ──►  Order is PENDING
 (rates from the                                              │
  current rate list)                                          ▼
                                                     Invoice PDF ──► read ──► check ──► Invoice recorded
                                                                                     └► pending bags reduced
                                                     Payment PDF ──► read ──► check ──► Payment recorded
```

There are no dispatch or warehouse screens: the vehicle, D.O., DC and OGP numbers arrive on the invoice PDF.

### Order statuses

| Status               | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| Draft                | Being written; only its author sees it                       |
| Submitted            | Waiting for office approval (salesmen's orders only)         |
| Pending              | Saved by the office/owner, or approved; nothing invoiced yet |
| Part delivered       | Some bags invoiced, some still pending                       |
| Completed            | Every bag invoiced                                           |
| Closed short         | Office closed it with bags still pending (reason required)   |
| Rejected / Cancelled | Not going ahead (reason required)                            |

## 2. Rate lists (market rates)

Rates move with the market, sometimes daily and sometimes weekly, so they are kept as **dated rate lists**. The model follows the real list: `docs/rate-lists/2026-11-04.csv`, from the PDF of 04-11-2026.

- A list has an _effective from_ date and time. The **current list** is the newest one already in effect, and old lists are kept for history.
- To make a new list: **copy the previous list** and change what moved, or upload it from Excel.
- Each entry has:
  - **product** and **crop year** (Steam Platinum 25 kg is 13,500 for the 2025-26 crop and 11,500 for 2026-27, both on sale at once);
  - **rate** and **basis**: rice and pulses **per 40 kg**; desi ghee and spices **per pack (tin)**, exactly as printed (ghee 1 kg = 2,550, 500 g = 1,450; cumin 5.5 kg = 6,550);
  - **available**: N/A means it can't be ordered;
  - a **note** shown to the salesman (origin such as "Australia" or "Crimson", or "On approval – advance only" for Shadmani).
- Footer text ("all pulses are non-returnable", …) is kept as the list's remarks.
- The 50 kg and 25 kg bag prices printed on the list are rounded half up for display. Invoices use the exact bag rate and round the line amount half down, so an odd bag can differ from the printed list by Rs 1.

## 3. Orders

- **Booked by** salesmen (their own logins, on a phone) and by the office.
- **Order number** is assigned by the system: **one series for all categories** (rice, pulses, ghee, spices). It continues the current series (last used: **3210**), and the starting number is set at go-live.
- **One order, many lines.** Each line is product + pack size + **crop year** + bags, at the **booked rate** taken from the current rate list. The booked rate stays even if the market moves, and the office may change it during approval (audited).
- **Ghee is ordered in whole cartons** (6 × 1 kg or 12 × 500 g); loose tins are not allowed. When opening data or reports count tins, the system converts (60 tins of 1 kg = 10 cartons). Carton price = tin price × tins per carton. Reports also show tins and kg.
- **Approval (salesmen's orders only):** orders entered by the owner or office go **straight to Pending**. Orders entered by a salesman wait for the office to approve or reject them, seeing the same credit warnings as the invoice form (overdue, over limit; warn only).
- Each order also carries the agreed **prompt-payment discount per category** (§6).

## 4. Reading invoice PDFs

The invoice PDFs from the current software contain real text, not scans, so they are read exactly, field by field. Layout: `docs/invoice-format.md`.

**Upload:** the office drops in one or many PDFs at once. For each PDF the system:

1. **Reads** the header (party, sub-party, city, invoice no., date, D.O., vehicle, DC, OGP, booking no.) and every line (description, crop year, qty, Rate 40Kg, bag rate, weight, amount), plus the totals.
2. **Checks:**
   - the **invoice no. is new** (an already-recorded invoice is skipped as a duplicate);
   - **party, product and salesman names are known** (see aliases below);
   - **amounts recompute exactly** with the system's own calculation, including half-rupee-down rounding; a difference is flagged;
   - the **pending order lines** it delivers can be found (below).
3. **Posts** it when every check passes: the invoice is recorded in the main app (same rules as today: snapshots, commission, audit) and the pending bags are reduced, all in one transaction. The original PDF is kept with the invoice.
4. Otherwise it goes to a **Needs review** list showing exactly what's wrong, for example "unknown product 'ZAFARANI-WHITE CHANA 7-8 MM'" or "no pending order at rate 10,600". The office fixes it (map the name, pick the order, or post without an order) and posts.

**Matching an invoice line to pending orders** (owner's choice):

- It matches on **same party + product + pack size + crop year + rate**.
- It reduces the **oldest** matching pending order line first, then the next one if bags are left over.
- **If nothing matches**, for example a different rate, the line waits in Needs review for the office to choose.

**Name aliases** (learned once, then remembered). The current software and reports use their own names, so the system keeps an alias list:

| Seen on PDFs/reports             | Means                                        |
| -------------------------------- | -------------------------------------------- |
| 1121 STEAM                       | Steam Platinum (25, 10, 5 kg by pack size)   |
| ALMEIRAH ST 20 kg                | Steam Platinum 20 kg                         |
| 1121 SELLA                       | Sella Golden                                 |
| STEAM GOLD / EVERYDAY / SHADMANI | Steam Gold / Steam Everyday / Steam Shadmani |
| ZAFARANI-DAAL MOONG - 25- KG, …  | the matching product (mapped on first sight) |
| FARHAN SB                        | Farhan Khalid                                |
| HAMDARD TDR, PAK RICE TRD, …     | the matching party (mapped on first sight)   |

## 5. Reading payment PDFs

The same flow (read → check → post or Needs review) records payments in the main app. **Waiting for a sample payment PDF** to define the fields.

## 6. Prompt-payment discount (credit policy)

The discount is **not** taken off the invoice. It is a reward for paying on time.

- Each party has **credit days** (already in the main app: most 30, some 40).
- Each order carries an agreed **discount per category**: rice and pulses in Rs per 40 kg; desi ghee and spices in Rs per kg. Invoices matched to the order take these terms.
- If the party clears the **whole invoice** within its credit days (part on time and part late earns **nothing**) (invoice date + credit days, oldest-debt-first as in `calc/ageing.ts`), it earns:
  - for **rice and pulses**: the discount per 40 kg ÷ 40 × the line's weight in kg;
  - for **desi ghee and spices**: the discount per kg × the line's weight in kg;
  - added up over the invoice's lines, in whole rupees, with half a rupee rounding down.
- The discount is **credited in the party's ledger automatically** as a _Discount_ entry the moment the invoice is cleared within its credit days, reducing outstanding. It is audited, and the office can reverse it (with a reason).
- If a payment that cleared the invoice is later deleted or changed so the invoice is no longer cleared in time, the automatic discount is reversed too.

## 7. Pending orders report

This replaces the current "WAQAR RICE MILLS PENDING ORDERS DETAIL" (samples: `docs/pending-orders/2026-11-04.csv`, 43 lines).

- **Columns:** date, party, order no., salesman, product, kg, crop year, qty, weight, rate, total dispatched, balance, weight remaining, status, **amount** (= weight remaining ÷ 40 × rate; ghee by tin price).
- **Grouping:** by city, with a "PENDINGS" subtotal per city and a grand total. The header shows the date and the **last order no.**
- **Filters:** party, city, salesman, product, crop year; **print or PDF per party** (as today) or for everyone.
- The figures update the moment an invoice PDF is posted.

## 8. Data model (new and changed tables)

Money is `Decimal`; every calculated field is recomputed on the server with `packages/shared/src/calc`.

```
RateList          id, effectiveFrom, remarks, createdById, createdAt
RateListItem      id, rateListId, productId, cropYear?, basis (PER_40KG | PER_UNIT),
                  rate Decimal(14,2), isAvailable, note?      @@unique(rateListId, productId, cropYear)

Order             id, orderNo Int @unique, orderDate, partyId, subPartyId?, cityId?, salespersonId?,
                  status, remarks, rateListId?, discount per category (4 × Decimal),
                  approvedById?, approvedAt?, closedReason?, isOpening (imported at go-live),
                  createdById, timestamps
OrderLine         id, orderId, lineNo, productId, cropYear?, qtyPacks (ghee: cartons), basis,
                  rate (booked), packWeightKg (snapshot), amount, weightKg,
                  openingDispatched (go-live only)

OrderAllocation   id, invoiceLineId, orderLineId, qtyPacks       (how invoices reduce orders;
                  pending = qty − openingDispatched − Σ allocations)

PdfImport         id, kind (INVOICE | PAYMENT), fileName, fileUrl, status (POSTED | NEEDS_REVIEW |
                  DUPLICATE | FAILED), parsed Json, problems Json, invoiceId?, paymentId?,
                  uploadedById, timestamps
NameAlias         id, kind (PRODUCT | PARTY | SALESPERSON | SUBPARTY), text (normalised),
                  packKg?, targetId        @@unique(kind, text, packKg)

DiscountCredit    id, partyId, invoiceId @unique, creditDate, amount Decimal(18,2),
                  computedAmount, isAutomatic, reversedAt?, reversedReason?, remarks, timestamps
```

Changes to existing tables:

- **Invoice:** add `doNo?`, `vehicleNo?`, `dcNo?`, `ogpNo?`, `bookingNo?`, `pdfImportId?`, and snapshots of the discount terms and the party's credit days. Hand-entered invoices keep working with these left blank.
- **InvoiceLine:** add `cropYear?` and `rateBasis` (default PER_40KG, so existing invoices are unchanged). For PER_UNIT lines ratePerPack = rate × pack pcs. This touches the shared invoice calc, so it gets its own tests, and the golden test must still pass.
- **Ledger, recovery, ageing:** Discount credits count as credits.
- **PDF storage:** original PDFs need file storage (e.g. Vercel Blob), because the database shouldn't hold files.

Rules carried over: snapshots, one transaction plus an `AuditLog` entry per write, half-rupee amounts round down, Asia/Karachi dates.

## 9. Who can do what

| Permission                                                     | SUPER_ADMIN | ADMIN  | USER (salesman) |
| -------------------------------------------------------------- | :---------: | :----: | :-------------: |
| View rate lists                                                |     ✅      |   ✅   |       ✅        |
| Manage rate lists                                              |     ✅      |   ✅   |       ❌        |
| Book & submit orders                                           |     ✅      |   ✅   |    ✅ (own)     |
| Edit own order before approval                                 |     ✅      |   ✅   |       ✅        |
| Approve / reject salesmen's orders, close orders, change rates |     ✅      |   ✅   |       ❌        |
| Upload invoice / payment PDFs, resolve Needs review            |     ✅      |   ✅   |       ❌        |
| Pending orders report                                          |   ✅ all    | ✅ all |   own orders    |

## 10. Build plan (one phase per session; lint, typecheck and tests pass before each commit)

| Phase                           | Builds                                                                                  | Done when                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **O1. Rate lists**              | Schema, API, screens, copy previous, Excel upload                                       | The 04-11-2026 list can be entered and is "current"                                      |
| **O2. Orders**                  | Orders, lines, approval, credit warning, statuses                                       | A salesman books order 3211 with list rates; the office approves it                      |
| **O3. Pending orders report**   | Report in the current layout, per-party PDF, opening-order import, starting order no.   | The 04-11-2026 sample reproduces exactly (83,226 bags, Rs 538,896,375)                   |
| **O4. Invoice PDF reader**      | Upload, parser, checks, aliases, Needs review, auto-post, order allocation, PDF storage | The sample invoice posts, and its lines reduce the right pending orders                  |
| **O5. Payment PDF reader**      | Parser + checks + post                                                                  | Needs a sample payment PDF                                                               |
| **O6. Prompt-payment discount** | Calc, automatic ledger credit, reversal                                                 | A 30-day party paying on day 25 earns exactly the order's discount; on day 31 it doesn't |
| **C. Commission**               | See `docs/COMMISSION_SPEC.md`                                                           | Its own tests                                                                            |

## 11. Still open (to be supplied later by the owner)

- **Go-live data:** the opening pending orders to import and the next order number (the design supports both).
- **A sample payment PDF.**
- The pending report's **Payment status** column is empty in every sample, so its meaning is unknown and it is left out for now.

## 12. Owner's answers (2026-11-05)

| Question                        | Answer                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Module location                 | Inside the main app, on a branch, not merged until approved                                                                |
| Language                        | English                                                                                                                    |
| Who books orders                | **Salesmen (own logins) and office**                                                                                       |
| Invoices & payments             | **Not typed: read from PDFs** by the system                                                                                |
| Rate after booking              | **Booked rate** stays                                                                                                      |
| Ghee & spices basis             | **Per pack (tin)**, as printed on the rate list                                                                            |
| Ghee quantity                   | **By carton**                                                                                                              |
| Crop year                       | **Per order line**, from the rate list                                                                                     |
| Discount                        | **Prompt-payment discount** per category, on each order; earned within the party's credit days; **credited in the ledger** |
| Order number                    | **Assigned by the system**                                                                                                 |
| Stock                           | No stock module; the system **tracks pending orders**                                                                      |
| Invoice → order matching        | **Same party, product, pack, crop year and rate; oldest order first**                                                      |
| Report names                    | 1121 STEAM = Steam Platinum; ALMEIRAH ST 20 kg = Steam Platinum 20 kg; 1121 SELLA = Sella Golden                           |
| Ex Mill / Delivered             | **Ignore**                                                                                                                 |
| D.O. / DC / OGP                 | Come from the invoice PDF; no numbering in the system                                                                      |
| Invoice expenses / freight      | Not used (0)                                                                                                               |
| Go-live data                    | **Design only for now**; the owner will supply it later                                                                    |
| Approval                        | **Salesmen's orders only**; owner/office orders go straight to Pending                                                     |
| Order numbers                   | **One series** for rice, pulses, ghee and spices                                                                           |
| Ghee quantity                   | **Whole cartons only**                                                                                                     |
| Discount with part-late payment | **Whole invoice only**: part late = no discount                                                                            |
| Discount posting                | **Automatic**; office can reverse                                                                                          |
