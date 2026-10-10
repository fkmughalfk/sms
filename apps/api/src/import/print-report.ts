import type { ImportReport } from '@sms/shared';

/** Console summary of an import plan/run (CLI and seed). */
export function printReport(r: ImportReport) {
  const s = r.summary;
  console.log('\nWould import' + (r.dryRun ? ' (dry run — nothing written)' : '') + ':');
  for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(13)} ${JSON.stringify(v)}`);
  console.log('\nRecalculated vs Excel:');
  for (const c of r.comparison) {
    console.log(
      `  ${c.matches ? 'OK ' : 'DIFF'} ${c.metric.padEnd(32)} excel ${String(c.excel).padStart(16)}  app ${c.computed.padStart(16)}`,
    );
  }
  if (r.mismatches.length) {
    console.log(
      `\n${r.mismatches.length} line(s) where the recalculated value differs from Excel:`,
    );
    for (const m of r.mismatches.slice(0, 20)) {
      console.log(
        `  invoice ${m.invoiceNo} row ${m.row} ${m.product} ${m.field}: excel ${m.excel} app ${m.computed}`,
      );
    }
  }
  if (r.unmatchedParties.length) {
    console.log('\nSheet1 party names:');
    for (const u of r.unmatchedParties) {
      console.log(
        `  "${u.raw}" (${u.payments} payments, ${u.amount}) → ${u.mapping ? JSON.stringify(u.mapping) : `UNMAPPED (suggest: ${u.suggestion ?? '—'})`}`,
      );
    }
  }
  if (r.problems.length) {
    console.log('\nProblems:');
    for (const p of r.problems) console.log(`  ${p.sheet} row ${p.row}: ${p.message}`);
  }
  console.log(
    `\n${r.ready ? 'Ready to import.' : 'Not ready — map every party name and fix the problems above.'}`,
  );
}
