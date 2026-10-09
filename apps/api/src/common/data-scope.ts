import { type AuthUser, isScopedToOwnData } from '@sms/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Rows a user may see (spec §3 note **). ADMIN+ see everything. A USER sees invoices
 * they created, plus — if linked to a salesperson — that salesperson's invoices.
 */
export function invoiceScope(user: AuthUser): Prisma.InvoiceWhereInput {
  if (!isScopedToOwnData(user.role)) return {};
  return user.salespersonId
    ? { OR: [{ createdById: user.id }, { salespersonId: user.salespersonId }] }
    : { createdById: user.id };
}
