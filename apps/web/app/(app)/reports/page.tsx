'use client';

import {
  partySalesSchema,
  productSalesSchema,
  salesBreakdownSchema,
  trendSchema,
} from '@sms/shared';
import { Printer } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CategoryShare } from '@/components/reports/category-share';
import { PeriodFilter } from '@/components/reports/period-filter';
import { RecoveryByParty } from '@/components/reports/recovery-by-party';
import { SalesTable } from '@/components/reports/sales-table';
import { Section } from '@/components/reports/section';
import { DailyTrendChart, MonthlyTargetChart } from '@/components/reports/trend-charts';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Period, periodDays, usePeriod, useReport } from '@/lib/reports';
import { useSettings } from '@/lib/use-invoice';

const TABS = [
  { id: 'category', label: 'Category' },
  { id: 'salesperson', label: 'ASM' },
  { id: 'product', label: 'Product' },
  { id: 'party', label: 'Party' },
  { id: 'city', label: 'City' },
  { id: 'trend', label: 'Trend' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function CategoryReport({ period }: { period: Period }) {
  const q = useReport('by-category', salesBreakdownSchema, period);
  return (
    <Section title="Sales by category" busy={q.isPlaceholderData}>
      {q.data && (
        <div className="grid gap-4">
          <CategoryShare rows={q.data.data} />
          <SalesTable label="Category" rows={q.data.data} totals={q.data.totals} />
        </div>
      )}
    </Section>
  );
}

function SalespersonReport({ period }: { period: Period }) {
  const q = useReport('by-salesperson', salesBreakdownSchema, period);
  return (
    <Section title="Sales by ASM / salesperson" busy={q.isPlaceholderData}>
      {q.data && <SalesTable label="ASM" rows={q.data.data} totals={q.data.totals} />}
    </Section>
  );
}

function ProductReport({ period }: { period: Period }) {
  const q = useReport('by-product', productSalesSchema, period);
  return (
    <Section title="Sales by product" busy={q.isPlaceholderData}>
      {q.data && (
        <SalesTable
          label="Product"
          rows={q.data.data}
          totals={q.data.totals}
          extra={[
            {
              header: '#',
              cell: (r) => r.sku ?? '—',
              className: 'hidden w-12 tabular-nums md:table-cell',
            },
            { header: 'Category', cell: (r) => r.category, className: 'hidden md:table-cell' },
          ]}
        />
      )}
    </Section>
  );
}

function PartyReport({ period }: { period: Period }) {
  const q = useReport('by-party', partySalesSchema, period);
  return (
    <div className="grid gap-4">
      <Section title="Sales by party" busy={q.isPlaceholderData}>
        {q.data && (
          <SalesTable
            label="Party"
            rows={q.data.data}
            totals={q.data.totals}
            extra={[
              {
                header: 'Invoices',
                cell: (r) => r.invoices,
                className: 'hidden text-right md:table-cell',
              },
            ]}
          />
        )}
      </Section>
      <Section title="Recovery by party (this period)" busy={q.isPlaceholderData}>
        {q.data && <RecoveryByParty data={q.data} />}
      </Section>
    </div>
  );
}

function CityReport({ period }: { period: Period }) {
  const q = useReport('by-city', salesBreakdownSchema, period);
  return (
    <Section title="Sales by city" busy={q.isPlaceholderData}>
      {q.data && <SalesTable label="City" rows={q.data.data} totals={q.data.totals} />}
    </Section>
  );
}

function TrendReport({ period }: { period: Period }) {
  const monthly = useReport('trend', trendSchema, period, '&granularity=month');
  const daily = useReport('trend', trendSchema, period, '&granularity=day');
  return (
    <div className="grid gap-4">
      <Section title="Monthly sales vs target" busy={monthly.isPlaceholderData}>
        {monthly.data && <MonthlyTargetChart trend={monthly.data} />}
      </Section>
      {periodDays(period) <= 400 && (
        <Section title="Sales per day" busy={daily.isPlaceholderData}>
          {daily.data && <DailyTrendChart trend={daily.data} />}
        </Section>
      )}
    </div>
  );
}

function ReportsContent() {
  const settings = useSettings();
  const { period, setPeriod } = usePeriod(settings.data);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (
    TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'category'
  ) as TabId;

  const setTab = (next: string) => {
    const q = new URLSearchParams(params);
    q.set('tab', next);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Full breakdowns behind the dashboard.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <PeriodFilter period={period} onChange={setPeriod} />
          <Button variant="outline" className="no-print" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="no-print">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'category' && <CategoryReport period={period} />}
      {tab === 'salesperson' && <SalespersonReport period={period} />}
      {tab === 'product' && <ProductReport period={period} />}
      {tab === 'party' && <PartyReport period={period} />}
      {tab === 'city' && <CityReport period={period} />}
      {tab === 'trend' && <TrendReport period={period} />}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ReportsContent />
    </Suspense>
  );
}
