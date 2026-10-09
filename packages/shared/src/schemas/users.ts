import { z } from 'zod';
import { ROLES } from '../enums';
import { emailSchema, passwordSchema } from './auth';
import { nameSchema, optionalIdSchema } from './common';

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
