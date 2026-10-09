import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Paginated, PaginationQuery } from '@sms/shared';

// Small helpers shared by the master-data services (spec §5.6, §7).

/** skip/take/orderBy from `?page&pageSize&sort=field:dir`, limited to `sortable` fields. */
export function listArgs(query: PaginationQuery, sortable: readonly string[], fallback = 'name') {
  const [field = fallback, dir] = (query.sort ?? `${fallback}:asc`).split(':');
  const orderBy = {
    [sortable.includes(field) ? field : fallback]: dir === 'desc' ? 'desc' : 'asc',
  } as const;
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy };
}

export function toPage<T>(data: T[], total: number, query: PaginationQuery): Paginated<T> {
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

/** `name ILIKE %search%` (names are citext, so equality checks are case-insensitive too). */
export const nameContains = (search?: string) =>
  search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

export const activeIs = (active?: boolean) => (active === undefined ? {} : { isActive: active });

/** Excludes `id` from a uniqueness lookup when updating. */
export const notId = (id?: string) => (id ? { NOT: { id } } : {});

export function orNotFound<T>(row: T | null, label: string): T {
  if (!row) throw new NotFoundException(`${label} not found.`);
  return row;
}

/** Throws 409 when a case-insensitive duplicate exists. */
export function assertUnique(clash: unknown, message: string): void {
  if (clash) throw new ConflictException(message);
}

/**
 * A referenced master must exist and be active when (re)assigned — deactivated records
 * stay on old data but can't be picked for new data (spec §4.1).
 */
export function assertActiveRef(row: { isActive: boolean } | null, message: string): void {
  if (!row || !row.isActive) throw new BadRequestException(message);
}
