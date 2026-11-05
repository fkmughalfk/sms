# Orders & Delivery Module: Design (draft for review)

> Status: **proposal, not built.** Nothing in the main app changes until this is approved.
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
- **Order lines take their rate from the current list** when the order is booked. The office can still change a rate during approval, and that change is recorded in the audit log.
- Products with no rate in the current list cannot be ordered until the office adds one.
- Discounts: the Urdu order form has a discount per group (rice, pulses, ghee, spices). The order can carry these discounts, and the line rate on the invoice is the rate **after** discount. _(See open question 2.)_

## 3. Data model (new and changed tables)

New tables (Prisma). Money is `Decimal`, and every calculated field is recomputed on the server with `packages/shared/src/calc`.

```
RateList        id, effectiveFrom (timestamp), remarks, createdById, createdAt
RateListItem    id, rateListId, productId, rate40Kg Decimal(14,2)     @@unique(rateListId, productId)

Order           id, orderNo Int @unique (= "Booking No." on the invoice), orderDate,
                partyId, subPartyId?, cityId?, salespersonId?, status, remarks,
                rateListId (the list its rates came from), discounts (per group, see Q2),
                totalPacks, totalWeightKg, totalAmount (computed),
                approvedById?, approvedAt?, closedReason?, createdById, timestamps
OrderLine       id, orderId, lineNo, productId, qtyPacks, listRate40Kg, rate40Kg (after discount/edit),
                packWeightKg (snapshot), amount, weightKg

Delivery        id, deliveryNo, orderId, deliveryDate, status (LOADING | DISPATCHED),
                vehicleNo, doNo, dcNo, ogpNo, driverName?, driverPhone?, remarks,
                invoiceId? (set when dispatched), createdById, timestamps
DeliveryLine    id, deliveryId, orderLineId, qtyPacks         (cannot exceed bags still pending)
```

Changes to existing tables:

- **Invoice**: add `orderId?`, `deliveryId?` (unique), `doNo?`, `vehicleNo?`, `dcNo?`, `ogpNo?`, `bookingNo?`. These are header fields for the print and contain no money. Invoices entered by hand, the way they are today, keep working with these fields left blank.
- **Setting**: add `cropYear` (e.g. `2025-2026`), printed on every invoice line.
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

| Phase                      | Builds                                                                                                      | Done when                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **O1. Rate lists**         | Schema + API + screens + copy previous + Excel upload                                                       | Office can publish a list; "current list" resolves by date and time             |
| **O2. Orders**             | Order schema, API, form, list, detail; credit warning; statuses up to Submitted                             | A salesman books an order with rates from the current list                      |
| **O3. Approval**           | Approve / reject / edit / close, audit, permissions                                                         | The office approves; the order shows on the dispatch board                      |
| **O4. Dispatch → Invoice** | Delivery schema + API + screens; partial deliveries; auto-invoice in one transaction; invoice header fields | Loading 200 of 300 bags creates an invoice for 200; the order shows 100 pending |
| **O5. Invoice print**      | Print view in your invoice format, multi-page, amount in words                                              | Print matches the sample layout                                                 |
| **O6. Reports**            | Pending orders, dispatch register                                                                           | Numbers tie to orders and invoices                                              |

## 7. Open questions (please answer before phase O1)

1. **Rate change after booking:** if the market rate changes between booking and loading, does the invoice use the **booked rate** (my assumption) or the **rate on the loading day**?
2. **Discounts:** keep the order form's per-group discount (rice, pulses, ghee, spices), or are rates in the rate list already final?
3. **Ghee and spices pricing:** the main app prices every line by Rate 40Kg. Your order form prices ghee **per kg (carton)** and spices **per pack**. In the main app today, are ghee and spices entered as a 40 kg rate? If not, rate lists need a "rate per kg / per pack" option.
4. **Numbers:** which of D.O. no., DC no. and OGP no. should the system number automatically, and which are typed from a paper book? (In the sample, OGP 23158 looks like a separate book.)
5. **Order number:** a separate sequence starting at 1, printed as "Booking No." on the invoice?
6. **Who books orders:** do salesmen have their own logins, or does the office enter orders they phone in?
7. **Stock:** should the system check the bags in stock before loading, or is stock out of scope for now?
