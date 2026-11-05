# Orders & Delivery Module: Design (draft for review)

> Status: **proposal, not built.** Owner's answers recorded 2026-11-05 (§8). Nothing in the main app changes until this is approved.
> Lives inside the Sales Management System and reuses its products, parties, cities, salespersons, users, credit control and invoices.

## 1. The flow

```
 Salesman                 Office / Admin                 Warehouse (USER login)          System
 ────────                 ──────────────                 ──────────────────────          ──────
 Book order  ──submit──►  Check credit, rates  ──approve──►  Load vehicle, enter      ──►  Invoice created
 (rates from              (edit or reject)                   vehicle / D.O. / DC / OGP     automatically,
  current rate list)                                         and bags loaded               printed in the
                                                             (one or more trips)            invoice format
```

1. **Book.** A salesman (or the office) books an order for a party: products, bags, and rates taken from the **current rate list**. Saved as _Draft_, then _Submitted_.
2. **Approve.** The office reviews it, with the same credit warnings the invoice form shows today (overdue, over limit; warn only). It can edit bags or rates, then _Approve_ or _Reject_.
3. **Dispatch.** Warehouse staff open approved orders and create a **delivery**: vehicle no., D.O. no., DC no., OGP no., and the bags loaded per product. One order can go out in **several trips** (partial deliveries).
4. **Invoice.** Saving a delivery as _Dispatched_ creates the **sales invoice** for exactly what was loaded, in the same database transaction. It prints in the format in `docs/invoice-format.md`.
5. **Close.** The order is _Completed_ when every bag is delivered. The office can also _Close_ it short, for example when the party cancels the rest.

### Statuses

| Order                | Meaning                                                    |
| -------------------- | ---------------------------------------------------------- |
| Draft                | Being written; only its author sees it                     |
| Submitted            | Waiting for office approval                                |
| Approved             | Ready to dispatch; nothing loaded yet                      |
| Part dispatched      | Some bags sent, some pending                               |
| Completed            | All bags sent                                              |
| Closed short         | Office closed it with bags still pending (reason required) |
| Rejected / Cancelled | Not going ahead (reason required)                          |

| Delivery   | Meaning                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Loading    | Vehicle being loaded; quantities can change                                                                         |
| Dispatched | Left the mill; the invoice exists. To change it, edit the invoice or cancel the delivery, which deletes its invoice |

## 2. Rate lists (market rates)

Rates move with the market, sometimes daily and sometimes weekly, so they are kept as **dated rate lists**.

- A **rate list** has an _effective from_ date and time, and one rate per active product.
- The office creates a new list whenever the market changes. The fastest way is **"Copy previous list"**, then change only the rates that moved. It can also **upload** the list from Excel.
- The **current list** is the newest one whose _effective from_ has passed. Old lists are kept for history.
- Modelled on the real list (`docs/rate-lists/2026-11-04.csv`, from the PDF of 04-11-2026). Each entry has:
  - **product**;
  - **crop year** (rice especially: Steam Platinum 25 kg is 13,500 for the 2025-26 crop and 11,500 for 2026-27, both on sale at once);
  - **rate** and **basis**;
  - **available** (N/A on the list means it can't be ordered);
  - a **note** shown to the salesman (origin such as "Australia", "Crimson", "S 11", or "On approval – advance only" for Shadmani).
- **Basis:** rice and pulses are rated **per 40 kg**. Desi ghee and spices are rated **per pack (tin)**, exactly as printed (ghee 1 kg = 2,550, 500 g = 1,450; cumin 5.5 kg = 6,550).
- **Ghee is ordered by the carton** (6 × 1 kg or 12 × 500 g). Carton price = tin price × tins per carton (the product's pack pcs).
- The list also prints 50 kg and 25 kg bag prices. These are 40 kg rate ÷ 40 × bag kg, **rounded half up for display** (e.g. 7,062.5 → 7,063). The invoice uses the exact bag rate (7,062.50) and rounds the line amount half down, so 1 bag invoices at 7,062. Odd bags can differ from the printed list by Rs 1.
- List footer text (e.g. "all orders received today are on the new rate list", "all pulses are non-returnable") is kept as the list's remarks and printed with it.
- The salesman picks a **product + crop year** from the current list, and the crop year prints on the invoice line.
- **Order lines take their rate from the current list when the order is booked, and that booked rate goes on the invoice**, even if the market moves before loading. The office can still change a rate during approval, and that change is recorded in the audit log.
- Products with no rate in the current list cannot be ordered until the office adds one.

## 2a. Prompt-payment discount (credit policy)

The discount is **not** taken off the invoice rate. It is a reward for paying on time:

- Each party has **credit days** (already in the main app: most are 30, some 40, set party by party).
- Each order carries an agreed **discount per group**, written on the order as on the Urdu order form: rice and pulses in Rs per 40 kg, desi ghee and spices in Rs per kg. Invoices made from the order copy these terms.
- The invoice prints at the full booked rate. If the party **clears that invoice within its credit days** (invoice date + credit days, Asia/Karachi), it earns
  `discount = Σ lines: rice/pulses → discount per 40 kg ÷ 40 × weight kg; ghee/spices → discount per kg × weight kg`, in whole rupees with a half rupee rounding down.
- "Cleared" uses the same oldest-debt-first allocation as the existing ageing calculation (`calc/ageing.ts`).
- The discount is **credited in the party's ledger** as its own entry type, _Discount_, next to Invoices (debit) and Payments (credit). It reduces outstanding and shows in the recovery reports.
- The system lists the invoices that have **earned** a discount, and those still **eligible** with the date their window closes. The office posts each credit with one click, can change or skip it, and the action is audited. _(Assumption: posting is a deliberate office step, not automatic.)_

## 3. Data model (new and changed tables)

New tables (Prisma). Money is `Decimal`, and every calculated field is recomputed on the server with `packages/shared/src/calc`.

```
RateList        id, effectiveFrom (timestamp), remarks, createdById, createdAt
RateListItem    id, rateListId, productId, cropYear String? (e.g. "2025-2026"),
                basis (PER_40KG | PER_UNIT), rate Decimal(14,2), isAvailable, note?
                @@unique(rateListId, productId, cropYear)

Order           id, orderNo Int @unique (assigned by the system; = "Booking No." on the invoice), orderDate,
                partyId, subPartyId?, cityId?, salespersonId?, status, remarks,
                rateListId (the list its rates came from),
                discount terms per group (rice, pulses per 40 kg; ghee, spices per kg),
                totalPacks, totalWeightKg, totalAmount (computed),
                approvedById?, approvedAt?, closedReason?, createdById, timestamps
OrderLine       id, orderId, lineNo, productId, cropYear?, qtyPacks (ghee: cartons),
                basis, listRate, rate (booked; office may edit), ratePerPack,
                packWeightKg (snapshot), amount, weightKg

Delivery        id, deliveryNo, orderId, deliveryDate, status (LOADING | DISPATCHED),
                vehicleNo, doNo, dcNo, ogpNo, driverName?, driverPhone?, remarks,
                invoiceId? (set when dispatched), createdById, timestamps
DeliveryLine    id, deliveryId, orderLineId, qtyPacks         (cannot exceed bags still pending)

DiscountCredit  id, partyId, invoiceId @unique, creditDate, amount Decimal(18,2),
                computedAmount (what the rule gave), remarks, createdById, timestamps
```

Changes to existing tables:

- **Invoice**: add `orderId?`, `deliveryId?` (unique), `doNo?`, `vehicleNo?`, `dcNo?`, `ogpNo?`, `bookingNo?`. These are header fields for the print and contain no money. Invoices entered by hand, the way they are today, keep working with these fields left blank.
- **Invoice**: also snapshot the order's discount terms and the party's credit days at save time (rule 4 style), so later changes don't rewrite history.
- **Category → discount group**: each category is its own discount group; the live app already has Rice, Pulses, Desi Ghee and Spices (confirmed by the owner).
- **Ledger, recovery, ageing**: Discount credits count as credits, like payments.
- **InvoiceLine**: add `cropYear?` and `rateBasis` (default PER_40KG, so existing invoices are unchanged). For PER_UNIT lines the rate is the tin or pack price, and ratePerPack = rate × pack pcs; for PER_40KG lines nothing changes. **This touches the shared invoice calc and the invoice form, so it gets its own tests**, and the golden test must still pass.
- **Products**: the list has items the product master lacks (e.g. Hazara B-2 40 kg). The office adds them as products before they appear on a rate list.
- **Print only, as you decided**: Add Expenses, Less Expenses and Less-Freight print as **0**, Value and Net payable equal the total, and the amount in words is generated.

Rules carried over from the main app: snapshots of pack weight and commission rate on invoice lines; each write runs in one transaction plus an `AuditLog` entry; half-rupee amounts round down; dates use Asia/Karachi.

## 4. Who can do what

You chose to give warehouse staff the existing **USER** login. New permissions:

| Permission                                         | SUPER_ADMIN | ADMIN |       USER        |
| -------------------------------------------------- | :---------: | :---: | :---------------: |
| View / manage rate lists                           |     ✅      |  ✅   |     view only     |
| Book & submit orders                               |     ✅      |  ✅   |     ✅ (own)      |
| Edit own draft / submitted order                   |     ✅      |  ✅   | ✅ until approved |
| Approve / reject / close orders, change rates      |     ✅      |  ✅   |        ❌         |
| See approved orders & create deliveries (dispatch) |     ✅      |  ✅   |        ✅         |
| Cancel a dispatched delivery (deletes its invoice) |     ✅      |  ✅   |        ❌         |

⚠️ **Consequence of using USER for the warehouse:** every USER, salesmen included, will be able to see all approved orders and create deliveries. A salesman linked to a salesperson still only sees _their own_ orders' amounts in reports. If that's a problem later, a separate warehouse role can be added without changing the data.

## 5. Screens (English)

| Screen                                         | Who                | What                                                                                                                                                                       |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rate lists** `/rates`                        | Office             | List by date; "New from previous"; edit grid (product, rate 40Kg, change vs previous list); Excel upload; "current" badge                                                  |
| **New order** `/orders/new`                    | Salesman / office  | Party (pre-fills city and salesperson), credit warning, product grid with rate auto-filled from the current list, bags, live totals (bags, weight, amount); phone friendly |
| **Orders** `/orders`                           | All                | Filter by status, party, salesperson, date; pending bags column                                                                                                            |
| **Order detail** `/orders/[id]`                | All                | Lines with ordered / delivered / pending bags, deliveries, linked invoices; Approve / Reject / Close buttons for the office                                                |
| **Dispatch board** `/dispatch`                 | Warehouse / office | Approved and part-dispatched orders waiting to load, oldest first                                                                                                          |
| **New delivery** `/orders/[id]/deliveries/new` | Warehouse          | Vehicle, D.O., DC, OGP, bags to load per line (defaults to pending), "Dispatch & create invoice"                                                                           |
| **Invoice print** `/invoices/[id]/print`       | All                | The printed invoice format (`docs/invoice-format.md`); A4; multi-page                                                                                                      |
| **Reports**                                    | Office             | Pending orders by party and product, dispatch register by date and vehicle, orders vs delivered                                                                            |

## 6. Build plan (one phase per session, tests pass before each commit)

| Phase                           | Builds                                                                                                                                | Done when                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **O1. Rate lists**              | Schema + API + screens + copy previous + Excel upload                                                                                 | Office can publish a list; "current list" resolves by date and time                                 |
| **O2. Orders**                  | Order schema, API, form, list, detail; credit warning; statuses up to Submitted                                                       | A salesman books an order with rates from the current list                                          |
| **O3. Approval**                | Approve / reject / edit / close, audit, permissions                                                                                   | The office approves; the order shows on the dispatch board                                          |
| **O4. Dispatch → Invoice**      | Delivery schema + API + screens; partial deliveries; auto-invoice in one transaction; invoice header fields                           | Loading 200 of 300 bags creates an invoice for 200; the order shows 100 pending                     |
| **O5. Invoice print**           | Print view in your invoice format, multi-page, amount in words                                                                        | Print matches the sample layout                                                                     |
| **O6. Reports**                 | Pending orders by party/product/salesperson, dispatch register                                                                        | Numbers tie to orders and invoices                                                                  |
| **O7. Prompt-payment discount** | DiscountCredit schema + calc in `packages/shared` + eligible/earned list + post credit; ledger, recovery and ageing include discounts | A 30-day party paying in full on day 25 earns exactly the order-form discount; on day 31 it doesn't |

## 7. Still open

- **D.O., DC and OGP numbering:** the owner will send invoice PDFs; the numbering (automatic or typed) will be decided from them before phase O4.

## 8. Owner's answers (2026-11-05)

From the rate list review:

| Question            | Answer                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| Crop year           | **Per line**, picked from the rate list and printed on the invoice              |
| Ghee & spices basis | **Per pack (tin)**, as printed on the list (this replaces the earlier "per kg") |
| Ghee quantity       | **By carton** (6 × 1 kg or 12 × 500 g)                                          |

Earlier answers:

| #   | Question                                | Answer                                                                                                                                                                      |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rate change between booking and loading | **Booked rate** goes on the invoice                                                                                                                                         |
| 2   | Discounts                               | **Prompt-payment discount** per group, written on each order; earned when the party pays within its credit days (30, 40… set per party); **credited in the party's ledger** |
| 3   | Ghee & spices pricing                   | ~~per kg~~ → **per pack**, see above                                                                                                                                        |
| 4   | D.O. / DC / OGP numbers                 | Pending; owner will send invoice PDFs                                                                                                                                       |
| 5   | Order number                            | **Assigned by the system** (printed as Booking No.)                                                                                                                         |
| 6   | Who books orders                        | **Salesmen (own logins) and office**                                                                                                                                        |
| 7   | Stock                                   | No stock module; the system **tracks pending orders**                                                                                                                       |
| —   | Module location                         | Inside the main app, built on a branch, not merged until approved                                                                                                           |
| —   | Users                                   | Salesmen, office/admin, warehouse (on the existing USER login)                                                                                                              |
| —   | Scope                                   | Full: order → delivery → invoice                                                                                                                                            |
| —   | Language                                | English                                                                                                                                                                     |
| —   | Invoice expenses / freight              | Print-only, always 0                                                                                                                                                        |
