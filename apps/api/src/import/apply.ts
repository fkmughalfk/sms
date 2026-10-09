import { dec } from '@sms/shared';
import { fromDbDate, toDbDate } from '../common/db-date';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { type ExistingState, type ImportPlan, keyOf } from './plan';

type Db = PrismaClient | Prisma.TransactionClient;

/** Snapshot of what the database already holds, for planning (names keyed lower-case). */
export async function loadExisting(db: Db): Promise<ExistingState> {
  const byName = (rows: { name: string }[]) => new Map(rows.map((r) => [keyOf(r.name), r.name]));
  const [
    setting,
    categories,
    products,
    cities,
    salespersons,
    parties,
    subParties,
    banks,
    invoices,
    payments,
  ] = await Promise.all([
    db.setting.findUnique({ where: { id: 1 }, select: { defaultCommissionRate: true } }),
    db.category.findMany({ select: { name: true } }),
    db.product.findMany({ select: { name: true, sku: true } }),
    db.city.findMany({ select: { name: true } }),
    db.salesperson.findMany({ select: { name: true } }),
    db.party.findMany({ select: { name: true } }),
    db.subParty.findMany({ where: { partyId: null }, select: { name: true } }),
    db.bank.findMany({ select: { name: true } }),
    db.invoice.findMany({ select: { invoiceNo: true } }), // incl. soft-deleted: numbers stay reserved
    db.payment.findMany({
      where: { deletedAt: null },
      select: { paymentDate: true, amount: true, slipNo: true, party: { select: { name: true } } },
    }),
  ]);
  const paymentCounts = new Map<string, number>();
  for (const p of payments) {
    const key = `${fromDbDate(p.paymentDate)}|${keyOf(p.party.name)}|${dec(p.amount.toString()).toString()}|${keyOf(p.slipNo ?? '')}`;
    paymentCounts.set(key, (paymentCounts.get(key) ?? 0) + 1);
  }
  return {
    defaultCommissionRate: setting?.defaultCommissionRate.toString() ?? '0.0035',
    categories: byName(categories),
    products: byName(products),
    productSkus: new Map(products.map((p) => [p.sku, p.name])),
    cities: byName(cities),
    salespersons: byName(salespersons),
    parties: byName(parties),
    subParties: byName(subParties),
    banks: byName(banks),
    invoiceNos: new Set(invoices.map((i) => i.invoiceNo)),
    payments: paymentCounts,
  };
}

/**
 * Writes the plan inside the caller's transaction: masters first, then invoices
 * (with snapshots and recalculated totals) and payments, then one IMPORT audit entry.
 */
export async function applyPlan(
  tx: Prisma.TransactionClient,
  plan: ImportPlan,
  actorId: string,
  ip: string | null,
) {
  const ids = async (
    rows: { name: string; exists: boolean }[],
    find: (names: string[]) => Promise<{ id: string; name: string }[]>,
    create: (row: { name: string }) => Promise<{ id: string; name: string }>,
  ) => {
    const map = new Map<string, string>();
    for (const r of await find(rows.map((r) => r.name))) map.set(keyOf(r.name), r.id);
    let created = 0;
    for (const r of rows) {
      if (map.has(keyOf(r.name))) continue;
      const row = await create(r);
      map.set(keyOf(row.name), row.id);
      created++;
    }
    return { map, created };
  };
  const findIn =
    (delegate: { findMany: (a: object) => Promise<{ id: string; name: string }[]> }) =>
    (names: string[]) =>
      delegate.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });

  const categories = await ids(plan.categories, findIn(tx.category), (r) =>
    tx.category.create({
      data: {
        name: r.name,
        commissionRate: plan.categories.find((c) => c.name === r.name)?.commissionRate ?? null,
      },
      select: { id: true, name: true },
    }),
  );
  const products = await ids(plan.products, findIn(tx.product), (r) => {
    const p = plan.products.find((x) => x.name === r.name)!;
    return tx.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        unitWeightKg: p.unitWeightKg,
        packPcs: p.packPcs,
        categoryId: categories.map.get(keyOf(p.category))!,
      },
      select: { id: true, name: true },
    });
  });
  const cities = await ids(plan.cities, findIn(tx.city), (r) =>
    tx.city.create({ data: { name: r.name }, select: { id: true, name: true } }),
  );
  const salespersons = await ids(plan.salespersons, findIn(tx.salesperson), (r) =>
    tx.salesperson.create({ data: { name: r.name }, select: { id: true, name: true } }),
  );
  const banks = await ids(plan.banks, findIn(tx.bank), (r) =>
    tx.bank.create({ data: { name: r.name }, select: { id: true, name: true } }),
  );
  const parties = await ids(plan.parties, findIn(tx.party), (r) => {
    const city = plan.parties.find((p) => p.name === r.name)?.city;
    return tx.party.create({
      data: { name: r.name, cityId: city ? cities.map.get(keyOf(city)) : null },
      select: { id: true, name: true },
    });
  });
  const subParties = await ids(
    plan.subParties,
    (names) =>
      tx.subParty.findMany({
        where: { name: { in: names }, partyId: null },
        select: { id: true, name: true },
      }),
    (r) => tx.subParty.create({ data: { name: r.name }, select: { id: true, name: true } }),
  );

  const ref = (map: Map<string, string>, name: string | null) =>
    name ? (map.get(keyOf(name)) ?? null) : null;

  let invoices = 0;
  let lines = 0;
  for (const inv of plan.invoices.filter((i) => i.status === 'create')) {
    await tx.invoice.create({
      data: {
        invoiceNo: inv.invoiceNo,
        invoiceDate: toDbDate(inv.invoiceDate),
        partyId: ref(parties.map, inv.party)!,
        cityId: ref(cities.map, inv.city),
        subPartyId: ref(subParties.map, inv.subParty),
        salespersonId: ref(salespersons.map, inv.salesperson),
        remarks: 'Imported from Excel',
        totalPacks: inv.totals.totalPacks,
        totalWeightKg: inv.totals.totalWeightKg.toString(),
        totalAmount: inv.totals.totalAmount.toString(),
        totalCommission: inv.totals.totalCommission.toString(),
        createdById: actorId,
        lines: {
          create: inv.lines.map((l) => ({
            lineNo: l.lineNo,
            productId: products.map.get(keyOf(l.product))!,
            qtyPacks: l.qtyPacks,
            rate40Kg: l.rate40Kg,
            packWeightKg: l.packWeightKg,
            commissionRate: l.commissionRate,
            ratePerPack: l.ratePerPack.toString(),
            amount: l.amount.toString(),
            commission: l.commission.toString(),
            weightKg: l.weightKg.toString(),
          })),
        },
      },
    });
    invoices++;
    lines += inv.lines.length;
  }

  const toCreate = plan.payments.filter((p) => p.status === 'create');
  if (toCreate.length) {
    await tx.payment.createMany({
      data: toCreate.map((p) => ({
        paymentDate: toDbDate(p.date),
        partyId: ref(parties.map, p.party)!,
        subPartyId: ref(subParties.map, p.subParty),
        slipNo: p.slipNo,
        bankId: ref(banks.map, p.bank),
        amount: p.amount,
        remarks: p.remarks,
        createdById: actorId,
      })),
    });
  }

  const masters =
    categories.created +
    products.created +
    cities.created +
    salespersons.created +
    banks.created +
    parties.created +
    subParties.created;
  const created = { masters, invoices, lines, payments: toCreate.length };
  await tx.auditLog.create({
    data: {
      userId: actorId,
      action: 'IMPORT',
      entity: 'Import',
      after: { source: 'Excel workbook', ...created, summary: plan.report.summary },
      ip,
    },
  });
  return created;
}
