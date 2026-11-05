# Salesman Commission: Design (draft for review)

> Status: **proposal, not built.** This changes the main app (commission today is per product/category, default 0.35%). Owner's answers recorded 2026-11-05.

## 1. The rules (from the owner, confirmed 2026-11-05)

1. **Farhan earns on every sale**, whoever the salesman is, at his rate for the line's category:

   | Category  | Farhan's rate |
   | --------- | ------------- |
   | Rice      | 0.35%         |
   | Pulses    | 0.25%         |
   | Desi Ghee | 0.35%         |
   | Spices    | 0.35%         |

2. **Arslan Dar's share comes out of Farhan's rate.** Arslan earns **only** on sales to **his parties** (parties whose salesman in the Parties master is Arslan Dar, whoever is on the invoice) and on sales **through sub-party Arslan Dar**. On those, Arslan gets a flat **0.15%** and Farhan keeps the rest. The total stays at Farhan's rate:

   | Category  | Total | Farhan keeps | Arslan Dar |
   | --------- | ----- | ------------ | ---------- |
   | Rice      | 0.35% | 0.20%        | 0.15%      |
   | Pulses    | 0.25% | **0.10%**    | 0.15%      |
   | Desi Ghee | 0.35% | 0.20%        | 0.15%      |
   | Spices    | 0.35% | 0.20%        | 0.15%      |

3. **Other salesmen** have no commission rate yet and earn nothing on their own sales; Farhan still earns on them (rule 1).

4. **Recalculate all invoices** with these rules once they are set up. Past commission figures and reports will change; invoice amounts don't.

5. Commission is still **amount × rate, not rounded** (stored to 4 dp, shown to 2 dp).

## 2. How a line's commission is worked out

1. **Total rate** = the line's category rate for the **overriding earner** (Farhan). If no overriding earner is set up, fall back to today's chain: product override → category rate → default.
2. **Shares:** go through the active share rules. A rule matches when the invoice's **party belongs to** the named salesman (Party.salespersonId) or the invoice's **sub-party** is the named one. Each matching rule gives its earner a flat rate (Arslan Dar 0.15%) **out of** the total.
3. **The overriding earner** keeps total − shares, never below 0.
4. The line stores one row per earner, and the line's `commission` is the total, so existing totals and reports stay correct.

Examples (Rs 100,000 line):

| Sale                                       | Farhan | Arslan Dar | Total |
| ------------------------------------------ | ------ | ---------- | ----- |
| Rice, salesman Ali                         | 350    | 0          | 350   |
| Pulses, salesman Farhan                    | 250    | 0          | 250   |
| Pulses, salesman Ali, sub-party Arslan Dar | 100    | 150        | 250   |
| Spices, party belongs to Arslan Dar        | 200    | 150        | 350   |
| Rice, party belongs to Ali, no sub-party   | 350    | 0          | 350   |

## 3. Data model

```
SalespersonCommissionRate  id, salespersonId, categoryId, rate Decimal(8,6)
                           @@unique(salespersonId, categoryId)        (Farhan's 4 rates)

Salesperson                + earnsOnAllSales Boolean @default(false)    (true for Farhan;
                             at most one, enforced by the service)

CommissionShare            id, earnerSalespersonId (Arslan Dar),
                           matchPartySalespersonId? (Arslan Dar: parties assigned to him), matchSubPartyId? (Arslan Dar sub-party),
                           rate Decimal(8,6) (0.0015), isActive
                           (at least one match field required)

InvoiceLineCommission      id, invoiceLineId, salespersonId (the earner), rate Decimal(8,6) snapshot,
                           amount Decimal(18,4)        @@unique(invoiceLineId, salespersonId)
```

- **InvoiceLine** `commissionRate` / `commission` stay as the line **total**, so invoice totals, the dashboard and the golden test keep working.
- Arslan Dar exists twice: as a **salesman** (parties are assigned to him, and he receives commission) and as a **sub-party** (for Farhan's sales through him). The share rule links both.
- The snapshot rule stays: rates are copied when a line is saved. The one-off recalculation below is the deliberate exception.

## 4. Recalculating all invoices

A SUPER_ADMIN action, **Recalculate commission**:

1. **Dry run:** each earner's commission before and after, and the number of lines that change. Nothing is saved.
2. **Run:** in one transaction, applies §2 to every line, rewrites the line commission rows and invoice totals, and writes one `AuditLog` entry with before/after totals per earner.
3. Amounts never change, only commission.

## 5. Screens

- **Salespersons master:** a rate per category, the "earns on all sales" switch (Farhan), and share rules (Arslan Dar 0.15%, matched by his parties and by sub-party).
- **Invoice form:** shows the total commission and the split per earner.
- **Commission report:** per earner (Farhan, Arslan Dar) by period, with the lines behind each total; Arslan's own sales and his share of others' sales shown separately.

## 6. Tests

- The four example rows in §2 give exactly those figures.
- Pulses via Arslan Dar: Farhan 0.10%, Arslan 0.15%.
- A sale matching Arslan both by party **and** sub-party pays his 0.15% once, not twice.
- Arslan earns nothing on a sale to someone else's party without sub-party Arslan Dar, even if he is written on the invoice.
- Recalculation: the dry run changes nothing; the run changes commission only, and amounts are untouched.

## 7. Open

- Nothing blocking. When other salesmen are given rates later, decide whether their rate comes **out of** Farhan's or **on top of** it.
