// `?sort=field:asc|desc` → Prisma orderBy, from a whitelist of sortable columns (spec §7).

export type SortDir = 'asc' | 'desc';
type OrderBy = Record<string, unknown>;

/** Column key → how to order by it (can reach into relations, e.g. party name). */
export type SortColumns = Record<string, (dir: SortDir) => OrderBy>;

export function parseSort(
  sort: string | undefined,
  fallback: string,
): { field: string; dir: SortDir } {
  const [field = '', dir] = (sort ?? fallback).split(':');
  return { field, dir: dir === 'desc' ? 'desc' : 'asc' };
}

/**
 * Prisma `orderBy` for the requested column, falling back to `fallback` for unknown
 * columns, then the tie-breakers — so equal values never shuffle between pages.
 */
export function orderBy(
  sort: string | undefined,
  columns: SortColumns,
  fallback: string,
  tieBreakers: OrderBy[] = [{ id: 'asc' }],
): OrderBy[] {
  const wanted = parseSort(sort, fallback);
  const { field, dir } = columns[wanted.field] ? wanted : parseSort(undefined, fallback);
  return [columns[field]!(dir), ...tieBreakers];
}

/** Plain scalar columns: `byFields('name', 'sku')`. */
export const byFields = (...fields: string[]): SortColumns =>
  Object.fromEntries(fields.map((f) => [f, (dir: SortDir) => ({ [f]: dir })]));

/** A related record's name, e.g. `byRelationName('city')` → `{ city: { name } }`. */
export const byRelationName = (relation: string) => (dir: SortDir) => ({
  [relation]: { name: dir },
});

/** Page window from `?page&pageSize`. */
export const pageArgs = (q: { page: number; pageSize: number }) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});
