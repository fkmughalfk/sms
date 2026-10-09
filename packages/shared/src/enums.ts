/** Mirrors the Prisma `Role` enum (spec §4). */
export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'IMPORT'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
