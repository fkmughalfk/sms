'use client';

import {
  dashboardSchema,
  formatCommission,
  formatKg,
  formatPercent,
  formatPKR,
  formatQty,
  formatTons,
  partySalesSchema,
  productSalesSchema,
  salesBreakdownSchema,
  trendSchema,
} from '@sms/shared';
import {
  BadgePercent,
  CircleDollarSign,
  FileText,
  Gauge,
  HandCoins,
  Hourglass,
  LayoutDashboard,
  Receipt,
  Weight,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { CategoryShare } from '@/components/reports/category-share';
import { Meter, StatTile } from '@/components/reports/figures';
import { PeriodFilter } from '@/components/reports/period-filter';
import { RecoveryByParty } from '@/components/reports/recovery-by-party';
import { SalesTable } from '@/components/reports/sales-table';
import { Section } from '@/components/reports/section';
import { DailyTrendChart, MonthlyTargetChart } from '@/components/reports/trend-charts';
import { periodDays, usePeriod, useReport } from '@/lib/reports';
import { useSettings } from '@/lib/use-invoice';
import { cn } from '@/lib/utils';
import { PageHeading } from '@/components/form-section';

const TOP = 10;

function DashboardContent() {
  const settings = useSettings();
  const { period, setPeriod } = usePeriod(settings.data);
  const daily = periodDays(period) <= 62;

  const dash = useReport('dashboard', dashboardSchema, period);
  const category = useReport('by-category', salesBreakdownSchema, period);
  const asm = useReport('by-salesperson', salesBreakdownSchema, period);
  const products = useReport('by-product', productSalesSchema, period);
  const parties = useReport('by-party', partySalesSchema, period);
  const trend = useReport('trend', trendSchema, period, `&granularity=${daily ? 'day' : 'month'}`);

  const d = dash.data;
  const reportsLink = (tab: string) => (
    <Link
      href={`/reports?tab=${tab}&period=${period.preset}${period.preset === 'custom' ? `&from=${period.from}&to=${period.to}` : ''}`}
      className="text-xs text-muted-foreground hover:underline"
    >
      See all
    </Link>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageHeading icon={LayoutDashboard}>Dashboard</PageHeading>
          {d?.scoped && (
            <p className="text-sm text-muted-foreground">Showing your own invoices and payments.</p>
          )}
        </div>
        <PeriodFilter period={period} onChange={setPeriod} />
      </div>

      {dash.error && <p className="text-sm text-destructive">{dash.error.message}</p>}

      {/* KPI cards (Dashboard rows 6–7) */}
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
          dash.isPlaceholderData && 'opacity-60',
        )}
      >
        <StatTile
          label="Total revenue (PKR)"
          icon={CircleDollarSign}
          tone="indigo"
          value={d ? formatPKR(d.kpis.revenue) : '—'}
          sub={d && `${formatPercent(d.target.achieved, 1)} of annual target`}
        />
        <StatTile
          label="Total commission"
          icon={BadgePercent}
          tone="fuchsia"
          value={d ? formatCommission(d.kpis.commission) : '—'}
          sub={d && `${formatPercent(d.kpis.commissionPct, 2)} of sales`}
        />
        <StatTile
          label="Total weight (tons)"
          icon={Weight}
          tone="amber"
          value={d ? formatTons(d.kpis.weightKg) : '—'}
          sub={d && `${formatKg(d.kpis.weightKg)} KG`}
        />
        <StatTile
          label="Invoices"
          icon={FileText}
          tone="sky"
          value={d ? formatQty(d.kpis.invoices) : '—'}
          sub={d && `${formatQty(d.kpis.packs)} packs`}
        />
      </div>

      {/* Annual sales target (rows 11–16) + monthly actual vs target */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Section title="Annual sales target" busy={dash.isPlaceholderData}>
          {d ? (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Achieved</dt>
                <dd className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-4xl font-bold text-transparent dark:from-indigo-300 dark:to-violet-300">
                  {formatPercent(d.target.achieved, 1)}
                </dd>
                <div className="mt-2">
                  <Meter ratio={d.target.achieved} label="Share of annual target achieved" />
                </div>
              </div>
              {(
                [
                  ['Annual target', formatPKR(d.target.annualTarget)],
                  ['Actual to date', formatPKR(d.target.actual)],
                  ['Remaining', formatPKR(d.target.remaining)],
                  ['Monthly target', formatPKR(d.target.monthlyTarget)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </Section>
        <Section
          title={daily ? 'Sales per day' : 'Monthly sales vs target'}
          busy={trend.isPlaceholderData}
        >
          {trend.data ? (
            daily ? (
              <DailyTrendChart trend={trend.data} />
            ) : (
              <MonthlyTargetChart trend={trend.data} />
            )
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </Section>
      </div>

      {/* Sales by category (rows 20–25) and by ASM (rows 29–42) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section
          title="Sales by category"
          busy={category.isPlaceholderData}
          action={reportsLink('category')}
        >
          {category.data && (
            <div className="grid gap-4">
              <CategoryShare rows={category.data.data} />
              <SalesTable
                label="Category"
                rows={category.data.data}
                totals={category.data.totals}
              />
            </div>
          )}
        </Section>
        <Section
          title="Sales by ASM / salesperson"
          busy={asm.isPlaceholderData}
          action={reportsLink('salesperson')}
        >
          {asm.data && (
            <SalesTable label="ASM" rows={asm.data.data} totals={asm.data.totals} limit={TOP} />
          )}
        </Section>
      </div>

      {/* Sales by product (rows 46–87) */}
      <Section
        title={`Top ${TOP} products`}
        busy={products.isPlaceholderData}
        action={reportsLink('product')}
      >
        {products.data && (
          <SalesTable
            label="Product"
            rows={products.data.data}
            totals={products.data.totals}
            limit={TOP}
            extra={[
              { header: 'Category', cell: (r) => r.category, className: 'hidden md:table-cell' },
            ]}
          />
        )}
      </Section>

      {/* Payments & recovery (rows 90–93) */}
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
          dash.isPlaceholderData && 'opacity-60',
        )}
      >
        <StatTile
          label="Total recovered"
          icon={HandCoins}
          tone="emerald"
          value={d ? formatPKR(d.recovery.recovered) : '—'}
        />
        <StatTile
          label="Outstanding"
          icon={Hourglass}
          tone="rose"
          value={d ? formatPKR(d.recovery.outstanding) : '—'}
          sub="Revenue − recovered, this period"
        />
        <StatTile
          label="Recovery rate"
          icon={Gauge}
          tone="sky"
          value={d ? formatPercent(d.recovery.recoveryRate, 1) : '—'}
        />
        <StatTile
          label="Payments logged"
          icon={Receipt}
          tone="amber"
          value={d ? formatQty(d.recovery.payments) : '—'}
        />
      </div>

      {/* Recovery by party (rows 96+) */}
      <Section
        title="Recovery by party"
        busy={parties.isPlaceholderData}
        action={reportsLink('party')}
      >
        {parties.data && <RecoveryByParty data={parties.data} limit={TOP} />}
      </Section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <DashboardContent />
    </Suspense>
  );
}
