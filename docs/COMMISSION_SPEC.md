# Salesman Commission: Design (draft for review)

> Status: **proposal, not built.** This changes the main app (commission today is per product/category, default 0.35%). Owner's answers recorded 2026-11-05.

## 1. The rules (from the owner)

1. **Every salesman has their own commission rate per group.** Example, Farhan Khalid:

   | Group     | Rate  |
   | --------- | ----- |
   | Rice      | 0.35% |
   | Pulses    | 0.25% |
   | Desi Ghee | 0.35% |
   | Spices    | 0.35% |

2. **Sub-party split.** On sales through sub-party **Arslan Dar**, the commission is **0.35% in total, on every group**, shared:
   - **Farhan 0.20%**
   - **Arslan Dar 0.15%** (taken out of Farhan's commission)

   Both shares are tracked. Arslan Dar is the only case today, but the office can add more splits later.

   **Arslan Dar is also a salesman** for sales booked under his own name, at a **flat 0.15% on all categories** (Rice, Pulses, Desi Ghee, Spices). Commission reports therefore show his own sales and his share of Farhan's sub-party sales separately, as well as combined.

3. **Recalculate all invoices** with the new rates once they are set up. Past commission figures and reports will change.

4. Commission is still **amount × rate, not rounded** (stored to 4 dp, shown to 2 dp), on each line's amount.

## 2. Which rate applies to an invoice line

Checked in this order; the first match wins:

1. **Salesman + sub-party split** (e.g. Farhan + Arslan Dar): salesman share 0.20%, sub-party share 0.15%, any group.
2. **Salesman + group rate** (e.g. Farhan + Pulses = 0.25%).
3. Fallback, as today: product override → category rate → default rate (0.35%). This covers invoices with no salesman or a salesman with no rate set for that group.

## 3. Data model

```
SalespersonCommissionRate  id, salespersonId, categoryId, rate Decimal(8,6)
                           @@unique(salespersonId, categoryId)

CommissionSplit            id, salespersonId, subPartyId,
                           salespersonRate Decimal(8,6)   (0.0020)
                           subPartyRate    Decimal(8,6)   (0.0015)
                           isActive        @@unique(salespersonId, subPartyId)
```

Changes to existing tables:

- **InvoiceLine**: `commissionRate` / `commission` stay as the **salesman's** share. Add `subPartyCommissionRate` (snapshot, default 0) and `subPartyCommission`.
- **Invoice**: add `totalSubPartyCommission` next to `totalCommission`.
- **Groups = categories.** The live app already has the four categories Rice, Pulses, Desi Ghee and Spices (confirmed by the owner), so rates are set per category.

The snapshot rule stays: rates are copied onto each line when it is saved, so later rate changes only affect new or re-saved invoices. The one-off recalculation below is the deliberate exception.

## 4. Recalculating all invoices

A SUPER_ADMIN action, **Recalculate commission**:

1. **Dry run first:** shows each salesman's and sub-party's commission before and after, plus the number of lines that change. Nothing is saved.
2. **Run:** in one transaction, re-resolves the rate for every line (§2), recomputes line and invoice commission totals, and writes one `AuditLog` entry with the before/after totals per salesman.
3. Invoice **amounts never change**, only commission.

## 5. Screens

- **Salespersons master:** a rate grid per salesman (one rate per group) and their sub-party splits.
- **Invoice form:** shows the rate that will apply and, for split sub-parties, both shares.
- **Commission report:** by salesman and by sub-party (Arslan Dar), by period, with the lines behind each total.

## 6. Tests

- Farhan: a rice line at 0.35%, a pulses line at 0.25%, a ghee/spices line at 0.35%.
- Arslan Dar's own sales: 0.15% on every group.
- Farhan through Arslan Dar: every group gives 0.20% to Farhan and 0.15% to Arslan Dar, 0.35% in total.
- A salesman with no rate for a group falls back to the category/default rate.
- Recalculation: the dry run changes nothing; the run updates commission only, and amounts and the §6.4 golden amounts are untouched.

## 7. Needed from the owner

- **Every other salesman's rate per group** (Farhan's and Arslan Dar's are known).
