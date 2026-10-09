import {
  calcInvoice,
  dec,
  type Decimal,
  type ImportMapping,
  type ImportReport,
  type PartyMapping,
  packWeightKg,
  resolveCommissionRate,
  sum,
  ZERO,
} from '@sms/shared';
import type { ParsedWorkbook, RawPayment } from './workbook';

// Turns the parsed workbook + what's already in the database + the admin's name
// decisions into an exact plan (spec §11). Pure: no database access here.

export const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
export const keyOf = (s: string) => clean(s).toLowerCase();

/** Current database state, keyed by lower-cased name. */
export interface ExistingState {
  defaultCommissionRate: string;
  categories: Map<string, string>; // key → name
  products: Map<string, string>;
  productSkus: Map<number, string>; // sku → product name
  cities: Map<string, string>;
  salespersons: Map<string, string>;
  parties: Map<string, string>;
  subParties: Map<string, string>; // unassigned only
  banks: Map<string, string>;
  invoiceNos: Set<number>;
  /** `date|partyKey|amount|slip` → how many such payments already exist. */
  payments: Map<string, number>;
}

export interface PlannedMaster {
  name: string;
  exists: boolean;
}

export interface PlannedLine {
  lineNo: number;
  row: number;
  product: string;
  qtyPacks: number;
  rate40Kg: string;
  packWeightKg: string;
  commissionRate: string;
  ratePerPack: Decimal;
  amount: Decimal;
  commission: Decimal;
  weightKg: Decimal;
  category: string;
}

export interface PlannedInvoice {
  invoiceNo: number;
  invoiceDate: string;
  party: string;
  city: string | null;
  subParty: string | null;
  salesperson: string | null;
  lines: PlannedLine[];
  totals: ReturnType<typeof calcInvoice>['totals'];
  status: 'create' | 'exists';
}

export type PaymentStatus = 'create' | 'exists' | 'duplicate' | 'skipped' | 'unmapped';

export interface PlannedPayment {
  sheet: RawPayment['sheet'];
  row: number;
  date: string;
  party: string | null;
  subParty: string | null;
  slipNo: string | null;
  bank: string | null;
  amount: string;
  remarks: string | null;
  status: PaymentStatus;
}

export interface ImportPlan {
  categories: (PlannedMaster & { commissionRate: string | null })[];
  products: (PlannedMaster & {
    sku: number;
    unitWeightKg: string;
    packPcs: number;
    category: string;
  })[];
  cities: PlannedMaster[];
  salespersons: PlannedMaster[];
  parties: (PlannedMaster & { city: string | null })[];
  subParties: PlannedMaster[];
  banks: PlannedMaster[];
  invoices: PlannedInvoice[];
  payments: PlannedPayment[];
  report: Omit<ImportReport, 'dryRun' | 'created'>;
}

const RATE_RE = /^\d+(\.\d{1,2})?$/;
const fixed = (n: number, dp: number) => dec(n).toDecimalPlaces(dp).toString();

/** Collects names, preferring the first spelling seen (Lists before Database). */
class NameSet {
  private readonly names = new Map<string, string>();
  add(raw: string | null | undefined) {
    const name = clean(raw ?? '');
    if (name && !this.names.has(keyOf(name))) this.names.set(keyOf(name), name);
    return name ? this.names.get(keyOf(name))! : null;
  }
  get(raw: string) {
    return this.names.get(keyOf(raw)) ?? null;
  }
  has(raw: string) {
    return this.names.has(keyOf(raw));
  }
  values() {
    return [...this.names.values()];
  }
}

/**
 * A likely party for a free-text name, conservatively: the raw text starts with a
 * party's full name ("Pak Rice Traders dina"), or both share their first two words
 * ("Allah walay Nakyal" → "Allah Walay Traders"). Only a pre-fill — the admin confirms.
 */
function suggestParty(raw: string, parties: string[]): string | null {
  const k = keyOf(raw);
  const firstTwo = (s: string) => s.split(' ').slice(0, 2).join(' ');
  const prefix = parties
    .filter((p) => k.startsWith(keyOf(p)) || keyOf(p).startsWith(k))
    .sort((x, y) => y.length - x.length)[0];
  if (prefix) return prefix;
  const twoWords = parties.filter(
    (p) => k.split(' ').length >= 2 && firstTwo(keyOf(p)) === firstTwo(k),
  );
  return twoWords.length === 1 ? twoWords[0]! : null;
}

/** A likely bank for free text such as "Grainco Ubl" or "Waqar Rice Abl". */
function suggestBank(raw: string, banks: string[]): string | null {
  const k = keyOf(raw);
  const exact = banks.find((b) => keyOf(b) === k);
  if (exact) return exact;
  const has = (word: string) => new RegExp(`(^|\\W)${word}(\\W|$)`).test(k);
  const byWord: [string, string][] = [
    ['cash', 'Cash'],
    ['ubl', 'UBL'],
    ['abl', 'Allied Bank'],
    ['allied', 'Allied Bank'],
    ['hbl', 'HBL'],
    ['mcb', 'MCB'],
    ['meezan', 'Meezan Bank'],
    ['alfalah', 'Bank Alfalah'],
    ['askari', 'Askari Bank'],
    ['faysal', 'Faysal Bank'],
    ['bop', 'Bank of Punjab'],
    ['nbp', 'National Bank'],
  ];
  for (const [word, bank] of byWord) {
    if (has(word)) return banks.find((b) => keyOf(b) === keyOf(bank)) ?? null;
  }
  return null;
}

export function buildPlan(
  wb: ParsedWorkbook,
  existing: ExistingState,
  mapping: ImportMapping,
): ImportPlan {
  const problems: ImportReport['problems'] = [];
  for (const s of wb.missingSheets.filter((s) => ['Products', 'Database'].includes(s))) {
    problems.push({ sheet: s, row: 0, message: `Sheet "${s}" not found.` });
  }

  // ── Categories ──
  const excelDefault = wb.defaultCommissionRate ?? Number(existing.defaultCommissionRate);
  const categoryRate = new Map(
    wb.categoryRates.map((c) => [keyOf(c.name), c.rate ?? excelDefault]),
  );
  const categoryNames = new NameSet();
  for (const c of wb.categoryRates) categoryNames.add(c.name);
  for (const p of wb.products) categoryNames.add(p.category || 'Other');
  /** Rate a category's products get in the app; null = inherit the settings default. */
  const rateFor = (category: string): string | null => {
    const rate = dec(categoryRate.get(keyOf(category)) ?? excelDefault);
    return rate.eq(existing.defaultCommissionRate) ? null : rate.toString();
  };
  const categories = categoryNames.values().map((name) => ({
    name: existing.categories.get(keyOf(name)) ?? name,
    exists: existing.categories.has(keyOf(name)),
    commissionRate: rateFor(name),
  }));

  // ── Products ──
  const products: ImportPlan['products'] = [];
  const productByKey = new Map<string, ImportPlan['products'][number]>();
  for (const p of wb.products) {
    const name = clean(p.name);
    if (productByKey.has(keyOf(name))) {
      problems.push({ sheet: 'Products', row: p.row, message: `"${name}" is listed twice.` });
      continue;
    }
    const bad = (m: string) =>
      problems.push({ sheet: 'Products', row: p.row, message: `${name}: ${m}` });
    if (!p.sku || !Number.isInteger(p.sku) || p.sku <= 0) {
      bad('product # (column A) must be a whole number.');
      continue;
    }
    if (!p.unitWeightKg || p.unitWeightKg <= 0) {
      bad('unit weight must be more than 0.');
      continue;
    }
    if (!p.packPcs || !Number.isInteger(p.packPcs) || p.packPcs < 1) {
      bad('pack (pcs) must be a whole number of at least 1.');
      continue;
    }
    const skuOwner = existing.productSkus.get(p.sku);
    if (skuOwner && keyOf(skuOwner) !== keyOf(name)) {
      bad(`product # ${p.sku} already belongs to "${skuOwner}" in the app.`);
      continue;
    }
    const planned = {
      name: existing.products.get(keyOf(name)) ?? name,
      exists: existing.products.has(keyOf(name)),
      sku: p.sku,
      unitWeightKg: fixed(p.unitWeightKg, 3),
      packPcs: p.packPcs,
      category: categoryNames.get(p.category || 'Other')!,
    };
    products.push(planned);
    productByKey.set(keyOf(name), planned);
  }

  // ── Cities, salespersons, parties, sub-parties, banks (Lists first, then Database) ──
  const cityNames = new NameSet();
  const spNames = new NameSet();
  const partyNames = new NameSet();
  const subNames = new NameSet();
  const bankNames = new NameSet();
  wb.lists.cities.forEach((n) => cityNames.add(n));
  wb.lists.salespersons.forEach((n) => spNames.add(n));
  wb.lists.parties.forEach((n) => partyNames.add(n));
  wb.lists.subParties.forEach((n) => subNames.add(n));
  wb.lists.banks.forEach((n) => bankNames.add(n));
  for (const l of wb.lines) {
    cityNames.add(l.city);
    spNames.add(l.salesperson);
    partyNames.add(l.party);
    subNames.add(l.subParty);
  }
  for (const p of wb.payments.filter((p) => p.sheet === 'Payments')) {
    partyNames.add(p.party);
    subNames.add(p.subParty);
  }

  // Party default city = the city most of its invoices went to.
  const cityVotes = new Map<string, Map<string, number>>();
  for (const l of wb.lines) {
    if (!l.party || !l.city) continue;
    const votes = cityVotes.get(keyOf(l.party)) ?? new Map<string, number>();
    const city = cityNames.get(l.city)!;
    votes.set(city, (votes.get(city) ?? 0) + 1);
    cityVotes.set(keyOf(l.party), votes);
  }
  const defaultCity = (party: string) =>
    [...(cityVotes.get(keyOf(party)) ?? new Map<string, number>())].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] ?? null;

  // ── Invoices (Database → group by Invoice #) ──
  const groups = new Map<number, typeof wb.lines>();
  for (const l of wb.lines) {
    const bad = (m: string) => problems.push({ sheet: 'Database', row: l.row, message: m });
    if (l.invoiceNo === null || !Number.isInteger(l.invoiceNo) || l.invoiceNo <= 0) {
      bad(
        `Invoice # "${l.invoiceNoText}" is not a whole number — give this line a proper invoice number in the workbook.`,
      );
      continue;
    }
    if (!l.invoiceDate) bad(`Invoice ${l.invoiceNo}: unreadable date.`);
    if (!l.party) bad(`Invoice ${l.invoiceNo}: party is empty.`);
    if (!productByKey.has(keyOf(l.product)))
      bad(`Invoice ${l.invoiceNo}: product "${l.product}" is not in Products.`);
    if (l.qtyPacks === null || !Number.isInteger(l.qtyPacks) || l.qtyPacks <= 0) {
      bad(`Invoice ${l.invoiceNo}: Qty (Packs) must be a whole number above 0.`);
    }
    if (l.rate40Kg === null || l.rate40Kg <= 0 || !RATE_RE.test(String(l.rate40Kg))) {
      bad(`Invoice ${l.invoiceNo}: Rate 40Kg must be above 0 with at most 2 decimals.`);
    }
    const g = groups.get(l.invoiceNo) ?? [];
    g.push(l);
    groups.set(l.invoiceNo, g);
  }

  const mismatches: ImportReport['mismatches'] = [];
  const invoices: PlannedInvoice[] = [];
  for (const [invoiceNo, rows] of [...groups].sort((a, b) => a[0] - b[0])) {
    const head = rows[0]!;
    const headers = new Set(
      rows.map((r) =>
        [
          r.invoiceDate,
          keyOf(r.party),
          keyOf(r.city),
          keyOf(r.subParty),
          keyOf(r.salesperson),
        ].join('|'),
      ),
    );
    if (headers.size > 1) {
      problems.push({
        sheet: 'Database',
        row: head.row,
        message: `Invoice ${invoiceNo}: its lines have different dates/parties/cities/ASMs.`,
      });
    }
    const valid = rows.filter(
      (r) =>
        productByKey.has(keyOf(r.product)) &&
        r.qtyPacks &&
        r.rate40Kg &&
        RATE_RE.test(String(r.rate40Kg)),
    );
    if (valid.length !== rows.length || !head.invoiceDate || !head.party) continue;

    const withSnapshots = valid.map((r, i) => {
      const product = productByKey.get(keyOf(r.product))!;
      return {
        lineNo: i + 1,
        row: r.row,
        product: product.name,
        category: product.category,
        qtyPacks: r.qtyPacks!,
        rate40Kg: String(r.rate40Kg),
        packWeightKg: packWeightKg(product.unitWeightKg, product.packPcs).toString(),
        commissionRate: resolveCommissionRate(
          null,
          categories.find((c) => keyOf(c.name) === keyOf(product.category))?.commissionRate,
          existing.defaultCommissionRate,
        ).toString(),
        excelAmount: r.excelAmount,
        excelCommission: r.excelCommission,
      };
    });
    const { lines, totals } = calcInvoice(withSnapshots);
    for (const l of lines) {
      if (l.excelAmount !== null && !l.amount.eq(fixed(l.excelAmount, 2))) {
        mismatches.push({
          invoiceNo,
          row: l.row,
          product: l.product,
          field: 'amount',
          excel: fixed(l.excelAmount, 2),
          computed: l.amount.toString(),
        });
      }
      if (l.excelCommission !== null && l.commission.minus(l.excelCommission).abs().gt('0.0001')) {
        mismatches.push({
          invoiceNo,
          row: l.row,
          product: l.product,
          field: 'commission',
          excel: fixed(l.excelCommission, 4),
          computed: l.commission.toString(),
        });
      }
    }
    invoices.push({
      invoiceNo,
      invoiceDate: head.invoiceDate,
      party: partyNames.get(head.party)!,
      city: head.city ? cityNames.get(head.city) : null,
      subParty: head.subParty ? subNames.get(head.subParty) : null,
      salesperson: head.salesperson ? spNames.get(head.salesperson) : null,
      lines: lines.map(({ excelAmount: _a, excelCommission: _c, ...l }) => l),
      totals,
      status: existing.invoiceNos.has(invoiceNo) ? 'exists' : 'create',
    });
  }

  // ── Payments (Payments sheet, then Sheet1 with name mapping) ──
  const knownParties = () =>
    [...new Set([...partyNames.values(), ...existing.parties.values()])].sort((a, b) =>
      a.localeCompare(b),
    );
  const allBanks = [...new Set([...bankNames.values(), ...existing.banks.values()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const unmatched = new Map<string, { raw: string; payments: number; amount: Decimal }>();
  const bankTexts = new Map<string, { raw: string; payments: number }>();

  const resolveParty = (raw: string): { party: string | null; status: PaymentStatus } => {
    // Parties that exist only in the app are added too, so the writer can find their id.
    const known = partyNames.get(raw) ?? existing.parties.get(keyOf(raw));
    if (known) return { party: partyNames.add(known), status: 'create' };
    const m: PartyMapping | undefined = mapping.parties[keyOf(raw)];
    if (!m) return { party: null, status: 'unmapped' };
    if (m.action === 'skip') return { party: null, status: 'skipped' };
    if (m.action === 'create') return { party: partyNames.add(m.name), status: 'create' };
    const target = partyNames.get(m.party) ?? existing.parties.get(keyOf(m.party));
    if (!target) {
      problems.push({
        sheet: 'Sheet1',
        row: 0,
        message: `Mapping for "${raw}" points at unknown party "${m.party}".`,
      });
      return { party: null, status: 'unmapped' };
    }
    return { party: partyNames.add(target), status: 'create' };
  };

  const remaining = new Map(existing.payments); // consume counts so re-runs skip what's there
  const fromPaymentsSheet = new Map<string, number>(); // Sheet1 rows already on the Payments sheet
  const payments: PlannedPayment[] = [];
  for (const p of [...wb.payments].sort((a, b) =>
    a.sheet === b.sheet ? 0 : a.sheet === 'Payments' ? -1 : 1,
  )) {
    const bad = (m: string) => problems.push({ sheet: p.sheet, row: p.row, message: m });
    if (!p.date) {
      bad('unreadable date.');
      continue;
    }
    if (p.amount === null || p.amount <= 0 || !RATE_RE.test(String(p.amount))) {
      bad('amount must be above 0 with at most 2 decimals.');
      continue;
    }
    if (!p.party) {
      bad('party is empty.');
      continue;
    }
    const amount = dec(p.amount).toString();
    const { party, status: partyStatus } = resolveParty(p.party);
    if (partyStatus === 'unmapped' && !partyNames.has(p.party)) {
      const u = unmatched.get(keyOf(p.party)) ?? { raw: clean(p.party), payments: 0, amount: ZERO };
      u.payments++;
      u.amount = u.amount.plus(amount);
      unmatched.set(keyOf(p.party), u);
    }

    // Bank: exact list name, else the admin's mapping; the original text goes in remarks.
    let bank: string | null = null;
    if (p.bank) {
      const exact = allBanks.find((b) => keyOf(b) === keyOf(p.bank));
      if (p.sheet === 'Sheet1') {
        const t = bankTexts.get(keyOf(p.bank)) ?? { raw: clean(p.bank), payments: 0 };
        t.payments++;
        bankTexts.set(keyOf(p.bank), t);
      }
      const mapped = mapping.banks[keyOf(p.bank)];
      bank = mapped !== undefined ? mapped : (exact ?? null);
    }
    const remarks = [
      p.remarks,
      p.bank && (!bank || keyOf(bank) !== keyOf(p.bank)) ? `Bank: ${clean(p.bank)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    let status: PaymentStatus = partyStatus;
    if (status === 'create' && party) {
      const dupKey = `${p.date}|${keyOf(party)}|${amount}`;
      const slipKey = `${dupKey}|${keyOf(p.slipNo)}`;
      if (p.sheet === 'Sheet1' && (fromPaymentsSheet.get(dupKey) ?? 0) > 0) {
        // Same date + party + amount as a Payments-sheet entry: one payment, not two (spec §11.5).
        fromPaymentsSheet.set(dupKey, fromPaymentsSheet.get(dupKey)! - 1);
        status = 'duplicate';
      } else if ((remaining.get(slipKey) ?? 0) > 0) {
        remaining.set(slipKey, remaining.get(slipKey)! - 1); // imported on an earlier run
        status = 'exists';
      }
      if (p.sheet === 'Payments') {
        fromPaymentsSheet.set(dupKey, (fromPaymentsSheet.get(dupKey) ?? 0) + 1);
      }
    }
    payments.push({
      sheet: p.sheet,
      row: p.row,
      date: p.date,
      party,
      subParty: p.subParty ? subNames.get(p.subParty) : null,
      slipNo: p.slipNo || null,
      bank,
      amount,
      remarks: remarks || null,
      status,
    });
  }
  for (const b of new Set(payments.map((p) => p.bank).filter((b): b is string => !!b)))
    bankNames.add(b);

  // ── Masters to create ──
  const master = (names: string[], existingMap: Map<string, string>) =>
    names.map((name) => ({
      name: existingMap.get(keyOf(name)) ?? name,
      exists: existingMap.has(keyOf(name)),
    }));
  const parties = partyNames.values().map((name) => ({
    name: existing.parties.get(keyOf(name)) ?? name,
    exists: existing.parties.has(keyOf(name)),
    city: defaultCity(name),
  }));

  // ── Comparison with the Excel Dashboard (all Database lines, before skipping existing) ──
  const allLines = invoices.flatMap((i) => i.lines);
  const total = (f: (l: PlannedLine) => Decimal) => sum(allLines.map(f));
  const revenue = total((l) => l.amount);
  const commission = total((l) => l.commission);
  const weight = total((l) => l.weightKg);
  const compare = (metric: string, excel: number | null, computed: Decimal, dp: number) => ({
    metric,
    excel: excel === null ? null : fixed(excel, dp),
    computed: computed.toDecimalPlaces(dp).toString(),
    matches:
      excel !== null &&
      computed
        .minus(excel)
        .abs()
        .lte(dp === 0 ? '0.5' : '0.005'),
  });
  const comparison = [
    compare('Total revenue (PKR)', wb.dashboard.revenue, revenue, 0),
    compare('Total commission', wb.dashboard.commission, commission, 3),
    compare('Total weight (tons)', wb.dashboard.tons, weight.div(1000), 3),
    compare('Invoices', wb.dashboard.invoices, dec(invoices.length), 0),
    compare(
      'Total packs',
      wb.lines.reduce((n, l) => n + (l.qtyPacks ?? 0), 0),
      dec(allLines.reduce((n, l) => n + l.qtyPacks, 0)),
      0,
    ),
    ...wb.dashboard.byCategory
      .filter((c) => c.amount !== null)
      .map((c) =>
        compare(
          `Sales — ${c.name}`,
          c.amount,
          total((l) => (keyOf(l.category) === keyOf(c.name) ? l.amount : ZERO)),
          0,
        ),
      ),
    ...wb.dashboard.bySalesperson
      .filter((s) => s.amount !== null)
      .map((s) =>
        compare(
          `Sales — ${s.name}`,
          s.amount,
          sum(
            invoices
              .filter((i) => i.salesperson && keyOf(i.salesperson) === keyOf(s.name))
              .map((i) => i.totals.totalAmount),
          ),
          0,
        ),
      ),
  ];

  const count = <T extends { exists: boolean }>(xs: T[]) => ({
    create: xs.filter((x) => !x.exists).length,
    exists: xs.filter((x) => x.exists).length,
  });
  const cities = master(cityNames.values(), existing.cities);
  const salespersons = master(spNames.values(), existing.salespersons);
  const subParties = master(subNames.values(), existing.subParties);
  const banks = master(bankNames.values(), existing.banks);
  const byStatus = (s: PaymentStatus) => payments.filter((p) => p.status === s).length;

  const unmatchedParties = [...unmatched].map(([key, u]) => ({
    raw: u.raw,
    key,
    payments: u.payments,
    amount: u.amount.toString(),
    suggestion: suggestParty(u.raw, knownParties()),
    mapping: mapping.parties[key] ?? null,
  }));
  // Names the admin chose to map already (so the UI can show them as decided).
  for (const [key, m] of Object.entries(mapping.parties)) {
    if (unmatched.has(key)) continue;
    const rows = wb.payments.filter((p) => keyOf(p.party) === key);
    if (rows.length && !partyNames.has(rows[0]!.party)) {
      unmatchedParties.push({
        raw: clean(rows[0]!.party),
        key,
        payments: rows.length,
        amount: sum(rows.map((r) => r.amount ?? 0)).toString(),
        suggestion: suggestParty(rows[0]!.party, knownParties()),
        mapping: m,
      });
    }
  }
  unmatchedParties.sort((a, b) => a.raw.localeCompare(b.raw));

  const report: ImportPlan['report'] = {
    ready: problems.length === 0 && payments.every((p) => p.status !== 'unmapped'),
    summary: {
      categories: count(categories),
      products: count(products),
      cities: count(cities),
      salespersons: count(salespersons),
      parties: count(parties),
      subParties: count(subParties),
      banks: count(banks),
      invoices: {
        create: invoices.filter((i) => i.status === 'create').length,
        exists: invoices.filter((i) => i.status === 'exists').length,
        lines: invoices
          .filter((i) => i.status === 'create')
          .reduce((n, i) => n + i.lines.length, 0),
      },
      payments: {
        create: byStatus('create'),
        exists: byStatus('exists'),
        duplicate: byStatus('duplicate'),
        skipped: byStatus('skipped'),
        unmapped: byStatus('unmapped'),
      },
    },
    comparison,
    mismatches,
    unmatchedParties,
    banks: [...bankTexts].map(([key, t]) => ({
      raw: t.raw,
      key,
      payments: t.payments,
      suggestion: suggestBank(t.raw, allBanks),
      mapped: mapping.banks[key] !== undefined ? mapping.banks[key] : undefined,
    })),
    partyNames: knownParties(),
    bankNames: allBanks,
    invoices: invoices.map((i) => ({
      invoiceNo: i.invoiceNo,
      invoiceDate: i.invoiceDate,
      party: i.party,
      lines: i.lines.length,
      totalAmount: i.totals.totalAmount.toString(),
      status: i.status,
    })),
    problems,
  };

  return {
    categories,
    products,
    cities,
    salespersons,
    parties,
    subParties,
    banks,
    invoices,
    payments,
    report,
  };
}
