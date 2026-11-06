import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type AuthUser,
  calcOrderLine,
  calcOrderTotals,
  dec,
  defaultRateBasis,
  normalizeAlias,
  normalizeCropYear,
  type OpeningImportReport,
  type OpeningMapping,
  packWeightKg,
  pendingLine,
  type RateBasis,
  sum,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import { toDbDate } from '../common/db-date';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type OpeningRow, parseOpeningFile } from './opening-file';
import { OrdersService } from './orders.service';

interface ProductRec {
  id: string;
  name: string;
  unitWeightKg: string;
  packPcs: number;
  category: string;
}

/** A row turned into an order line. */
interface PlannedLine {
  row: number;
  productId: string;
  cropYear: string;
  basis: RateBasis;
  rate: string;
  packWeightKg: string;
  packPcs: number;
  qtyPacks: number;
  dispatched: number;
}

interface PlannedOrder {
  orderNo: number | null;
  date: string;
  partyKey: string;
  partyText: string;
  cityText: string;
  salespersonKey: string;
  lines: PlannedLine[];
  exists: boolean;
}

type Target = { id: string; name: string };

/** Words that say nothing about which party / product a name means. */
const GENERIC = new Set([
  'TRADERS',
  'TRADER',
  'AND',
  'CO',
  'SHOP',
  'COMMISSION',
  'ENTERPRISES',
  'ZAFARANI',
  'PURE',
  'SB',
]);
const words = (s: string) =>
  normalizeAlias(s)
    .replace(/[.,&]/g, ' ')
    .replace(/\b(TRD|TDR|TRDS)\b/g, 'TRADERS')
    .split(' ')
    .filter((w) => w && !GENERIC.has(w) && !/^\d+(\.\d+)?KG$/.test(w));

/** The closest name by shared words (a guess shown to the office, never applied by itself). */
function suggest(text: string, options: Target[], fits: (t: Target) => boolean = () => true) {
  const want = new Set(words(text));
  let best: Target | null = null;
  let score = 0;
  for (const o of options) {
    if (!fits(o)) continue;
    const have = words(o.name);
    if (!have.length || !want.size) continue;
    const s = have.filter((w) => want.has(w)).length / Math.max(want.size, have.length);
    if (s > score) {
      score = s;
      best = o;
    }
  }
  return score >= 0.5 ? best : null;
}

/** Round-number decimals only (rates are stored to 2 dp). */
const twoDp = (d: ReturnType<typeof dec>) => (d.decimalPlaces() <= 2 ? d.toString() : null);

/**
 * Go-live: loads the old pending-orders report as opening orders (docs/ORDERS_DELIVERY_SPEC.md
 * §7). Order numbers and what was already dispatched are kept. Names the system doesn't
 * know are listed for the office to map once; mappings are remembered as aliases.
 */
@Injectable()
export class OpeningImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
  ) {}

  async run(
    user: AuthUser,
    file: { buffer: Buffer; originalname: string },
    mapping: OpeningMapping,
    dryRun: boolean,
    ip: string | null,
  ): Promise<OpeningImportReport> {
    const parsed = await parseOpeningFile(file.buffer, file.originalname);
    const problems = [...parsed.problems];
    const rows = parsed.rows;

    const [productRecs, parties, salespersons, cities, aliases, existingNos] = await Promise.all([
      this.prisma.product.findMany({
        select: {
          id: true,
          name: true,
          unitWeightKg: true,
          packPcs: true,
          isActive: true,
          category: { select: { name: true } },
        },
      }),
      this.prisma.party.findMany({ select: { id: true, name: true } }),
      this.prisma.salesperson.findMany({ select: { id: true, name: true } }),
      this.prisma.city.findMany({ select: { id: true, name: true } }),
      this.prisma.nameAlias.findMany(),
      this.prisma.order.findMany({
        select: { orderNo: true, isOpening: true, partyId: true, orderDate: true },
      }),
    ]);
    const products = new Map<string, ProductRec>(
      productRecs.map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          unitWeightKg: p.unitWeightKg.toString(),
          packPcs: p.packPcs,
          category: p.category.name,
        },
      ]),
    );
    const alias = (kind: string, text: string, kg = '') =>
      aliases.find((a) => a.kind === kind && a.text === text && a.packKg === kg)?.targetId;
    const byName = <T extends Target>(list: T[], text: string) =>
      list.find((x) => normalizeAlias(x.name) === text);
    const kgKey = (kg: string) => dec(kg).toString();

    // ── Names ──
    const unmatched: OpeningImportReport['unmatched'] = {
      products: [],
      parties: [],
      salespersons: [],
    };
    const productOf = new Map<string, string | null>();
    const partyOf = new Map<string, { id: string } | 'create' | null>();
    const salespersonOf = new Map<string, { id: string } | 'create' | 'none' | null>();
    const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const productRows = new Map<string, number>();
    const partyRows = new Map<string, number>();
    const spRows = new Map<string, number>();

    for (const r of rows) {
      const pText = normalizeAlias(r.product);
      const pKey = `${pText}|${kgKey(r.kg)}`;
      count(productRows, pKey);
      if (!productOf.has(pKey)) {
        const mapped = mapping.products[pKey];
        const found =
          (mapped && products.has(mapped) ? mapped : undefined) ??
          alias('PRODUCT', pText, kgKey(r.kg)) ??
          byName([...products.values()], pText)?.id;
        productOf.set(pKey, found ?? null);
      }
      const partyKey = normalizeAlias(r.party);
      count(partyRows, partyKey);
      if (!partyOf.has(partyKey)) {
        const m = mapping.parties[partyKey];
        const found =
          m?.action === 'map'
            ? parties.find((p) => p.id === m.partyId)
            : m?.action === 'create'
              ? undefined
              : (parties.find((p) => p.id === alias('PARTY', partyKey)) ??
                byName(parties, partyKey));
        partyOf.set(partyKey, found ? { id: found.id } : m?.action === 'create' ? 'create' : null);
      }
      const spKey = normalizeAlias(r.salesperson);
      if (spKey) {
        count(spRows, spKey);
        if (!salespersonOf.has(spKey)) {
          const m = mapping.salespersons[spKey];
          const found =
            m?.action === 'map'
              ? salespersons.find((s) => s.id === m.salespersonId)
              : m
                ? undefined
                : (salespersons.find((s) => s.id === alias('SALESPERSON', spKey)) ??
                  byName(salespersons, spKey));
          salespersonOf.set(
            spKey,
            found
              ? { id: found.id }
              : m?.action === 'create' || m?.action === 'none'
                ? m.action
                : null,
          );
        }
      }
    }
    const productTargets = [...products.values()].map((p) => ({ id: p.id, name: p.name }));
    for (const [k, id] of productOf) {
      if (id) continue;
      const [text = '', kg = ''] = k.split('|');
      unmatched.products.push({
        key: k,
        text,
        kg,
        rows: productRows.get(k) ?? 0,
        suggestion: suggest(text, productTargets, (t) => {
          const p = products.get(t.id)!;
          return dec(p.unitWeightKg).eq(kg) || packWeightKg(p.unitWeightKg, p.packPcs).eq(kg);
        }),
        mapping: mapping.products[k] ?? null,
      });
    }
    for (const [k, v] of partyOf) {
      if (v) continue;
      unmatched.parties.push({
        key: k,
        text: k,
        rows: partyRows.get(k) ?? 0,
        suggestion: suggest(k, parties),
        mapping: null,
      });
    }
    for (const [k, v] of salespersonOf) {
      if (v) continue;
      unmatched.salespersons.push({
        key: k,
        text: k,
        rows: spRows.get(k) ?? 0,
        suggestion: suggest(k, salespersons),
        mapping: null,
      });
    }

    // ── Lines and orders ──
    const planned = new Map<string, PlannedOrder>();
    const mismatches: OpeningImportReport['mismatches'] = [];
    const fileWeight: string[] = [];
    const fileAmount: string[] = [];
    const computedWeight: string[] = [];
    const computedAmount: string[] = [];
    for (const r of rows) {
      const productId = productOf.get(`${normalizeAlias(r.product)}|${kgKey(r.kg)}`);
      if (!productId) continue; // listed under unmatched
      const p = products.get(productId)!;
      const fail = (message: string) => problems.push({ row: r.row, message });

      // Pack: the report counts bags of `kg`; the product may pack several (10 kg × 4).
      const pack = packWeightKg(p.unitWeightKg, p.packPcs);
      let factor = 1;
      if (!pack.eq(r.kg)) {
        if (dec(p.unitWeightKg).eq(r.kg) && p.packPcs > 1) factor = p.packPcs;
        else {
          fail(`${p.name} is packed ${pack.toString()} kg, but the row says ${r.kg} kg.`);
          continue;
        }
      }
      if (r.qty! % factor !== 0 || r.dispatched % factor !== 0) {
        fail(`${r.qty} × ${r.kg} kg doesn't make whole ${p.packPcs}-piece packs of ${p.name}.`);
        continue;
      }
      const crop = normalizeCropYear(r.cropYear);
      if (crop === undefined) {
        fail(`Unreadable crop year "${r.cropYear}".`);
        continue;
      }
      const basis = defaultRateBasis(p.category);
      const rate =
        basis === 'PER_40KG'
          ? twoDp(dec(r.rate).div(r.rateBasisKg).times(40))
          : twoDp(dec(r.rate).div(r.rateBasisKg).times(p.unitWeightKg));
      if (rate === null) {
        fail(`Rate ${r.rate} per ${r.rateBasisKg} kg doesn't convert to a whole-paisa rate.`);
        continue;
      }
      const line: PlannedLine = {
        row: r.row,
        productId,
        cropYear: crop ?? '',
        basis,
        rate,
        packWeightKg: pack.toString(),
        packPcs: p.packPcs,
        qtyPacks: r.qty! / factor,
        dispatched: r.dispatched / factor,
      };
      const pend = pendingLine({ ...line, dispatchedPacks: line.dispatched });
      computedWeight.push(pend.pendingWeightKg.toString());
      computedAmount.push(pend.pendingAmount.toString());
      if (r.wtRemaining) fileWeight.push(r.wtRemaining);
      if (r.amount) {
        fileAmount.push(r.amount);
        if (!dec(r.amount).eq(pend.pendingAmount)) {
          mismatches.push({ row: r.row, file: r.amount, computed: pend.pendingAmount.toString() });
        }
      }

      const key = r.orderNo ? `no:${r.orderNo}` : `new:${normalizeAlias(r.party)}|${r.date}`;
      const o = planned.get(key);
      if (o) {
        if (o.partyKey !== normalizeAlias(r.party) || o.date !== r.date) {
          fail(`Order ${r.orderNo} appears with another party or date on an earlier row.`);
          continue;
        }
        if (o.lines.some((l) => l.productId === productId && l.cropYear === line.cropYear)) {
          fail(`${p.name} ${crop ?? ''} is twice on order ${r.orderNo ?? '(no number)'}.`);
          continue;
        }
        o.lines.push(line);
      } else {
        planned.set(key, {
          orderNo: r.orderNo,
          date: r.date!,
          partyKey: normalizeAlias(r.party),
          partyText: r.party.trim(),
          cityText: r.city.trim(),
          salespersonKey: normalizeAlias(r.salesperson),
          lines: [line],
          exists: r.orderNo
            ? existingNos.some((e) => e.orderNo === r.orderNo)
            : // No number (the ghee report): an opening order for the same party and date
              // means this file was imported before.
              existingNos.some((e) => {
                const party = partyOf.get(normalizeAlias(r.party));
                return (
                  e.isOpening &&
                  typeof party === 'object' &&
                  party !== null &&
                  e.partyId === party.id &&
                  e.orderDate.toISOString().slice(0, 10) === r.date
                );
              }),
        });
      }
    }

    const orders = [...planned.values()];
    const newCities = new Set(
      orders
        .filter((o) => !o.exists && o.cityText)
        .map((o) => normalizeAlias(o.cityText))
        .filter((c) => !cities.some((x) => normalizeAlias(x.name) === c)),
    );
    const total = (xs: string[]) => sum(xs).toString();
    const comparison: OpeningImportReport['comparison'] = [];
    if (fileWeight.length) {
      comparison.push({
        metric: 'Weight remaining (kg)',
        file: total(fileWeight),
        computed: total(computedWeight),
        matches: dec(total(fileWeight)).eq(total(computedWeight)),
      });
    }
    if (fileAmount.length) {
      comparison.push({
        metric: 'Pending amount (Rs)',
        file: total(fileAmount),
        computed: total(computedAmount),
        matches: dec(total(fileAmount)).eq(total(computedAmount)),
      });
    }

    const ready =
      rows.length > 0 &&
      problems.length === 0 &&
      unmatched.products.length === 0 &&
      unmatched.parties.length === 0 &&
      unmatched.salespersons.length === 0;
    const toCreate = orders.filter((o) => !o.exists);
    const report: OpeningImportReport = {
      dryRun,
      ready,
      summary: {
        rows: rows.length + parsed.problems.length,
        orders: {
          create: toCreate.length,
          exists: orders.length - toCreate.length,
          lines: toCreate.reduce((n, o) => n + o.lines.length, 0),
        },
        cities: { create: newCities.size },
        parties: { create: [...partyOf.values()].filter((v) => v === 'create').length },
        salespersons: { create: [...salespersonOf.values()].filter((v) => v === 'create').length },
      },
      problems,
      unmatched,
      comparison,
      mismatches,
      created: null,
    };
    if (dryRun) return report;
    if (!ready) {
      throw new BadRequestException({
        message: 'The file is not ready to import: fix the problems and map every name first.',
        report,
      });
    }

    report.created = await this.prisma.$transaction(
      async (tx) => {
        const cityId = new Map(cities.map((c) => [normalizeAlias(c.name), c.id]));
        for (const c of newCities) {
          const text = toCreate.find((o) => normalizeAlias(o.cityText) === c)!.cityText;
          cityId.set(c, (await tx.city.create({ data: { name: text }, select: { id: true } })).id);
        }
        const spId = new Map<string, string | null>();
        for (const [k, v] of salespersonOf) {
          if (v === 'none') spId.set(k, null);
          else if (v === 'create') {
            const name = rows.find((r) => normalizeAlias(r.salesperson) === k)!.salesperson.trim();
            spId.set(k, (await tx.salesperson.create({ data: { name }, select: { id: true } })).id);
          } else spId.set(k, v!.id);
        }
        const partyId = new Map<string, string>();
        let partiesCreated = 0;
        for (const [k, v] of partyOf) {
          if (v === 'create') {
            const first =
              toCreate.find((o) => o.partyKey === k) ?? orders.find((o) => o.partyKey === k)!;
            const created = await tx.party.create({
              data: {
                name: first.partyText,
                cityId: first.cityText
                  ? (cityId.get(normalizeAlias(first.cityText)) ?? null)
                  : null,
                salespersonId: spId.get(first.salespersonKey) ?? null,
              },
              select: { id: true },
            });
            partyId.set(k, created.id);
            partiesCreated++;
          } else partyId.set(k, v!.id);
        }

        // Remember every decided name that isn't simply the record's own name.
        let aliasesSaved = 0;
        const remember = async (
          kind: 'PRODUCT' | 'PARTY' | 'SALESPERSON',
          text: string,
          packKg: string,
          targetId: string,
        ) => {
          await tx.nameAlias.upsert({
            where: { kind_text_packKg: { kind, text, packKg } },
            update: { targetId },
            create: { kind, text, packKg, targetId, createdById: user.id },
          });
          aliasesSaved++;
        };
        for (const [k, id] of productOf) {
          const [text = '', kg = ''] = k.split('|');
          if (id && normalizeAlias(products.get(id)!.name) !== text)
            await remember('PRODUCT', text, kg, id);
        }
        for (const [k, id] of partyId) {
          const name = parties.find((p) => p.id === id)?.name;
          if (name && normalizeAlias(name) !== k) await remember('PARTY', k, '', id);
        }
        for (const [k, id] of spId) {
          const name = salespersons.find((s) => s.id === id)?.name;
          if (id && name && normalizeAlias(name) !== k) await remember('SALESPERSON', k, '', id);
        }

        let next = (await this.orders.nextNumber(tx)).orderNo;
        let lines = 0;
        for (const o of [...toCreate].sort(
          (a, b) => (a.orderNo ?? Infinity) - (b.orderNo ?? Infinity),
        )) {
          const calculated = o.lines.map((l, i) => {
            const c = calcOrderLine(l);
            return {
              lineNo: i + 1,
              productId: l.productId,
              cropYear: l.cropYear,
              basis: l.basis,
              listRate: null,
              rate: l.rate,
              packWeightKg: l.packWeightKg,
              packPcs: l.packPcs,
              qtyPacks: l.qtyPacks,
              ratePerPack: c.ratePerPack.toString(),
              amount: c.amount.toString(),
              weightKg: c.weightKg.toString(),
              openingDispatched: l.dispatched,
            };
          });
          const totals = calcOrderTotals(calculated);
          const data: Prisma.OrderUncheckedCreateInput = {
            orderNo: o.orderNo ?? next++,
            orderDate: toDbDate(o.date),
            status: 'PENDING',
            isOpening: true,
            partyId: partyId.get(o.partyKey)!,
            cityId: o.cityText ? (cityId.get(normalizeAlias(o.cityText)) ?? null) : null,
            salespersonId: o.salespersonKey ? (spId.get(o.salespersonKey) ?? null) : null,
            remarks: 'Opening order (go-live import)',
            totalPacks: totals.totalPacks,
            totalWeightKg: totals.totalWeightKg.toString(),
            totalAmount: totals.totalAmount.toString(),
            createdById: user.id,
            lines: { create: calculated },
          };
          if (o.orderNo !== null && o.orderNo >= next) next = o.orderNo + 1;
          await tx.order.create({ data });
          lines += calculated.length;
        }
        const created = {
          orders: toCreate.length,
          lines,
          parties: partiesCreated,
          aliases: aliasesSaved,
        };
        await this.audit.log(
          {
            userId: user.id,
            action: 'IMPORT',
            entity: 'OrderImport',
            after: { file: file.originalname, ...created, comparison },
            ip,
          },
          tx,
        );
        return created;
      },
      { timeout: 120_000 },
    );
    return report;
  }
}

export type { OpeningRow };
