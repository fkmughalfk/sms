import { z } from 'zod';
import { ROLES } from '../enums';
import { emailSchema, passwordSchema } from './auth';
import {
  booleanQuerySchema,
  nameSchema,
  optionalIdSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './common';

export const roleSchema = z.enum(ROLES);

const userBase = z.object({
  name: nameSchema(),
  email: emailSchema,
  role: roleSchema,
  /** Optional link for USER data scoping (spec §3 note **). */
  salespersonId: optionalIdSchema,
});

export const createUserSchema = userBase.extend({
  password: passwordSchema,
  role: roleSchema.default('USER'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// No defaults here: an omitted role must not reset the user to USER.
export const updateUserSchema = userBase.partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** `GET /users?search=&role=&active=` */
export const userListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  role: roleSchema.optional(),
  active: booleanQuerySchema.optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

// ── Responses ──

/** The signed-in user (`GET /auth/me`, login/refresh responses). */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  salespersonId: z.string().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** A user row as the users screens see it (never includes the password hash). */
export const userSchema = authUserSchema.extend({
  isActive: z.boolean(),
  salesperson: z.object({ id: z.string(), name: z.string() }).nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const userListSchema = paginatedSchema(userSchema);
