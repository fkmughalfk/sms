'use client';

import { formatCompact, formatPKR, formatQty, type Trend } from '@sms/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { type ChartColors, useChartColors } from '@/lib/use-chart-colors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const dayLabel = (ymd: string) =>
  `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;

interface Point {
  period: string;
  label: string;
  /** Number only for plotting; the tooltip shows the exact Decimal string. */
  value: number;
  amount: string;
  invoices: number;
  packs: number;
}

const toPoints = (trend: Trend, label: (p: string) => string): Point[] =>
  trend.points.map((p) => ({
    period: p.period,
    label: label(p.period),
    value: Number(p.amount),
    amount: p.amount,
    invoices: p.invoices,
    packs: p.packs,
  }));

/** Values lead, labels follow (dataviz: interaction). */
function TrendTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const p = payload?.[0]?.payload as Point | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold">PKR {formatPKR(p.amount)}</p>
      <p className="text-muted-foreground">{p.label}</p>
      <p className="text-muted-foreground">
        {formatQty(p.invoices)} {p.invoices === 1 ? 'invoice' : 'invoices'} · {formatQty(p.packs)}{' '}
        bags
      </p>
    </div>
  );
}

const axisProps = (c: ChartColors) => ({
  stroke: c.axis,
  tick: { fill: c.muted, fontSize: 12 },
  tickLine: false,
});

/**
 * Monthly sales vs the implied monthly target (spec §5.5 "monthly actual-vs-target bar
 * chart"): single-hue columns, one axis, the target as a labelled reference line.
 */
export function MonthlyTargetChart({ trend }: { trend: Trend }) {
  const c = useChartColors();
  const data = toPoints(trend, monthLabel);
  const target = Number(trend.monthlyTarget);
  // Only draw the target line when it's on the bars' scale; a target far above actual
  // sales would flatten every bar to nothing. Then the caption states it instead.
  const maxSales = Math.max(0, ...data.map((p) => p.value));
  const showTarget = target > 0 && (maxSales === 0 || target <= maxSales * 3);
  return (
    <figure className="grid gap-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
            <XAxis dataKey="label" {...axisProps(c)} interval="preserveStartEnd" />
            <YAxis
              {...axisProps(c)}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => formatCompact(v)}
              domain={[0, (max: number) => (showTarget ? Math.max(max, target) : max) * 1.05]}
            />
            <Tooltip content={TrendTooltip} cursor={{ fill: c.grid, opacity: 0.5 }} />
            <Bar dataKey="value" fill={c.series1} radius={[4, 4, 0, 0]} maxBarSize={24} />
            {showTarget && (
              <ReferenceLine
                y={target}
                stroke={c.muted}
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{
                  value: `Monthly target ${formatCompact(trend.monthlyTarget)}`,
                  position: 'insideTopRight',
                  fill: c.muted,
                  fontSize: 12,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {showTarget
          ? 'Bars: sales per month (PKR). Line: monthly target (annual target ÷ 12).'
          : `Sales per month (PKR). The monthly target, PKR ${formatPKR(trend.monthlyTarget)}, is far above this scale and not drawn.`}
      </figcaption>
    </figure>
  );
}

/** Daily sales trend for short periods: one 2px line, crosshair tooltip. */
export function DailyTrendChart({ trend }: { trend: Trend }) {
  const c = useChartColors();
  const data = toPoints(trend, dayLabel);
  return (
    <figure className="grid gap-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
            <XAxis dataKey="label" {...axisProps(c)} interval="preserveStartEnd" minTickGap={24} />
            <YAxis
              {...axisProps(c)}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => formatCompact(v)}
            />
            <Tooltip content={TrendTooltip} cursor={{ stroke: c.axis, strokeWidth: 1 }} />
            <Line
              type="linear"
              dataKey="value"
              stroke={c.series1}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, fill: c.series1, stroke: c.surface, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-muted-foreground">Sales per day (PKR).</figcaption>
    </figure>
  );
}
