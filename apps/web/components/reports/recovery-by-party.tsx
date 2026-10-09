import { dec, formatPercent, formatPKR2, type PartySales } from '@sms/shared';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ShareBar } from './figures';

/** Dashboard "Recovery by Party" (rows 96+): period invoiced vs recovered per party. */
export function RecoveryByParty({ data, limit }: { data: PartySales; limit?: number }) {
  const rows = limit ? data.data.slice(0, limit) : data.data;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Party</TableHead>
            <TableHead className="text-right">Invoiced</TableHead>
            <TableHead className="text-right">Recovered</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead className="hidden text-right md:table-cell">Last payment</TableHead>
            <TableHead className="text-right">% recovered</TableHead>
            <TableHead className="hidden w-32 sm:table-cell">
              <span className="sr-only">Share recovered</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No invoices or payments in this period.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id ?? r.name}>
              <TableCell className="font-sans">
                {r.id ? (
                  <Link href={`/recovery/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </TableCell>
              <TableCell className="text-right">{formatPKR2(r.amount)}</TableCell>
              <TableCell className="text-right">{formatPKR2(r.recovered)}</TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium',
                  dec(r.outstanding).lt(0) && 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {formatPKR2(r.outstanding)}
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">
                {r.lastPaymentDate?.split('-').reverse().join('-') ?? '—'}
              </TableCell>
              <TableCell className="text-right">{formatPercent(r.recoveryRate, 1)}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <ShareBar ratio={r.recoveryRate} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {limit && data.data.length > limit && (
        <p className="pt-2 text-xs text-muted-foreground">
          Top {limit} of {data.data.length} parties by sales.
        </p>
      )}
    </div>
  );
}
